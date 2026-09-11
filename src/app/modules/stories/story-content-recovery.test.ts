import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import * as crypto from "node:crypto";
import { parseStoryContentRecoveryInput } from "./story-content-recovery-input";

const text = "This is the original article supplied by its reader with clear source attribution. ".repeat(12);

test("manual recovery requires confirmation, a source URL and sufficient bounded text", () => {
  const valid = { sourceUrl: "https://publisher.example/article", text, confirmed: true };
  assert.equal(parseStoryContentRecoveryInput(valid).text, text.trim());
  for (const change of [
    { confirmed: false }, { sourceUrl: "javascript:alert(1)" },
    { sourceUrl: "https://user:secret@example.com" }, { text: "" },
    { text: "A search snippet" }, { text: "x".repeat(100001) },
  ]) assert.throws(() => parseStoryContentRecoveryInput({ ...valid, ...change }));
});

function harness(failFetch = false) {
  const calls: string[] = [];
  let saved: Record<string, unknown> | undefined;
  const source = readFileSync("src/app/modules/stories/prepare-selected-story-content.ts", "utf8");
  const start = source.indexOf("export async function recoverStoryContent(");
  const exports: { recoverStoryContent?: (...args: unknown[]) => Promise<unknown> } = {};
  runInNewContext(ts.transpileModule(source.slice(start), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, {
    exports, parseStoryContentRecoveryInput, createHash: crypto.createHash,
    findStoryForEnrichment: async (topic: string, story: string) => {
      assert.equal(topic, "topic"); assert.equal(story, "story");
      return { title: "Original", url: "https://original.example/article" };
    },
    extractReaderArticleContent: ({ markdown }: { markdown: string }) => ({
      text: markdown, wordCount: 200, status: "likely-full",
    }),
    fetchPreparedArticle: async () => {
      if (failFetch) throw new Error("Publisher blocked access");
      return { extracted: { text, wordCount: 200, status: "likely-full" },
        resolvedUrl: "https://alternative.example/article", method: "direct" };
    },
    beginStoryContentEnrichment: async (_id: string, sourceUrl: string) => {
      assert.equal(sourceUrl, "https://original.example/article"); calls.push("begin");
    },
    completeStoryContentEnrichment: async (input: Record<string, unknown>) => { saved = input; calls.push("save"); },
    getStoryContent: async () => ({ storyId: "story" }),
  });
  return { run: (input: unknown) => exports.recoverStoryContent!("topic", "story", input), calls, saved: () => saved };
}

test("manual recovery records manual provenance while retaining original URL", async () => {
  const h = harness();
  await h.run({ sourceUrl: "https://alternative.example/article", text, confirmed: true });
  assert.equal(h.saved()?.method, "manual");
  assert.equal(h.saved()?.resolvedUrl, "https://alternative.example/article");
  assert.equal(h.saved()?.contentHash, crypto.createHash("sha256").update(text.trim()).digest("hex"));
});

test("failed alternative extraction does not erase saved content", async () => {
  const h = harness(true);
  await assert.rejects(h.run({ sourceUrl: "https://alternative.example/article", confirmed: true }));
  assert.deepEqual(h.calls, []);
});

test("alternative URL is fetched and its resolved provenance saved", async () => {
  const h = harness();
  await h.run({ sourceUrl: "https://alternative.example/article", confirmed: true });
  assert.equal(h.saved()?.method, "direct");
  assert.equal(h.saved()?.resolvedUrl, "https://alternative.example/article");
});
