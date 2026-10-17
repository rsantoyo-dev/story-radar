import assert from "node:assert/strict";
import test from "node:test";
import { castWithChoice, draft2Cast, draft2ChoiceIsEmpty, draft2ModelName, draft2RevisionEffort, draft2RoleModel, draft2StepChoice, parseDraft2ModelChoice, parseDraft2Pipeline } from "./draft2-models";

const defaults = { anthropic: "claude-sonnet-5-5", openai: "gpt-6.1-sol" };

test("a revision round's efforts by pipeline: v2 writes at high and judges at medium, v3 writes at medium and judges at low, unless the environment says otherwise, per role", () => {
  assert.deepEqual([draft2RevisionEffort("writer", {}), draft2RevisionEffort("judge", {})], ["high", "medium"]);
  assert.deepEqual([draft2RevisionEffort("writer", {}, "v3"), draft2RevisionEffort("judge", {}, "v3")], ["medium", "low"]);
  const env = { DRAFT2_REVISION_EFFORT_JUDGE: " High ", DRAFT2_REVISION_EFFORT_WRITER: "nonsense" };
  assert.deepEqual([draft2RevisionEffort("writer", env), draft2RevisionEffort("judge", env)], ["high", "high"], "an unknown value is ignored");
  assert.deepEqual([draft2RevisionEffort("writer", env, "v3"), draft2RevisionEffort("judge", env, "v3")], ["medium", "high"], "the environment wins over the pipeline's default");
});

test("a pipeline is v2 or v3", () => {
  assert.equal(parseDraft2Pipeline("v3"), "v3");
  assert.equal(parseDraft2Pipeline("v2"), "v2");
  assert.equal(parseDraft2Pipeline("v1"), undefined);
  assert.equal(parseDraft2Pipeline(null), undefined);
});

test("the editor's choice per step: a step's own writer, judge and efforts over the choice for every step; only the offered models and the three efforts are kept", () => {
  const choice = parseDraft2ModelChoice({
    judge: "gpt-6-luna",
    steps: { opening: { judge: "gpt-6.1-sol", judgeEffort: "High", writerEffort: "xhigh" }, visual: { writer: { provider: "anthropic", model: "claude-opus-5-5" } }, deck: { judge: "claude-fable-5-1" }, caption: "nonsense" },
  });
  assert.deepEqual(choice, {
    judge: { provider: "openai", model: "gpt-6-luna" },
    steps: { opening: { judge: { provider: "openai", model: "gpt-6.1-sol" }, judgeEffort: "high" }, visual: { writer: { provider: "anthropic", model: "claude-opus-5-5" } } },
  }, "an unknown effort, a model not offered and a step with nothing are left out");
  assert.deepEqual(draft2StepChoice(choice, "opening"), { judge: { provider: "openai", model: "gpt-6.1-sol" }, judgeEffort: "high" }, "the step's own judge wins over the one for every step");
  assert.deepEqual(draft2StepChoice(choice, "closing"), { judge: { provider: "openai", model: "gpt-6-luna" } }, "a step without its own follows the choice for every step");
  assert.deepEqual(draft2StepChoice(choice, "visual"), { writer: { provider: "anthropic", model: "claude-opus-5-5" }, judge: { provider: "openai", model: "gpt-6-luna" } });
  assert.equal(draft2ChoiceIsEmpty(parseDraft2ModelChoice({ steps: { opening: { judgeEffort: "turbo" } } })), true);
  assert.equal(draft2ChoiceIsEmpty(choice), false);
  const cast = draft2Cast({}, "claude-sonnet-5-5");
  const chosen = castWithChoice(cast, choice);
  assert.deepEqual([chosen.funnel.opening.judge.model, chosen.funnel.closing.judge.model, chosen.funnel.visual.writer.model, chosen.funnel.deck.writer.model], ["gpt-6.1-sol", "gpt-6-luna", "claude-opus-5-5", "claude-sonnet-5-5"]);
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

test("the editor's choice of writer and judge: only the offered models are kept, a role left out stays today's, and every funnel step takes it", () => {
  assert.deepEqual(parseDraft2ModelChoice({ writer: "gpt-6.1-sol", judge: "claude-sonnet-5-5" }), { writer: { provider: "openai", model: "gpt-6.1-sol" }, judge: { provider: "anthropic", model: "claude-sonnet-5-5" } });
  assert.deepEqual(parseDraft2ModelChoice({ writer: { provider: "openai", model: "gpt-6-luna" }, judge: "claude-fable-5-1" }), { writer: { provider: "openai", model: "gpt-6-luna" } }, "a model not offered is left out, as the stored shape is read back");
  assert.deepEqual(parseDraft2ModelChoice(null), {});
  const cast = draft2Cast({ DRAFT2_MODEL_JUDGE: "gpt-6-luna" }, "claude-sonnet-5-5");
  assert.equal(castWithChoice(cast, undefined), cast);
  const chosen = castWithChoice(cast, { judge: { provider: "anthropic", model: "claude-opus-5-5" } });
  assert.deepEqual([chosen.funnel.opening.writer.model, chosen.funnel.opening.judge.model, chosen.funnel.visual.judge.model, chosen.facts.reviewer.model], ["claude-sonnet-5-5", "claude-opus-5-5", "claude-opus-5-5", "claude-sonnet-5-5"], "the funnel's judges change; the facts keep theirs");
});
