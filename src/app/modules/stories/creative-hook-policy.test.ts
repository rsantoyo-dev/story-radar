import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import ts from "typescript";
import { HOOK_CHECKS, parseHookSelection, hookSelectionIssues, hookSelectionMatches, type CreativeHookSelection } from "./creative-hook-policy";
import type { GeneratedCreativeDraft, CreativeKeyFact } from "./creative-content.types";

const facts: CreativeKeyFact[] = [{ id: "fact-1", statement: "The company says its agent can fill forms.", sourceExcerpt: "The company says its agent can fill forms." }];
const draft: GeneratedCreativeDraft = {
  concept: "Form filling with an AI agent", caption: facts[0].statement, hashtags: [], altText: "A conceptual form-filling illustration.",
  callToAction: "Follow for explanations of AI tools and their limits.",
  units: [{ order: 1, type: "meme-frame", role: "cover", headline: "An agent that can fill forms", body: facts[0].statement,
    visualDirection: "Conceptual form illustration.", factIds: ["fact-1"], aspectRatio: "4:5", assetRequest: "generated-image", characterIds: [] }],
};
const scores = { factuality: 99, hook: 99, curiosity: 99, swipeReward: 100, continuity: 100, relevance: 99, clarity: 99, resolution: 99, cta: 99, overall: 99 };
function selection(): CreativeHookSelection {
  return { selectedIndex: 0, candidates: [draft.units[0].headline, "AI can help with form filling", "An AI agent for filling forms"].map(headline => ({
    headline, subheadline: "", factIds: ["fact-1"], readerQuestion: "What can this agent do?", payoffUnitOrder: 1,
    supported: true, checks: { clear: true, tension: false, consequence: true, human: true, curiosity: true }, reason: "A concrete capability with attribution in the supporting text.",
  })) };
}

test("four checks can pass without manufactured tension, but clarity and support are mandatory", () => {
  const selected = parseHookSelection(selection(), draft, ["fact-1"]);
  assert.equal(hookSelectionIssues(selected).length, 0);
  selected.candidates[0].checks.tension = true;
  selected.candidates[0].checks.clear = false;
  assert.ok(hookSelectionIssues(selected).some(i => i.code === "WEAK_HOOK"));
  selected.candidates[0].supported = false;
  assert.ok(hookSelectionIssues(selected).some(i => i.code === "UNSUPPORTED" && i.severity === "blocker"));
});

test("selection validates distinct alternatives, exact returned copy, planned facts and actual payoff slide", () => {
  for (const mutate of [
    (s: CreativeHookSelection) => { s.candidates[0].headline = "Agents can book flights on their own"; },
    (s: CreativeHookSelection) => { s.candidates[1].factIds = ["unplanned"]; },
    (s: CreativeHookSelection) => { s.candidates[1] = s.candidates[0]; },
    (s: CreativeHookSelection) => { s.selectedIndex = 3; },
    (s: CreativeHookSelection) => { s.candidates[1].payoffUnitOrder = 2; },
  ]) { const input = selection(); mutate(input); assert.throws(() => parseHookSelection(input, draft, ["fact-1"])); }
  assert.throws(() => parseHookSelection({ ...selection(), candidates: selection().candidates.slice(0, 2) }, draft, ["fact-1"]));
  assert.throws(() => parseHookSelection({ ...selection(), candidates: selection().candidates.map(c => ({ ...c, checks: { clear: "true" } })) }, draft, ["fact-1"]));
  const carousel = { units: [draft.units[0], { ...draft.units[0], order: 2 }] };
  assert.throws(() => parseHookSelection(selection(), carousel, ["fact-1"]), /subsequent/);
  const input = selection(); input.candidates.forEach(c => { c.payoffUnitOrder = 2; });
  assert.equal(parseHookSelection(input, carousel, ["fact-1"]).candidates[0].payoffUnitOrder, 2);
  assert.equal(hookSelectionMatches(selection(), { units: [{ ...draft.units[0], subheadline: "A changed promise" }] }), false);
});

