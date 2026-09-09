import "server-only";

import { createHash, randomUUID } from "node:crypto";

import { after } from "next/server";
import { and, eq, gt, inArray, isNull, lt, or, sql } from "drizzle-orm";

import { db } from "@/db/client";
import {
  instagramDeliveryFiles,
  instagramPublicationJobs,
  instagramPublicationPackages,
  topicInstagramMedia,
} from "@/db/schema";

import {
  CreativeContentConflictError,
  CreativeContentNotFoundError,
} from "../stories/manage-creative-content";
import { PublicationJobConflictError } from "./publish-publication-package.core";

import { checkInstagramPublishingAccess } from "./check-instagram-publishing-access";
import { getPublicationCandidate } from "./get-publication-candidate";
import {
  createInstagramCarouselContainer,
  createInstagramMediaContainer,
  fetchInstagramMediaPermalink,
  getInstagramContainerStatus,
  GRAPH_API_VERSION,
  publishInstagramContainer,
} from "./meta-graph-client";
import { publishingIdentity, samePublishingIdentity } from "./instagram-publishing-access";
import {
  getDecryptedTopicMetaAccessToken,
  getPublicationDestination,
} from "./topic-meta-connections.repository";
import {
  isTerminalPublicationJobStatus,
  publicationRetryPatch,
  PublicationIdentityChangedError,
  PublicationJobLeaseLostError,
  MAX_ATTEMPTS,
  MAX_JOB_AGE_MS,
  runPublishPublicationJob,
  toPublicationJobView,
  type ChildContainer,
  type FrozenPackageForPublish,
  type PublicationJobPatch,
  type PublicationJobRow,
  type PublicationJobStatus,
  type PublicationJobView,
  type PublishJobDependencies,
} from "./publish-publication-package.core";

export {
  PublicationJobConflictError,
  PublicationJobStateError,
  type PublicationJobView,
} from "./publish-publication-package.core";

const NON_TERMINAL: PublicationJobStatus[] = [
  "queued",
  "preparing",
  "creating-containers",
  "containers-ready",
  "publishing",
  "pending-confirmation",
];
const LEASE_MS = 150_000; // Longer than the 120s request budget, including provider timeouts.
const STEP_INTERVAL_MS = 5_000;

function configuredInteger(name: string, fallback: number, min: number, max: number): number {
  const value = Number(process.env[name]);
  return Number.isInteger(value) && value >= min && value <= max ? value : fallback;
}
function maxAttempts() { return configuredInteger("INSTAGRAM_PUBLISH_MAX_ATTEMPTS", MAX_ATTEMPTS, 1, 10); }
function maxJobAgeMs() { return configuredInteger("INSTAGRAM_PUBLISH_MAX_MINUTES", MAX_JOB_AGE_MS / 60_000, 5, 60) * 60_000; }

/** Also pick up legacy jobs marked published before their local bookkeeping finished. */
function runnableJob() {
  return or(
    inArray(instagramPublicationJobs.status, NON_TERMINAL),
    and(eq(instagramPublicationJobs.status, "published"), or(
      isNull(instagramPublicationJobs.publishedMediaId),
      sql`NOT EXISTS (SELECT 1 FROM ${topicInstagramMedia} WHERE
        ${topicInstagramMedia.topicId} = ${instagramPublicationJobs.topicId}
        AND ${topicInstagramMedia.igUserId} = ${instagramPublicationJobs.igUserId}
        AND ${topicInstagramMedia.externalId} = ${instagramPublicationJobs.publishedMediaId}
        AND ${topicInstagramMedia.publishedPackageId} = ${instagramPublicationJobs.packageId})`,
      sql`EXISTS (SELECT 1 FROM ${instagramPublicationPackages} WHERE
        ${instagramPublicationPackages.id} = ${instagramPublicationJobs.packageId}
        AND ${instagramPublicationPackages.status} <> 'consumed')`,
      // Best-effort permalink retries are bounded; the media id already confirms publication.
      and(isNull(instagramPublicationJobs.permalink), gt(instagramPublicationJobs.finishedAt, new Date(Date.now() - maxJobAgeMs()))),
    )),
  );
}
function leaseAvailable() {
  return or(isNull(instagramPublicationJobs.leaseUntil), lt(instagramPublicationJobs.leaseUntil, new Date()));
}

