import assert from "node:assert/strict";
import { test } from "node:test";

import { MetaGraphApiError } from "./meta-token-response";
import type {
  PublishingAccess,
  PublishingIdentity,
} from "./instagram-publishing-access";
import {
  runPublishPublicationJob,
  publicationRetryPatch,
  isTerminalPublicationJobStatus,
  PublicationJobLeaseLostError,
  type ContainerStatusCode,
  type FrozenPackageForPublish,
  type PublicationJobRow,
  type PublishJobDependencies,
  type RecordPublishedMediaInput,
} from "./publish-publication-package.core";

const NOW = new Date("2026-09-09T12:00:00Z");
const IDENTITY: PublishingIdentity = {
  topicId: "t1",
  igUserId: "1789",
  connectionVersion: "conn-1",
  appConfigurationVersion: "app-1",
};

function enabledAccess(over: Partial<PublishingAccess> = {}): PublishingAccess {
  return {
    state: "enabled",
    message: "ok",
    identity: IDENTITY,
    apiVersion: "v21.0",
    checkedAt: new Date(NOW.getTime() - 1_000).toISOString(),
    expiresAt: new Date(NOW.getTime() + 4 * 60_000).toISOString(),
    quota: { used: 0, total: 100, durationSeconds: 86_400, remaining: 100 },
    ...over,
  };
}

function frozen(over: Partial<FrozenPackageForPublish> = {}): FrozenPackageForPublish {
  return {
    status: "frozen",
    mediaType: "carousel",
    caption: "Exact caption",
    candidateSnapshotHash: "snap-1",
    expiresAt: new Date("2026-09-10T12:00:00Z"),
    destination: { igUserId: "1789", igUsername: "acct" },
    slides: [
      { unitOrder: 1, deliveryUrl: "https://app.example/api/deliver/tok-secret-1" },
      { unitOrder: 2, deliveryUrl: "https://app.example/api/deliver/tok-secret-2" },
    ],
    ...over,
  };
}

function initialRow(over: Partial<PublicationJobRow> = {}): PublicationJobRow {
  return {
    id: "job-1",
    packageId: "pkg-1",
    topicId: "t1",
    status: "queued",
    mediaType: null,
    igUserId: "1789",
    connectionVersion: "conn-1",
    appConfigurationVersion: "app-1",
    apiVersion: "v21.0",
    accessState: null,
    quotaRemaining: null,
    childContainers: [],
    parentContainerId: null,
    publishedMediaId: null,
    permalink: null,
    attempts: 0,
    failureKind: null,
    lastError: null,
    startedAt: null,
    finishedAt: null,
    ...over,
  };
}

type HarnessOptions = {
  row?: Partial<PublicationJobRow>;
  pkg?: Partial<FrozenPackageForPublish>;
  access?: PublishingAccess | (() => Promise<PublishingAccess>);
  candidateHash?: string;
  containerStatuses?: ContainerStatusCode[];
  publishResult?: () => Promise<string>;
  transition?: "normal" | "lost-race";
};

function harness(options: HarnessOptions = {}) {
  const row = initialRow(options.row);
  const pkg = frozen(options.pkg);
  const statuses = [...(options.containerStatuses ?? [])];
  const calls = {
    createImage: [] as string[],
    createCarousel: 0,
    getContainerStatus: 0,
    publishContainer: 0,
    markConsumed: 0,
    recordMedia: [] as RecordPublishedMediaInput[],
    permalink: 0,
  };

  let imageSeq = 1000;
  const deps: PublishJobDependencies = {
    loadJob: async () => ({ ...row }),
    loadPackage: async () => pkg,
    reverifyAccess: async (): Promise<PublishingAccess> =>
      typeof options.access === "function"
        ? options.access()
        : (options.access ?? enabledAccess()),
    expectedIdentity: IDENTITY,
    apiVersion: "v21.0",
    currentCandidateSnapshotHash: async () =>
      options.candidateHash ?? pkg.candidateSnapshotHash,
    createImageContainer: async (input) => {
      calls.createImage.push(input.imageUrl);
      imageSeq += 1;
      return String(imageSeq);
    },
    createCarouselContainer: async () => {
      calls.createCarousel += 1;
      return "9001";
    },
    getContainerStatus: async () => {
      calls.getContainerStatus += 1;
      return statuses.shift() ?? "FINISHED";
    },
    publishContainer: options.publishResult
      ? async () => {
          calls.publishContainer += 1;
          return options.publishResult!();
        }
      : async () => {
          calls.publishContainer += 1;
          return "5001";
        },
    fetchPermalink: async () => {
      calls.permalink += 1;
      return {
        permalink: "https://www.instagram.com/p/ABCDEF/",
        timestamp: "2026-09-09T12:00:05Z",
      };
    },
    transition: async (from, patch) => {
      if (options.transition === "lost-race") return null;
      if (row.status !== from) return null;
      for (const [key, value] of Object.entries(patch)) {
        if (value !== undefined) (row as Record<string, unknown>)[key] = value;
      }
      return { ...row };
    },
    markPackageConsumed: async () => {
      calls.markConsumed += 1;
    },
    recordPublishedMedia: async (input) => {
      calls.recordMedia.push(input);
    },
    now: () => NOW,
  };

  return { deps, calls, row: () => row };
}

