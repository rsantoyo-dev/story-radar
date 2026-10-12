import assert from "node:assert/strict";
import test from "node:test";
import {
  adjacentDraft2Steps, DRAFT_2_PHASES, DRAFT_2_STEPS, draft2RailState, draft2StepForKey, draft2StepFromPath, draft2StepHref, draft2StepNumber, draft2StepPhase,
  minutes, sessionMetrics, stepMetrics, usd, draft2Href, paragraphs, sourceHost, storyHref, traceUsageLine, wordCount,
} from "./draft-2-canvas.core";

const topicId = "11111111-1111-4111-8111-111111111111";
const storyId = "22222222-2222-4222-8222-222222222222";
const context = "33333333-3333-4333-8333-333333333333";

test("the canvas link keeps the dashboard section and return context, and drops anything else", () => {
  assert.equal(draft2Href(topicId, storyId), `/topics/${topicId}/stories/${storyId}/draft-2`);
  assert.equal(
    draft2Href(topicId, storyId, { from: "#today", returnContext: context }),
    `/topics/${topicId}/stories/${storyId}/draft-2?from=%23today&returnContext=${context}`,
  );
  assert.equal(draft2Href(topicId, storyId, { from: "javascript:alert(1)", returnContext: "not-a-context" }), `/topics/${topicId}/stories/${storyId}/draft-2`);
});

test("the way back opens the story's script tab with the same context", () => {
  assert.equal(storyHref(topicId, storyId, { from: "#production" }), `/topics/${topicId}/stories/${storyId}?from=%23production&tab=script`);
  assert.equal(storyHref(topicId, storyId), `/topics/${topicId}/stories/${storyId}?tab=script`);
});

test("the source host drops www and survives a malformed URL", () => {
  assert.equal(sourceHost("https://www.wired.com/story/pentagon"), "wired.com");
  assert.equal(sourceHost("not a url"), "");
});

test("the reading view splits paragraphs on blank lines and joins wrapped lines", () => {
  assert.deepEqual(paragraphs("First line\nstill first.\n\n  Second.\n\n\n"), ["First line still first.", "Second."]);
  assert.deepEqual(paragraphs(undefined), []);
  assert.equal(wordCount("one two  three\nfour"), 4);
  assert.equal(wordCount("   "), 0);
});

test("a trace line splits each call's output between the answer and thinking, and keeps what a failed call cost", () => {
  const usage = (outputTokens: number, thoughtsTokens = 0) => ({ promptTokens: 9_541, outputTokens, thoughtsTokens, totalTokens: 9_541 + outputTokens });
  assert.equal(traceUsageLine({ provider: "anthropic", usage: usage(15_233), answerCharacters: 10_500, cacheWriteTokens: 9_519, outcome: "ok", durationMs: 107_200 }),
    "9541 in · 15233 out (≈3000 answer, ≈12233 thinking) · 9519 written to cache · 107.2 s");
  assert.equal(traceUsageLine({ provider: "openai", usage: usage(11_876, 7_768), cachedInputTokens: 2_010, outcome: "ok", durationMs: 221_200 }),
    "9541 in · 11876 out (7768 reasoning) · 2010 cached · 221.2 s");
  assert.equal(traceUsageLine({ provider: "anthropic", usage: usage(24_000), answerCharacters: 0, outcome: "error", note: "Claude ran out of output tokens before finishing (24000)", durationMs: 170_400 }),
    "Claude ran out of output tokens before finishing (24000) · 9541 in · 24000 out (≈0 answer, ≈24000 thinking) · 170.4 s", "a cut-off in thinking reads as such");
  assert.equal(traceUsageLine({ provider: "openai", outcome: "error", note: "Sol did not respond within 240 seconds", durationMs: 240_200 }), "Sol did not respond within 240 seconds · 240.2 s");
  assert.equal(traceUsageLine({ provider: "anthropic", usage: usage(2_457), outcome: "ok", durationMs: 21_900 }), "9541 in · 2457 out · 21.9 s", "a call stored before the split was recorded");
});