function deliveryBaseUrl(): string {
  const url = process.env.RADAR_APP_URL?.trim().replace(/\/+$/u, "");
  if (!url) {
    throw new CreativeContentConflictError(
      "RADAR_APP_URL is not configured; delivery links cannot be built.",
    );
  }
  return url;
}

function idempotencyKey(packageHash: string, igUserId: string): string {
  return createHash("sha256")
    .update(`${packageHash}|${igUserId}|publish-now`)
    .digest("hex");
}

type JobDbRow = typeof instagramPublicationJobs.$inferSelect;

function mapJobRow(row: JobDbRow): PublicationJobRow {
  const children = Array.isArray(row.childContainers)
    ? (row.childContainers as ChildContainer[])
    : [];
  return {
    id: row.id,
    packageId: row.packageId,
    topicId: row.topicId,
    status: row.status as PublicationJobStatus,
    mediaType: (row.mediaType as "image" | "carousel" | null) ?? null,
    igUserId: row.igUserId,
    connectionVersion: row.connectionVersion,
    appConfigurationVersion: row.appConfigurationVersion ?? undefined,
    apiVersion: row.apiVersion,
    accessState: row.accessState,
    quotaRemaining: row.quotaRemaining,
    childContainers: children,
    parentContainerId: row.parentContainerId,
    publishedMediaId: row.publishedMediaId,
    permalink: row.permalink,
    attempts: row.attempts,
    failureKind: row.failureKind as PublicationJobRow["failureKind"],
    lastError: row.lastError,
    startedAt: row.startedAt,
    finishedAt: row.finishedAt,
  };
}

function patchToColumns(patch: PublicationJobPatch): Partial<JobDbRow> {
  const set: Partial<JobDbRow> = { updatedAt: new Date() };
  if (patch.status !== undefined) set.status = patch.status;
  if (patch.mediaType !== undefined) set.mediaType = patch.mediaType;
  if (patch.accessState !== undefined) set.accessState = patch.accessState;
  if (patch.accessCheckedAt !== undefined) {
    set.accessCheckedAt = patch.accessCheckedAt;
  }
  if (patch.quotaRemaining !== undefined) set.quotaRemaining = patch.quotaRemaining;
  if (patch.childContainers !== undefined) {
    set.childContainers = patch.childContainers;
  }
  if (patch.parentContainerId !== undefined) {
    set.parentContainerId = patch.parentContainerId;
  }
  if (patch.publishedMediaId !== undefined) {
    set.publishedMediaId = patch.publishedMediaId;
  }
  if (patch.permalink !== undefined) set.permalink = patch.permalink;
  if (patch.attempts !== undefined) set.attempts = patch.attempts;
  if (patch.failureKind !== undefined) set.failureKind = patch.failureKind;
  if (patch.lastError !== undefined) set.lastError = patch.lastError;
  if (patch.startedAt !== undefined) set.startedAt = patch.startedAt;
  if (patch.finishedAt !== undefined) set.finishedAt = patch.finishedAt;
  return set;
}

async function loadJobRow(jobId: string): Promise<JobDbRow> {
  const [row] = await db
    .select()
    .from(instagramPublicationJobs)
    .where(eq(instagramPublicationJobs.id, jobId))
    .limit(1);
  if (!row) throw new CreativeContentNotFoundError("Publication job not found");
  return row;
}