async function finish(deps: PublishJobDependencies) {
  for (let step = 0; step < 30; step++) {
    const view = await runPublishPublicationJob(deps);
    if (isTerminalPublicationJobStatus(view.status)) return view;
  }
  throw new Error("The job did not finish in 30 steps");
}

test("carousel happy path: containers in order, one publish, package consumed and media recorded", async () => {
  const h = harness({ containerStatuses: ["FINISHED"] });
  const view = await finish(h.deps);

  assert.equal(view.status, "published");
  assert.equal(view.publishedMediaId, "5001");
  assert.deepEqual(h.calls.createImage, [
    "https://app.example/api/deliver/tok-secret-1",
    "https://app.example/api/deliver/tok-secret-2",
  ]);
  assert.equal(h.calls.createCarousel, 1);
  assert.equal(h.calls.publishContainer, 1);
  assert.equal(h.calls.markConsumed, 1);
  assert.equal(h.calls.recordMedia.length, 1);
  assert.equal(h.calls.recordMedia[0].externalId, "5001");
  assert.equal(h.calls.recordMedia[0].mediaType, "carousel");
  assert.deepEqual(
    h.row().childContainers.map((c) => c.unitOrder),
    [1, 2],
  );
});

test("a single image posts without a carousel container and carries the caption", async () => {
  const h = harness({
    pkg: {
      mediaType: "image",
      slides: [{ unitOrder: 1, deliveryUrl: "https://app.example/api/deliver/x" }],
    },
    containerStatuses: ["FINISHED"],
  });
  const view = await finish(h.deps);

  assert.equal(view.status, "published");
  assert.equal(h.calls.createCarousel, 0);
  assert.equal(h.calls.createImage.length, 1);
  assert.equal(h.calls.publishContainer, 1);
});

test("a container ERROR fails the job before any publish", async () => {
  const h = harness({ containerStatuses: ["ERROR"] });
  const view = await finish(h.deps);

  assert.equal(view.status, "failed");
  assert.equal(view.failureKind, "retryable");
  assert.equal(h.calls.publishContainer, 0);
  assert.equal(h.calls.markConsumed, 0);
});

test("a timeout followed by PUBLISHED without a media id requires manual resolution, never another send", async () => {
  const h = harness({ row: { status: "containers-ready", parentContainerId: "9001", attempts: 1, startedAt: NOW },
    containerStatuses: ["FINISHED", "PUBLISHED"], publishResult: async () => { throw new Error("timeout"); } });
  const first = await runPublishPublicationJob(h.deps);
  assert.equal(first.status, "pending-confirmation");
  const second = await runPublishPublicationJob(h.deps);
  assert.equal(second.status, "suspended");
  assert.equal(second.failureKind, "uncertain");
  assert.equal(second.publishedMediaId, null);
  assert.equal(h.calls.publishContainer, 1);
  assert.equal(h.calls.markConsumed, 0);
});

test("missing publishing permission suspends the job and touches nothing on Instagram", async () => {
  const h = harness({
    access: enabledAccess({ state: "missing-permission", message: "no publish scope" }),
  });
  const view = await finish(h.deps);

  assert.equal(view.status, "suspended");
  assert.equal(view.failureKind, "permission");
  assert.equal(h.calls.createImage.length, 0);
  assert.equal(h.calls.getContainerStatus, 0);
});

test("a stale (expired) access check suspends the job", async () => {
  const h = harness({
    access: enabledAccess({
      checkedAt: new Date(NOW.getTime() - 30 * 60_000).toISOString(),
      expiresAt: new Date(NOW.getTime() - 20 * 60_000).toISOString(),
    }),
  });
  const view = await finish(h.deps);
  assert.equal(view.status, "suspended");
  assert.equal(view.failureKind, "invalidated");
});

