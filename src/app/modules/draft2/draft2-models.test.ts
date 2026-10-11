import assert from "node:assert/strict";
import test from "node:test";
import { draft2RevisionEffort, draft2RoleModel, draft2ShadowJudgeEffort } from "./draft2-models";

const defaults = { anthropic: "claude-sonnet-5-5", openai: "gpt-6.1-sol" };

test("a revision round runs at high unless the environment says otherwise, per role", () => {
  assert.deepEqual([draft2RevisionEffort("writer", {}), draft2RevisionEffort("judge", {})], ["high", "high"]);
  const env = { DRAFT2_REVISION_EFFORT_JUDGE: " Medium ", DRAFT2_REVISION_EFFORT_WRITER: "nonsense" };
  assert.deepEqual([draft2RevisionEffort("writer", env), draft2RevisionEffort("judge", env)], ["high", "medium"], "an unknown value is ignored");
});

test("the shadow judgment's effort comes from the environment, or there is none", () => {
  assert.equal(draft2ShadowJudgeEffort({}), undefined);
  assert.equal(draft2ShadowJudgeEffort({ DRAFT2_SHADOW_JUDGE_EFFORT: "medium" }), "medium");
  assert.equal(draft2ShadowJudgeEffort({ DRAFT2_SHADOW_JUDGE_EFFORT: "xhigh" }), undefined);
});

test("a step's role runs on the model the environment names for it, when it is one of the role's provider", () => {
  assert.equal(draft2RoleModel("opening", "writer", "anthropic", {}, defaults), "claude-sonnet-5-5");
  assert.equal(draft2RoleModel("opening", "writer", "anthropic", { DRAFT2_MODEL_OPENING_WRITER: "claude-opus-5-5" }, defaults), "claude-opus-5-5");
  assert.equal(draft2RoleModel("closing", "writer", "anthropic", { DRAFT2_MODEL_OPENING_WRITER: "claude-opus-5-5" }, defaults), "claude-sonnet-5-5", "another step keeps its default");
  assert.equal(draft2RoleModel("opening", "judge", "openai", { DRAFT2_MODEL_OPENING_JUDGE: "claude-opus-5-5" }, defaults), "gpt-6.1-sol", "a Claude model cannot play Sol's role");
  assert.equal(draft2RoleModel("opening", "judge", "openai", { DRAFT2_MODEL_OPENING_JUDGE: "gpt-6.1-sol-mini" }, defaults), "gpt-6.1-sol-mini");
});