/**
 * Creates (or returns the existing) publish order for a frozen package and kicks
 * its first pass. Idempotent: a double click, a retry and a concurrent request
 * converge on one row via the unique `idempotency_key`.
 */
export async function requestPublishNow(
  topicId: string,
  draftId: string,
  packageId: string,
  retryJobId?: string,
): Promise<PublicationJobView> {
  const [pkg] = await db
    .select()
    .from(instagramPublicationPackages)
    .where(
      and(
        eq(instagramPublicationPackages.id, packageId),
        eq(instagramPublicationPackages.topicId, topicId),
        eq(instagramPublicationPackages.draftId, draftId),
      ),
    )
    .limit(1);
  if (!pkg) throw new CreativeContentNotFoundError("Publication package not found");
  if (!pkg.igUserId) throw new PublicationJobConflictError("The frozen package has no Instagram destination.");
  const key = idempotencyKey(pkg.packageHash, pkg.igUserId);
  const [existing] = await db.select().from(instagramPublicationJobs)
    .where(eq(instagramPublicationJobs.idempotencyKey, key)).limit(1);
  if (existing && (existing.topicId !== topicId || existing.draftId !== draftId)) {
    throw new PublicationJobConflictError("This exact package already has a publication order in another draft.");
  }
  // A replay of the original request remains read-only, including consumed packages.
  if (existing && !retryJobId) return toPublicationJobView(mapJobRow(existing), maxAttempts());
  if (retryJobId && (!existing || existing.id !== retryJobId || existing.packageId !== packageId)) {
    throw new PublicationJobConflictError("The retry does not match this publication order.");
  }
  if (pkg.status !== "frozen" || pkg.expiresAt.getTime() <= Date.now()) {
    throw new PublicationJobConflictError("The package is stale, consumed or expired. Validate and freeze again.");
  }
  const destination = await getPublicationDestination(topicId);
  if (destination.igUserId !== pkg.igUserId || destination.connectionVersion !== pkg.connectionVersion) {
    throw new PublicationJobConflictError("The frozen account or connection changed. Validate and freeze again.");
  }
  if (existing) {
    // The request must explicitly name the failed job, preventing a delayed initial POST from retrying it.
    if (existing.status !== "failed" && existing.status !== "suspended") return toPublicationJobView(mapJobRow(existing), maxAttempts());
    const patch = publicationRetryPatch(mapJobRow(existing), maxAttempts());
    const [retried] = await db.update(instagramPublicationJobs)
      .set({ ...patchToColumns(patch), startedAt: new Date(), leaseOwner: null, leaseUntil: null })
      .where(and(eq(instagramPublicationJobs.id, existing.id), eq(instagramPublicationJobs.status, existing.status),
        eq(instagramPublicationJobs.attempts, existing.attempts)))
      .returning();
    if (retried) after(() => advancePublicationJob(retried.id));
    return toPublicationJobView(mapJobRow(retried ?? await loadJobRow(existing.id)), maxAttempts());
  }
  const now = new Date();
  const inserted = await db
    .insert(instagramPublicationJobs)
    .values({
      topicId,
      storyId: pkg.storyId,
      draftId,
      batchId: pkg.batchId,
      packageId,
      idempotencyKey: key,
      status: "queued",
      startedAt: now,
      mediaType: pkg.mediaType,
      igUserId: destination.igUserId,
      connectionVersion: destination.connectionVersion,
      apiVersion: GRAPH_API_VERSION,
      appConfigurationVersion: destination.appConfigurationVersion,
      createdAt: now,
      updatedAt: now,
    } satisfies typeof instagramPublicationJobs.$inferInsert)
    .onConflictDoNothing({ target: instagramPublicationJobs.idempotencyKey })
    .returning();

  const job =
    inserted[0] ??
    (
      await db
        .select()
        .from(instagramPublicationJobs)
        .where(eq(instagramPublicationJobs.idempotencyKey, key))
        .limit(1)
    )[0];
  if (!job) throw new CreativeContentConflictError("Could not open a publish order.");
  if (job.topicId !== topicId || job.draftId !== draftId) {
    throw new PublicationJobConflictError("This exact package already has a publication order in another draft.");
  }

  if (job.status !== "published" && job.status !== "suspended") {
    after(() => advancePublicationJob(job.id));
  }
  return toPublicationJobView(mapJobRow(job), maxAttempts());
}

