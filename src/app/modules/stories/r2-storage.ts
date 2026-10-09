import "server-only";
import { withTransientR2Retry } from "./r2-retry";

import {
  CopyObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  type GetObjectCommandOutput,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";

import {
  approvedImageArchiveSegments,
  deliverySegments,
  editBaseSegments,
  retentionObjectKey,
} from "./r2-retention";

const MAX_REFERENCE_IMAGE_BYTES = 20 * 1024 * 1024;
const MAX_DOCUMENT_BYTES = 40_000_000;

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
  metadata,
  signal,
}: {
  objectKey: string;
  body: Uint8Array;
  contentType: string;
  /** Small string metadata stored with the object (e.g. its sha256). */
  metadata?: Record<string, string>;
  signal?: AbortSignal;
}): Promise<{ objectKey: string; contentType: string; size: number }> {
  assertObjectKey(objectKey);
  const resolvedContentType = contentType.trim();
  if (!resolvedContentType) {
    throw new R2StorageValidationError("An object content type is required");
  }

  const { client, configuration } = getR2Client();
  try {
    // A PUT of the same bytes under the same key is idempotent, so a dropped
    // connection is retried instead of failing a whole publication.
    await withTransientR2Retry(() => client.send(
      new PutObjectCommand({
        Bucket: configuration.bucket,
        Key: objectKey,
        Body: body,
        ContentType: resolvedContentType,
        ...(metadata ? { Metadata: metadata } : {}),
      }),
      { abortSignal: signal },
    ), { signal });
  } catch (error) {
    throw new R2StorageObjectError(
      `The private object could not be stored in R2: ${errorMessage(error)}`,
      { retryable: isRetryableR2Error(error) },
    );
  }

  return { objectKey, contentType: resolvedContentType, size: body.byteLength };
}

export function buildKnowledgeDocumentObjectKey(contentHash: string): string {
  if (!/^[a-f0-9]{64}$/.test(contentHash)) {
    throw new R2StorageValidationError("The document hash is invalid");
  }
  const { objectPrefix } = getR2Client().configuration;
  const key = `${objectPrefix}/documents/${contentHash}.pdf`;
  assertObjectKey(key);
  return key;
}

