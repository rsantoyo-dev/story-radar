import assert from "node:assert/strict";
import { test } from "node:test";
import sharp from "sharp";

import type { PublicationCandidate } from "./instagram-publication-candidate";
import {
  PublicationPackageConflictError,
  runFreezePublicationPackage,
  type FreezeDependencies,
  type FrozenPackage,
  type PersistDeliveryFile,
  type PersistPackage,
  type RenewPackage,
} from "./freeze-publication-package.core";

async function jpeg1080x1350(): Promise<File> {
  const bytes = await sharp({
    create: { width: 1080, height: 1350, channels: 3, background: "white" },
  })
    .png()
    .toBuffer();
  return new File([new Uint8Array(bytes)], "approved.png", { type: "image/png" });
}

function candidate(over: Partial<PublicationCandidate> = {}): PublicationCandidate {
  return {
    state: "ready",
    checkedAt: "2026-09-09T12:00:00Z",
    snapshotHash: "snap-1",
    draftId: "draft",
    draftVersion: 3,
    batchId: "batch",
    caption: "Exact caption",
    hashtags: ["#a", "#b"],
    destination: { igUserId: "1789", igUsername: "topic.account" },
    assets: [
      { id: "asset-2", version: 4, order: 2 },
      { id: "asset-1", version: 5, order: 1 },
    ],
    blockers: [],
    ...over,
  };
}

function baseDeps(
  over: Partial<FreezeDependencies> = {},
): { deps: FreezeDependencies; puts: string[]; removed: string[]; persisted: { pkg?: PersistPackage; files?: PersistDeliveryFile[] } } {
  const puts: string[] = [];
  const removed: string[] = [];
  const persisted: { pkg?: PersistPackage; files?: PersistDeliveryFile[] } = {};
  const deps: FreezeDependencies = {
    deliveryBaseUrl: "https://app.example",
    loadCandidate: async () => candidate(),
    loadContext: async () => ({
      storyId: "story",
      provider: "creative",
      connectionVersion: "conn-1-SECRET",
      channel: "instagram-direct",
      pageId: null,
      scriptSnapshot: { units: [{ order: 1 }] },
      policySnapshot: { provider: "creative" },
    }),
    findExisting: async () => undefined,
    readApprovedImage: async () => jpeg1080x1350(),
    buildObjectKey: (pkgId, order) => `delivery/${pkgId}/${order}.jpg`,
    putObject: async (key) => {
      puts.push(key);
    },
    removeObject: async (key) => {
      removed.push(key);
    },
    persist: async (pkg, files) => {
      persisted.pkg = pkg;
      persisted.files = files;
    },
    now: () => new Date("2026-09-09T12:00:00Z"),
    ...over,
  };
  return { deps, puts, removed, persisted };
}

test("a non-ready candidate is a conflict carrying its blockers", async () => {
  const { deps } = baseDeps({
    loadCandidate: async () =>
      candidate({ state: "candidate", blockers: [{ code: "x", message: "fix approval" }] }),
  });
  await assert.rejects(
    () => runFreezePublicationPackage("t", "draft", deps),
    (e: unknown) =>
      e instanceof PublicationPackageConflictError &&
      e.blockers[0]?.code === "x",
  );
});

