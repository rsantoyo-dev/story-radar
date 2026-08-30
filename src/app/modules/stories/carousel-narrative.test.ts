import assert from "node:assert/strict";
import test from "node:test";

import {
  evaluateCarouselNarrative,
  repairCarouselPlanEvidence,
  type CarouselPlan,
  validateCarouselPlan,
} from "./carousel-narrative";
import { repairDeterministicCreativeCopy } from "./creative-quality";
import type { GeneratedCreativeDraft } from "./creative-content.types";

test("rejects a carousel plan that spends its final slide on another impact fact", () => {
  const plan: CarouselPlan = {
    slideCount: 4,
    rationale: "Explain the study and compare the domains.",
    slides: [
      slide("hook", ["fact-1"]),
      slide("explain", ["fact-2"]),
      slide("compare", ["fact-3"]),
      slide("impact", ["fact-4"]),
    ],
  };

  assert.ok(
    validateCarouselPlan(
      plan,
      new Set(["fact-1", "fact-2", "fact-3", "fact-4"]),
    ).some((error) => error.includes("final slide must conclude")),
  );
});

test("repairs missing hook evidence and reuses established evidence at closing", () => {
  const original: CarouselPlan = {
    slideCount: 3,
    rationale: "Hook, explanation, conclusion.",
    slides: [
      slide("hook", []),
      slide("explain", ["fact-2"]),
      slide("conclude", ["fact-3"]),
    ],
  };

  const { plan, repaired } = repairCarouselPlanEvidence(
    original,
    new Set(["fact-1", "fact-2", "fact-3"]),
  );

  assert.equal(repaired, true);
  assert.deepEqual(plan.slides[0]?.allowedFactIds, ["fact-1"]);
  assert.deepEqual(plan.slides[2]?.allowedFactIds, ["fact-1"]);
  assert.deepEqual(
    validateCarouselPlan(
      plan,
      new Set(["fact-1", "fact-2", "fact-3"]),
    ),
    [],
  );
});

test("reports a closing-goal blocker for an editable draft", () => {
  const issues = evaluateCarouselNarrative([
    unit("cover", "hook", ["fact-1"]),
    unit("content", "explain", ["fact-2"]),
    unit("content", "compare", ["fact-3"]),
    unit("conclusion", "impact", ["fact-4"]),
  ]);

  assert.ok(
    issues.some(
      (issue) => issue.code === "closing-goal" && issue.severity === "blocker",
    ),
  );
});

test("promotes an internal debate question to the visible CTA", () => {
  const draft: GeneratedCreativeDraft = {
    concept: "Evidence-led debate",
    caption: "A concise evidence-led carousel.",
    hashtags: [],
    altText: "A three-slide evidence-led carousel.",
    units: [
      fullUnit(1, "cover", "hook", ["fact-1"]),
      fullUnit(2, "content", "explain", ["fact-2"]),
      {
        ...fullUnit(3, "call-to-action", "debate", ["fact-1"]),
        viewerQuestion: "What should readers consider next?",
      },
    ],
  };

  const repaired = repairDeterministicCreativeCopy(draft, "carousel");

  assert.equal(
    repaired.units[2]?.ctaQuestion,
    "Where would you apply Evidence-led debate first?",
  );
  assert.ok(
    !evaluateCarouselNarrative(repaired.units).some(
      (issue) =>
        issue.code === "missing-debate-question" ||
        issue.code === "closing-question-count",
    ),
  );
});

test("does not leak an English internal question into a Spanish CTA", () => {
  const draft: GeneratedCreativeDraft = {
    concept: "Cierre localizado",
    caption: "Carrusel en español.",
    hashtags: [],
    altText: "Carrusel en español.",
    units: [
      fullUnit(1, "cover", "hook", ["fact-1"]),
      {
        ...fullUnit(2, "call-to-action", "debate", ["fact-1"]),
        viewerQuestion: "What did you find most surprising about this information?",
      },
    ],
  };

  const repaired = repairDeterministicCreativeCopy(
    draft,
    "carousel",
    [],
    "espanol",
  );

  assert.equal(
    repaired.units[1]?.ctaQuestion,
    "¿Dónde aplicarías primero Cierre localizado?",
  );
});

