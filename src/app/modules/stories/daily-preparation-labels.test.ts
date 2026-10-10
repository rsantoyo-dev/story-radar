import assert from "node:assert/strict";
import test from "node:test";
import { preparationModelLabel } from "./daily-preparation.types";

test("model labels read like product names, including Claude's hyphenated versions", () => {
  assert.equal(preparationModelLabel("claude-sonnet-5-5"), "Claude Sonnet 5.5");
  assert.equal(preparationModelLabel("claude-haiku-4-5-20251001"), "Claude Haiku 4.5");
  assert.equal(preparationModelLabel("anthropic/claude-opus-5-5"), "Claude Opus 5.5");
  assert.equal(preparationModelLabel("gpt-6.1-sol"), "GPT-6.1 Sol");
  assert.equal(preparationModelLabel("gemini-3.8-flash"), "Gemini 3.8 Flash");
});
