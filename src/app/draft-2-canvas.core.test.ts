import assert from "node:assert/strict";
import test from "node:test";
import { draft2Href, paragraphs, sourceHost, storyHref, wordCount } from "./draft-2-canvas.core";

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
