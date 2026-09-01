import "server-only";

import {
  DeleteObjectCommand,
  GetObjectCommand,
  type GetObjectCommandOutput,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";

const MAX_REFERENCE_IMAGE_BYTES = 20 * 1024 * 1024;

type R2Configuration = {
  bucket: string;
  endpoint: string;
  accessKeyId: string;
  secretAccessKey: string;
  objectPrefix: string;
};

let cachedClient: S3Client | undefined;
let cachedConfiguration: R2Configuration | undefined;

/**
 * Stores a private object in the configured Cloudflare R2 bucket. Callers
 * persist the returned object key, never a public or signed URL.
 */
export async function putPrivateR2Object({
  objectKey,
  body,
  contentType,
}: {
  objectKey: string;
  body: Uint8Array;
  contentType: string;
}): Promise<{ objectKey: string; contentType: string; size: number }> {
  assertObjectKey(objectKey);
  const resolvedContentType = contentType.trim();
  if (!resolvedContentType) {
    throw new R2StorageValidationError("An object content type is required");
  }

  const { client, configuration } = getR2Client();
  try {
    await client.send(
      new PutObjectCommand({
        Bucket: configuration.bucket,
        Key: objectKey,
        Body: body,
        ContentType: resolvedContentType,
      }),
    );
  } catch (error) {
    throw new R2StorageObjectError(
      `The private object could not be stored in R2: ${errorMessage(error)}`,
      { retryable: isRetryableR2Error(error) },
    );
  }

  return { objectKey, contentType: resolvedContentType, size: body.byteLength };
}

/** Removes a private object after its database record has been cleaned up. */
export async function deletePrivateR2Object(objectKey: string): Promise<void> {
  assertObjectKey(objectKey);
  const { client, configuration } = getR2Client();
  try {
    await client.send(
      new DeleteObjectCommand({
        Bucket: configuration.bucket,
        Key: objectKey,
      }),
    );
  } catch (error) {
    throw new R2StorageObjectError(
      `The private object could not be deleted from R2: ${errorMessage(error)}`,
      { retryable: isRetryableR2Error(error) },
    );
  }
}

/**
 * Creates the canonical private key for an immutable character reference.
 * The configured prefix is part of the key, so persisted snapshots are fully
 * resolvable without reconstructing any URLs.
 */
export function buildCreativeCharacterReferenceObjectKey({
  topicId,
  characterId,
  versionId,
  referenceImageId,
  extension,
}: {
  topicId: string;
  characterId: string;
  versionId: string;
  referenceImageId: string;
  extension: string;
}): string {
  const { objectPrefix } = getR2Client().configuration;
  const safeExtension = extension.trim().replace(/^\./, "").toLowerCase();
  if (!/^[a-z0-9]{2,10}$/.test(safeExtension)) {
    throw new R2StorageValidationError("The reference image extension is invalid");
  }

  const key = [
    objectPrefix,
    "topics",
    safeKeySegment(topicId, "topic ID"),
    "creative",
    "characters",
    safeKeySegment(characterId, "character ID"),
    "versions",
    safeKeySegment(versionId, "character version ID"),
    "references",
    `${safeKeySegment(referenceImageId, "reference image ID")}.${safeExtension}`,
  ].join("/");
  assertObjectKey(key);
  return key;
}

/** Creates the canonical private key for an immutable profile brand asset. */
export function buildCreativeBrandAssetObjectKey({
  topicId,
  assetId,
}: {
  topicId: string;
  assetId: string;
}): string {
  const { objectPrefix } = getR2Client().configuration;
  const key = [
    objectPrefix,
    "topics",
    safeKeySegment(topicId, "topic ID"),
    "creative",
    "brand-assets",
    `${safeKeySegment(assetId, "brand asset ID")}.png`,
  ].join("/");
  assertObjectKey(key);
  return key;
}

/**
 * Reads a private R2 image into a server-side File for temporary upload to
 * fal storage. This intentionally does not mint or retain a signed R2 URL.
 */
export async function readPrivateR2ImageFile({
  objectKey,
  contentType,
  fileName,
}: {
  objectKey: string;
  contentType?: string;
  fileName?: string;
}): Promise<File> {
  assertObjectKey(objectKey);

  const { client, configuration } = getR2Client();
  let object: GetObjectCommandOutput;
  try {
    object = await client.send(
      new GetObjectCommand({
        Bucket: configuration.bucket,
        Key: objectKey,
      }),
    );
  } catch (error) {
    throw new R2StorageObjectError(
      `The private reference image could not be read from R2: ${errorMessage(error)}`,
      { retryable: isRetryableR2Error(error) },
    );
  }

  if (!object.Body) {
    throw new R2StorageObjectError(
      "The private reference image did not include an object body",
      { retryable: false },
    );
  }
  if (
    object.ContentLength !== undefined &&
    object.ContentLength > MAX_REFERENCE_IMAGE_BYTES
  ) {
    throw new R2StorageValidationError(
      `Reference images must be ${formatMegabytes(MAX_REFERENCE_IMAGE_BYTES)} or smaller`,
    );
  }

  let bytes: Uint8Array;
  try {
    bytes = await object.Body.transformToByteArray();
  } catch (error) {
    throw new R2StorageObjectError(
      `The private reference image could not be downloaded from R2: ${errorMessage(error)}`,
      { retryable: true },
    );
  }
  if (bytes.byteLength > MAX_REFERENCE_IMAGE_BYTES) {
    throw new R2StorageValidationError(
      `Reference images must be ${formatMegabytes(MAX_REFERENCE_IMAGE_BYTES)} or smaller`,
    );
  }

  const resolvedContentType = contentType?.trim() || object.ContentType?.trim();
  if (!resolvedContentType?.startsWith("image/")) {
    throw new R2StorageValidationError(
      "The private reference object must have an image content type",
    );
  }

  const fileBytes = new Uint8Array(bytes.byteLength);
  fileBytes.set(bytes);

  return new File([fileBytes.buffer], safeFileName(fileName, objectKey), {
    type: resolvedContentType,
  });
}

function getR2Client(): {
  client: S3Client;
  configuration: R2Configuration;
} {
  const configuration = cachedConfiguration ?? readConfiguration();
  cachedConfiguration = configuration;
  cachedClient ??= new S3Client({
    endpoint: configuration.endpoint,
    region: "auto",
    forcePathStyle: true,
    credentials: {
      accessKeyId: configuration.accessKeyId,
      secretAccessKey: configuration.secretAccessKey,
    },
  });

  return { client: cachedClient, configuration };
}

function readConfiguration(): R2Configuration {
  const bucket = process.env.CLOUDFLARE_R2_BUCKET?.trim();
  const endpoint = process.env.CLOUDFLARE_R2_ENDPOINT?.trim();
  const accessKeyId = process.env.CLOUDFLARE_R2_ACCESS_KEY_ID?.trim();
  const secretAccessKey = process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY?.trim();
  const objectPrefix = process.env.CLOUDFLARE_R2_OBJECT_PREFIX?.trim();

  if (!bucket || !endpoint || !accessKeyId || !secretAccessKey || !objectPrefix) {
    throw new R2StorageConfigurationError(
      "Cloudflare R2 storage is not fully configured on the server",
    );
  }
  let normalizedEndpoint: string;
  try {
    const parsedEndpoint = new URL(endpoint);
    if (
      parsedEndpoint.protocol !== "https:" ||
      (parsedEndpoint.pathname !== "" && parsedEndpoint.pathname !== "/") ||
      parsedEndpoint.search ||
      parsedEndpoint.hash
    ) {
      throw new Error("not HTTPS");
    }
    normalizedEndpoint = parsedEndpoint.origin;
  } catch {
    throw new R2StorageConfigurationError(
      "CLOUDFLARE_R2_ENDPOINT must be an HTTPS origin without a bucket path",
    );
  }
  const normalizedPrefix = objectPrefix.replace(/^\/+|\/+$/g, "");
  assertObjectKey(normalizedPrefix);

  return {
    bucket,
    endpoint: normalizedEndpoint,
    accessKeyId,
    secretAccessKey,
    objectPrefix: normalizedPrefix,
  };
}

function assertObjectKey(objectKey: string): void {
  if (!objectKey || objectKey.length > 1_024) {
    throw new R2StorageValidationError("The R2 object key is invalid");
  }
  if (
    objectKey.startsWith("/") ||
    objectKey.includes("\\") ||
    objectKey.includes("\0") ||
    objectKey.split("/").some((segment) => segment === ".." || segment === ".")
  ) {
    throw new R2StorageValidationError("The R2 object key is invalid");
  }
}

function safeFileName(fileName: string | undefined, objectKey: string): string {
  const candidate = fileName?.trim() || objectKey.split("/").at(-1) || "reference";
  return candidate.replaceAll(/[^a-zA-Z0-9._-]/g, "-").slice(0, 180) || "reference";
}

function safeKeySegment(value: string, label: string): string {
  const trimmed = value.trim();
  if (!/^[a-zA-Z0-9_-]{1,160}$/.test(trimmed)) {
    throw new R2StorageValidationError(`The ${label} is invalid`);
  }
  return trimmed;
}

function formatMegabytes(bytes: number): string {
  return `${Math.floor(bytes / (1024 * 1024))} MB`;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown R2 error";
}

function isRetryableR2Error(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return true;
  const metadata = (error as { $metadata?: { httpStatusCode?: unknown } })
    .$metadata;
  const status = metadata?.httpStatusCode;
  if (typeof status !== "number") return true;
  return status === 408 || status === 429 || status >= 500;
}

export class R2StorageConfigurationError extends Error {}
export class R2StorageObjectError extends Error {
  readonly retryable: boolean;

  constructor(message: string, options: { retryable?: boolean } = {}) {
    super(message);
    this.name = "R2StorageObjectError";
    this.retryable = options.retryable ?? true;
  }
}
export class R2StorageValidationError extends Error {}
