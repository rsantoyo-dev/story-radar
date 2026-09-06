import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";

function harness({ postVersion = 2, draftVersion = 3, batchId = "batch", batchDraft = "draft", batchVersion = 2, found = true, draftStory = "story" } = {}) {
  const exports: Record<string, (...args: string[]) => Promise<{ unavailable?: string; units: { headline: string }[] }>> = {};
  let fetchedBatch: string | undefined;
  const deps: Record<string, unknown> = {
    "server-only": {},
    "@/app/modules/stories/creative-assets.repository": { findCreativeAssetBatchById: async (id: string) => {
      fetchedBatch = id;
      return { draftId: batchDraft, draftVersion: batchVersion, assets: [{ unitOrder: 1, unitSnapshot: { headline: "Original headline", body: "Original text" }, imageUrl: "https://example.org/original.png" }] };
    } },
    "@/app/modules/stories/creative-content.repository": { findCreativeDraftById: async (topic: string, id: string) => {
      assert.equal(topic, "topic"); assert.equal(id, "draft");
      return { id: "draft", storyId: draftStory, provider: "documentary", format: "carousel", version: draftVersion, units: [{ order: 1, headline: "Current headline" }] };
    } },
    "./instagram-creative-version-label": { instagramCreativeVersionLabel: () => "Historical carousel" },
    "./topic-meta-connections.repository": { getTopicMetaConnectionStatus: async () => ({ state: "operational" }), getConnectedInstagramAccount: async () => ({ igUsername: "test" }) },
    "./topic-instagram-media.repository": { listStoryInstagramPosts: async (topic: string, story: string) => {
      assert.equal(topic, "topic"); assert.equal(story, "story");
      return found ? [{ externalId: "post", linkedDraftId: "draft", linkedDraftVersion: postVersion, linkedBatchId: batchId || null }] : [];
    } },
  };
  const code = ts.transpileModule(readFileSync("src/app/modules/meta/story-instagram-results.ts", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  runInNewContext(code, { exports, require: (name: string) => { if (!(name in deps)) throw Error(name); return deps[name]; } });
  return { read: () => exports.getStoryInstagramVersion("topic", "story", "post"), results: () => exports.getStoryInstagramResults("topic", "story") as unknown as Promise<{ posts: { creativeVersion: unknown }[] }>, batch: () => fetchedBatch };
}

test("historical post opens its exact batch snapshot despite a newer current draft", async () => {
  const h = harness(); const result = await h.read();
  assert.equal(h.batch(), "batch"); assert.equal(result.units[0].headline, "Original headline");
});
test("old revision without a snapshot never falls back to current draft content", async () => {
  const result = await harness({ batchId: "" }).read();
  assert.ok(result.unavailable); assert.equal(result.units.length, 0);
});
test("same draft revision without batch can display its preserved current content", async () => {
  const result = await harness({ batchId: "", draftVersion: 2 }).read();
  assert.equal(result.units[0].headline, "Current headline");
});
test("batch from another draft or revision is not exposed", async () => {
  for (const options of [{ batchDraft: "other" }, { batchVersion: 4 }]) {
    const result = await harness(options).read(); assert.ok(result.unavailable); assert.equal(result.units.length, 0);
  }
});
test("a post not linked to this topic and story cannot load an asset batch", async () => {
  const h = harness({ found: false }); const result = await h.read();
  assert.ok(result.unavailable); assert.equal(h.batch(), undefined);
});


test("documentary draft appears in story results and opens its linked batch", async () => {
  const h = harness();
  assert.ok((await h.results()).posts[0].creativeVersion);
  assert.equal((await h.read()).units[0].headline, "Original headline");
});
test("a linked draft from another story is not exposed", async () => {
  const h = harness({ draftStory: "other-story" });
  assert.equal((await h.results()).posts[0].creativeVersion, null);
  assert.ok((await h.read()).unavailable);
  assert.equal(h.batch(), undefined);
});
