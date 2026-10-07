import assert from "node:assert/strict";
import test from "node:test";

import { createAssetImageStore, type AssetImageStoreDependencies } from "./creative-asset-image-store.core";

const ref = {
  topicId: "topic",
  assetId: "asset",
  version: 2,
  imageUrl: "https://v3.fal.media/files/a/image.png",
};

function fakeStore(overrides: Partial<AssetImageStoreDependencies> = {}) {
  const archive = new Map<string, File>();
  const calls = { source: 0, writes: 0 };
  const deps: AssetImageStoreDependencies = {
    archiveKey: (value) => `archive/${value.assetId}/v${value.version}`,
    exists: async (key) => archive.has(key),
    readArchive: async (key) => archive.get(key),
    writeArchive: async (key, file) => { calls.writes += 1; archive.set(key, file); },
    readSource: async () => { calls.source += 1; return new File(["fal-bytes"], "image.png", { type: "image/png" }); },
    ...overrides,
  };
  return { store: createAssetImageStore(deps), archive, calls };
}

test("archiving copies once and is idempotent", async () => {
  const { store, archive, calls } = fakeStore();
  assert.equal(await store.archive(ref), "archived");
  assert.equal(await store.archive(ref), "present");
  assert.equal(calls.source, 1);
  assert.equal(calls.writes, 1);
  assert.equal(await archive.get("archive/asset/v2")?.text(), "fal-bytes");
});

test("images not hosted by fal are never archived", async () => {
  const { store, calls } = fakeStore();
  assert.equal(await store.archive({ ...ref, imageUrl: "/api/radar/creative/documentary?asset=1" }), "not-archivable");
  assert.equal(await store.archive({ ...ref, imageUrl: null }), "not-archivable");
  assert.equal(calls.source, 0);
});

test("reads prefer the R2 copy and survive fal deleting the image", async () => {
  const { store, calls } = fakeStore({
    readSource: async () => { throw new Error("The source image is unavailable or expired."); },
  });
  await assert.rejects(store.read(ref), /expired/);
  const archived = fakeStore();
  await archived.store.archive(ref);
  archived.calls.source = 0;
  assert.equal(await (await archived.store.read(ref)).text(), "fal-bytes");
  assert.equal(archived.calls.source, 0);
  assert.equal(calls.writes, 0);
});

test("an R2 outage falls back to fal instead of failing the read", async () => {
  const { store, calls } = fakeStore({
    readArchive: async () => { throw new Error("R2 unavailable"); },
  });
  assert.equal(await (await store.read(ref)).text(), "fal-bytes");
  assert.equal(calls.source, 1);
  await assert.rejects(store.read({ ...ref, imageUrl: null }), /R2 unavailable/);
});
