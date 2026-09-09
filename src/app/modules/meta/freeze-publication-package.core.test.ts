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