const localRequire = createRequire(import.meta.url);
const source = readFileSync(new URL("./gemini-creative-content-generator.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source + "\nexports.review = runOpenAiEditorialQualityGate; exports.audit = parseCreativeGroundingAudit;", {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
}).outputText;
function harness(checks: (index: number) => CreativeHookSelection) {
  const calls: string[] = [];
  const exports = {} as {
    review: (options: unknown) => Promise<{ draft: GeneratedCreativeDraft }>;
    audit: (...args: unknown[]) => { hookSelection: CreativeHookSelection; criticIssues: { code: string }[] };
  };
  class OpenAiEditorialError extends Error {}
  vm.runInNewContext(compiled, { exports, AbortController, AbortSignal, Buffer, Date, Map, Set, JSON, setTimeout, clearTimeout,
    console: { info() {}, warn() {}, error() {} },
    require: (id: string) => {
      if (id === "server-only") return {};
      if (id === "./openai-structured-response") return { OpenAiEditorialError, generateOpenAiStructuredResponse: async (params: {
        model: string; schema: { required: string[] }; instructions: string; contents: { previousFeedback: { code: string }[] };
      }) => {
        const index = calls.length; calls.push(params.model);
        assert.ok(params.schema.required.includes("hookSelection"));
        assert.ok(!params.instructions.includes("a cover longer than 12 words"));
        if (index) assert.ok(params.contents.previousFeedback.some(i => ["WEAK_HOOK", "LOW_HUMAN_CURIOSITY"].includes(i.code)));
        return { text: JSON.stringify({ verdict: "accepted", scores, issues: [], draft, hookSelection: checks(index) }),
          usage: { promptTokens: 5, outputTokens: 5, thoughtsTokens: 0, totalTokens: 10 } };
      } };
      return localRequire(id);
    },
  });
  return { api: exports, calls };
}
const options = {
  apiKey: "test", models: { criticModel: "terra-test", severeRepairModel: "sol-test" }, currentDraft: draft, format: "meme",
  brief: { keyFacts: facts, riskFlags: [] }, topic: { name: "AI tools" },
  profile: { name: "AI tools", language: "English", brandPersonality: [], framingStrategy: "explainer", conversionGoal: "followers" },
  outputAspectRatio: "4:5", characterRoster: [],
};

test("a 99 score cannot override a failed checklist; the existing bounded editor fallback fixes it and persists the comparison", async () => {
  const h = harness(index => { const s = selection(); if (!index) { s.candidates[0].checks.human = false; } return s; });
  const result = await h.api.review(options);
  assert.deepEqual(h.calls, ["terra-test", "sol-test"]);
  assert.equal(result.draft.qualityReview?.status, "accepted");
  assert.equal(result.draft.qualityReview?.hookSelection?.candidates.length, 3);
  assert.equal(result.draft.qualityReview?.critic?.model, "sol-test");
});

test("an unresolved clarity failure cannot become accepted even at four of five checks", async () => {
  const h = harness(() => { const s = selection(); s.candidates[0].checks.tension = true; s.candidates[0].checks.clear = false; return s; });
  const result = await h.api.review(options);
  assert.equal(h.calls.length, 2);
  assert.equal(result.draft.qualityReview?.status, "needs-review");
  assert.ok(result.draft.qualityReview!.scores.hook < 90);
});

test("the non-OpenAI grounding audit evaluates the same five checks against the current copy", () => {
  const h = harness(selection);
  const s = selection(); s.candidates[0].checks.human = false;
  const result = h.api.audit(JSON.stringify({ scores, issues: [], hookSelection: s }), draft, "meme", options.brief, "4:5", []);
  assert.deepEqual(Object.keys(result.hookSelection.candidates[0].checks), [...HOOK_CHECKS]);
  assert.ok(result.criticIssues.some(i => i.code === "LOW_HUMAN_CURIOSITY"));
  assert.equal(h.calls.length, 0);
});
