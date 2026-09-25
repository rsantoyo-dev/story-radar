import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import * as errors from "./creative-run-errors";
import {
  applyCreativeBriefOverrides,
  normalizeCreativeBriefOverrides,
  type CreativeDraft,
} from "./creative-content.types";

// createCreativeDraft is loaded in a vm with only its persistence and provider
// edges stubbed, so the branch under test is the real one.
const code = ts.transpileModule(
  readFileSync(new URL("./manage-creative-content.ts", import.meta.url), "utf8"),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } },
).outputText;

const generatedDraft = {
  concept: "concept", caption: "caption", altText: "alt", hashtags: [],
  units: [{ order: 1, headline: "new", factIds: ["fact-1"] }],
};

function harness({ singleShot, cached }: { singleShot: boolean; cached: boolean }) {
  const events: string[] = [];
  const cachedDraft = {
    id: "draft", briefId: "brief", storyId: "story", version: 3, status: "draft",
    format: "carousel", outputAspectRatio: "4:5", units: [{ id: "slide", order: 1, headline: "old" }],
  } as unknown as CreativeDraft;

  const mocks: Record<string, unknown> = {
    // Deterministic digests so the brief's stored hash matches the recomputed
    // one and the "refresh the brief" guard does not short-circuit the test.
    "node:crypto": { createHash: () => ({ update() { return this; }, digest: () => "HASH" }) },
    "./creative-run-errors": errors,
    "./creative-recovery.repository": { latestRecovery: async () => undefined },
    "./creative-assets.repository": { findLatestCreativeAssetBatch: async () => undefined },
    "./manage-story-photos": { resolveStoryReferences: async () => [] },
    "./editorial-profile.repository": { getEditorialProfile: async () => undefined },
    "./creative-text-accounting.repository": { recordTextOutcome: async () => {}, getCreativeTextSpend: async () => ({}) },
    "./creative-evidence-guardrails": { onlyTruncatedCreativeFacts: () => false, locationOnlyRoadFacts: () => false },
    "./road-notice-evidence": { build511Brief: () => undefined },
    "../editorial-lines/editorial-lines.repository": { storyCollectionContexts: async () => [], selectedStoryContext: () => undefined },
    "../editorial-lines/editorial-lines": { editorialContextInstruction: () => "", collectionContextForHash: () => "" },
    "./story-content.repository": { getStoryContent: async () => ({ text: "source text" }) },
    "./creative-visual-guidance": { resolveCreativeVisualGuidance: () => undefined },
    // The override helpers are pure; the real ones keep this stub honest about
    // how createCreativeDraft re-applies a brief's overrides to the live profile.
    "./creative-content.types": { isCreativeCompanionApproach: () => false, applyCreativeBriefOverrides, normalizeCreativeBriefOverrides },
    "./acquisition-lenses": { fallbackEditorialAngle: () => undefined },
    "./creative-aspect-ratio": { resolveCreativeOutputAspectRatio: () => "4:5" },
    "./creative-profile.repository": { getCreativeProfile: async () => ({ language: "French" }) },
    "./daily-draft-access": { getDailyDraftStory: async () => ({
      id: "story", title: "Story", contentStatus: "full", url: "https://example.com/a",
      text: "A real claim was published by the city today.",
    }) },
    "./topic-acquisition-lenses.repository": { getCurrentTopicAcquisitionTaxonomy: async () => undefined },
    "@/app/modules/topics/topic-context": { requireTopic: async () => ({ id: "topic", name: "Topic" }) },
    "./creative-content.config": {
      getCreativeContentRuntimeConfig: () => ({
        apiKey: "gemini", model: "gemini-test", primaryProvider: "google", maxRunsPerDay: 40,
        maxContentCharacters: 100_000, draftPromptVersions: { carousel: "v-test" },
        openAiApiKey: "openai", openAiEditorialModels: { criticModel: "terra" },
      }),
      creativeSingleShotConfig: () => ({ enabled: singleShot }),
      getCreativeContentPublicConfig: () => ({}),
    },
    "./creative-characters.repository": {
      listCreativeCharacterRoster: async () => [],
      snapshotsForCreativeCharacterIds: async () => new Map(),
    },
    "./creative-content.repository": {
      findCreativeBriefById: async () => ({
        id: "brief", storyId: "story", inputHash: "HASH", profileSnapshot: { language: "French" },
        keyFacts: [{ id: "fact-1", statement: "A real claim.", sourceExcerpt: "A real claim." }],
      }),
      findLatestCreativeBrief: async () => undefined,
      findCachedCreativeBrief: async () => undefined,
      findLatestCreativeAssetBatch: async () => undefined,
      getCreativeTextSpend: async () => ({}),
      findCreativeDraftsForStory: async () => [],
      findCreativeDraftById: async () => undefined,
      findCachedCreativeDraft: async () => (cached ? cachedDraft : undefined),
      getCreativeDailyUsage: async () => ({ runs: 0, remainingRuns: 40 }),
      createCreativeAiRun: async () => "run",
      completeCreativeAiRun: async () => {},
      failCreativeAiRun: async () => {},
      insertCreativeDraft: async () => {
        events.push("insert");
        return { ...cachedDraft, version: 1 };
      },
      replaceCreativeDraft: async (_topic: unknown, baseline: CreativeDraft) => {
        events.push(`replace:v${baseline.version}`);
        return { ...cachedDraft, version: baseline.version + 1 };
      },
    },
    "./creative-text-meter": { withCreativeTextBudget: (_scope: unknown, run: () => unknown) => run() },
    "./creative-single-shot-editorial": {
      runSingleShotCreativePipeline: async (options: { checkpoint: (v: unknown) => Promise<void> }) => {
        await options.checkpoint({ draft: generatedDraft, usage: {}, callsUsed: 2 });
        return { draft: generatedDraft, usage: {}, callsUsed: 3 };
      },
    },
  };
  const exports = {} as typeof import("./manage-creative-content");
  vm.runInNewContext(code, {
    exports, Date, Error, Math, JSON, Map, Set, Promise, console, Buffer, URL,
    require: (name: string) => mocks[name] ?? {},
  });
  return { api: exports, events };
}

test("regenerating a single-shot draft replaces the cached row instead of inserting a duplicate", async () => {
  const { api, events } = harness({ singleShot: true, cached: true });
  // (briefId, format, inputHash) is unique. Before this was wired, the first
  // checkpoint called insertCreativeDraft on a regenerate and the run died with
  // "duplicate key value violates unique constraint creative_drafts_cache_unique"
  // — after the script had already been generated and paid for.
  await api.createCreativeDraft("topic", "brief", "carousel", "4:5", true);
  assert.ok(!events.includes("insert"), "a regenerate must never insert over the cached row");
  assert.ok(events[0]?.startsWith("replace:v3"), `expected the cached v3 to be replaced, got ${events.join(",")}`);
});

test("a first single-shot draft with nothing cached still inserts", async () => {
  const { api, events } = harness({ singleShot: true, cached: false });
  await api.createCreativeDraft("topic", "brief", "carousel", "4:5", false);
  assert.equal(events[0], "insert", `the first draft has no row to replace, got ${events.join(",")}`);
});
