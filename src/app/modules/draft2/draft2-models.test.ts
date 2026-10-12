import assert from "node:assert/strict";
import test from "node:test";
import { draft2Cast, draft2ModelName, draft2RevisionEffort, draft2RoleModel, draft2ShadowJudgeEffort, draft2ShadowJudgeModel } from "./draft2-models";

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

test("a model is named as the editor calls it: an OpenAI model by its family, a Claude model Claude", () => {
  assert.equal(draft2ModelName("gpt-6.1-sol"), "Sol");
  assert.equal(draft2ModelName("gpt-6-luna"), "Luna", "Luna judging is not Sol");
  assert.equal(draft2ModelName("gpt-6-astra"), "Astra");
  assert.equal(draft2ModelName("gpt-6.1-sol-mini"), "Sol mini");
  assert.equal(draft2ModelName("claude-sonnet-5-5"), "Claude");
  assert.equal(draft2ModelName("claude-opus-5-5"), "Claude");
  assert.equal(draft2ModelName("o9-preview"), "o9-preview", "an unknown model keeps its own name");
  assert.equal(draft2ModelName(undefined, "openai"), "Sol", "a run stored before it recorded its model");
  assert.equal(draft2ModelName(undefined, "anthropic"), "Claude");
});

test("today's cast reads the environment the runs read: the judge's variable moves every funnel judge, not the extractor or the image reviews", () => {
  const cast = draft2Cast({ DRAFT2_MODEL_JUDGE: "gpt-6-luna", DRAFT2_MODEL_DECK_JUDGE: "gpt-6.1-sol" }, "claude-sonnet-5-5");
  assert.deepEqual(cast.facts, { extractor: { provider: "openai", model: "gpt-6.1-sol" }, reviewer: { provider: "anthropic", model: "claude-sonnet-5-5" } });
  assert.deepEqual(cast.funnel.opening, { writer: { provider: "anthropic", model: "claude-sonnet-5-5" }, judge: { provider: "openai", model: "gpt-6-luna" } });
  assert.equal(cast.funnel.caption.judge.model, "gpt-6-luna");
  assert.equal(cast.funnel.deck.judge.model, "gpt-6.1-sol", "a step's own variable wins");
  assert.deepEqual(cast.imageReview, { provider: "openai", model: "gpt-6.1-sol" });
  assert.deepEqual(cast.focusReview, { provider: "openai", model: "gpt-6-luna" }, "the narrative form is reviewed by the judges' model");
  const extractor = draft2Cast({ DRAFT2_EXTRACTOR_MODEL: "gpt-6-astra" }, "claude-opus-5-5");
  assert.equal(extractor.facts.extractor.model, "gpt-6-astra");
  assert.equal(extractor.funnel.visual.judge.model, "gpt-6-astra", "the judges default to Sol's model");
  assert.equal(extractor.funnel.visual.writer.model, "claude-opus-5-5");
});