/** One bounded step, protected by a DB lease. No recursion or sleeping request. */
export async function advancePublicationJob(jobId: string): Promise<void> {
  const owner = randomUUID();
  const [claimed] = await db.update(instagramPublicationJobs)
    .set({ leaseOwner: owner, leaseUntil: new Date(Date.now() + LEASE_MS), updatedAt: new Date() })
    .where(and(eq(instagramPublicationJobs.id, jobId), runnableJob(), leaseAvailable()))
    .returning({ id: instagramPublicationJobs.id });
  if (!claimed) return;
  try {
    await runPublishPublicationJob(await buildDependencies(jobId, owner));
  } catch {
    // Provider/DB exceptions may contain credentials. Keep only the operational job id.
    console.error(`Publication job ${jobId} step failed; the worker will resume it.`);
  } finally {
    await db.update(instagramPublicationJobs)
      .set({ leaseOwner: null, leaseUntil: new Date(Date.now() + STEP_INTERVAL_MS), updatedAt: new Date() })
      .where(and(eq(instagramPublicationJobs.id, jobId), eq(instagramPublicationJobs.leaseOwner, owner)));
  }
}

/** Called by a supervised worker/cron, independently of browser reads. Oldest updates first for fairness. */
export async function resumePublicationJobs(): Promise<{ selected: number }> {
  const rows = await db.select({ id: instagramPublicationJobs.id }).from(instagramPublicationJobs)
    .where(and(runnableJob(), leaseAvailable())).orderBy(instagramPublicationJobs.updatedAt).limit(4);
  const outcomes = await Promise.allSettled(rows.map(row => advancePublicationJob(row.id)));
  if (outcomes.some(outcome => outcome.status === "rejected")) throw new Error("Publication worker step failed");
  return { selected: rows.length };
}

