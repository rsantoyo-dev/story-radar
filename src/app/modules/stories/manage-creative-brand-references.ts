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
  const referenceId = randomUUID();
  const objectKey = buildCreativeBrandReferenceObjectKey({
    topicId: input.topicId,
    referenceId,
    version: 1,
    extension: "webp",
  });

  await putPrivateR2Object({
    objectKey,
    body: normalized.body,
    contentType: "image/webp",
  });

  try {
    return await createCreativeBrandReference({
      id: referenceId,
      topicId: input.topicId,
      version: 1,
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
    });
  } catch (error) {
    // The row never existed, so this object is not a historical reference.
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

  if (touchesGate) {
    const row = await findCreativeBrandReference(topicId, referenceId);
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

    if (activatedForJourney) {
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

  return updateCreativeBrandReference(topicId, referenceId, parsed);
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
}: {
  topicId: string;
  referenceId: string;
}): Promise<File | undefined> {
  const row = await findCreativeBrandReference(topicId, referenceId);
  if (!row) return undefined;
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