test("time and cost per step come from the trace and the images' charges; the accounts to tag count with the caption", () => {
  const call = (step: string, provider: "openai" | "anthropic", durationMs: number, costMicros?: number) => ({ step, provider, durationMs, outcome: "ok" as const, ...(costMicros !== undefined ? { costMicros } : {}) });
  const trace = [call("facts", "openai", 30_000, 20_000), call("facts", "anthropic", 10_000, 15_000), call("opening", "anthropic", 20_000, 44_000), call("opening", "openai", 121_000, 90_000), call("mentions", "anthropic", 2_000, 5_000), call("caption", "anthropic", 8_000), { provider: "openai" as const, durationMs: 5_000, outcome: "ok" as const }];
  const images = { slides: [{ attempts: [{ costMicros: 12_000 }, {}] }, { attempts: [{ costMicros: 12_000 }] }] };
  const metrics = stepMetrics(trace, images);
  assert.deepEqual(metrics.facts, { ms: 40_000, costMicros: 35_000, calls: 2 });
  assert.deepEqual(metrics.opening, { ms: 141_000, costMicros: 134_000, calls: 2 });
  assert.deepEqual(metrics.caption, { ms: 10_000, costMicros: 5_000, calls: 2 }, "a call without a rate counts its time, not a cost");
  assert.deepEqual(metrics.images, { ms: 0, costMicros: 24_000, calls: 0 }, "the images' charges, without model time of their own");
  assert.equal("mentions" in metrics, false);
  const session = sessionMetrics(trace, images);
  assert.deepEqual([session.ms, session.costMicros, session.calls, Math.round(session.openaiShare * 100)], [191_000, 198_000, 6, 79]);
  assert.equal(usd(1_540_000), "$1.54");
  assert.deepEqual([minutes(45_000), minutes(141_000)], ["45 s", "2.4 min"]);
  assert.match(traceUsageLine({ provider: "openai", usage: { promptTokens: 7_100, outputTokens: 7_200, thoughtsTokens: 2_600, totalTokens: 14_300 }, outcome: "ok", durationMs: 121_000, costMicros: 86_200 }), /121\.0 s · \$0\.09$/);
});

test("each step has its own canvas path with the same return context, and a path reads back as its step", () => {
  assert.equal(draft2StepHref(topicId, storyId, "opening", { from: "#today", returnContext: context }),
    `/topics/${topicId}/stories/${storyId}/draft-2/opening?from=%23today&returnContext=${context}`);
  assert.equal(draft2StepHref(topicId, storyId, undefined), draft2Href(topicId, storyId), "no step is the overview");
  assert.equal(draft2StepFromPath(`/topics/${topicId}/stories/${storyId}/draft-2/visual`), "visual");
  assert.equal(draft2StepFromPath(`/topics/${topicId}/stories/${storyId}/draft-2/inventory/`), "inventory");
  assert.equal(draft2StepFromPath(`/topics/${topicId}/stories/${storyId}/draft-2`), undefined);
  assert.equal(draft2StepFromPath(`/topics/${topicId}/stories/${storyId}/draft-2/nothing`), undefined, "an unknown segment is no step");
});

test("the four phases hold every step once, in the pipeline's order", () => {
  assert.deepEqual(DRAFT_2_PHASES.flatMap((phase) => [...phase.steps]), DRAFT_2_STEPS.map((step) => step.key));
  assert.equal(draft2StepNumber("facts"), 1);
  assert.equal(draft2StepNumber("publish"), 10);
  assert.equal(draft2StepPhase("deck").title, "Words");
  assert.equal(draft2StepPhase("images").title, "Visuals");
});

test("the screens before and after one, and where a key takes the canvas", () => {
  assert.deepEqual(adjacentDraft2Steps(undefined), { next: "facts" });
  assert.deepEqual(adjacentDraft2Steps("facts"), { previous: "overview", next: "inventory" }, "people and places come before the focus");
  assert.deepEqual(adjacentDraft2Steps("focus"), { previous: "inventory", next: "opening" });
  assert.deepEqual(adjacentDraft2Steps("caption"), { previous: "images", next: "publish" });
  assert.deepEqual(adjacentDraft2Steps("publish"), { previous: "caption" });
  assert.equal(draft2StepForKey("ArrowRight", "deck"), "visual");
  assert.equal(draft2StepForKey("[", "facts"), "overview");
  assert.equal(draft2StepForKey("]", "publish"), undefined, "nothing past the last step");
  assert.equal(draft2StepForKey("3", undefined), "focus");
  assert.equal(draft2StepForKey("2", undefined), "inventory");
  assert.equal(draft2StepForKey("0", "facts"), "publish", "0 is the tenth step");
  assert.equal(draft2StepForKey("a", "facts"), undefined);
});

test("a step's rail state reads its badge, what runs now and what it waits on", () => {
  assert.equal(draft2RailState(undefined, { available: true }), "idle");
  assert.equal(draft2RailState(undefined, { available: false }), "blocked");
  assert.equal(draft2RailState({ label: "Ready", tone: "success" }), "done");
  assert.equal(draft2RailState({ label: "Ready", tone: "success" }, { live: true }), "running", "running again in this tab");
  assert.equal(draft2RailState({ label: "Generating", tone: "info" }), "running");
  assert.equal(draft2RailState({ label: "Paused", tone: "info" }), "attention");
  assert.equal(draft2RailState({ label: "Acceptable · 92", tone: "info" }), "attention");
  assert.equal(draft2RailState({ label: "Under 90 · 82", tone: "warning" }), "attention");
  assert.equal(draft2RailState({ label: "Failed", tone: "error" }), "failed");
});
