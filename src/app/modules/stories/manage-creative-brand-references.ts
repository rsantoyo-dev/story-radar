import "server-only";

import { createHash, randomUUID } from "node:crypto";
import sharp from "sharp";

import {
  assertBrandReferenceActivatable,
  brandContributionIsConfigured,
  parseCreativeBrandContribution,
  parseCreativeBrandReferenceMetadata,
  parseCreativeBrandReferencePatch,
  CreativeBrandReferenceValidationError,
} from "./creative-brand-reference-metadata";
import {
  createCreativeBrandReference,
  replaceBrandReferenceFile,
  type StoredCreativeBrandReference,
  CreativeBrandReferenceConflictError,
  findCreativeBrandReference,
  updateCreativeBrandReference,
  CreativeBrandReferenceNotFoundError,
} from "./creative-brand-references.repository";
import type {
  CreativeBrandContribution,
  CreativeBrandReference,
} from "./creative-content.types";
import {
  buildCreativeBrandReferenceObjectKey,
  deletePrivateR2Object,
  putPrivateR2Object,
  readPrivateR2ImageFile,
} from "./r2-storage";

const MAX_BRAND_REFERENCE_BYTES = 15 * 1024 * 1024;
const MIN_BRAND_REFERENCE_DIMENSION = 64;
const MAX_BRAND_REFERENCE_DIMENSION = 8_192;
const MAX_BRAND_REFERENCE_PIXELS = 60_000_000;
const MAX_BRAND_REFERENCE_ASPECT_RATIO = 30;

/** Accepted upload MIME → extension. Everything is stored as WebP regardless. */
const BRAND_REFERENCE_MIME_EXTENSIONS = new Map<string, string>([
  ["image/png", "png"],
  ["image/jpeg", "jpg"],
  ["image/webp", "webp"],
]);

export { CreativeBrandReferenceValidationError };

export type UploadCreativeBrandReferenceInput = {
  topicId: string;
  image: File;
  name: unknown;
  kind?: unknown;
  provenance?: unknown;
  usageNote?: unknown;
  providerTransmissionAllowed?: unknown;
};

export async function uploadCreativeBrandReference(
  input: UploadCreativeBrandReferenceInput,
  previous?: StoredCreativeBrandReference,
): Promise<CreativeBrandReference> {
  validateBrandReferenceFile(input.image);
  const metadata = parseCreativeBrandReferenceMetadata({
    name: input.name,
    kind: input.kind,
    provenance: input.provenance,
    usageNote: input.usageNote,
    providerTransmissionAllowed: input.providerTransmissionAllowed,
  });

  const normalized = await normalizeBrandReferenceImage(input.image);
  const originalBytes = new Uint8Array(await input.image.arrayBuffer());
  const referenceId = previous?.id ?? randomUUID();
  const version = (previous?.version ?? 0) + 1;
  const objectKeyBase = buildCreativeBrandReferenceObjectKey({
    topicId: input.topicId,
    referenceId,
    version,
    extension: "webp",
  });
  const objectKey = `${objectKeyBase}.${randomUUID()}`;

  await putPrivateR2Object({
    objectKey,
    body: normalized.body,
    contentType: "image/webp",
  });

  const originalSnapshot = { objectKey: `${objectKey}.original`,
    sha256: createHash("sha256").update(originalBytes).digest("hex"),
    contentType: input.image.type, fileName: input.image.name, fileSize: originalBytes.byteLength };
  try {
    await putPrivateR2Object({ objectKey: originalSnapshot.objectKey, body: originalBytes, contentType: originalSnapshot.contentType });
    const record = {
      originalSnapshot,
      id: referenceId,
      topicId: input.topicId,
      version,
      objectKey,
      sha256: createHash("sha256").update(normalized.body).digest("hex"),
      originalContentType: input.image.type,
      fileName: normalizedFileName(input.image.name),
      fileSize: normalized.body.byteLength,
      width: normalized.width,
      height: normalized.height,
      name: metadata.name,
      kind: metadata.kind,
      provenance: metadata.provenance,
      usageNote: metadata.usageNote,
      providerTransmissionAllowed: metadata.providerTransmissionAllowed,
    };
    return previous ? await replaceBrandReferenceFile(previous, record) : await createCreativeBrandReference(record);
  } catch (error) {
    // The row never existed, so this object is not a historical reference.
    await deletePrivateR2Object(originalSnapshot.objectKey).catch(() => undefined);
    await deletePrivateR2Object(objectKey).catch((cleanupError) => {
      console.error(
        "Failed to remove an unpersisted brand reference",
        cleanupError,
      );
    });
    throw error;
  }
}

