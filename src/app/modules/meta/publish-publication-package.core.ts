/**
 * PUB-04 + PUB-07 orchestration, pure of I/O via injected dependencies so it can
 * be unit-tested. It drives one durable `instagram_publication_jobs` row from
 * `queued` to a terminal state: re-check authorization, create the Instagram
 * media containers from the frozen delivery URLs, wait for them, run
 * `media_publish`, and record the result. Every provider id and every
 * transition is persisted through `deps.transition`, which is a *conditional*
 * update — a worker that lost its lease, or a job a concurrent action already
 * moved, writes zero rows and this code stops instead of racing.
 *
 * A finished container is not a confirmed publication. A publish call that does
 * not return a confirmation leaves the job in `pending-confirmation`; the next
 * pass queries the container before deciding, and never re-sends blindly.
 */

import { classifyMetaGraphError } from "./meta-verification";
import { MetaGraphApiError } from "./meta-token-response";
import {
  publishingAccessIsCurrent,
  type PublishingAccess,
  type PublishingIdentity,
} from "./instagram-publishing-access";

export const MAX_JOB_AGE_MS = 30 * 60_000;
export const MAX_ATTEMPTS = 4;

export type PublicationJobStatus =
  | "queued"
  | "preparing"
  | "creating-containers"
  | "containers-ready"
  | "publishing"
  | "pending-confirmation"
  | "published"
  | "failed"
  | "suspended";

export type PublicationJobFailureKind =
  | "retryable"
  | "permission"
  | "rate-limit"
  | "expired-container"
  | "uncertain"
  | "invalidated";

export type ContainerStatusCode =
  | "EXPIRED"
  | "ERROR"
  | "FINISHED"
  | "IN_PROGRESS"
  | "PUBLISHED";

export type ChildContainer = {
  unitOrder: number;
  creationId: string;
  status?: string;
};

/** camelCase mirror of the columns this orchestration reads and patches. */
export type PublicationJobRow = {
  id: string;
  packageId: string;
  topicId: string;
  status: PublicationJobStatus;
  mediaType: "image" | "carousel" | null;
  igUserId: string | null;
  connectionVersion: string;
  appConfigurationVersion?: string;
  apiVersion: string;
  accessState: string | null;
  quotaRemaining: number | null;
  childContainers: ChildContainer[];
  parentContainerId: string | null;
  publishedMediaId: string | null;
  permalink: string | null;
  attempts: number;
  failureKind: PublicationJobFailureKind | null;
  lastError: string | null;
  startedAt: Date | null;
  finishedAt: Date | null;
};

export type PublicationJobPatch = Partial<{
  status: PublicationJobStatus;
  mediaType: "image" | "carousel" | null;
  accessState: string | null;
  accessCheckedAt: Date | null;
  quotaRemaining: number | null;
  childContainers: ChildContainer[];
  parentContainerId: string | null;
  publishedMediaId: string | null;
  permalink: string | null;
  attempts: number;
  failureKind: PublicationJobFailureKind | null;
  lastError: string | null;
  startedAt: Date | null;
  finishedAt: Date | null;
}>;

/** Everything the send needs from the frozen PUB-03 package. */
export type FrozenPackageForPublish = {
  status: "frozen" | "stale" | "consumed";
  mediaType: "image" | "carousel";
  caption: string;
  candidateSnapshotHash: string;
  expiresAt: Date;
  destination: { igUserId: string | null; igUsername: string | null };
  slides: { unitOrder: number; deliveryUrl: string }[];
};

export type RecordPublishedMediaInput = {
  externalId: string;
  mediaType: "image" | "carousel";
  permalink?: string;
  publishedAt: Date;
};

/** Browser-safe projection. No token, delivery URL, object key or connectionVersion. */
export type PublicationJobView = {
  id: string;
  packageId: string;
  status: PublicationJobStatus;
  mediaType: "image" | "carousel" | null;
  attempts: number;
  canRetry: boolean;
  permalink: string | null;
  publishedMediaId: string | null;
  failureKind: PublicationJobFailureKind | null;
  lastError: string | null;
  startedAt: string | null;
  finishedAt: string | null;
};

