import "server-only";

import { createHash, randomUUID } from "node:crypto";
import sharp from "sharp";

import {
  createCreativeBrandAsset,
  requireCreativeBrandAsset,
} from "./creative-brand-assets.repository";
import type { CreativeBrandAsset } from "./creative-content.types";
import {
  buildCreativeBrandAssetObjectKey,
  deletePrivateR2Object,
  putPrivateR2Object,
  readPrivateR2ImageFile,
} from "./r2-storage";

const MAX_BRAND_ASSET_BYTES = 5 * 1024 * 1024;
const MIN_BRAND_ASSET_DIMENSION = 16;
const MAX_BRAND_ASSET_DIMENSION = 4_096;
const MAX_BRAND_ASSET_PIXELS =
  MAX_BRAND_ASSET_DIMENSION * MAX_BRAND_ASSET_DIMENSION;
const MAX_BRAND_ASSET_ASPECT_RATIO = 20;

export async function uploadCreativeBrandAsset({
  topicId,
  image,
}: {
  topicId: string;
  image: File;
}): Promise<CreativeBrandAsset> {
  validateBrandAssetFile(image);
  const normalized = await normalizeBrandAsset(image);
  const assetId = randomUUID();
  const objectKey = buildCreativeBrandAssetObjectKey({ topicId, assetId });

  await putPrivateR2Object({
    objectKey,
    body: normalized.body,
    contentType: "image/png",
  });

  try {
    return await createCreativeBrandAsset({
      id: assetId,
      topicId,
      objectKey,
      sha256: createHash("sha256").update(normalized.body).digest("hex"),
      fileName: normalizedFileName(image.name),
      fileSize: normalized.body.byteLength,
      width: normalized.width,
      height: normalized.height,
    });
  } catch (error) {
    // The database row never existed, so this object is not a historical asset.
    await deletePrivateR2Object(objectKey).catch((cleanupError) => {
      console.error("Failed to remove an unpersisted brand asset", cleanupError);
    });
    throw error;
  }
}

export async function readCreativeBrandAsset({
  topicId,
  assetId,
}: {
  topicId: string;
  assetId: string;
}): Promise<File> {
  const asset = await requireCreativeBrandAsset(topicId, assetId);
  return readPrivateR2ImageFile({
    objectKey: asset.objectKey,
    contentType: asset.contentType,
    fileName: asset.fileName,
  });
}

function validateBrandAssetFile(image: File): void {
  if (image.type !== "image/png") {
    throw new CreativeBrandAssetValidationError(
      "Brand assets must be PNG files with transparency.",
    );
  }
  if (image.size <= 0) {
    throw new CreativeBrandAssetValidationError("The brand asset is empty.");
  }
  if (image.size > MAX_BRAND_ASSET_BYTES) {
    throw new CreativeBrandAssetValidationError(
      "Brand assets must be 5 MB or smaller.",
    );
  }
}

async function normalizeBrandAsset(
  image: File,
): Promise<{ body: Uint8Array; width: number; height: number }> {
  try {
    const source = Buffer.from(await image.arrayBuffer());
    const input = sharp(source, {
      limitInputPixels: MAX_BRAND_ASSET_PIXELS,
      failOn: "error",
      animated: false,
    });
    const metadata = await input.metadata();

    if (metadata.format !== "png" || (metadata.pages ?? 1) !== 1) {
      throw new CreativeBrandAssetValidationError(
        "The uploaded file must be a static PNG image.",
      );
    }
    assertBrandAssetDimensions(metadata.width, metadata.height);
    if (!metadata.hasAlpha) {
      throw new CreativeBrandAssetValidationError(
        "The brand asset must contain both visible and transparent pixels.",
      );
    }
    const visibleBounds = await alphaContentBounds(
      source,
      metadata.width,
      metadata.height,
    );

    // Re-encoding validates the full payload and strips metadata while keeping
    // the approved pixels and alpha channel immutable under this asset ID.
    // Transparent outer margins are removed so configured placement and size
    // describe the visible mark, not an arbitrary empty PNG canvas.
    const { data, info } = await sharp(source, {
      limitInputPixels: MAX_BRAND_ASSET_PIXELS,
      failOn: "error",
      animated: false,
    })
      .extract(visibleBounds)
      .png({ compressionLevel: 9, adaptiveFiltering: true, effort: 10 })
      .toBuffer({ resolveWithObject: true });

    assertBrandAssetDimensions(info.width, info.height);
    if (data.byteLength > MAX_BRAND_ASSET_BYTES) {
      throw new CreativeBrandAssetValidationError(
        "The normalized brand asset exceeds 5 MB.",
      );
    }

    return {
      body: new Uint8Array(data),
      width: info.width,
      height: info.height,
    };
  } catch (error) {
    if (error instanceof CreativeBrandAssetValidationError) throw error;
    throw new CreativeBrandAssetValidationError(
      "The uploaded file is not a valid transparent PNG brand asset.",
    );
  }
}

async function alphaContentBounds(
  source: Buffer,
  width: number,
  height: number,
): Promise<{ left: number; top: number; width: number; height: number }> {
  const alpha = await sharp(source, {
    limitInputPixels: MAX_BRAND_ASSET_PIXELS,
    failOn: "error",
    animated: false,
  })
    .extractChannel("alpha")
    .raw({ depth: "uchar" })
    .toBuffer();
  let left = width;
  let top = height;
  let right = -1;
  let bottom = -1;
  let hasTransparentPixel = false;

  for (let index = 0; index < alpha.byteLength; index += 1) {
    const value = alpha[index];
    if (value !== 255) hasTransparentPixel = true;
    if (value === 0) continue;
    const x = index % width;
    const y = Math.floor(index / width);
    if (x < left) left = x;
    if (x > right) right = x;
    if (y < top) top = y;
    if (y > bottom) bottom = y;
  }

  if (!hasTransparentPixel || right < left || bottom < top) {
    throw new CreativeBrandAssetValidationError(
      "The brand asset must contain both visible and transparent pixels.",
    );
  }

  return {
    left,
    top,
    width: right - left + 1,
    height: bottom - top + 1,
  };
}

function assertBrandAssetDimensions(
  width: number | undefined,
  height: number | undefined,
): void {
  if (
    !width ||
    !height ||
    width < MIN_BRAND_ASSET_DIMENSION ||
    height < MIN_BRAND_ASSET_DIMENSION ||
    width > MAX_BRAND_ASSET_DIMENSION ||
    height > MAX_BRAND_ASSET_DIMENSION ||
    width > height * MAX_BRAND_ASSET_ASPECT_RATIO ||
    height > width * MAX_BRAND_ASSET_ASPECT_RATIO
  ) {
    throw new CreativeBrandAssetValidationError(
      "Brand asset dimensions must be 16–4096 px with an aspect ratio no wider than 20:1.",
    );
  }
}

function normalizedFileName(value: string): string {
  const base = value
    .trim()
    .replace(/[^a-zA-Z0-9._-]/g, "-")
    .replace(/\.[^.]+$/, "")
    .slice(0, 170);
  return `${base || "brand-logo"}.png`;
}

export class CreativeBrandAssetValidationError extends Error {}
