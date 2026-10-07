import "server-only";

import { and, asc, eq, gte, inArray, isNotNull, like, notLike, sql } from "drizzle-orm";

import { db } from "@/db/client";
import {
  creativeAssetBatches,
  creativeAssets,
  creativeDrafts,
  instagramDeliveryFiles,
  instagramPublicationJobs,
  instagramPublicationPackages,
} from "@/db/schema";

import { archiveApprovedImage } from "./creative-image-source";
import {
  buildPublishedDeliveryObjectKey,
  copyPrivateR2Object,
  R2StorageObjectError,
} from "./r2-storage";
import {
  preservePublishedDeliveries,
  runStorageMaintenance,
  type StorageMaintenanceDependencies,
} from "./storage-maintenance.core";

const dependencies: StorageMaintenanceDependencies = {
  now: () => new Date(),
  listRecentApprovedImages: async (since, limit) =>
    db
      .select({
        topicId: creativeDrafts.topicId,
        assetId: creativeAssets.id,
        version: creativeAssets.version,
        imageUrl: creativeAssets.imageUrl,
      })
      .from(creativeAssets)
      .innerJoin(creativeAssetBatches, eq(creativeAssetBatches.id, creativeAssets.batchId))
      .innerJoin(creativeDrafts, eq(creativeDrafts.id, creativeAssetBatches.draftId))
      .where(
        and(
          eq(creativeAssets.status, "approved"),
          isNotNull(creativeAssets.imageUrl),
          like(creativeAssets.imageUrl, "https://%fal.media/%"),
          gte(sql`coalesce(${creativeAssets.completedAt}, ${creativeAssets.createdAt})`, since),
        ),
      )
      // Oldest first: those are closest to fal deleting them.
      .orderBy(asc(sql`coalesce(${creativeAssets.completedAt}, ${creativeAssets.createdAt})`))
      .limit(limit),
  archive: archiveApprovedImage,
  listUnpreservedPublishedFiles: async ({ packageId, limit }) => {
    const publishedPackages = db
      .selectDistinct({ packageId: instagramPublicationJobs.packageId })
      .from(instagramPublicationJobs)
      .where(eq(instagramPublicationJobs.status, "published"));
    return db
      .select({
        fileId: instagramDeliveryFiles.id,
        topicId: instagramPublicationPackages.topicId,
        packageId: instagramDeliveryFiles.packageId,
        unitOrder: instagramDeliveryFiles.unitOrder,
        objectKey: instagramDeliveryFiles.objectKey,
      })
      .from(instagramDeliveryFiles)
      .innerJoin(instagramPublicationPackages, eq(instagramPublicationPackages.id, instagramDeliveryFiles.packageId))
      .where(
        and(
          inArray(instagramDeliveryFiles.packageId, publishedPackages),
          notLike(instagramDeliveryFiles.objectKey, "%/retention/permanent/%"),
          packageId ? eq(instagramDeliveryFiles.packageId, packageId) : undefined,
        ),
      )
      .orderBy(asc(instagramDeliveryFiles.createdAt))
      .limit(limit);
  },
  publishedKey: (file) => buildPublishedDeliveryObjectKey(file),
  copy: (sourceKey, destinationKey) => copyPrivateR2Object(sourceKey, destinationKey, AbortSignal.timeout(20_000)),
  isMissingObject: (error) => error instanceof R2StorageObjectError && error.notFound,
  repoint: async (fileId, from, to) => {
    await db
      .update(instagramDeliveryFiles)
      .set({ objectKey: to })
      .where(and(eq(instagramDeliveryFiles.id, fileId), eq(instagramDeliveryFiles.objectKey, from)));
  },
};

/** One bounded hourly pass; see storage-maintenance.core.ts. */
export function runStorageMaintenancePass(budgetMs: number) {
  return runStorageMaintenance(dependencies, { budgetMs });
}

/** Called right after a publication confirms, so its files never wait for the hourly pass. */
export async function preservePublishedPackage(packageId: string): Promise<void> {
  await preservePublishedDeliveries(dependencies, { packageId, deadline: Date.now() + 30_000 });
}