export type PublishJobDependencies = {
  loadJob: () => Promise<PublicationJobRow>;
  loadPackage: () => Promise<FrozenPackageForPublish>;
  reverifyAccess: () => Promise<PublishingAccess>;
  expectedIdentity: PublishingIdentity;
  apiVersion: string;
  currentCandidateSnapshotHash: () => Promise<string>;
  createImageContainer: (input: {
    imageUrl: string;
    isCarouselItem: boolean;
    caption?: string;
  }) => Promise<string>;
  createCarouselContainer: (input: {
    childrenIds: string[];
    caption: string;
  }) => Promise<string>;
  getContainerStatus: (containerId: string) => Promise<ContainerStatusCode>;
  publishContainer: (creationId: string) => Promise<string>;
  fetchPermalink: (
    mediaId: string,
  ) => Promise<{ permalink?: string; timestamp?: string }>;
  /** Conditional UPDATE ... WHERE id AND status=from AND lease_owner=owner. */
  transition: (
    from: PublicationJobStatus,
    patch: PublicationJobPatch,
  ) => Promise<PublicationJobRow | null>;
  markPackageConsumed: () => Promise<void>;
  recordPublishedMedia: (input: RecordPublishedMediaInput) => Promise<void>;
  now: () => Date;
  maxJobAgeMs?: number;
  maxAttempts?: number;
};

export class PublicationJobConflictError extends Error {}
export class PublicationJobStateError extends Error {}
export class PublicationJobLeaseLostError extends Error {}
export class PublicationIdentityChangedError extends Error {}

const TERMINAL: ReadonlySet<PublicationJobStatus> = new Set([
  "published",
  "failed",
  "suspended",
]);

export function isTerminalPublicationJobStatus(
  status: PublicationJobStatus,
): boolean {
  return TERMINAL.has(status);
}

export function toPublicationJobView(row: PublicationJobRow, maxAttempts = MAX_ATTEMPTS): PublicationJobView {
  return {
    id: row.id,
    packageId: row.packageId,
    status: row.status,
    mediaType: row.mediaType,
    attempts: row.attempts,
    canRetry: canRetryPublicationJob(row, maxAttempts),
    permalink: row.permalink,
    publishedMediaId: row.publishedMediaId,
    failureKind: row.failureKind,
    lastError: row.lastError,
    startedAt: row.startedAt ? row.startedAt.toISOString() : null,
    finishedAt: row.finishedAt ? row.finishedAt.toISOString() : null,
  };
}

/** Only a safe failure or a suspension before ALL provider work can be retried. */
export function canRetryPublicationJob(row: PublicationJobRow, maxAttempts = MAX_ATTEMPTS): boolean {
  if (row.publishedMediaId || row.attempts >= maxAttempts) return false;
  if (row.status === "failed") return ["retryable", "expired-container"].includes(row.failureKind ?? "");
  return row.status === "suspended" && row.failureKind === "invalidated" && row.attempts === 0 &&
    row.parentContainerId === null && row.childContainers.length === 0;
}

/** An explicit retry reuses the order; uncertain outcomes can never be retried here. */
export function publicationRetryPatch(row: PublicationJobRow, maxAttempts = MAX_ATTEMPTS): PublicationJobPatch {
  if (!canRetryPublicationJob(row, maxAttempts)) {
    throw new PublicationJobConflictError("This job cannot be retried safely. Review its recorded outcome.");
  }
  // Retain every remote id, including superseded parents, for incident review.
  const history = row.childContainers.map(child => ({ ...child, status: "retired" }));
  if (row.parentContainerId) history.push({ unitOrder: 0, creationId: row.parentContainerId, status: "retired" });
  return { status: "queued", childContainers: history, parentContainerId: null,
    failureKind: null, lastError: null, finishedAt: null, startedAt: null };
}