test("freeze re-encodes each slide in order, uploads once per slide, and never leaks keys or secrets", async () => {
  const { deps, puts, persisted } = baseDeps();
  const frozen = await runFreezePublicationPackage("t", "draft", deps);

  assert.equal(frozen.mediaType, "carousel");
  assert.equal(frozen.draftVersion, 3);
  assert.equal(frozen.slides.length, 2);
  assert.deepEqual(frozen.slides.map((s) => s.unitOrder), [1, 2]);
  assert.deepEqual(frozen.slides.map((s) => s.assetVersion), [5, 4]);
  assert.equal(frozen.caption, "Exact caption");
  assert.match(frozen.slides[0].deliveryUrl, /^https:\/\/app\.example\/api\/deliver\/[A-Za-z0-9_-]{32}$/);
  for (const slide of frozen.slides) {
    assert.match(slide.sha256, /^[a-f0-9]{64}$/);
    assert.equal(slide.width, 1080);
    assert.equal(slide.height, 1350);
    assert.ok(slide.byteSize > 0);
    assert.match(slide.transform, /PNG → JPEG q90/);
  }
  assert.equal(puts.length, 2);
  assert.deepEqual(puts, persisted.files!.map((f) => f.objectKey));
  assert.equal(persisted.pkg!.status, "frozen");
  assert.equal(persisted.pkg!.draftVersion, 3);
  assert.equal(persisted.pkg!.publishingAccessPending, false);
  assert.equal(frozen.publishingAccessPending, false);
  assert.equal(
    persisted.pkg!.expiresAt.getTime() - persisted.pkg!.createdAt.getTime(),
    24 * 60 * 60 * 1000,
  );
  // browser-safe result: no object keys, no connection version, no token outside the URL
  const json = JSON.stringify(frozen);
  assert.doesNotMatch(json, /delivery\/|SECRET|conn-1/);
});

test("only publishing-access blockers do not stop the freeze; the package is flagged pending", async () => {
  const { deps, puts, persisted } = baseDeps({
    loadCandidate: async () =>
      candidate({
        state: "candidate",
        blockers: [{ code: "publishing-access-missing-permission", message: "no publish scope" }],
      }),
  });
  const frozen = await runFreezePublicationPackage("t", "draft", deps);
  assert.equal(frozen.publishingAccessPending, true);
  assert.equal(persisted.pkg!.publishingAccessPending, true);
  assert.equal(puts.length, 2);
});

test("an editorial blocker alongside an access blocker still stops the freeze", async () => {
  const { deps } = baseDeps({
    loadCandidate: async () =>
      candidate({
        state: "candidate",
        blockers: [
          { code: "publishing-access-missing-permission", message: "no publish scope" },
          { code: "image-approval", message: "approve image 2" },
        ],
      }),
  });
  await assert.rejects(
    () => runFreezePublicationPackage("t", "draft", deps),
    (e: unknown) =>
      e instanceof PublicationPackageConflictError &&
      e.blockers.length === 1 &&
      e.blockers[0].code === "image-approval",
  );
});

test("freeze is idempotent: an existing frozen package for the same snapshot is returned without re-uploading", async () => {
  const prior: FrozenPackage = {
    id: "prior",
    status: "frozen",
    packageHash: "h",
    mediaType: "carousel",
    caption: "Exact caption",
    hashtags: [],
    destination: { igUserId: "1789", igUsername: "topic.account" },
    channel: "instagram-direct",
    publishingAccessPending: false,
    expiresAt: "2026-09-10T12:00:00Z",
    createdAt: "2026-09-09T12:00:00Z",
    slides: [],
  };
  const { deps, puts } = baseDeps({ findExisting: async () => prior });
  const frozen = await runFreezePublicationPackage("t", "draft", deps);
  assert.equal(frozen.id, "prior");
  assert.equal(puts.length, 0);
});

test("a slide that is not 1080x1350 blocks the freeze before persisting", async () => {
  const wrong = await sharp({
    create: { width: 1080, height: 1080, channels: 3, background: "white" },
  })
    .png()
    .toBuffer();
  const { deps, persisted } = baseDeps({
    loadCandidate: async () => candidate({ assets: [{ id: "a", version: 1, order: 1 }] }),
    readApprovedImage: async () => new File([new Uint8Array(wrong)], "w.png", { type: "image/png" }),
  });
  await assert.rejects(() => runFreezePublicationPackage("t", "draft", deps), /Image 1:/);
  assert.equal(persisted.pkg, undefined);
});

test("if persist fails, every uploaded object is removed and the error propagates", async () => {
  const { deps, puts, removed } = baseDeps({
    persist: async () => {
      throw new Error("db write failed");
    },
  });
  await assert.rejects(() => runFreezePublicationPackage("t", "draft", deps), /db write failed/);
  assert.equal(puts.length, 2);
  assert.deepEqual(removed.sort(), puts.sort());
});

