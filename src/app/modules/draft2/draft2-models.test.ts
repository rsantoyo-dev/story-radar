import assert from "node:assert/strict";
import test from "node:test";
import { draft2RevisionEffort, draft2RoleModel, draft2ShadowJudgeEffort, draft2ShadowJudgeModel } from "./draft2-models";

const defaults = { anthropic: "claude-sonnet-5-5", openai: "gpt-6.1-sol" };

test("a revision round's writer thinks at high and its judge judges at medium unless the environment says otherwise, per role", () => {
  assert.deepEqual([draft2RevisionEffort("writer", {}), draft2RevisionEffort("judge", {})], ["high", "medium"]);
  const env = { DRAFT2_REVISION_EFFORT_JUDGE: " High ", DRAFT2_REVISION_EFFORT_WRITER: "nonsense" };
  assert.deepEqual([draft2RevisionEffort("writer", env), draft2RevisionEffort("judge", env)], ["high", "high"], "an unknown value is ignored");
});

test("the shadow judgment's model comes from the environment when it is one of the judge's provider", () => {
  assert.equal(draft2ShadowJudgeModel({}, "openai"), undefined);
  assert.equal(draft2ShadowJudgeModel({ DRAFT2_SHADOW_JUDGE_MODEL: "gpt-6-luna" }, "openai"), "gpt-6-luna");
  assert.equal(draft2ShadowJudgeModel({ DRAFT2_SHADOW_JUDGE_MODEL: "gpt-6-luna" }, "anthropic"), undefined, "a GPT model cannot shadow a Claude judge");
  assert.equal(draft2ShadowJudgeModel({ DRAFT2_SHADOW_JUDGE_MODEL: "claude-opus-5-5" }, "anthropic"), "claude-opus-5-5");
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
  assert.equal(draft2RoleModel("closing", "judge", "openai", { DRAFT2_MODEL_JUDGE: "gpt-6-luna" }, defaults), "gpt-6-luna", "one variable for every step's judge");
  assert.equal(draft2RoleModel("opening", "judge", "openai", { DRAFT2_MODEL_JUDGE: "gpt-6-luna", DRAFT2_MODEL_OPENING_JUDGE: "gpt-6.1-sol" }, defaults), "gpt-6.1-sol", "a step's own variable wins");
  assert.equal(draft2RoleModel("opening", "writer", "anthropic", { DRAFT2_MODEL_JUDGE: "gpt-6-luna" }, defaults), "claude-sonnet-5-5", "the judge's variable leaves the writer alone");
});
