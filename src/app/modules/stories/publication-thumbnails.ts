import "server-only";

import { and, eq, inArray, isNotNull } from "drizzle-orm";

import { db } from "@/db/client";
import {
  creativeAssets,
  instagramDeliveryFiles,
  instagramPublicationJobs,
  instagramPublicationPackages,
  topicInstagramMedia,
} from "@/db/schema";

import {
  pickCoverAsset,
  resolvePublicationThumbnails,
} from "./publication-thumbnails.core";

/**
 * Thumbnail candidates for published Stories, keyed by story id. Read-only;
 * see `publication-thumbnails.core.ts` for the preference order.
 */
export async function loadPublicationThumbnails(
  topicId: string,
  storyIds: readonly string[],
): Promise<Map<string, string[]>> {
  if (!storyIds.length) return new Map();
  const ids = [...storyIds];

  const [jobs, linkedMedia] = await Promise.all([
    db
      .select({
        storyId: instagramPublicationJobs.storyId,
        packageId: instagramPublicationJobs.packageId,
        publishedAt: instagramPublicationJobs.finishedAt,
      })
      .from(instagramPublicationJobs)
      .where(
        and(
          eq(instagramPublicationJobs.topicId, topicId),
          inArray(instagramPublicationJobs.storyId, ids),
          eq(instagramPublicationJobs.status, "published"),
          isNotNull(instagramPublicationJobs.publishedMediaId),
        ),
      ),
    db
      .select({
        storyId: topicInstagramMedia.linkedStoryId,
        publishedAt: topicInstagramMedia.publishedAt,
        publishedPackageId: topicInstagramMedia.publishedPackageId,
        linkedBatchId: topicInstagramMedia.linkedBatchId,
        mediaType: topicInstagramMedia.mediaType,
        mediaUrl: topicInstagramMedia.mediaUrl,
        thumbnailUrl: topicInstagramMedia.thumbnailUrl,
        accessState: topicInstagramMedia.accessState,
      })
      .from(topicInstagramMedia)
      .where(
        and(
          eq(topicInstagramMedia.topicId, topicId),
          inArray(topicInstagramMedia.linkedStoryId, ids),
        ),
      ),
  ]);

  const media = linkedMedia.flatMap((row) =>
    row.storyId ? [{ ...row, storyId: row.storyId }] : [],
  );
  const packageIds = [
    ...new Set([
      ...jobs.map((job) => job.packageId),
      ...media.flatMap((row) => (row.publishedPackageId ? [row.publishedPackageId] : [])),
    ]),
  ];
  const linkedBatchIds = [
    ...new Set(media.flatMap((row) => (row.linkedBatchId ? [row.linkedBatchId] : []))),
  ];

  const [packageCoverUrls, batchCoverUrls] = await Promise.all([
    loadPackageCoverUrls(topicId, packageIds),
    loadBatchCoverUrls(linkedBatchIds),
  ]);

  return resolvePublicationThumbnails({
    publishedPackages: jobs,
    linkedMedia: media,
    packageCoverUrls,
    batchCoverUrls,
  });
}

/** The exact asset version each frozen package delivered as its first slide. */
async function loadPackageCoverUrls(
  topicId: string,
  packageIds: string[],
): Promise<Map<string, string>> {
  if (!packageIds.length) return new Map();
  const [packages, files] = await Promise.all([
    db
      .select({ id: instagramPublicationPackages.id, batchId: instagramPublicationPackages.batchId })
      .from(instagramPublicationPackages)
      .where(
        and(
          eq(instagramPublicationPackages.topicId, topicId),
          inArray(instagramPublicationPackages.id, packageIds),
        ),
      ),
    db
      .select({
        packageId: instagramDeliveryFiles.packageId,
        unitOrder: instagramDeliveryFiles.unitOrder,
        assetVersion: instagramDeliveryFiles.assetVersion,
      })
      .from(instagramDeliveryFiles)
      .where(inArray(instagramDeliveryFiles.packageId, packageIds)),
  ]);

  const coverFileByPackage = new Map<string, { unitOrder: number; assetVersion: number }>();
  for (const file of files) {
    const current = coverFileByPackage.get(file.packageId);
    if (!current || file.unitOrder < current.unitOrder) coverFileByPackage.set(file.packageId, file);
  }
  const batchIds = [...new Set(packages.map((entry) => entry.batchId))];
  if (!batchIds.length) return new Map();
  const assets = await db
    .select({
      batchId: creativeAssets.batchId,
      unitOrder: creativeAssets.unitOrder,
      version: creativeAssets.version,
      imageUrl: creativeAssets.imageUrl,
    })
    .from(creativeAssets)
    .where(inArray(creativeAssets.batchId, batchIds));

  const result = new Map<string, string>();
  for (const entry of packages) {
    const cover = coverFileByPackage.get(entry.id);
    if (!cover) continue;
    const asset = assets.find(
      (candidate) =>
        candidate.batchId === entry.batchId &&
        candidate.unitOrder === cover.unitOrder &&
        candidate.version === cover.assetVersion,
    );
    if (asset?.imageUrl) result.set(entry.id, asset.imageUrl);
  }
  return result;
}

/** First approved slide of each linked image batch. */
async function loadBatchCoverUrls(batchIds: string[]): Promise<Map<string, string>> {
  if (!batchIds.length) return new Map();
  const assets = await db
    .select({
      batchId: creativeAssets.batchId,
      unitOrder: creativeAssets.unitOrder,
      version: creativeAssets.version,
      imageUrl: creativeAssets.imageUrl,
    })
    .from(creativeAssets)
    .where(and(inArray(creativeAssets.batchId, batchIds), eq(creativeAssets.status, "approved")));

  const result = new Map<string, string>();
  for (const batchId of batchIds) {
    const cover = pickCoverAsset(assets.filter((asset) => asset.batchId === batchId));
    if (cover?.imageUrl) result.set(batchId, cover.imageUrl);
  }
  return result;
}