test("an approved set that was already published is refused at once, before any image is processed", async () => {
  let reads = 0;
  const { deps, puts } = baseDeps({ findUsed: async () => ({ status: "consumed" }) });
  const read = deps.readApprovedImage;
  deps.readApprovedImage = async (...args) => { reads++; return read(...args); };
  await assert.rejects(runFreezePublicationPackage("t", "draft", deps), /already published on this channel/);
  assert.equal(reads, 0);
  assert.equal(puts.length, 0);
});

async function expiredPrior(over: Partial<FrozenPackage> = {}): Promise<FrozenPackage> {
  // Freeze once to learn the exact package hash this content produces.
  const first = await runFreezePublicationPackage("t", "draft", baseDeps().deps);
  return { ...first, id: "prior", expiresAt: "2026-09-09T11:00:00Z", createdAt: "2026-09-08T11:00:00Z", ...over };
}

test("an expired package of the same approved set is renewed in place with new delivery files", async () => {
  const prior = await expiredPrior();
  const renewed: { pkg?: RenewPackage; files?: PersistDeliveryFile[] } = {};
  const { deps, puts, persisted } = baseDeps({
    findExisting: async () => prior,
    findUsed: async () => { throw new Error("an expired frozen package is not a used one"); },
    renew: async (pkg, files) => { renewed.pkg = pkg; renewed.files = files; },
  });
  const frozen = await runFreezePublicationPackage("t", "draft", deps);

  assert.equal(frozen.id, "prior");
  assert.equal(frozen.packageHash, prior.packageHash);
  assert.equal(frozen.createdAt, prior.createdAt);
  assert.equal(frozen.expiresAt, "2026-09-10T12:00:00.000Z");
  assert.equal(persisted.pkg, undefined, "renewal never inserts a second package");
  assert.deepEqual(renewed.pkg, {
    packageId: "prior",
    previousExpiresAt: new Date(prior.expiresAt),
    expiresAt: new Date("2026-09-10T12:00:00Z"),
    publishingAccessPending: false,
    updatedAt: new Date("2026-09-09T12:00:00Z"),
  });
  assert.deepEqual(renewed.files?.map((file) => file.packageId), ["prior", "prior"]);
  assert.deepEqual(puts, ["delivery/prior/1.jpg", "delivery/prior/2.jpg"]);
  // Fresh tokens: links from the expired window stop working.
  for (const slide of frozen.slides) {
    assert.ok(!prior.slides.some((old) => old.deliveryUrl === slide.deliveryUrl));
  }
});

test("a package that has not expired is returned without renewing", async () => {
  const prior = await expiredPrior({ expiresAt: "2026-09-09T13:00:00Z" });
  let renewals = 0;
  const { deps, puts } = baseDeps({ findExisting: async () => prior, renew: async () => { renewals += 1; } });
  assert.equal((await runFreezePublicationPackage("t", "draft", deps)).id, "prior");
  assert.equal(renewals, 0);
  assert.equal(puts.length, 0);
});

test("renewal refuses if the re-rendered content would change what is posted", async () => {
  const prior = await expiredPrior({ packageHash: "a-different-hash" });
  let renewals = 0;
  const { deps, puts } = baseDeps({ findExisting: async () => prior, renew: async () => { renewals += 1; } });
  await assert.rejects(runFreezePublicationPackage("t", "draft", deps), PublicationPackageConflictError);
  assert.equal(renewals, 0);
  assert.equal(puts.length, 0, "nothing is uploaded before the content check");
});

test("a failed renewal removes the files it uploaded", async () => {
  const prior = await expiredPrior();
  const { deps, removed } = baseDeps({
    findExisting: async () => prior,
    renew: async () => { throw new PublicationPackageConflictError("changed concurrently"); },
  });
  await assert.rejects(runFreezePublicationPackage("t", "draft", deps), /changed concurrently/);
  assert.deepEqual(removed, ["delivery/prior/1.jpg", "delivery/prior/2.jpg"]);
});