test("an approved-set change since freezing suspends the job before any container", async () => {
  const h = harness({ candidateHash: "snap-DIFFERENT" });
  const view = await finish(h.deps);

  assert.equal(view.status, "suspended");
  assert.equal(view.failureKind, "invalidated");
  assert.equal(h.calls.createImage.length, 0);
  assert.equal(h.calls.getContainerStatus, 0);
});

test("a lost transition race stops the pass without advancing or calling Instagram", async () => {
  const h = harness({ transition: "lost-race" });
  const view = await runPublishPublicationJob(h.deps);

  assert.equal(view.status, "queued");
  assert.equal(h.calls.createImage.length, 0);
  assert.equal(h.calls.publishContainer, 0);
});

test("a clean 4xx rejection from publish fails (not pending) and does not consume the package", async () => {
  const h = harness({
    containerStatuses: ["FINISHED"],
    publishResult: async () => {
      throw new MetaGraphApiError("bad request", 400, { error: { message: "bad" } });
    },
  });
  const view = await finish(h.deps);

  assert.equal(view.status, "failed");
  assert.equal(view.failureKind, "retryable");
  assert.equal(h.calls.markConsumed, 0);
});

test("the returned view carries no delivery URL, token or connection version", async () => {
  const h = harness({ containerStatuses: ["FINISHED"] });
  const view = await finish(h.deps);
  const json = JSON.stringify(view);

  assert.doesNotMatch(json, /api\/deliver\//);
  assert.doesNotMatch(json, /tok-secret/);
  assert.doesNotMatch(json, /SECRET/);
  assert.doesNotMatch(json, /connectionVersion|connection_version/);
});


test("a failed local write resumes with the saved media id and never sends again", async () => {
  const h = harness({ row: { status: "containers-ready", parentContainerId: "9001", startedAt: NOW, attempts: 1 } });
  await runPublishPublicationJob(h.deps);
  assert.equal(h.row().publishedMediaId, "5001");
  const record = h.deps.recordPublishedMedia;
  h.deps.recordPublishedMedia = async () => { throw new Error("DB unavailable"); };
  await runPublishPublicationJob(h.deps);
  assert.equal(h.row().status, "pending-confirmation");
  assert.equal(h.calls.markConsumed, 0);
  h.deps.recordPublishedMedia = record;
  h.deps.fetchPermalink = async () => { throw new Error("Account disconnected"); };
  h.deps.loadPackage = async () => frozen({ status: "stale", expiresAt: new Date(0) });
  await runPublishPublicationJob(h.deps);
  assert.equal(h.row().status, "published");
  assert.equal(h.calls.publishContainer, 1);
  assert.equal(h.calls.recordMedia[0].externalId, "5001");
});

test("legacy published jobs can repair their record without rechecking authorization or publishing", async () => {
  const h = harness({ row: { status: "published", publishedMediaId: "5001", finishedAt: NOW }, pkg: { status: "consumed" } });
  h.deps.reverifyAccess = async () => { throw new Error("Must not check access for local repair"); };
  const view = await runPublishPublicationJob(h.deps);
  assert.equal(view.status, "published");
  assert.equal(h.calls.recordMedia.length, 1);
  assert.equal(h.calls.publishContainer, 0);
});

test("retry preserves remote history, revalidates, and creates fresh containers on the same job", async () => {
  const h = harness({ row: { status: "failed", failureKind: "expired-container", attempts: 1,
    parentContainerId: "old-parent", childContainers: [{ unitOrder: 1, creationId: "old-child" }] } });
  Object.assign(h.row(), publicationRetryPatch(h.row()));
  const view = await finish(h.deps);
  assert.equal(view.id, "job-1");
  assert.equal(view.status, "published");
  assert.equal(view.attempts, 2);
  assert.ok(h.row().childContainers.some(child => child.creationId === "old-parent" && child.status === "retired"));
  assert.equal(h.calls.publishContainer, 1);
});

test("uncertain, confirmed and exhausted orders cannot enter the explicit retry path", () => {
  for (const row of [
    initialRow({ status: "failed", failureKind: "uncertain" }),
    initialRow({ status: "failed", failureKind: "retryable", publishedMediaId: "5001" }),
    initialRow({ status: "failed", failureKind: "retryable", attempts: 4 }),
    initialRow({ status: "pending-confirmation" }),
  ]) assert.throws(() => publicationRetryPatch(row), /cannot be retried safely/);
});

test("a worker interrupted in publishing checks status without repeating media_publish", async () => {
  const h = harness({ row: { status: "publishing", parentContainerId: "9001", startedAt: NOW, attempts: 1 }, containerStatuses: ["FINISHED"] });
  const view = await runPublishPublicationJob(h.deps);
  assert.equal(view.status, "pending-confirmation");
  assert.equal(h.calls.getContainerStatus, 1);
  assert.equal(h.calls.publishContainer, 0);
});

test("confirmation queries stop at the persisted deadline, including provider outages", async () => {
  const h = harness({ row: { status: "pending-confirmation", parentContainerId: "9001", startedAt: NOW, attempts: 1 } });
  h.deps.getContainerStatus = async () => { throw new Error("unavailable"); };
  await runPublishPublicationJob(h.deps);
  h.deps.now = () => new Date(NOW.getTime() + 30 * 60_000);
  const view = await runPublishPublicationJob(h.deps);
  assert.equal(view.status, "suspended");
  assert.equal(view.failureKind, "uncertain");
  assert.equal(h.calls.publishContainer, 0);
});

test("the original connection is checked again after containers are ready", async () => {
  const h = harness({ row: { status: "containers-ready", parentContainerId: "9001", connectionVersion: "old-connection" } });
  const view = await runPublishPublicationJob(h.deps);
  assert.equal(view.status, "suspended");
  assert.equal(h.calls.publishContainer, 0);
});

test("a revoked approval after processing suspends the send", async () => {
  const h = harness({ row: { status: "containers-ready", parentContainerId: "9001" }, candidateHash: "revoked" });
  assert.equal((await runPublishPublicationJob(h.deps)).status, "suspended");
  assert.equal(h.calls.publishContainer, 0);
});

test("losing the publish transition to another worker stops before the external call", async () => {
  const h = harness({ row: { status: "containers-ready", parentContainerId: "9001" } });
  h.deps.transition = async () => { h.row().status = "publishing"; return null; };
  await runPublishPublicationJob(h.deps);
  assert.equal(h.calls.publishContainer, 0);
});

test("an expired lease cannot authorize a provider send", async () => {
  const h = harness({ row: { status: "containers-ready", parentContainerId: "9001" } });
  h.deps.publishContainer = async () => { throw new PublicationJobLeaseLostError(); };
  const view = await runPublishPublicationJob(h.deps);
  assert.equal(view.status, "publishing");
  assert.equal(h.calls.publishContainer, 0);
});

test("one processing step performs at most one container operation and does not sleep", async () => {
  const h = harness({ row: { status: "creating-containers" } });
  await runPublishPublicationJob(h.deps);
  assert.equal(h.calls.createImage.length, 1);
  assert.equal(h.calls.createCarousel, 0);
  assert.equal(h.calls.publishContainer, 0);
});


test("a transient failure saving the publish response retains its exact media id on the recovery write", async () => {
  const h = harness({ row: { status: "containers-ready", parentContainerId: "9001", startedAt: NOW } });
  const transition = h.deps.transition;
  let rejected = false;
  h.deps.transition = async (from, patch) => {
    if (patch.publishedMediaId && !rejected) { rejected = true; throw new Error("transient DB error"); }
    return transition(from, patch);
  };
  await runPublishPublicationJob(h.deps);
  assert.equal(h.row().publishedMediaId, "5001");
  assert.equal((await runPublishPublicationJob(h.deps)).status, "published");
  assert.equal(h.calls.publishContainer, 1);
});

test("a preflight-only invalidated suspension can be explicitly revalidated on the same order", async () => {
  const h = harness({ row: { status: "suspended", failureKind: "invalidated", attempts: 0 } });
  assert.equal((await runPublishPublicationJob(h.deps)).canRetry, true);
  assert.equal(h.calls.publishContainer, 0);
  Object.assign(h.row(), publicationRetryPatch(h.row()));
  assert.equal((await finish(h.deps)).status, "published");
  assert.equal(h.calls.publishContainer, 1);
});

test("a suspension with any provider history or uncertain result cannot be reactivated", () => {
  for (const extra of [
    { attempts: 1 }, { parentContainerId: "123" },
    { childContainers: [{ unitOrder: 1, creationId: "123" }] },
    { publishedMediaId: "5001" }, { failureKind: "uncertain" as const },
  ]) assert.throws(() => publicationRetryPatch(initialRow({ status: "suspended", failureKind: "invalidated", ...extra })), /cannot be retried safely/);
});

test("access checked after an asynchronous probe is compared with the current time", async () => {
  const h = harness();
  let time = NOW.getTime();
  h.deps.now = () => new Date(time);
  h.deps.reverifyAccess = async () => {
    time += 1000;
    return enabledAccess({ checkedAt: new Date(time).toISOString(), expiresAt: new Date(time + 240000).toISOString() });
  };
  assert.equal((await runPublishPublicationJob(h.deps)).status, "preparing");
});
