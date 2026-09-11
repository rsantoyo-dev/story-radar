import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import * as crypto from "node:crypto";
import ts from "typescript";

test("alternative search exposes only grounded URLs and retains usage accounting", async () => {
  const url = "https://publisher.example/republication";
  let recorded = false;
  const deps: Record<string, unknown> = {
    "server-only": {}, "node:crypto": crypto,
    "./story-content.repository": { findStoryForEnrichment: async () => ({ title: "Article", url: "https://original.example/article" }) },
    "./creative-content.config": { getCreativeContentPublicConfig: () => ({ maxRunsPerDay: 10 }) },
    "./creative-content.repository": {
      getCreativeDailyUsage: async () => ({ remainingRuns: 1 }), createCreativeAiRun: async () => "run",
      completeCreativeAiRun: async () => { recorded = true; }, failCreativeAiRun: async () => assert.fail("Unexpected failure"),
    },
    "./openai-structured-response": { generateOpenAiStructuredResponse: async () => ({
      text: JSON.stringify({ candidates: [
        { url, title: "Article", reason: "Same credited author" },
        { url: "https://invented.example/story", title: "Article", reason: "Unverified" },
      ] }), webSearch: { sources: [{ url }] }, usage: {}, model: "fixture",
    }) },
  };
  const exports: { findArticleAlternatives?: (topic: string, story: string) => Promise<{ candidates: { url: string }[] }> } = {};
  runInNewContext(ts.transpileModule(readFileSync("src/app/modules/stories/find-article-alternatives.ts", "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, { exports, URL, Set, process: { env: { OPENAI_API_KEY: "fixture" } }, require: (name: string) => deps[name] });
  const result = await exports.findArticleAlternatives!("topic", "story");
  assert.equal(result.candidates.length, 1);
  assert.equal(result.candidates[0].url, url);
  assert.ok(recorded);
});
