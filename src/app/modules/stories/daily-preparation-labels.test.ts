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

test("Prepare my day offers the steps through Content since the v1 studio retired: the carousel is Draft 2's", async () => {
  const { DAILY_PREPARATION_STEPS, DRAFT2_PREPARATION_STEPS, DAILY_PREPARATION_TITLES } = await import("./daily-preparation.types");
  assert.deepEqual(DRAFT2_PREPARATION_STEPS, ["collect", "evaluate", "recommend", "approve", "content"]);
  assert.deepEqual(DAILY_PREPARATION_STEPS.slice(0, DRAFT2_PREPARATION_STEPS.length), DRAFT2_PREPARATION_STEPS, "the same first five steps, in the same order, so a saved run's step still resolves");
  assert.deepEqual(DRAFT2_PREPARATION_STEPS.map((step) => DAILY_PREPARATION_TITLES[step]), ["Collect", "Evaluate", "Select", "Approve Story", "Content"]);
});
