import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import vm from "node:vm";
import ts from "typescript";
import { parseEditorialFocus, EDITORIAL_FOCUS_PROMPT_VERSION } from "./editorial-focus";
import { plannerDay } from "./daily-editorial-planner.types";

test("focus response rejects empty, malformed, non-text and oversized guidance", () => {
  for (const value of [null, [], {}, { editorialDirection: 1 }, { editorialDirection: " " }, { editorialDirection: "x".repeat(1501) }]) {
    assert.throws(() => parseEditorialFocus(JSON.stringify(value)));
  }
  assert.throws(() => parseEditorialFocus("not json"));
  assert.equal(parseEditorialFocus('{"editorialDirection":" Lead with the deadline. "}'), "Lead with the deadline.");
});

function harness({ runs = 0, content = "Verified source material", providerFails = false } = {}) {
  const events: string[] = [];
  let input: Record<string, unknown> | undefined;
  const mocks: Record<string, unknown> = {
    "node:crypto": { createHash },
    "./editorial-focus": { EDITORIAL_FOCUS_PROMPT_VERSION },
    "./daily-editorial-planner.types": { plannerDay },
    "./creative-content.config": { getCreativeContentRuntimeConfig: () => ({ maxRunsPerDay: 2, maxContentCharacters: 15000, provider: "google", model: "test" }) },
    "@/app/modules/topics/topic-context": { requireTopic: async () => ({ name: "Local publication" }) },
    "./daily-draft-access": { getDailyDraftStory: async (...args: unknown[]) => { assert.deepEqual(args, ["topic", "story", "preparation", true]); return { title: "Old headline", text: content, contentStatus: "full", contentSource: "article" }; } },
    "./creative-profile.repository": { getCreativeProfile: async () => ({ conversionGoal: "saves", language: "fr" }) },
    "./editorial-profile.repository": { getEditorialProfile: async () => ({ mission: "Useful local reminders", weights: { socialPotential: 20 } }) },
    "./topic-acquisition-lenses.repository": { getCurrentTopicAcquisitionTaxonomy: async () => ({ lenses: [] }) },
    "../editorial-lines/editorial-lines.repository": { selectedStoryContext: async () => ({ timezone: "America/Toronto", objective: "Help residents act" }) },
    "./creative-content.repository": {
      getCreativeDailyUsage: async () => ({ runs, maxRuns: 2, remainingRuns: 2 - runs }),
      createCreativeAiRun: async () => { events.push("reserve"); return "run"; },
      completeCreativeAiRun: async () => { events.push("complete"); },
      failCreativeAiRun: async () => { events.push("fail"); },
      insertCreativeBrief: async () => { assert.fail("A suggestion must not create a brief"); },
    },
    "./gemini-creative-content-generator": { generateEditorialFocus: async (options: Record<string, unknown>) => {
      input = options; events.push("generate");
      if (providerFails) throw new Error("Provider unavailable");
      return { editorialDirection: "Lead with the next deadline.", usage: {}, provider: "google", model: "test" };
    } },
  };
  const exports: { suggestEditorialFocus?: (...args: unknown[]) => Promise<unknown> } = {};
  const code = ts.transpileModule(readFileSync(new URL("./manage-creative-content.ts", import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(code, { exports, Date, Intl, console, require: (name: string) => mocks[name] ?? (name === "./creative-text-meter" ? { withCreativeTextBudget: (_context: unknown, work: () => Promise<unknown>) => work() } : {}) });
  return { call: () => exports.suggestEditorialFocus!("topic", "story", "Existing preference", "research", "preparation", "UTC"), events, input: () => input };
}

test("suggestion uses source, channel goals and line timezone without persisting a brief", async () => {
  const h = harness();
  await h.call();
  assert.deepEqual(h.events, ["reserve", "generate", "complete"]);
  const input = h.input()!;
  assert.equal(input.editorialDirection, "Existing preference");
  assert.equal((input.story as { text: string }).text, "Verified source material");
  const context = input.focusContext as { temporalContext: { timezone: string }; editorialProfile: { mission: string } };
  assert.equal(context.temporalContext.timezone, "America/Toronto");
  assert.equal(context.editorialProfile.mission, "Useful local reminders");
});

test("missing source and exhausted budget prevent provider calls", async () => {
  for (const h of [harness({ runs: 2 }), harness({ content: "" })]) {
    await assert.rejects(h.call());
    assert.deepEqual(h.events, []);
  }
});

test("provider failures mark the reserved run as failed", async () => {
  const h = harness({ providerFails: true });
  await assert.rejects(h.call(), /Provider unavailable/);
  assert.deepEqual(h.events, ["reserve", "generate", "fail"]);
});