async function buildDependencies(
  jobId: string,
  owner: string,
): Promise<PublishJobDependencies> {
  const job = await loadJobRow(jobId);

  const [pkgRow] = await db
    .select()
    .from(instagramPublicationPackages)
    .where(eq(instagramPublicationPackages.id, job.packageId))
    .limit(1);
  if (!pkgRow) throw new CreativeContentNotFoundError("Publication package not found");

  const files = await db
    .select()
    .from(instagramDeliveryFiles)
    .where(eq(instagramDeliveryFiles.packageId, job.packageId));

  const expectedIdentity = { topicId: job.topicId, igUserId: job.igUserId,
    connectionVersion: job.connectionVersion, appConfigurationVersion: job.appConfigurationVersion ?? undefined };

  async function assertLease() {
    const current = await loadJobRow(jobId);
    if (current.leaseOwner !== owner || !current.leaseUntil || current.leaseUntil.getTime() <= Date.now()) {
      throw new PublicationJobLeaseLostError();
    }
  }
  async function currentToken(sending = false) {
    await assertLease();
    const destination = await getPublicationDestination(job.topicId);
    const token = await getDecryptedTopicMetaAccessToken(job.topicId);
    if (!samePublishingIdentity(expectedIdentity, publishingIdentity(job.topicId, destination)) ||
        !token || token.igUserId !== job.igUserId || token.connectionVersion !== job.connectionVersion ||
        job.apiVersion !== GRAPH_API_VERSION) throw new PublicationIdentityChangedError();
    if (sending) {
      const [current] = await db.select().from(instagramPublicationPackages)
        .where(eq(instagramPublicationPackages.id, job.packageId)).limit(1);
      if (!current || current.status !== "frozen" || current.expiresAt.getTime() <= Date.now()) throw new PublicationIdentityChangedError();
    }
    await assertLease();
    return token;
  }
  const frozen: FrozenPackageForPublish = {
    status: pkgRow.status as FrozenPackageForPublish["status"],
    mediaType: pkgRow.mediaType as "image" | "carousel",
    caption: pkgRow.caption,
    candidateSnapshotHash: pkgRow.candidateSnapshotHash,
    expiresAt: pkgRow.expiresAt,
    destination: { igUserId: pkgRow.igUserId, igUsername: pkgRow.igUsername },
    slides: [...files]
      .sort((a, b) => a.unitOrder - b.unitOrder)
      .map((file) => ({
        unitOrder: file.unitOrder,
        deliveryUrl: `/api/deliver/${file.token}`,
      })),
  };

  return {
    loadJob: async () => mapJobRow(await loadJobRow(jobId)),
    loadPackage: async () => frozen,
    reverifyAccess: () =>
      checkInstagramPublishingAccess(job.topicId, expectedIdentity),
    expectedIdentity,
    apiVersion: GRAPH_API_VERSION,
    currentCandidateSnapshotHash: async () => {
      const candidate = await getPublicationCandidate(job.topicId, job.draftId, job.batchId);
      return candidate.state === "ready" ? candidate.snapshotHash : "not-ready";
    },
    createImageContainer: async (input) => {
      const token = await currentToken(true);
      return createInstagramMediaContainer(token.igUserId, token.accessToken,
        { ...input, imageUrl: `${deliveryBaseUrl()}${input.imageUrl}` });
    },
    createCarouselContainer: async (input) => {
      const token = await currentToken(true);
      return createInstagramCarouselContainer(token.igUserId, token.accessToken, input);
    },
    getContainerStatus: async (containerId) => getInstagramContainerStatus(containerId, (await currentToken()).accessToken),
    publishContainer: async (creationId) => {
      const token = await currentToken(true);
      return publishInstagramContainer(token.igUserId, token.accessToken, creationId);
    },
    fetchPermalink: async (mediaId) => fetchInstagramMediaPermalink(mediaId, (await currentToken()).accessToken),
    transition: async (from, patch) => {
      const [updated] = await db
        .update(instagramPublicationJobs)
        .set(patchToColumns(patch))
        .where(
          and(
            eq(instagramPublicationJobs.id, jobId),
            eq(instagramPublicationJobs.status, from),
            eq(instagramPublicationJobs.leaseOwner, owner),
            gt(instagramPublicationJobs.leaseUntil, new Date()),
          ),
        )
        .returning();
      return updated ? mapJobRow(updated) : null;
    },
    markPackageConsumed: async () => {
      await assertLease();
      await db
        .update(instagramPublicationPackages)
        .set({ status: "consumed", updatedAt: new Date() })
        .where(
          and(
            eq(instagramPublicationPackages.id, job.packageId),
            inArray(instagramPublicationPackages.status, ["frozen", "stale"]),
          ),
        );
    },
    recordPublishedMedia: async (input) => {
      await assertLease();
      const publishedAt = input.publishedAt;
      await db
        .insert(topicInstagramMedia)
        .values({
          topicId: job.topicId,
          igUserId: job.igUserId!,
          externalId: input.externalId,
          mediaType: input.mediaType === "carousel" ? "CAROUSEL_ALBUM" : "IMAGE",
          mediaProductType: "FEED",
          permalink: input.permalink ?? null,
          caption: pkgRow.caption,
          publishedAt,
          linkedStoryId: job.storyId,
          linkedDraftId: job.draftId,
          linkedDraftVersion: pkgRow.draftVersion,
          linkedBatchId: job.batchId,
          linkedAt: new Date(),
          linkedBy: "auto-publish",
          publishedPackageId: job.packageId,
          raw: { source: "publication-job", jobId, packageId: job.packageId },
          updatedAt: new Date(),
        } satisfies typeof topicInstagramMedia.$inferInsert)
        .onConflictDoUpdate({
          target: [topicInstagramMedia.topicId, topicInstagramMedia.externalId],
          set: {
            permalink: sql`COALESCE(${topicInstagramMedia.permalink}, excluded.permalink)`,
            // A sync row is untouched editorially only while linkedAt is null.
            // A manual unlink also sets linkedAt, so it must survive this repair.
            linkedStoryId: sql`CASE WHEN ${topicInstagramMedia.linkedAt} IS NULL AND ${topicInstagramMedia.publishedPackageId} IS NULL THEN excluded.linked_story_id ELSE ${topicInstagramMedia.linkedStoryId} END`,
            linkedDraftId: sql`CASE WHEN ${topicInstagramMedia.linkedAt} IS NULL AND ${topicInstagramMedia.publishedPackageId} IS NULL THEN excluded.linked_draft_id ELSE ${topicInstagramMedia.linkedDraftId} END`,
            linkedDraftVersion: sql`CASE WHEN ${topicInstagramMedia.linkedAt} IS NULL AND ${topicInstagramMedia.publishedPackageId} IS NULL THEN excluded.linked_draft_version ELSE ${topicInstagramMedia.linkedDraftVersion} END`,
            linkedBatchId: sql`CASE WHEN ${topicInstagramMedia.linkedAt} IS NULL AND ${topicInstagramMedia.publishedPackageId} IS NULL THEN excluded.linked_batch_id ELSE ${topicInstagramMedia.linkedBatchId} END`,
            linkedBy: sql`CASE WHEN ${topicInstagramMedia.linkedAt} IS NULL AND ${topicInstagramMedia.publishedPackageId} IS NULL THEN excluded.linked_by ELSE ${topicInstagramMedia.linkedBy} END`,
            linkedAt: sql`COALESCE(${topicInstagramMedia.linkedAt}, excluded.linked_at)`,
            publishedPackageId: sql`COALESCE(${topicInstagramMedia.publishedPackageId}, excluded.published_package_id)`,
            updatedAt: new Date(),
          },
        });
    },
    now: () => new Date(),
    maxAttempts: maxAttempts(),
    maxJobAgeMs: maxJobAgeMs(),
  };
}