export async function readPrivateR2Document(objectKey: string): Promise<Uint8Array> {
  assertObjectKey(objectKey);
  const { client, configuration } = getR2Client();
  let object: GetObjectCommandOutput;
  try {
    object = await client.send(new GetObjectCommand({ Bucket: configuration.bucket, Key: objectKey }));
  } catch (error) {
    throw new R2StorageObjectError(`The private document could not be read from R2: ${errorMessage(error)}`, { retryable: isRetryableR2Error(error) });
  }
  if (!object.Body || (object.ContentLength ?? 0) > MAX_DOCUMENT_BYTES) {
    throw new R2StorageValidationError("The private document is missing or exceeds 40 MB");
  }
  const bytes = await object.Body.transformToByteArray();
  if (bytes.byteLength > MAX_DOCUMENT_BYTES) throw new R2StorageValidationError("The private document exceeds 40 MB");
  return bytes;
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
 * Canonical private key for a brand visual reference (BRAND-01). `version` is in
 * the path so a future replace (BRAND-05) writes a distinct immutable object.
 */
export function buildCreativeBrandReferenceObjectKey({
  topicId,
  referenceId,
  version,
  extension,
}: {
  topicId: string;
  referenceId: string;
  version: number;
  extension: string;
}): string {
  const { objectPrefix } = getR2Client().configuration;
  const safeExtension = extension.trim().replace(/^\./, "").toLowerCase();
  if (!/^[a-z0-9]{2,10}$/.test(safeExtension)) {
    throw new R2StorageValidationError(
      "The brand reference extension is invalid",
    );
  }
  if (!Number.isInteger(version) || version < 1 || version > 100000) {
    throw new R2StorageValidationError("The brand reference version is invalid");
  }

  const key = [
    objectPrefix,
    "topics",
    safeKeySegment(topicId, "topic ID"),
    "creative",
    "brand-references",
    safeKeySegment(referenceId, "brand reference ID"),
    `v${version}.${safeExtension}`,
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
  signal,
}: {
  objectKey: string;
  contentType?: string;
  fileName?: string;
  signal?: AbortSignal;
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
      { abortSignal: signal },
    );
  } catch (error) {
    throw new R2StorageObjectError(
      `The private reference image could not be read from R2: ${errorMessage(error)}`,
      { retryable: isRetryableR2Error(error), notFound: isNotFound(error) },
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

function isNotFound(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const name = (error as { name?: unknown }).name;
  const status = (error as { $metadata?: { httpStatusCode?: unknown } }).$metadata?.httpStatusCode;
  return name === "NoSuchKey" || name === "NotFound" || status === 404;
}

/** Joins a retention class and segments under the configured prefix. */
function retentionKey(retention: "7d" | "180d" | "permanent", segments: string[]): string {
  const key = retentionObjectKey(getR2Client().configuration.objectPrefix, retention, segments);
  assertObjectKey(key);
  return key;
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
  /** The object does not exist (HTTP 404 / NoSuchKey). */
  readonly notFound: boolean;

  constructor(message: string, options: { retryable?: boolean; notFound?: boolean } = {}) {
    super(message);
    this.name = "R2StorageObjectError";
    this.retryable = options.retryable ?? true;
    this.notFound = options.notFound ?? false;
  }
}
export class R2StorageMissingObjectError extends R2StorageObjectError {
  constructor(objectKey: string) {
    super(`The private object does not exist in R2: ${objectKey}`, { retryable: false, notFound: true });
    this.name = "R2StorageMissingObjectError";
  }
}
export class R2StorageValidationError extends Error {}

/** Content-addressed originals and immutable documentary outputs, isolated by topic. */
export function buildDocumentaryObjectKey(topicId: string, kind: "originals" | "outputs", id: string): string {
  const { objectPrefix } = getR2Client().configuration;
  return [objectPrefix, "topics", safeKeySegment(topicId, "topic ID"), "creative", "documentary", kind, safeKeySegment(id, "documentary object ID")].join("/");
}

/**
 * PUB-03. Private key for a frozen delivery JPEG. Served to Instagram only via
 * the opaque-token public route, never as a signed URL.
 */
export function buildPublicationDeliveryObjectKey({
  topicId,
  packageId,
  unitOrder,
}: {
  topicId: string;
  packageId: string;
  unitOrder: number;
}): string {
  // Lives in the 7-day class: a package that is never published is removed by
  // the R2 lifecycle rule. Publishing copies its files to the permanent class.
  return retentionKey("7d", deliverySegments("publication-delivery", {
    topicId: safeKeySegment(topicId, "topic ID"),
    packageId: safeKeySegment(packageId, "publication package ID"),
    unitOrder,
  }));
}

/** Permanent copy of a delivery JPEG once its package has been published. */
export function buildPublishedDeliveryObjectKey(input: {
  topicId: string;
  packageId: string;
  unitOrder: number;
}): string {
  return retentionKey("permanent", deliverySegments("published", {
    topicId: safeKeySegment(input.topicId, "topic ID"),
    packageId: safeKeySegment(input.packageId, "publication package ID"),
    unitOrder: input.unitOrder,
  }));
}

/** R2 copy of an approved generated image, kept 180 days. */
export function buildApprovedImageArchiveKey(input: {
  topicId: string;
  assetId: string;
  version: number;
}): string {
  return retentionKey("180d", approvedImageArchiveSegments({
    topicId: safeKeySegment(input.topicId, "topic ID"),
    assetId: safeKeySegment(input.assetId, "asset ID"),
    version: input.version,
  }));
}

/** Snapshot of an image used as the base of an edit, kept 180 days. */
export function buildEditBaseObjectKey(input: { topicId: string; id: string }): string {
  return retentionKey("180d", editBaseSegments({
    topicId: safeKeySegment(input.topicId, "topic ID"),
    id: safeKeySegment(input.id, "edit base ID"),
  }));
}

/** The configured key prefix, for callers that classify existing keys. */
export function configuredR2ObjectPrefix(): string {
  return getR2Client().configuration.objectPrefix;
}

/** True when the object exists; false only for a definite 404. */
export async function privateR2ObjectExists(objectKey: string, signal?: AbortSignal): Promise<boolean> {
  assertObjectKey(objectKey);
  const { client, configuration } = getR2Client();
  try {
    await client.send(new HeadObjectCommand({ Bucket: configuration.bucket, Key: objectKey }), { abortSignal: signal });
    return true;
  } catch (error) {
    if (isNotFound(error)) return false;
    throw new R2StorageObjectError(`The private object could not be checked in R2: ${errorMessage(error)}`, { retryable: isRetryableR2Error(error) });
  }
}

/** Server-side copy inside the bucket; nothing is downloaded. */
export async function copyPrivateR2Object(sourceKey: string, destinationKey: string, signal?: AbortSignal): Promise<void> {
  assertObjectKey(sourceKey);
  assertObjectKey(destinationKey);
  const { client, configuration } = getR2Client();
  try {
    await client.send(new CopyObjectCommand({
      Bucket: configuration.bucket,
      Key: destinationKey,
      CopySource: `${configuration.bucket}/${sourceKey.split("/").map(encodeURIComponent).join("/")}`,
    }), { abortSignal: signal });
  } catch (error) {
    if (isNotFound(error)) throw new R2StorageMissingObjectError(sourceKey);
    throw new R2StorageObjectError(`The private object could not be copied in R2: ${errorMessage(error)}`, { retryable: isRetryableR2Error(error) });
  }
}

/** Reads a private image, or returns undefined when the object does not exist. */
export async function readPrivateR2ImageIfPresent(objectKey: string, signal?: AbortSignal): Promise<File | undefined> {
  try {
    return await readPrivateR2ImageFile({ objectKey, signal });
  } catch (error) {
    if (error instanceof R2StorageObjectError && error.notFound) return undefined;
    throw error;
  }
}

/** Private immutable photo belonging to one story in one topic. */
export function buildStoryReferenceObjectKey(topicId: string, storyId: string, photoId: string): string {
  const { objectPrefix } = getR2Client().configuration;
  const key = [objectPrefix, "topics", safeKeySegment(topicId, "topic ID"), "stories",
    safeKeySegment(storyId, "story ID"), "references", `${safeKeySegment(photoId, "photo ID")}.webp`].join("/");
  assertObjectKey(key);
  return key;
}
