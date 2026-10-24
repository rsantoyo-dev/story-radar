import { scheduledPastDeadline } from "./publish-publication-package.core";
import { draft2FactsByPublicationDraft } from "../draft2/draft2-session.repository";
import { storyDeadline } from "../draft2/draft2-data-marks";
import "server-only";

import { createHash, randomUUID } from "node:crypto";
import { setTimeout as sleep } from "node:timers/promises";

import { after } from "next/server";
import { and, eq, gt, inArray, isNotNull, isNull, lt, lte, or, sql } from "drizzle-orm";

import { db } from "@/db/client";
import {
  instagramDeliveryFiles,
  instagramPublicationJobs,
  instagramPublicationPackages,
  storySocialPublications,
  topicInstagramMedia,
} from "@/db/schema";

import {
  CreativeContentConflictError,
  CreativeContentNotFoundError,
} from "../stories/manage-creative-content";
import {
  PublicationJobConflictError,
  releasedUncertainError,
  SCHEDULE_EXPIRY_MARGIN_MS,
  schedulePublishAt,
  UNRESOLVED_SEND_STATUSES,
  unresolvedSendMessage,
  unresolvedSendsTo,
} from "./publish-publication-package.core";
import { publicationPostText } from "./instagram-publication-candidate";
import { preservePublishedPackage } from "../stories/storage-maintenance";

import { getPublicationCandidate } from "./get-publication-candidate";
import {
  createPageComment,
  fetchPagePostPermalink,
  findPageComment,
  publishPagePhotoPost,
  uploadUnpublishedPagePhoto,
} from "./meta-facebook-graph-client";
import {
  CommentAccountChangedError,
  runFirstComment,
  type CommentStatus,
  type FirstCommentPatch,
} from "./publication-first-comment.core";
import {
  createInstagramCarouselContainer,
  createInstagramComment,
  createInstagramMediaContainer,
  findInstagramComment,
  fetchInstagramMediaPermalink,
  getInstagramContainerStatus,
  GRAPH_API_VERSION,
  publishInstagramContainer,
} from "./meta-graph-client";
import { publishingIdentity, samePublishingIdentity } from "./instagram-publishing-access";
import {
  checkChannelPublishingAccess,
  getChannelPublicationDestination,
  getChannelSendCredentials,
  instagramGraphHostFor,
} from "./publication-channel-connections";
import {
  DEFAULT_PUBLICATION_CHANNEL,
  destinationAccountId,
  parsePublicationChannel,
  publicationPlatformLabel,
  type PublicationChannel,
} from "./publication-channel";
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
/**
 * How long one worker pass keeps driving an order, step after step, before
 * it starts no new step (the last one ends well inside the route's 120 s and
 * the 150 s lease). A carousel takes a dozen steps (one container per image,
 * each image's status, the parent, the send, the confirmation), and the
 * GitHub worker "every 5 minutes" ran every 10 to 20: at one step per pass, a
 * scheduled Salut St-Jean post (2026-10-21) had made two containers when its
 * 30-minute delivery window closed. The open page drives an order itself.
 */
const WORKER_PASS_BUDGET_MS = 75_000;
/** The pause between two steps that moved the order on. */
const WORKER_STEP_PAUSE_MS = 1_000;

/** How far one call drives an order: one step (`budgetMs` 0, for a read or a request), or steps until the budget runs out. */
export type PublicationWorkerPass = { budgetMs?: number; waitMs?: number; pauseMs?: number };