/** One bounded step per claim. The independent worker resumes the persisted state. */
export async function runPublishPublicationJob(deps: PublishJobDependencies): Promise<PublicationJobView> {
  let row = await deps.loadJob();
  if (row.status === "failed" || row.status === "suspended") return toPublicationJobView(row);
  const pkg = await deps.loadPackage();
  try {
    // A known media id means ONLY local repair, even after expiry or reconnection.
    if (row.publishedMediaId) {
      await finalizePublished(deps, row, pkg);
      return toPublicationJobView(await deps.loadJob());
    }
    if (row.status === "published") {
      return toPublicationJobView(await suspend(deps, row, "uncertain",
        "Instagram publication was reported without a media id. Resolve manually; do not resend."));
    }
    if (!row.startedAt && row.status !== "queued") row = await move(deps, row.status, { startedAt: deps.now() });
    const uncertain = row.status === "publishing" || row.status === "pending-confirmation";
    if (row.startedAt && deps.now().getTime() - row.startedAt.getTime() >= (deps.maxJobAgeMs ?? MAX_JOB_AGE_MS)) {
      return toPublicationJobView(await suspend(deps, row, uncertain ? "uncertain" : "invalidated",
        uncertain ? "The confirmation window expired. Resolve manually before any new send." : "The delivery window expired. Review this order before publishing."));
    }
    // A restarted worker cannot know whether a persisted `publishing` request ran.
    if (row.status === "publishing") {
      row = await move(deps, "publishing", { status: "pending-confirmation", failureKind: "uncertain",
        lastError: "The previous send was interrupted. Checking its outcome without resending." });
    }
    if (row.status === "pending-confirmation") {
      return toPublicationJobView(await reconcilePending(deps, row));
    }
    if (row.status === "queued") {
      return toPublicationJobView(await runPreparingGate(deps, row, pkg, deps.maxAttempts ?? MAX_ATTEMPTS));
    }
    if (row.status === "preparing") {
      return toPublicationJobView(await move(deps, "preparing", { status: "creating-containers" }));
    }
    if (row.status === "creating-containers") {
      return toPublicationJobView(await createContainers(deps, row, pkg));
    }
    if (row.status === "containers-ready") {
      const status = await deps.getContainerStatus(row.parentContainerId!);
      if (status === "IN_PROGRESS") return toPublicationJobView(row);
      if (status === "PUBLISHED") {
        return toPublicationJobView(await suspend(deps, row, "uncertain",
          "Instagram reports this container was published, but its media id is missing. Resolve manually; do not resend."));
      }
      if (status === "ERROR" || status === "EXPIRED") {
        return toPublicationJobView(await fail(deps, row, status === "EXPIRED" ? "expired-container" : "retryable",
          "Instagram could not process this container. An explicit retry is required."));
      }
      // Revalidate the approved snapshot and original identity immediately before sending.
      const blocker = await checkPreparation(deps, row, pkg);
      if ("kind" in blocker) return toPublicationJobView(await suspend(deps, row, blocker.kind, blocker.message));
      row = await move(deps, "containers-ready", { status: "publishing", quotaRemaining: blocker.quotaRemaining, accessCheckedAt: deps.now() });
      return toPublicationJobView(await doPublish(deps, row));
    }
    return toPublicationJobView(row);
  } catch (error) {
    const current = await deps.loadJob();
    if (error instanceof PublicationJobLeaseLostError) return toPublicationJobView(current);
    // A persisted remote id must survive any bookkeeping error. Retry only local work.
    if (current.publishedMediaId || isTerminalPublicationJobStatus(current.status)) return toPublicationJobView(current);
    if (current.status === "publishing" || current.status === "pending-confirmation") {
      await deps.transition(current.status, { status: "pending-confirmation", failureKind: "uncertain",
        lastError: "The send outcome is uncertain. Checking without resending." });
    } else {
      const verdict = classifyPublishError(error);
      await deps.transition(current.status, { status: verdict.terminal, failureKind: verdict.kind,
        lastError: verdict.message, finishedAt: deps.now() });
    }
    return toPublicationJobView(await deps.loadJob());
  }
}

async function move(deps: PublishJobDependencies, from: PublicationJobStatus, patch: PublicationJobPatch): Promise<PublicationJobRow> {
  const moved = await deps.transition(from, patch);
  if (!moved) throw new PublicationJobLeaseLostError();
  return moved;
}

type Blocker = { kind: PublicationJobFailureKind; message: string };
async function checkPreparation(deps: PublishJobDependencies, row: PublicationJobRow, pkg: FrozenPackageForPublish): Promise<Blocker | { quotaRemaining: number }> {
  if (row.igUserId !== pkg.destination.igUserId || row.igUserId !== deps.expectedIdentity.igUserId ||
      row.connectionVersion !== deps.expectedIdentity.connectionVersion ||
      row.appConfigurationVersion !== deps.expectedIdentity.appConfigurationVersion || row.apiVersion !== deps.apiVersion) {
    return { kind: "invalidated", message: "The account or connection changed. This order cannot be redirected." };
  }
  if (pkg.status !== "frozen" || pkg.expiresAt.getTime() <= deps.now().getTime()) {
    return { kind: "invalidated", message: "The frozen package is stale, consumed or expired. Review it before publishing." };
  }
  const access = await deps.reverifyAccess();
  if (!publishingAccessIsCurrent(access, deps.expectedIdentity, deps.apiVersion, deps.now().getTime())) {
    return { kind: failureKindForAccess(access.state), message: access.message };
  }
  if (!access.quota || access.quota.remaining <= 0) {
    return { kind: "rate-limit", message: "This account has no publishing quota left." };
  }
  if (await deps.currentCandidateSnapshotHash() !== pkg.candidateSnapshotHash) {
    return { kind: "invalidated", message: "The approved set changed since freezing. Validate and freeze again." };
  }
  return { quotaRemaining: access.quota.remaining };
}

