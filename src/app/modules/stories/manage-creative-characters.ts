import "server-only";

import { randomUUID } from "node:crypto";
import sharp from "sharp";

import {
  addCreativeCharacterReference,
  findCreativeCharacterReference,
} from "./creative-characters.repository";
import type { CreativeCharacterReferenceImage } from "./creative-content.types";
import {
  buildCreativeCharacterReferenceObjectKey,
  deletePrivateR2Object,
  putPrivateR2Object,
  readPrivateR2ImageFile,
} from "./r2-storage";

const MAX_REFERENCE_IMAGE_BYTES = 20 * 1024 * 1024;
const MIN_REFERENCE_IMAGE_DIMENSION = 256;
const MAX_REFERENCE_IMAGE_DIMENSION = 2_048;
const MAX_REFERENCE_IMAGE_PIXELS = 40_000_000;
const REFERENCE_IMAGE_EXTENSIONS = new Map<string, string>([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
]);

export async function uploadCreativeCharacterReference({
  topicId,
  characterId,
  image,
}: {
  topicId: string;
  characterId: string;
  image: File;
}): Promise<CreativeCharacterReferenceImage> {
  validateReferenceImage(image);
  const normalized = await normalizeReferenceImage(image);
  const referenceId = randomUUID();
  const objectKey = buildCreativeCharacterReferenceObjectKey({
    topicId,
    characterId,
    versionId: referenceId,
    referenceImageId: referenceId,
    extension: "webp",
  });

  await putPrivateR2Object({
    objectKey,
    body: normalized.body,
    contentType: "image/webp",
  });

  try {
    return await addCreativeCharacterReference({
      id: referenceId,
      topicId,
      characterId,
      objectKey,
      contentType: "image/webp",
      fileName: normalizedFileName(image.name),
      fileSize: normalized.body.byteLength,
    });
  } catch (error) {
    await deletePrivateR2Object(objectKey).catch((cleanupError) => {
      console.error(
        "Failed to remove an unpersisted character reference image",
        cleanupError,
      );
    });
    throw error;
  }
}

export async function readCreativeCharacterReference({
  topicId,
  characterId,
  referenceId,
}: {
  topicId: string;
  characterId: string;
  referenceId: string;
}): Promise<File | undefined> {
  const reference = await findCreativeCharacterReference(
    topicId,
    characterId,
    referenceId,
  );
  if (!reference) return undefined;

  return readPrivateR2ImageFile({
    objectKey: reference.objectKey,
    contentType: reference.contentType,
    fileName: reference.fileName,
  });
}

function validateReferenceImage(image: File): void {
  if (!REFERENCE_IMAGE_EXTENSIONS.has(image.type)) {
    throw new CreativeCharacterReferenceValidationError(
      "Reference images must be JPEG, PNG, or WebP files.",
    );
  }
  if (image.size <= 0) {
    throw new CreativeCharacterReferenceValidationError(
      "The reference image is empty.",
    );
  }
  if (image.size > MAX_REFERENCE_IMAGE_BYTES) {
    throw new CreativeCharacterReferenceValidationError(
      "Reference images must be 20 MB or smaller.",
    );
  }
}

async function normalizeReferenceImage(
  image: File,
): Promise<{ body: Uint8Array }> {
  try {
    const source = Buffer.from(await image.arrayBuffer());
    const sourceMetadata = await sharp(source, {
      limitInputPixels: MAX_REFERENCE_IMAGE_PIXELS,
      failOn: "error",
    }).metadata();
    if (
      !sourceMetadata.width ||
      !sourceMetadata.height ||
      sourceMetadata.width < MIN_REFERENCE_IMAGE_DIMENSION ||
      sourceMetadata.height < MIN_REFERENCE_IMAGE_DIMENSION
    ) {
      throw new CreativeCharacterReferenceValidationError(
        `Reference images must be at least ${MIN_REFERENCE_IMAGE_DIMENSION}×${MIN_REFERENCE_IMAGE_DIMENSION} pixels.`,
      );
    }

    // Re-encoding both validates the bytes and strips EXIF/location metadata
    // before the image becomes a durable private reference.
    const body = await sharp(source, {
      limitInputPixels: MAX_REFERENCE_IMAGE_PIXELS,
      failOn: "error",
    })
      .rotate()
      .resize(MAX_REFERENCE_IMAGE_DIMENSION, MAX_REFERENCE_IMAGE_DIMENSION, {
        fit: "inside",
        withoutEnlargement: true,
      })
      .webp({ quality: 92 })
      .toBuffer();

    return { body: new Uint8Array(body) };
  } catch (error) {
    if (error instanceof CreativeCharacterReferenceValidationError) {
      throw error;
    }
    throw new CreativeCharacterReferenceValidationError(
      "The uploaded file is not a valid reference image.",
    );
  }
}

function normalizedFileName(value: string): string {
  const base = value
    .trim()
    .replace(/[\\/\0]/g, "_")
    .replace(/\.[^.]+$/, "")
    .slice(0, 180);
  return `${base || "reference"}.webp`;
}

export class CreativeCharacterReferenceValidationError extends Error {}