export async function editCreativeBrandReference({
  topicId,
  referenceId,
  patch,
}: {
  topicId: string;
  referenceId: string;
  patch: unknown;
}): Promise<CreativeBrandReference> {
  const parsed = parseCreativeBrandReferencePatch(patch);

  // The activation gate (BRAND-02) needs the merged state (row + patch): a
  // reference may only be turned on for the journey once provider transmission
  // is allowed and a contribution is set. And turning either of those off must
  // not leave an already-activated reference dangling.
  const touchesGate =
    "activatedForJourney" in parsed ||
    "providerTransmissionAllowed" in parsed ||
    "contribution" in parsed;

  const row = await findCreativeBrandReference(topicId, referenceId);
  if (!row) throw new CreativeBrandReferenceNotFoundError("The brand reference was not found");
  const expected = patch as { expectedVersion?: number; expectedConfigVersion?: number };
  if ((expected.expectedVersion !== undefined && expected.expectedVersion !== row.version) ||
      (expected.expectedConfigVersion !== undefined && expected.expectedConfigVersion !== row.configVersion)) throw new CreativeBrandReferenceConflictError("The reference changed. Reload before saving.");
  if (touchesGate) {
    if (!row) {
      throw new CreativeBrandReferenceNotFoundError(
        "The brand reference was not found",
      );
    }
    const providerTransmissionAllowed =
      parsed.providerTransmissionAllowed ?? row.providerTransmissionAllowed;
    const contribution: CreativeBrandContribution | null =
      "contribution" in parsed
        ? (parsed.contribution ?? null)
        : readStoredContribution(row.contribution);
    const activatedForJourney =
      parsed.activatedForJourney ?? row.activatedForJourney;

    if (!providerTransmissionAllowed || !brandContributionIsConfigured(contribution)) {
      parsed.activatedForJourney = false;
    } else if (activatedForJourney) {
      assertBrandReferenceActivatable({
        providerTransmissionAllowed,
        contribution,
      });
    } else if (
      row.activatedForJourney &&
      (!providerTransmissionAllowed ||
        !brandContributionIsConfigured(contribution))
    ) {
      // Conditions were just removed from an active reference — deactivate it.
      parsed.activatedForJourney = false;
    }
  }

  return updateCreativeBrandReference(topicId, referenceId, parsed, row);
}

function readStoredContribution(
  value: unknown,
): CreativeBrandContribution | null {
  if (value == null) return null;
  try {
    return parseCreativeBrandContribution(value);
  } catch {
    return null;
  }
}

export async function readCreativeBrandReferenceFile({
  topicId,
  referenceId,
  original = false,
  version,
}: {
  topicId: string;
  referenceId: string;
  original?: boolean;
  version?: number;
}): Promise<File | undefined> {
  const current = await findCreativeBrandReference(topicId, referenceId);
  if (!current) return undefined;
  const row = version && version !== current.version ? current.revisions.find(revision => revision.version === version) as unknown as StoredCreativeBrandReference | undefined : current;
  if (!row) return undefined;
  if (original) return row.originalSnapshot ? readPrivateR2ImageFile(row.originalSnapshot) : undefined;
  return readPrivateR2ImageFile({
    objectKey: row.objectKey,
    contentType: row.contentType,
    fileName: row.fileName,
  });
}

function validateBrandReferenceFile(image: File): void {
  if (!BRAND_REFERENCE_MIME_EXTENSIONS.has(image.type)) {
    throw new CreativeBrandReferenceValidationError(
      "Brand references must be PNG, JPEG or WebP images.",
    );
  }
  if (image.size <= 0) {
    throw new CreativeBrandReferenceValidationError(
      "The brand reference is empty.",
    );
  }
  if (image.size > MAX_BRAND_REFERENCE_BYTES) {
    throw new CreativeBrandReferenceValidationError(
      "Brand references must be 15 MB or smaller.",
    );
  }
}

async function normalizeBrandReferenceImage(
  image: File,
): Promise<{ body: Uint8Array; width: number; height: number }> {
  try {
    const source = Buffer.from(await image.arrayBuffer());
    const metadata = await sharp(source, {
      limitInputPixels: MAX_BRAND_REFERENCE_PIXELS,
      failOn: "error",
      animated: false,
    }).metadata();

    const expectedFormat = image.type === "image/jpeg" ? "jpeg" : image.type === "image/png" ? "png" : "webp";
    if (metadata.format !== expectedFormat) throw new CreativeBrandReferenceValidationError("The file content does not match its image type.");
    assertBrandReferenceDimensions(metadata.width, metadata.height);

    // Re-encode: bakes EXIF orientation, strips all metadata (incl. GPS), and
    // gives every reference one decode path. The full sheet is kept — never
    // cropped or segmented into objects.
    const { data, info } = await sharp(source, {
      limitInputPixels: MAX_BRAND_REFERENCE_PIXELS,
      failOn: "error",
      animated: false,
    })
      .rotate()
      .resize(MAX_BRAND_REFERENCE_DIMENSION, MAX_BRAND_REFERENCE_DIMENSION, {
        fit: "inside",
        withoutEnlargement: true,
      })
      .webp({ quality: 90 })
      .toBuffer({ resolveWithObject: true });

    assertBrandReferenceDimensions(info.width, info.height);
    if (data.byteLength > MAX_BRAND_REFERENCE_BYTES) {
      throw new CreativeBrandReferenceValidationError(
        "The normalized brand reference exceeds 15 MB.",
      );
    }

    return {
      body: new Uint8Array(data),
      width: info.width,
      height: info.height,
    };
  } catch (error) {
    if (error instanceof CreativeBrandReferenceValidationError) throw error;
    throw new CreativeBrandReferenceValidationError(
      "The uploaded file is not a valid brand reference image.",
    );
  }
}

function assertBrandReferenceDimensions(
  width: number | undefined,
  height: number | undefined,
): void {
  if (
    !width ||
    !height ||
    width < MIN_BRAND_REFERENCE_DIMENSION ||
    height < MIN_BRAND_REFERENCE_DIMENSION ||
    width > MAX_BRAND_REFERENCE_DIMENSION ||
    height > MAX_BRAND_REFERENCE_DIMENSION ||
    width > height * MAX_BRAND_REFERENCE_ASPECT_RATIO ||
    height > width * MAX_BRAND_REFERENCE_ASPECT_RATIO
  ) {
    throw new CreativeBrandReferenceValidationError(
      "Brand reference dimensions must be 64–8192 px with an aspect ratio no wider than 30:1.",
    );
  }
}

function normalizedFileName(value: string): string {
  const base = value
    .trim()
    .replace(/[^a-zA-Z0-9._-]/g, "-")
    .replace(/\.[^.]+$/, "")
    .slice(0, 170);
  return `${base || "brand-reference"}.webp`;
}
