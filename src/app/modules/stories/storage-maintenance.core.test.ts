import assert from "node:assert/strict";
import test from "node:test";

import {
  ARCHIVE_LOOKBACK_DAYS,
  runStorageMaintenance,
  type PublishedDeliveryFile,
  type StorageMaintenanceDependencies,
} from "./storage-maintenance.core";

const now = new Date("2026-10-07T12:00:00Z");

function fakeDeps(overrides: Partial<StorageMaintenanceDependencies> = {}) {
  const log = { since: undefined as Date | undefined, copies: [] as string[][], repoints: [] as string[][] };
  const files: PublishedDeliveryFile[] = [
    { fileId: "f1", topicId: "t", packageId: "p", unitOrder: 1, objectKey: "x/retention/7d/publication-delivery/topics/t/p/1.jpg" },
    { fileId: "f2", topicId: "t", packageId: "p", unitOrder: 2, objectKey: "x/retention/7d/publication-delivery/topics/t/p/2.jpg" },
  ];
  const deps: StorageMaintenanceDependencies = {
    now: () => now,
    listRecentApprovedImages: async (since) => {
      log.since = since;
      return [
        { topicId: "t", assetId: "a1", version: 1, imageUrl: "https://v3.fal.media/1.png" },
        { topicId: "t", assetId: "a2", version: 1, imageUrl: "https://v3.fal.media/2.png" },
        { topicId: "t", assetId: "a3", version: 1, imageUrl: "https://v3.fal.media/3.png" },
      ];
    },
    archive: async ({ assetId }) => {
      if (assetId === "a2") return "present";
      if (assetId === "a3") throw new Error("expired");
      return "archived";
    },
    listUnpreservedPublishedFiles: async () => files,
    publishedKey: (file) => `x/retention/permanent/published/topics/${file.topicId}/${file.packageId}/${file.unitOrder}.jpg`,
    copy: async (from, to) => {
      if (from.endsWith("/2.jpg")) throw Object.assign(new Error("missing"), { missing: true });
      log.copies.push([from, to]);
    },
    isMissingObject: (error) => Boolean((error as { missing?: boolean }).missing),
    repoint: async (fileId, from, to) => { log.repoints.push([fileId, from, to]); },
    ...overrides,
  };
  return { deps, log };
}

test("a pass preserves published files, then archives approved images inside fal's window", async () => {
  const { deps, log } = fakeDeps();
  const result = await runStorageMaintenance(deps, { budgetMs: 60_000 });

  assert.deepEqual(result.published, { checked: 2, preserved: 1, missing: 1, failed: 0 });
  assert.deepEqual(log.copies, [[
    "x/retention/7d/publication-delivery/topics/t/p/1.jpg",
    "x/retention/permanent/published/topics/t/p/1.jpg",
  ]]);
  // The row moves only after its copy exists.
  assert.deepEqual(log.repoints, [["f1", log.copies[0][0], log.copies[0][1]]]);

  assert.deepEqual(result.approved, { checked: 3, archived: 1, present: 1, failed: 1 });
  assert.equal(now.getTime() - log.since!.getTime(), ARCHIVE_LOOKBACK_DAYS * 86_400_000);
});

test("a failed copy never repoints its file", async () => {
  const { deps, log } = fakeDeps({ copy: async () => { throw new Error("R2 down"); } });
  const result = await runStorageMaintenance(deps, { budgetMs: 60_000 });
  assert.deepEqual(result.published, { checked: 2, preserved: 0, missing: 0, failed: 2 });
  assert.deepEqual(log.repoints, []);
});

test("an exhausted budget stops before doing more work", async () => {
  let archived = 0;
  const { deps } = fakeDeps({ archive: async () => { archived += 1; return "archived"; } });
  const result = await runStorageMaintenance(deps, { budgetMs: -1 });
  assert.equal(result.published.checked, 0);
  assert.equal(result.approved.checked, 0);
  assert.equal(archived, 0);
});