function reconcileOnRead(rows: JobDbRow[]): void {
  const now = Date.now();
  for (const row of rows) {
    const stale =
      !isTerminalPublicationJobStatus(row.status as PublicationJobStatus) &&
      (!row.leaseUntil || row.leaseUntil.getTime() < now);
    if (stale) after(() => advancePublicationJob(row.id));
  }
}

export async function getPublicationJob(
  topicId: string,
  jobId: string,
  draftId: string,
): Promise<PublicationJobView> {
  const [row] = await db
    .select()
    .from(instagramPublicationJobs)
    .where(
      and(
        eq(instagramPublicationJobs.id, jobId),
        eq(instagramPublicationJobs.topicId, topicId),
        eq(instagramPublicationJobs.draftId, draftId),
      ),
    )
    .limit(1);
  if (!row) throw new CreativeContentNotFoundError("Publication job not found");
  reconcileOnRead([row]);
  return toPublicationJobView(mapJobRow(row), maxAttempts());
}

export async function listPublicationJobs(
  topicId: string,
  draftId: string,
): Promise<PublicationJobView[]> {
  const rows = await db
    .select()
    .from(instagramPublicationJobs)
    .where(
      and(
        eq(instagramPublicationJobs.topicId, topicId),
        eq(instagramPublicationJobs.draftId, draftId),
      ),
    )
    .orderBy(instagramPublicationJobs.createdAt);
  reconcileOnRead(rows);
  return rows.map((row) => toPublicationJobView(mapJobRow(row), maxAttempts()));
}
