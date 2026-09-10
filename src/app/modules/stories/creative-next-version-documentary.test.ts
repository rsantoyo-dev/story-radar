import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";

function harness(overrides: Record<string, unknown> = {}) {
  const source = readFileSync("src/app/modules/stories/manage-creative-assets.ts", "utf8");
  const start = source.indexOf("export async function generateNextCreativeDraftAssetVersion(");
  const end = source.indexOf("export async function regenerateCreativeAsset(", start);
  const draft = { id: "draft", version: 3, status: "approved", briefId: "brief" };
  const batch = { id: "batch", draftId: "draft", draftVersion: 3, status: "completed",
    imageQuality: "high", promptVersion: "integrated-portrait-4x5-v13", assets: [] };
  const prepared = new Map([[3, { evidence: { representation: "photo" } }]]);
  const calls: string[] = [];
  const exports: Record<string, (...args: unknown[]) => Promise<unknown>> = {};
  runInNewContext(ts.transpileModule(source.slice(start, end), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, {
    exports,
    requireCreativeDraft: async () => draft,
    requireApprovedDraft: () => {},
    requireCreativeBrief: async () => ({ keyFacts: ["museum"] }),
    findCreativeAssetBatchById: async () => ({ ...batch, ...overrides }),
    reuseDocumentaryVisuals: async () => prepared,
    placeCompositionVersion: () => "place-visual-v4",
    documentaryVisualInputHash: () => "photo-hash",
    hasPendingAssets: (b: { status: string }) => b.status === "generating",
    CreativeContentConflictError: Error,
    composeDraftPlaceVisuals: async (topic: string, d: unknown, brief: unknown, quality: string, originals: unknown) => {
      assert.equal(topic, "topic"); assert.equal(d, draft);
      assert.equal(quality, "high"); assert.equal(originals, prepared);
      calls.push("compose");
      return { outcome: "submitted", batch: { id: "new-composition" } };
    },
  });
  return { run: () => exports.generateNextCreativeDraftAssetVersion("topic", "draft", "batch"), calls };
}

test("new version of a generative batch uses the newly approved documentary photo", async () => {
  const h = harness();
  const result = await h.run() as { outcome: string };
  assert.equal(result.outcome, "submitted");
  assert.deepEqual(h.calls, ["compose"]);
});

test("stale, foreign and pending batches cannot start a documentary replacement", async () => {
  for (const input of [{ status: "stale" }, { draftId: "other" }, { draftVersion: 2 }, { status: "generating" }]) {
    const h = harness(input);
    await assert.rejects(h.run());
    assert.deepEqual(h.calls, []);
  }
});