test("replaces a verbatim internal planning question in visible CTA copy", () => {
  const internalQuestion =
    "What question should the viewer consider regarding autonomous agent governance?";
  const draft: GeneratedCreativeDraft = {
    concept: "Agent governance",
    caption: "A governance carousel.",
    hashtags: [],
    altText: "A governance carousel.",
    units: [
      fullUnit(1, "cover", "hook", ["fact-1"]),
      {
        ...fullUnit(2, "call-to-action", "debate", ["fact-1"]),
        viewerQuestion: internalQuestion,
        ctaQuestion: internalQuestion,
      },
    ],
  };

  const repaired = repairDeterministicCreativeCopy(draft, "carousel");

  assert.equal(
    repaired.units[1]?.ctaQuestion,
    "Where would you apply Agent governance first?",
  );
});

test("blocks a slide that combines two editorial questions", () => {
  const issues = evaluateCarouselNarrative([
    unit("cover", "hook", ["fact-1"]),
    {
      ...unit("content", "prove", ["fact-2", "fact-3"]),
      viewerQuestion:
        "¿Cómo se estima la ovulación y cómo cambia la probabilidad con la edad?",
    },
    unit("call-to-action", "debate", ["fact-1"]),
  ]);

  assert.ok(
    issues.some(
      (issue) =>
        issue.code === "multiple-slide-claims" && issue.severity === "blocker",
    ),
  );
});

test("blocks consecutive middle slides that repeat the same numerical evidence", () => {
  const issues = evaluateCarouselNarrative([
    unit("cover", "hook", ["fact-1"]),
    {
      ...unit("content", "explain", ["fact-2"]),
      body: "The comparison begins with 14 days.",
    },
    {
      ...unit("content", "impact", ["fact-2"]),
      body: "In practice, the estimate still uses 14 days.",
    },
    unit("call-to-action", "debate", ["fact-1"]),
  ]);

  assert.ok(
    issues.some(
      (issue) =>
        issue.code === "semantic-repetition" && issue.severity === "blocker",
    ),
  );
});

test("blocks a middle slide with no supporting copy", () => {
  const issues = evaluateCarouselNarrative([
    unit("cover", "hook", ["fact-1"]),
    { ...unit("content", "impact", ["fact-2"]), body: undefined },
    unit("call-to-action", "debate", ["fact-1"]),
  ]);

  assert.ok(
    issues.some(
      (issue) =>
        issue.code === "missing-supporting-copy" &&
        issue.severity === "blocker",
    ),
  );
});

function slide(
  editorialGoal: CarouselPlan["slides"][number]["editorialGoal"],
  allowedFactIds: string[],
): CarouselPlan["slides"][number] {
  return {
    editorialGoal,
    viewerQuestion: "What should the viewer understand?",
    allowedFactIds,
  };
}

function unit(
  role: "cover" | "content" | "conclusion" | "call-to-action",
  editorialGoal: CarouselPlan["slides"][number]["editorialGoal"],
  factIds: string[],
) {
  return {
    role,
    editorialGoal,
    viewerQuestion: "What should the viewer understand?",
    headline: "Editorial headline",
    body: "Concise supporting copy.",
    factIds,
  };
}

function fullUnit(
  order: number,
  role: "cover" | "content" | "conclusion" | "call-to-action",
  editorialGoal: CarouselPlan["slides"][number]["editorialGoal"],
  factIds: string[],
): GeneratedCreativeDraft["units"][number] {
  return {
    order,
    type: "carousel-slide",
    role,
    editorialGoal,
    viewerQuestion: "What should the viewer understand?",
    headline: "Editorial headline",
    body: "Concise supporting copy.",
    visualDirection: "Editorial infographic.",
    factIds,
    assetRequest: "generated-image",
    aspectRatio: "4:5",
    characterIds: [],
  };
}