async function runPreparingGate(deps: PublishJobDependencies, row: PublicationJobRow, pkg: FrozenPackageForPublish, maxAttempts: number): Promise<PublicationJobRow> {
  if (row.attempts >= maxAttempts) return suspend(deps, row, "retryable", "The attempt limit was reached. Review this order manually.");
  const blocker = await checkPreparation(deps, row, pkg);
  if ("kind" in blocker) return suspend(deps, row, blocker.kind, blocker.message);
  return move(deps, row.status, { status: "preparing", attempts: row.attempts + 1,
    startedAt: row.startedAt ?? deps.now(), mediaType: pkg.mediaType, accessState: "enabled",
    accessCheckedAt: deps.now(), quotaRemaining: blocker.quotaRemaining, failureKind: null, lastError: null });
}

async function createContainers(deps: PublishJobDependencies, row: PublicationJobRow, pkg: FrozenPackageForPublish): Promise<PublicationJobRow> {
  const isCarousel = pkg.mediaType === "carousel";
  const active = row.childContainers.filter(child => child.status !== "retired");
  const slides = [...pkg.slides].sort((a, b) => a.unitOrder - b.unitOrder);
  const missing = slides.find(slide => !active.some(child => child.unitOrder === slide.unitOrder));
  if (missing) {
    const creationId = await deps.createImageContainer({ imageUrl: missing.deliveryUrl,
      isCarouselItem: isCarousel, caption: isCarousel ? undefined : pkg.caption });
    return move(deps, "creating-containers", { childContainers: [...row.childContainers,
      { unitOrder: missing.unitOrder, creationId, status: "created" }] });
  }
  // Meta must finish every child before a carousel parent is created.
  const pending = isCarousel ? active.find(child => child.status !== "FINISHED") : undefined;
  if (pending) {
    const status = await deps.getContainerStatus(pending.creationId);
    if (status === "IN_PROGRESS") return row;
    if (status !== "FINISHED") return fail(deps, row, status === "EXPIRED" ? "expired-container" : "retryable", "A carousel image could not be prepared.");
    return move(deps, "creating-containers", { childContainers: row.childContainers.map(child =>
      child === pending ? { ...child, status } : child) });
  }
  const ordered = [...active].sort((a, b) => a.unitOrder - b.unitOrder);
  const parentContainerId = row.parentContainerId ?? (isCarousel
    ? await deps.createCarouselContainer({ childrenIds: ordered.map(child => child.creationId), caption: pkg.caption })
    : ordered[0]?.creationId);
  if (!parentContainerId) return fail(deps, row, "retryable", "No media container could be created.");
  return move(deps, "creating-containers", { status: "containers-ready", parentContainerId });
}

async function doPublish(
  deps: PublishJobDependencies,
  row: PublicationJobRow,
): Promise<PublicationJobRow> {
  const parentId = row.parentContainerId;
  if (!parentId) {
    return fail(deps, row, "retryable", "No media container to publish.");
  }
  let mediaId: string | undefined;
  try {
    mediaId = await deps.publishContainer(parentId);
    const moved = await move(deps, "publishing", {
      status: "pending-confirmation",
      publishedMediaId: mediaId,
      finishedAt: deps.now(),
      failureKind: null,
      lastError: null,
    });
    return moved ?? (await deps.loadJob());
  } catch (error) {
    if (error instanceof PublicationJobLeaseLostError) throw error;
    if (mediaId) {
      // A transient persistence failure must not discard the exact id already received.
      return move(deps, "publishing", { status: "pending-confirmation", publishedMediaId: mediaId,
        finishedAt: deps.now(), failureKind: null, lastError: null });
    }
    if (isUncertainError(error)) {
      const moved = await deps.transition("publishing", {
        status: "pending-confirmation",
        failureKind: "uncertain",
        lastError:
          "The publish request did not return a confirmation. We will check with Instagram before any retry.",
      });
      return moved ?? (await deps.loadJob());
    }
    const verdict = classifyPublishError(error);
    const moved = await deps.transition("publishing", {
      status: verdict.terminal,
      failureKind: verdict.kind,
      lastError: verdict.message,
      finishedAt: deps.now(),
    });
    return moved ?? (await deps.loadJob());
  }
}

