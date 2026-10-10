import assert from "node:assert/strict";
import test from "node:test";
import { draft2Href, paragraphs, sourceHost, storyHref, traceUsageLine, wordCount } from "./draft-2-canvas.core";

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
