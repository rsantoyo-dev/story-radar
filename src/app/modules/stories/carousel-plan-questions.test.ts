import assert from "node:assert/strict";
import test from "node:test";
import {
  CAROUSEL_EDITORIAL_GOAL_OPTIONS,
  carouselNarrativePolicyForPrompt,
  templatePlanQuestions,
} from "./carousel-narrative";

// A Spanish plan came back with every viewerQuestion copied verbatim from the
// goal templates the planning prompt showed as each goal's definition —
// "What happened, and why should I care?", "How is this happening?", … — and
// the mechanism question over a comparison of two groups made the writer
// invent a cause the facts never stated.

test("the planning prompt describes each goal's job and never shows a template question", () => {
  const policy = carouselNarrativePolicyForPrompt("followers");
  const serialized = JSON.stringify(policy);
  for (const option of CAROUSEL_EDITORIAL_GOAL_OPTIONS) {
    assert.ok(!serialized.includes(option.viewerQuestion), `the prompt still shows "${option.viewerQuestion}"`);
  }
  for (const goal of policy.editorialGoals) {
    assert.ok(goal.job.length > 20, `${goal.value} needs a described job`);
    assert.ok(!("viewerQuestion" in goal));
  }
  assert.match(policy.rules.join(" "), /Never use a generic template question/);
  assert.match(policy.rules.join(" "), /creative profile language/);
});

test("template questions are recognised on any slide, regardless of case or punctuation", () => {
  const found = templatePlanQuestions({
    slides: [
      { viewerQuestion: "What happened, and why should I care?" },
      { viewerQuestion: "how is this happening" },
      { viewerQuestion: "¿Cuánto pagaron quienes llevaban dos años o más en su vivienda?" },
      { viewerQuestion: "Why does this matter?" },
    ],
  });
  assert.deepEqual(found.map((entry) => entry.slide), [1, 2, 4]);
});

test("a plan written for the story has no template questions", () => {
  assert.deepEqual(
    templatePlanQuestions({
      slides: [
        { viewerQuestion: "¿Cuánto más pagó quien se mudó en 2024?" },
        { viewerQuestion: "¿Qué muestran los datos sobre los propietarios con hipoteca?" },
        { viewerQuestion: "¿Qué comparar antes de mudarse?" },
      ],
    }),
    [],
  );
});
