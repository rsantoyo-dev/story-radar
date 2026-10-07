import type { ArchiveOutcome, AssetImageRef } from "./creative-asset-image-store.core";

/**
 * One bounded storage-maintenance pass (run hourly by the worker):
 *
 * 1. Approved images whose fal copy may still exist are copied to R2. Approval
 *    already copies them; this catches approvals made before this existed or
 *    whose copy failed. fal deletes images after 30 days, so older ones are
 *    not retried.
 * 2. Delivery JPEGs of published packages move from the 7-day class to the
 *    permanent class (server-side copy, then the file row points at it), so
 *    the R2 lifecycle rule never removes what was published.
 *
 * Deleting is left to R2 lifecycle rules by retention class; this pass never
 * deletes anything.
 */
export const FAL_RETENTION_DAYS = 30;
/** A little past fal's 30 days, in case its expiry runs late. */
export const ARCHIVE_LOOKBACK_DAYS = FAL_RETENTION_DAYS + 2;

export type PendingApprovedImage = AssetImageRef;

export type PublishedDeliveryFile = {
  fileId: string;
  topicId: string;
  packageId: string;
  unitOrder: number;
  objectKey: string;
};

export type StorageMaintenanceDependencies = {
  now: () => Date;
  /** Approved fal images completed since `since`, oldest first. */
  listRecentApprovedImages: (since: Date, limit: number) => Promise<PendingApprovedImage[]>;
  archive: (ref: AssetImageRef) => Promise<ArchiveOutcome>;
  /** Delivery files of published packages not yet in the permanent class. */
  listUnpreservedPublishedFiles: (options: { packageId?: string; limit: number }) => Promise<PublishedDeliveryFile[]>;
  publishedKey: (file: PublishedDeliveryFile) => string;
  copy: (sourceKey: string, destinationKey: string) => Promise<void>;
  isMissingObject: (error: unknown) => boolean;
  /** Points the file row at its permanent copy, only if it still has `from`. */
  repoint: (fileId: string, from: string, to: string) => Promise<void>;
};

export type ApprovedArchiveSummary = { checked: number; archived: number; present: number; failed: number };
export type PublishedPreservationSummary = { checked: number; preserved: number; missing: number; failed: number };

export async function archivePendingApprovedImages(
  deps: StorageMaintenanceDependencies,
  { deadline, limit = 200 }: { deadline: number; limit?: number },
): Promise<ApprovedArchiveSummary> {
  const since = new Date(deps.now().getTime() - ARCHIVE_LOOKBACK_DAYS * 86_400_000);
  const summary: ApprovedArchiveSummary = { checked: 0, archived: 0, present: 0, failed: 0 };
  for (const image of await deps.listRecentApprovedImages(since, limit)) {
    if (Date.now() >= deadline) break;
    summary.checked += 1;
    try {
      const outcome = await deps.archive(image);
      if (outcome === "archived") summary.archived += 1;
      else if (outcome === "present") summary.present += 1;
    } catch {
      // fal already deleted it, or a transient error: the next pass retries
      // while it is inside the lookback window.
      summary.failed += 1;
    }
  }
  return summary;
}

export async function preservePublishedDeliveries(
  deps: StorageMaintenanceDependencies,
  { deadline, packageId, limit = 200 }: { deadline: number; packageId?: string; limit?: number },
): Promise<PublishedPreservationSummary> {
  const summary: PublishedPreservationSummary = { checked: 0, preserved: 0, missing: 0, failed: 0 };
  for (const file of await deps.listUnpreservedPublishedFiles({ packageId, limit })) {
    if (Date.now() >= deadline) break;
    summary.checked += 1;
    const destination = deps.publishedKey(file);
    try {
      await deps.copy(file.objectKey, destination);
      await deps.repoint(file.fileId, file.objectKey, destination);
      summary.preserved += 1;
    } catch (error) {
      if (deps.isMissingObject(error)) summary.missing += 1;
      else summary.failed += 1;
    }
  }
  return summary;
}

export async function runStorageMaintenance(
  deps: StorageMaintenanceDependencies,
  { budgetMs }: { budgetMs: number },
): Promise<{ published: PublishedPreservationSummary; approved: ApprovedArchiveSummary }> {
  const deadline = Date.now() + budgetMs;
  // Published files first: their 7-day window is the shorter one.
  const published = await preservePublishedDeliveries(deps, { deadline });
  const approved = await archivePendingApprovedImages(deps, { deadline });
  return { published, approved };
}