/** What changes when a step moves an order on; the same after a step means Meta is still processing. */
const progressOf = (row: JobDbRow) => JSON.stringify([row.status, row.childContainers, row.parentContainerId, row.publishedMediaId, row.lastError]);

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
      // A Facebook post is recorded in story_social_publications, not the
      // Instagram media table; only Instagram jobs are checked against it.
      sql`${instagramPublicationJobs.channel} <> 'facebook-page' AND NOT EXISTS (SELECT 1 FROM ${topicInstagramMedia} WHERE
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
/** A published order whose first comment is still to be posted or confirmed. */
function commentDueJob() {
  return and(eq(instagramPublicationJobs.status, "published"), isNotNull(instagramPublicationJobs.publishedMediaId),
    inArray(instagramPublicationJobs.commentStatus, ["pending", "posting"]));
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

/** The direct channel keeps its original key format, so existing orders still converge. */
function idempotencyKey(packageHash: string, accountId: string, channel: PublicationChannel): string {
  return createHash("sha256")
    .update(channel === "instagram-direct"
      ? `${packageHash}|${accountId}|publish-now`
      : `${packageHash}|${channel}|${accountId}|publish-now`)
    .digest("hex");
}

/**
 * Facebook has no carousel container: the "children" are unpublished Page
 * photos, and the parent is this local marker listing them in order. It never
 * leaves the server; publishContainer turns it into ONE feed post.
 */
const FACEBOOK_ATTACHMENT_PREFIX = "attach:";
function facebookPhotoIds(parentContainerId: string): string[] {
  return parentContainerId.startsWith(FACEBOOK_ATTACHMENT_PREFIX)
    ? parentContainerId.slice(FACEBOOK_ATTACHMENT_PREFIX.length).split(",").filter(Boolean)
    : [parentContainerId];
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
    channel: parsePublicationChannel(row.channel) ?? DEFAULT_PUBLICATION_CHANNEL,
    pageId: row.pageId,
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
    publishAt: row.publishAt,
    commentStatus: row.commentStatus,
    commentError: row.commentError,
    commentedAt: row.commentedAt,
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
 * converge on one row via the unique `idempotency_key`. With `publishAt` the
 * order is scheduled instead: it waits as `scheduled` (no worker step touches
 * it) until promoteDueScheduledJobs queues it at that time, and its package and
 * delivery links are kept valid until then (keepPackageUntil).
 */
export async function requestPublishNow(
  topicId: string,
  draftId: string,
  packageId: string,
  retryJobId?: string,
  { publishAt: requestedPublishAt }: { publishAt?: unknown } = {},
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
  const channel = parsePublicationChannel(pkg.channel) ?? DEFAULT_PUBLICATION_CHANNEL;
  const accountId = destinationAccountId({ channel, pageId: pkg.pageId, igUserId: pkg.igUserId });
  if (!accountId) throw new PublicationJobConflictError(`The frozen package has no ${publicationPlatformLabel(channel)} destination.`);
  const key = idempotencyKey(pkg.packageHash, accountId, channel);
  const [existing] = await db.select().from(instagramPublicationJobs)
    .where(eq(instagramPublicationJobs.idempotencyKey, key)).limit(1);
  if (existing && (existing.topicId !== topicId || existing.draftId !== draftId)) {
    throw new PublicationJobConflictError("This exact package already has a publication order in another draft.");
  }
  // A replay of the original request remains read-only, including consumed packages.
  if (existing && !retryJobId) return toPublicationJobView(mapJobRow(existing), maxAttempts());
  // The idempotency key fixes the content and destination, so a retry may move
  // the order to a newer frozen package of that same content (re-freezing after
  // an approval change is how a stale package becomes current again).
  if (retryJobId && (!existing || existing.id !== retryJobId)) {
    throw new PublicationJobConflictError("The retry does not match this publication order.");
  }
  if (pkg.status !== "frozen" || pkg.expiresAt.getTime() <= Date.now()) {
    throw new PublicationJobConflictError("The package is stale, consumed or expired. Validate and freeze again.");
  }
  const publishAt = schedulePublishAt(requestedPublishAt, { now: new Date(), frozenAt: pkg.createdAt });
  // A Draft 2 story with an end date is never scheduled after it.
  if (publishAt) {
    const facts = await draft2FactsByPublicationDraft(topicId, draftId);
    const refusal = facts ? scheduledPastDeadline(publishAt, storyDeadline(facts, publishAt.toISOString().slice(0, 10))) : undefined;
    if (refusal) throw new PublicationJobConflictError(refusal);
  }
  const destination = await getChannelPublicationDestination(topicId, channel);
  if (destination.igUserId !== pkg.igUserId || (destination.pageId ?? null) !== (channel === "instagram-direct" ? null : pkg.pageId) ||
      destination.connectionVersion !== pkg.connectionVersion) {
    throw new PublicationJobConflictError("The frozen account or connection changed. Validate and freeze again.");
  }
  if (existing) {
    // The request must explicitly name the failed job, preventing a delayed initial POST from retrying it.
    if (existing.status !== "failed" && existing.status !== "suspended") return toPublicationJobView(mapJobRow(existing), maxAttempts());
    await assertNoUnresolvedSend(topicId, draftId, channel, accountId, existing.id);
    const patch = publicationRetryPatch(mapJobRow(existing), maxAttempts());
    // A retry publishes now, or waits for a new time like any scheduled order (its delivery window starts when it is promoted).
    const [retried] = await db.update(instagramPublicationJobs)
      .set({ ...patchToColumns(patch), packageId: pkg.id, batchId: pkg.batchId,
        ...(publishAt ? { status: "scheduled" as const, publishAt, startedAt: null } : { startedAt: new Date() }), leaseOwner: null, leaseUntil: null,
        ...(existing.commentStatus === "posted" ? {} : { commentStatus: pkg.firstComment ? "pending" : null, commentError: null, commentAttempts: 0 }) })
      .where(and(eq(instagramPublicationJobs.id, existing.id), eq(instagramPublicationJobs.status, existing.status),
        eq(instagramPublicationJobs.attempts, existing.attempts)))
      .returning();
    if (retried && publishAt) await keepPackageUntil(pkg.id, new Date(publishAt.getTime() + SCHEDULE_EXPIRY_MARGIN_MS));
    else if (retried) after(() => advancePublicationJob(retried.id));
    return toPublicationJobView(mapJobRow(retried ?? await loadJobRow(existing.id)), maxAttempts());
  }
  await assertNoUnresolvedSend(topicId, draftId, channel, accountId);
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
      // A scheduled order starts its delivery window when it is promoted, not now.
      status: publishAt ? "scheduled" : "queued",
      startedAt: publishAt ? null : now,
      publishAt: publishAt ?? null,
      // Posted under the post once it is published.
      commentStatus: pkg.firstComment ? "pending" : null,
      mediaType: pkg.mediaType,
      igUserId: destination.igUserId,
      channel,
      pageId: channel === "instagram-direct" ? null : pkg.pageId,
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
  if (inserted[0]) {
    // Two different packages requested at the same moment both pass the check
    // above; the earlier order stands and the later one is withdrawn before
    // any worker can touch it.
    const competing = unresolvedSendsTo(await unresolvedSendRows(topicId, draftId), { channel, accountId }, job.id)
      .filter((row) => row.createdAt.getTime() < job.createdAt.getTime() ||
        (row.createdAt.getTime() === job.createdAt.getTime() && row.id < job.id));
    if (competing.length) {
      await db.delete(instagramPublicationJobs)
        .where(and(eq(instagramPublicationJobs.id, job.id), inArray(instagramPublicationJobs.status, ["queued", "scheduled"]), isNull(instagramPublicationJobs.leaseOwner)));
      throw new PublicationJobConflictError(unresolvedSendMessage(publicationPlatformLabel(channel)));
    }
  }

  if (job.status === "scheduled" && job.publishAt) {
    // The package and its delivery links (24 hours from the freeze) must outlive the wait.
    await keepPackageUntil(job.packageId, new Date(job.publishAt.getTime() + SCHEDULE_EXPIRY_MARGIN_MS));
  } else if (job.status !== "published" && job.status !== "suspended") {
    after(() => advancePublicationJob(job.id));
  }
  return toPublicationJobView(mapJobRow(job), maxAttempts());
}

/** Extends a frozen package and its delivery files to `until`, never shortening them; the content stays exactly as frozen. */
async function keepPackageUntil(packageId: string, until: Date): Promise<void> {
  await db.update(instagramPublicationPackages)
    .set({ expiresAt: until, updatedAt: new Date() })
    .where(and(eq(instagramPublicationPackages.id, packageId), eq(instagramPublicationPackages.status, "frozen"), lt(instagramPublicationPackages.expiresAt, until)));
  await db.update(instagramDeliveryFiles)
    .set({ expiresAt: until })
    .where(and(eq(instagramDeliveryFiles.packageId, packageId), lt(instagramDeliveryFiles.expiresAt, until)));
}

/**
 * Queues every scheduled order whose time has come (or only `jobIds`, for a
 * read of them), starting its delivery window now; the ordinary passes then
 * run it. Returns the queued ids. A worker on code that predates scheduling
 * never selects a `scheduled` row, so an order cannot go out early.
 */
export async function promoteDueScheduledJobs(jobIds?: readonly string[]): Promise<string[]> {
  if (jobIds && !jobIds.length) return [];
  const now = new Date();
  const rows = await db.update(instagramPublicationJobs)
    .set({ status: "queued", startedAt: now, updatedAt: now, leaseOwner: null, leaseUntil: null })
    .where(and(
      eq(instagramPublicationJobs.status, "scheduled"),
      lte(instagramPublicationJobs.publishAt, now),
      isNull(instagramPublicationJobs.leaseOwner),
      ...(jobIds ? [inArray(instagramPublicationJobs.id, [...jobIds])] : []),
    ))
    .returning({ id: instagramPublicationJobs.id });
  return rows.map((row) => row.id);
}

/** The editor withdraws a scheduled order before its time: nothing was sent, so the row goes and the package may be sent or scheduled again. */
export async function cancelScheduledPublicationJob(topicId: string, draftId: string, jobId: string): Promise<void> {
  const [cancelled] = await db.delete(instagramPublicationJobs)
    .where(and(
      eq(instagramPublicationJobs.id, jobId),
      eq(instagramPublicationJobs.topicId, topicId),
      eq(instagramPublicationJobs.draftId, draftId),
      eq(instagramPublicationJobs.status, "scheduled"),
      isNull(instagramPublicationJobs.leaseOwner),
    ))
    .returning({ id: instagramPublicationJobs.id });
  if (!cancelled) throw new PublicationJobConflictError("Only an order still waiting for its time can be cancelled; this one is already publishing or done.");
}

/** The editor sends a scheduled order now instead of at its time. */
export async function publishScheduledNow(topicId: string, draftId: string, jobId: string): Promise<PublicationJobView> {
  const now = new Date();
  const [queued] = await db.update(instagramPublicationJobs)
    .set({ status: "queued", publishAt: now, startedAt: now, updatedAt: now })
    .where(and(
      eq(instagramPublicationJobs.id, jobId),
      eq(instagramPublicationJobs.topicId, topicId),
      eq(instagramPublicationJobs.draftId, draftId),
      eq(instagramPublicationJobs.status, "scheduled"),
      isNull(instagramPublicationJobs.leaseOwner),
    ))
    .returning();
  if (!queued) throw new PublicationJobConflictError("This order is no longer waiting for its time.");
  after(() => advancePublicationJob(queued.id));
  return toPublicationJobView(mapJobRow(queued), maxAttempts());
}

function unresolvedSendRows(topicId: string, draftId: string) {
  return db.select({
    id: instagramPublicationJobs.id,
    status: instagramPublicationJobs.status,
    failureKind: instagramPublicationJobs.failureKind,
    channel: instagramPublicationJobs.channel,
    igUserId: instagramPublicationJobs.igUserId,
    pageId: instagramPublicationJobs.pageId,
    createdAt: instagramPublicationJobs.createdAt,
  }).from(instagramPublicationJobs).where(and(
    eq(instagramPublicationJobs.topicId, topicId),
    eq(instagramPublicationJobs.draftId, draftId),
    or(
      inArray(instagramPublicationJobs.status, [...UNRESOLVED_SEND_STATUSES]),
      and(eq(instagramPublicationJobs.status, "suspended"), eq(instagramPublicationJobs.failureKind, "uncertain")),
    ),
  ));
}

/** No second send of a draft to an account while an earlier one is unsettled. */
async function assertNoUnresolvedSend(
  topicId: string,
  draftId: string,
  channel: PublicationChannel,
  accountId: string,
  exceptJobId?: string,
): Promise<void> {
  if (unresolvedSendsTo(await unresolvedSendRows(topicId, draftId), { channel, accountId }, exceptJobId).length) {
    throw new PublicationJobConflictError(unresolvedSendMessage(publicationPlatformLabel(channel)));
  }
}

/**
 * An editor checked the platform and the post is not there: the uncertain
 * order becomes a retryable failure (with a fresh attempt budget and the
 * check recorded in its error), which also lifts the block on new sends.
 * Only a suspended order with an uncertain outcome and no media id qualifies;
 * one still being confirmed keeps checking on its own.
 */
export async function releaseUncertainPublicationJob(
  topicId: string,
  draftId: string,
  jobId: string,
): Promise<PublicationJobView> {
  const current = await loadJobRow(jobId);
  if (current.topicId !== topicId || current.draftId !== draftId) {
    throw new CreativeContentNotFoundError("Publication order not found");
  }
  const platform = publicationPlatformLabel(parsePublicationChannel(current.channel) ?? DEFAULT_PUBLICATION_CHANNEL);
  const now = new Date();
  const [released] = await db.update(instagramPublicationJobs)
    .set({ status: "failed", failureKind: "retryable", attempts: 0, leaseOwner: null, leaseUntil: null,
      lastError: releasedUncertainError(platform, current.attempts, now), finishedAt: current.finishedAt ?? now, updatedAt: now })
    .where(and(
      eq(instagramPublicationJobs.id, jobId),
      eq(instagramPublicationJobs.status, "suspended"),
      eq(instagramPublicationJobs.failureKind, "uncertain"),
      isNull(instagramPublicationJobs.publishedMediaId),
    ))
    .returning();
  if (!released) {
    throw new PublicationJobConflictError("Only a suspended order whose outcome is uncertain can be marked as not published.");
  }
  return toPublicationJobView(mapJobRow(released), maxAttempts());
}

/** One bounded step, protected by a DB lease. No recursion or sleeping request. */
export async function advancePublicationJob(jobId: string, { budgetMs = 0, waitMs = STEP_INTERVAL_MS, pauseMs = WORKER_STEP_PAUSE_MS }: PublicationWorkerPass = {}): Promise<void> {
  const owner = randomUUID();
  const deadline = Date.now() + Math.min(budgetMs, WORKER_PASS_BUDGET_MS);
  const [claimed] = await db.update(instagramPublicationJobs)
    .set({ leaseOwner: owner, leaseUntil: new Date(Date.now() + LEASE_MS), updatedAt: new Date() })
    .where(and(eq(instagramPublicationJobs.id, jobId), runnableJob(), leaseAvailable()))
    .returning({ id: instagramPublicationJobs.id });
  if (!claimed) return;
  try {
    const dependencies = await buildDependencies(jobId, owner);
    // Step after step while the lease is ours and the budget lasts: a step that moved the order on is followed
    // after a short pause, one that found Meta still processing after the usual interval.
    for (let before = progressOf(await loadJobRow(jobId)); ;) {
      await runPublishPublicationJob(dependencies);
      const current = await loadJobRow(jobId);
      if (isTerminalPublicationJobStatus(current.status as PublicationJobStatus) || current.status === "scheduled" || current.leaseOwner !== owner) break;
      const progress = progressOf(current);
      const pause = progress === before ? waitMs : pauseMs;
      if (Date.now() + pause >= deadline) break;
      before = progress;
      await sleep(pause);
    }
    const [job] = await db
      .select({ status: instagramPublicationJobs.status, packageId: instagramPublicationJobs.packageId })
      .from(instagramPublicationJobs)
      .where(eq(instagramPublicationJobs.id, jobId))
      .limit(1);
    if (job?.status === "published") {
      // Move the exact published JPEGs out of the 7-day class now; the hourly
      // storage maintenance retries if this copy fails.
      await preservePublishedPackage(job.packageId).catch(() =>
        console.error(`Published files of package ${job.packageId} were not preserved yet; maintenance will retry.`));
      // The first comment, under this lease, as soon as the post is up.
      await postFirstComment(jobId, owner).catch(() =>
        console.error(`The first comment of publication job ${jobId} was not posted yet; the worker will resume it.`));
    }
  } catch {
    // Provider/DB exceptions may contain credentials. Keep only the operational job id.
    console.error(`Publication job ${jobId} step failed; the worker will resume it.`);
  } finally {
    await db.update(instagramPublicationJobs)
      .set({ leaseOwner: null, leaseUntil: new Date(Date.now() + STEP_INTERVAL_MS), updatedAt: new Date() })
      .where(and(eq(instagramPublicationJobs.id, jobId), eq(instagramPublicationJobs.leaseOwner, owner)));
  }
}

/** Called by a supervised worker/cron, independently of browser reads. Oldest updates first for fairness; each order is driven step after step for one pass's budget. */
export async function resumePublicationJobs(pass: PublicationWorkerPass = { budgetMs: WORKER_PASS_BUDGET_MS }): Promise<{ selected: number }> {
  // Scheduled orders whose time has come join the queue first, so this pass can start them.
  await promoteDueScheduledJobs();
  const rows = await db.select({ id: instagramPublicationJobs.id }).from(instagramPublicationJobs)
    .where(and(runnableJob(), leaseAvailable())).orderBy(instagramPublicationJobs.updatedAt).limit(4);
  const outcomes = await Promise.allSettled(rows.map(row => advancePublicationJob(row.id, pass)));
  // Then the first comments still due under published posts (a send whose answer was lost, a pass that ended first).
  const comments = await db.select({ id: instagramPublicationJobs.id }).from(instagramPublicationJobs)
    .where(and(commentDueJob(), leaseAvailable())).orderBy(instagramPublicationJobs.updatedAt).limit(4);
  const commented = await Promise.allSettled(comments.map(row => advanceFirstComment(row.id)));
  if ([...outcomes, ...commented].some(outcome => outcome.status === "rejected")) throw new Error("Publication worker step failed");
  return { selected: rows.length };
}

/**
 * One step of a published order's first comment (publication-first-comment
 * .core.ts) under the caller's lease: it goes to the account the post went
 * to, whatever its connection's version (a reconnect that grants the comment
 * permission keeps the account), and never touches the post.
 */
async function postFirstComment(jobId: string, owner: string): Promise<void> {
  const job = await loadJobRow(jobId);
  if (job.status !== "published" || !job.publishedMediaId || (job.commentStatus !== "pending" && job.commentStatus !== "posting")) return;
  const [pkg] = await db.select({ firstComment: instagramPublicationPackages.firstComment }).from(instagramPublicationPackages)
    .where(eq(instagramPublicationPackages.id, job.packageId)).limit(1);
  const channel = parsePublicationChannel(job.channel) ?? DEFAULT_PUBLICATION_CHANNEL;
  const host = instagramGraphHostFor(channel);
  const accountId = destinationAccountId({ channel, pageId: job.pageId, igUserId: job.igUserId });
  const credentials = async () => {
    const token = await getChannelSendCredentials(job.topicId, channel);
    if (!token || !accountId || token.accountId !== accountId) throw new CommentAccountChangedError();
    return token;
  };
  await runFirstComment({
    loadJob: async () => {
      const row = await loadJobRow(jobId);
      return { commentStatus: row.status === "published" ? row.commentStatus as CommentStatus | null : null, commentAttempts: row.commentAttempts, publishedMediaId: row.publishedMediaId };
    },
    comment: pkg?.firstComment ?? undefined,
    channel,
    platformLabel: publicationPlatformLabel(channel),
    findPosted: async (mediaId, text) => {
      const token = await credentials();
      return channel === "facebook-page" ? findPageComment(mediaId, token.accountId, token.accessToken, text) : findInstagramComment(mediaId, token.accessToken, text, host);
    },
    post: async (mediaId, text) => {
      const token = await credentials();
      return channel === "facebook-page" ? createPageComment(mediaId, token.accessToken, text) : createInstagramComment(mediaId, token.accessToken, text, host);
    },
    transition: async (from: CommentStatus, patch: FirstCommentPatch) => {
      const [updated] = await db.update(instagramPublicationJobs)
        .set({ ...patch, updatedAt: new Date() })
        .where(and(eq(instagramPublicationJobs.id, jobId), eq(instagramPublicationJobs.status, "published"), eq(instagramPublicationJobs.commentStatus, from),
          eq(instagramPublicationJobs.leaseOwner, owner), gt(instagramPublicationJobs.leaseUntil, new Date())))
        .returning({ id: instagramPublicationJobs.id });
      return Boolean(updated);
    },
    now: () => new Date(),
  });
}

/** Claims a published order whose first comment is due and takes one step of it. */
export async function advanceFirstComment(jobId: string): Promise<void> {
  const owner = randomUUID();
  const [claimed] = await db.update(instagramPublicationJobs)
    .set({ leaseOwner: owner, leaseUntil: new Date(Date.now() + LEASE_MS), updatedAt: new Date() })
    .where(and(eq(instagramPublicationJobs.id, jobId), commentDueJob(), leaseAvailable()))
    .returning({ id: instagramPublicationJobs.id });
  if (!claimed) return;
  try {
    await postFirstComment(jobId, owner);
  } catch {
    // Provider/DB exceptions may contain credentials. Keep only the operational job id.
    console.error(`The first comment of publication job ${jobId} was not posted yet; the worker will resume it.`);
  } finally {
    await db.update(instagramPublicationJobs)
      .set({ leaseOwner: null, leaseUntil: new Date(Date.now() + STEP_INTERVAL_MS), updatedAt: new Date() })
      .where(and(eq(instagramPublicationJobs.id, jobId), eq(instagramPublicationJobs.leaseOwner, owner)));
  }
}

/** The editor tries a failed first comment again: it is pending once more and its sends start over. */
export async function retryFirstComment(topicId: string, draftId: string, jobId: string): Promise<PublicationJobView> {
  const [retried] = await db.update(instagramPublicationJobs)
    .set({ commentStatus: "pending", commentError: null, commentAttempts: 0, updatedAt: new Date() })
    .where(and(eq(instagramPublicationJobs.id, jobId), eq(instagramPublicationJobs.topicId, topicId), eq(instagramPublicationJobs.draftId, draftId),
      eq(instagramPublicationJobs.status, "published"), eq(instagramPublicationJobs.commentStatus, "failed")))
    .returning();
  if (!retried) throw new PublicationJobConflictError("Only a first comment that was not posted can be tried again.");
  after(() => advanceFirstComment(retried.id));
  return toPublicationJobView(mapJobRow(retried), maxAttempts());
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

  const channel = parsePublicationChannel(job.channel) ?? DEFAULT_PUBLICATION_CHANNEL;
  const host = instagramGraphHostFor(channel);
  const expectedIdentity = { topicId: job.topicId, igUserId: job.igUserId,
    connectionVersion: job.connectionVersion, appConfigurationVersion: job.appConfigurationVersion ?? undefined,
    ...(channel !== "instagram-direct" ? { channel, pageId: job.pageId } : {}) };
  const jobAccountId = destinationAccountId({ channel, pageId: job.pageId, igUserId: job.igUserId });

  async function assertLease() {
    const current = await loadJobRow(jobId);
    if (current.leaseOwner !== owner || !current.leaseUntil || current.leaseUntil.getTime() <= Date.now()) {
      throw new PublicationJobLeaseLostError();
    }
  }
  async function currentToken(sending = false) {
    await assertLease();
    const destination = await getChannelPublicationDestination(job.topicId, channel);
    const token = await getChannelSendCredentials(job.topicId, channel);
    if (!samePublishingIdentity(expectedIdentity, publishingIdentity(job.topicId, destination)) ||
        !token || !jobAccountId || token.accountId !== jobAccountId || token.connectionVersion !== job.connectionVersion ||
        job.apiVersion !== GRAPH_API_VERSION) throw new PublicationIdentityChangedError();
    if (sending) {
      const [current] = await db.select().from(instagramPublicationPackages)
        .where(eq(instagramPublicationPackages.id, job.packageId)).limit(1);
      if (!current || current.status !== "frozen" || current.expiresAt.getTime() <= Date.now()) throw new PublicationIdentityChangedError();
    }
    await assertLease();
    return token;
  }
  // Caption and hashtags are frozen apart; this is the one text that posts.
  const postText = publicationPostText(pkgRow);
  const frozen: FrozenPackageForPublish = {
    status: pkgRow.status as FrozenPackageForPublish["status"],
    mediaType: pkgRow.mediaType as "image" | "carousel",
    caption: postText,
    candidateSnapshotHash: pkgRow.candidateSnapshotHash,
    expiresAt: pkgRow.expiresAt,
    destination: { igUserId: pkgRow.igUserId, igUsername: pkgRow.igUsername, pageId: pkgRow.pageId },
    slides: [...files]
      .sort((a, b) => a.unitOrder - b.unitOrder)
      .map((file) => ({
        unitOrder: file.unitOrder,
        deliveryUrl: `/api/deliver/${file.token}`,
      })),
  };

  // Instagram (direct or through the Page) and Facebook differ only in these
  // provider calls; the job state machine, leases and checks are shared.
  const provider: Pick<PublishJobDependencies,
    "createImageContainer" | "createCarouselContainer" | "getContainerStatus" | "publishContainer" | "fetchPermalink"> =
    channel === "facebook-page"
      ? {
          // Never published on upload: the Page shows nothing until the one feed post exists.
          createImageContainer: async (input) => {
            const token = await currentToken(true);
            return uploadUnpublishedPagePhoto(token.accountId, token.accessToken, `${deliveryBaseUrl()}${input.imageUrl}`);
          },
          createCarouselContainer: async (input) => `${FACEBOOK_ATTACHMENT_PREFIX}${input.childrenIds.join(",")}`,
          // Uploaded photos are ready immediately; there is no container to poll.
          getContainerStatus: async () => "FINISHED",
          publishContainer: async (parentContainerId) => {
            const token = await currentToken(true);
            return publishPagePhotoPost(token.accountId, token.accessToken, {
              message: postText,
              photoIds: facebookPhotoIds(parentContainerId),
            });
          },
          fetchPermalink: async (postId) => fetchPagePostPermalink(postId, (await currentToken()).accessToken),
        }
      : {
          createImageContainer: async (input) => {
            const token = await currentToken(true);
            return createInstagramMediaContainer(token.accountId, token.accessToken,
              { ...input, imageUrl: `${deliveryBaseUrl()}${input.imageUrl}` }, host);
          },
          createCarouselContainer: async (input) => {
            const token = await currentToken(true);
            return createInstagramCarouselContainer(token.accountId, token.accessToken, input, host);
          },
          getContainerStatus: async (containerId) => getInstagramContainerStatus(containerId, (await currentToken()).accessToken, host),
          publishContainer: async (creationId) => {
            const token = await currentToken(true);
            return publishInstagramContainer(token.accountId, token.accessToken, creationId, host);
          },
          fetchPermalink: async (mediaId) => fetchInstagramMediaPermalink(mediaId, (await currentToken()).accessToken, host),
        };

  return {
    loadJob: async () => mapJobRow(await loadJobRow(jobId)),
    loadPackage: async () => frozen,
    reverifyAccess: () => checkChannelPublishingAccess(job.topicId, channel, expectedIdentity),
    expectedIdentity,
    apiVersion: GRAPH_API_VERSION,
    platformLabel: publicationPlatformLabel(channel),
    currentCandidateSnapshotHash: async () => {
      const candidate = await getPublicationCandidate(job.topicId, job.draftId, job.batchId, channel);
      return candidate.state === "ready" ? candidate.snapshotHash : "not-ready";
    },
    ...provider,
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
      if (channel === "facebook-page") {
        // Page posts are tracked per Story/platform; the job keeps the post id.
        await db
          .insert(storySocialPublications)
          .values({
            topicId: job.topicId,
            storyId: job.storyId,
            platform: "facebook",
            status: "published",
            publishedAt,
            postUrl: input.permalink ?? null,
            note: `Published by Press Craftor (post ${input.externalId}).`,
            updatedAt: new Date(),
          } satisfies typeof storySocialPublications.$inferInsert)
          .onConflictDoUpdate({
            target: [storySocialPublications.topicId, storySocialPublications.storyId, storySocialPublications.platform],
            set: {
              status: "published",
              publishedAt,
              postUrl: sql`COALESCE(excluded.post_url, ${storySocialPublications.postUrl})`,
              note: sql`excluded.note`,
              updatedAt: new Date(),
            },
          });
        return;
      }
      await db
        .insert(topicInstagramMedia)
        .values({
          topicId: job.topicId,
          igUserId: job.igUserId!,
          externalId: input.externalId,
          mediaType: input.mediaType === "carousel" ? "CAROUSEL_ALBUM" : "IMAGE",
          mediaProductType: "FEED",
          permalink: input.permalink ?? null,
          caption: postText,
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
  // A scheduled order read after its time is queued and started now, without waiting for the worker's next pass.
  const due = rows.filter((row) => row.status === "scheduled" && row.publishAt && row.publishAt.getTime() <= now).map((row) => row.id);
  if (due.length) after(async () => { for (const id of await promoteDueScheduledJobs(due)) await advancePublicationJob(id); });
  for (const row of rows) {
    if (row.status === "scheduled") continue;
    const stale =
      !isTerminalPublicationJobStatus(row.status as PublicationJobStatus) &&
      (!row.leaseUntil || row.leaseUntil.getTime() < now);
    if (stale) after(() => advancePublicationJob(row.id));
    // A published post's first comment still due is posted from the read too, without waiting for the worker.
    const commentDue = row.status === "published" && row.publishedMediaId && (row.commentStatus === "pending" || row.commentStatus === "posting");
    if (commentDue && (!row.leaseUntil || row.leaseUntil.getTime() < now)) after(() => advanceFirstComment(row.id));
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
  channel?: PublicationChannel,
): Promise<PublicationJobView[]> {
  const rows = await db
    .select()
    .from(instagramPublicationJobs)
    .where(
      and(
        eq(instagramPublicationJobs.topicId, topicId),
        eq(instagramPublicationJobs.draftId, draftId),
        ...(channel ? [eq(instagramPublicationJobs.channel, channel)] : []),
      ),
    )
    .orderBy(instagramPublicationJobs.createdAt);
  reconcileOnRead(rows);
  return rows.map((row) => toPublicationJobView(mapJobRow(row), maxAttempts()));
}