async function reconcilePending(deps: PublishJobDependencies, row: PublicationJobRow): Promise<PublicationJobRow> {
  if (!row.parentContainerId) return suspend(deps, row, "uncertain", "No container is recorded. Resolve manually; do not resend.");
  let status: ContainerStatusCode;
  try { status = await deps.getContainerStatus(row.parentContainerId); }
  catch { return row; } // Bounded by the persisted startedAt window, never by a browser timer.
  if (status === "PUBLISHED") {
    // The container id is NOT the media id. No supported mapping is assumed.
    return suspend(deps, row, "uncertain", "Instagram confirms the container was published, but the media id was not received. Resolve manually; do not resend.");
  }
  if (status === "EXPIRED" || status === "ERROR") {
    return suspend(deps, row, "uncertain", "The container is no longer available and the send outcome is uncertain. Resolve manually; do not resend.");
  }
  return row; // FINISHED/IN_PROGRESS do not prove a previous publish request failed.
}

async function finalizePublished(
  deps: PublishJobDependencies,
  row: PublicationJobRow,
  pkg: FrozenPackageForPublish,
): Promise<void> {
  if (!row.publishedMediaId) return;

  let permalink = row.permalink ?? undefined;
  let publishedAt = row.finishedAt ?? deps.now();
  if (!permalink) {
    try {
      const meta = await deps.fetchPermalink(row.publishedMediaId);
      permalink = meta.permalink;
      if (meta.timestamp) {
        const parsed = new Date(meta.timestamp);
        if (!Number.isNaN(parsed.getTime())) publishedAt = parsed;
      }
    } catch {
      // permalink is best-effort; its absence never hides a confirmed publication
    }
  }

  await deps.recordPublishedMedia({
    externalId: row.publishedMediaId,
    mediaType: pkg.mediaType,
    permalink,
    publishedAt,
  });

  await deps.markPackageConsumed();
  await move(deps, row.status, { status: "published", permalink: permalink ?? null,
    finishedAt: row.finishedAt ?? deps.now(), failureKind: null, lastError: null });
}

async function suspend(
  deps: PublishJobDependencies,
  row: PublicationJobRow,
  kind: PublicationJobFailureKind,
  message: string,
): Promise<PublicationJobRow> {
  const moved = await deps.transition(row.status, {
    status: "suspended",
    failureKind: kind,
    lastError: message,
    finishedAt: deps.now(),
  });
  return moved ?? (await deps.loadJob());
}

async function fail(
  deps: PublishJobDependencies,
  row: PublicationJobRow,
  kind: PublicationJobFailureKind,
  message: string,
): Promise<PublicationJobRow> {
  const moved = await deps.transition(row.status, {
    status: "failed",
    failureKind: kind,
    lastError: message,
    finishedAt: deps.now(),
  });
  return moved ?? (await deps.loadJob());
}

function failureKindForAccess(
  state: PublishingAccess["state"],
): PublicationJobFailureKind {
  if (state === "rate-limited" || state === "quota-exhausted") return "rate-limit";
  if (state === "missing-permission" || state === "needs-reconnect") {
    return "permission";
  }
  return "invalidated";
}

/**
 * A publish call that threw: was the post maybe created anyway? A clean 4xx
 * rejection from Meta means no — safe to fail. A 5xx, a timeout, or a network
 * error means we don't know — must go to pending-confirmation, never a blind
 * retry.
 */
function isUncertainError(error: unknown): boolean {
  if (error instanceof PublicationIdentityChangedError) return false;
  if (error instanceof MetaGraphApiError) return error.status >= 500;
  if (
    error instanceof Error &&
    (error.name === "TimeoutError" || error.name === "AbortError")
  ) {
    return true;
  }
  return true;
}

function classifyPublishError(error: unknown): {
  kind: PublicationJobFailureKind;
  terminal: "failed" | "suspended";
  message: string;
} {
  if (error instanceof PublicationIdentityChangedError) {
    return { kind: "invalidated", terminal: "suspended", message: "The original account, connection or package changed. No new send was authorized." };
  }
  if (error instanceof MetaGraphApiError) {
    const kind = classifyMetaGraphError(error.graphError);
    if (kind === "auth") {
      return {
        kind: "permission",
        terminal: "suspended",
        message:
          "Instagram rejected the request: the account authorization is no longer valid. Reconnect and verify again.",
      };
    }
    if (kind === "permission" || error.status === 403) {
      return {
        kind: "permission",
        terminal: "suspended",
        message:
          "Instagram rejected the request for lack of publishing permission.",
      };
    }
    if (error.status === 429) {
      return {
        kind: "rate-limit",
        terminal: "suspended",
        message: "Instagram rate-limited this account. Try again later.",
      };
    }
    return {
      kind: "retryable",
      terminal: "failed",
      message: `Instagram rejected the request (HTTP ${error.status}).`,
    };
  }
  return {
    kind: "retryable",
    terminal: "failed",
    message:
      "The publish attempt failed unexpectedly and no confirmation was received.",
  };
}
