import "server-only";

import { and, eq } from "drizzle-orm";

import { db } from "@/db/client";
import { creativeBrandAssets } from "@/db/schema";

import type {
  CreativeBrandAsset,
  CreativeBrandOverlaySettings,
  CreativeBrandOverlaySnapshot,
} from "./creative-content.types";

export type StoredCreativeBrandAsset =
  typeof creativeBrandAssets.$inferSelect;

export async function createCreativeBrandAsset({
  id,
  topicId,
  objectKey,
  sha256,
  fileName,
  fileSize,
  width,
  height,
}: {
  id: string;
  topicId: string;
  objectKey: string;
  sha256: string;
  fileName: string;
  fileSize: number;
  width: number;
  height: number;
}): Promise<CreativeBrandAsset> {
  const [created] = await db
    .insert(creativeBrandAssets)
    .values({
      id,
      topicId,
      objectKey,
      sha256,
      contentType: "image/png",
      fileName,
      fileSize,
      width,
      height,
    })
    .returning();

  if (!created) {
    throw new Error("The brand asset could not be saved");
  }

  return publicCreativeBrandAsset(created);
}

/** Resolves an asset only when it belongs to the selected topic. */
export async function findCreativeBrandAsset(
  topicId: string,
  assetId: string,
): Promise<StoredCreativeBrandAsset | undefined> {
  const [asset] = await db
    .select()
    .from(creativeBrandAssets)
    .where(
      and(
        eq(creativeBrandAssets.id, assetId),
        eq(creativeBrandAssets.topicId, topicId),
      ),
    )
    .limit(1);

  return asset;
}

export async function requireCreativeBrandAsset(
  topicId: string,
  assetId: string,
): Promise<StoredCreativeBrandAsset> {
  const asset = await findCreativeBrandAsset(topicId, assetId);
  if (!asset) {
    throw new CreativeBrandAssetNotFoundError("The brand asset was not found");
  }
  return asset;
}

/** Browser-safe metadata; deliberately excludes topicId and objectKey. */
export function publicCreativeBrandAsset(
  asset: StoredCreativeBrandAsset,
): CreativeBrandAsset {
  return {
    id: asset.id,
    fileName: asset.fileName,
    contentType: "image/png",
    fileSize: asset.fileSize,
    width: asset.width,
    height: asset.height,
    createdAt: asset.createdAt,
  };
}

/** Server-only snapshot for deterministic post-generation composition. */
export function creativeBrandOverlaySnapshot(
  settings: CreativeBrandOverlaySettings,
  asset: StoredCreativeBrandAsset,
): CreativeBrandOverlaySnapshot {
  return {
    ...settings,
    compositorVersion: 1,
    asset: {
      ...publicCreativeBrandAsset(asset),
      objectKey: asset.objectKey,
      sha256: asset.sha256,
    },
  };
}

export class CreativeBrandAssetNotFoundError extends Error {}
