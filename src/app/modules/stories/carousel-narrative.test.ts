import assert from "node:assert/strict";
import test from "node:test";

import {
  CAROUSEL_CONTINUATION_CUE_MAX_WORDS,
  CAROUSEL_SUBHEADLINE_MAX_WORDS,
  alignCarouselPlanWithConversionGoal,
  carouselNarrativePolicyForPrompt,
  evaluateCarouselNarrative,
  getPreferredCarouselArc,
  maximumFactsForGoal,
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

test("aligns the preferred arc and parsed-plan shape with the conversion goal", () => {
  assert.equal(getPreferredCarouselArc(4, "followers")?.at(-1), "conclude");
  assert.equal(getPreferredCarouselArc(4, "saves")?.at(-1), "conclude");
  assert.equal(getPreferredCarouselArc(4, "shares")?.at(-1), "conclude");
  assert.equal(getPreferredCarouselArc(4, "discussion")?.at(-1), "debate");

  const policy = carouselNarrativePolicyForPrompt("followers");
  assert.equal(policy.preferredClosingGoal, "conclude");
  assert.ok(policy.preferredArcs.every((arc) => arc.goals?.at(-1) === "conclude"));

  const plan: CarouselPlan = {
    slideCount: 3,
    rationale: "Explain, then convert.",
    slides: [
      slide("hook", ["fact-1"]),
      slide("explain", ["fact-2"]),
      slide("debate", ["fact-1"]),
    ],
  };
  const aligned = alignCarouselPlanWithConversionGoal(plan, "followers");
  assert.equal(aligned.repaired, true);
  assert.equal(aligned.plan.slides.at(-1)?.editorialGoal, "conclude");
  assert.equal(
    aligned.plan.slides.at(-1)?.viewerQuestion,
    "What is the essential takeaway?",
  );
  assert.ok(
    validateCarouselPlan(
      aligned.plan,
      new Set(["fact-1", "fact-2"]),
      "followers",
    ).length === 0,
  );
  assert.ok(
    validateCarouselPlan(
      plan,
      new Set(["fact-1", "fact-2"]),
      "followers",
    ).some((error) => error.includes("followers conversion goal")),
  );
});

test("keeps comparison scope, administrative context, and thesis reuse in the prompt policy", () => {
  const rules = carouselNarrativePolicyForPrompt("followers").rules.join(" ");

  assert.match(rules, /at most two slides/iu);
  assert.match(rules, /same category, program, cohort, or region/iu);
  assert.match(rules, /current or unfinished period/iu);
  assert.match(rules, /unbounded full-period or full-year claim/iu);
  assert.match(rules, /administrative ordinals as context, not impact/iu);
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

test("allows a conclude slide to synthesize three facts established earlier", () => {
  assert.equal(maximumFactsForGoal("conclude"), 3);
  assert.equal(maximumFactsForGoal("debate"), 2);

  const original: CarouselPlan = {
    slideCount: 4,
    rationale: "Establish three findings, then synthesize them.",
    slides: [
      slide("hook", ["fact-1"]),
      slide("explain", ["fact-2"]),
      slide("impact", ["fact-3"]),
      slide("conclude", ["fact-1", "fact-2", "fact-3"]),
    ],
  };

  const { plan, repaired } = repairCarouselPlanEvidence(
    original,
    new Set(["fact-1", "fact-2", "fact-3"]),
  );

  assert.equal(repaired, false);
  assert.deepEqual(plan.slides[3]?.allowedFactIds, [
    "fact-1",
    "fact-2",
    "fact-3",
  ]);
  assert.deepEqual(
    validateCarouselPlan(plan, new Set(["fact-1", "fact-2", "fact-3"])),
    [],
  );
});

test("still rejects a new fact introduced among three conclude facts", () => {
  const plan: CarouselPlan = {
    slideCount: 4,
    rationale: "Establish the findings before drawing the conclusion.",
    slides: [
      slide("hook", ["fact-1"]),
      slide("explain", ["fact-2"]),
      slide("impact", ["fact-3"]),
      slide("conclude", ["fact-1", "fact-2", "fact-4"]),
    ],
  };

  const errors = validateCarouselPlan(
    plan,
    new Set(["fact-1", "fact-2", "fact-3", "fact-4"]),
  );

  assert.ok(
    errors.some((error) =>
      error.includes("introduces a fact in the closing stage"),
    ),
  );
});

test("enforces established evidence when an editable conclude slide uses three facts", () => {
  const established = [
    unit("cover", "hook", ["fact-1"]),
    unit("content", "explain", ["fact-2"]),
    unit("content", "impact", ["fact-3"]),
    unit("conclusion", "conclude", ["fact-1", "fact-2", "fact-3"]),
  ];
  const establishedIssues = evaluateCarouselNarrative(established);

  assert.ok(
    !establishedIssues.some((issue) =>
      ["fact-budget", "new-closing-fact"].includes(issue.code),
    ),
  );

  const withNewClosingFact = established.map((slide, index) =>
    index === established.length - 1
      ? { ...slide, factIds: ["fact-1", "fact-2", "fact-4"] }
      : slide,
  );
  assert.ok(
    evaluateCarouselNarrative(withNewClosingFact).some(
      (issue) =>
        issue.code === "new-closing-fact" && issue.severity === "blocker",
    ),
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
    "What is your reading of these findings?",
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
    "¿Qué lectura haces de estos datos?",
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
    "What is your reading of these findings?",
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

test("reports the slide positions when one thesis fact is overused", () => {
  const issues = evaluateCarouselNarrative([
    unit("cover", "hook", ["fact-1"]),
    unit("content", "explain", ["fact-2"]),
    unit("content", "impact", ["fact-1", "fact-3"]),
    unit("conclusion", "conclude", ["fact-1"]),
  ]);

  assert.ok(
    issues.some(
      (issue) =>
        issue.code === "fact-overuse" &&
        issue.severity === "warning" &&
        issue.message.includes("slides 1, 3, 4"),
    ),
  );
});

test("detects repeated numerical evidence across English and Spanish punctuation", () => {
  const issues = evaluateCarouselNarrative([
    unit("cover", "hook", ["fact-1"]),
    {
      ...unit("content", "explain", ["fact-2"]),
      body: "The reported share was 21.8%.",
    },
    {
      ...unit("content", "impact", ["fact-2"]),
      body: "La proporción reportada fue 21,8 %.",
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

test("accepts a concise subheadline and concrete cover continuation cue", () => {
  const issues = evaluateCarouselNarrative([
    {
      ...unit("cover", "hook", ["fact-1"]),
      subheadline: "The mechanism behind the result",
      continuationCue: "How the mechanism changes the outcome",
    },
    unit("content", "explain", ["fact-2"]),
    unit("conclusion", "conclude", ["fact-1"]),
  ]);

  assert.ok(
    !issues.some((issue) =>
      [
        "missing-cover-continuation-cue",
        "generic-continuation-cue",
        "subheadline-too-long",
        "continuation-cue-too-long",
      ].includes(issue.code),
    ),
  );
});

test("blocks bare navigation copy and continuation copy on the final slide", () => {
  const issues = evaluateCarouselNarrative([
    {
      ...unit("cover", "hook", ["fact-1"]),
      continuationCue: "Desliza",
    },
    {
      ...unit("conclusion", "conclude", ["fact-1"]),
      continuationCue: "One more implication",
    },
  ]);

  assert.ok(
    issues.some(
      (issue) =>
        issue.code === "generic-continuation-cue" &&
        issue.severity === "blocker" &&
        issue.unitIndex === 0,
    ),
  );
  assert.ok(
    issues.some(
      (issue) =>
        issue.code === "continuation-cue-on-final" &&
        issue.severity === "blocker" &&
        issue.unitIndex === 1,
    ),
  );
});

test("warns when optional hierarchy and continuation copy exceed their limits", () => {
  const headline = "A concise editorial headline";
  const issues = evaluateCarouselNarrative([
    {
      ...unit("cover", "hook", ["fact-1"]),
      headline,
      subheadline: Array.from(
        { length: CAROUSEL_SUBHEADLINE_MAX_WORDS + 1 },
        () => "context",
      ).join(" "),
      continuationCue: Array.from(
        { length: CAROUSEL_CONTINUATION_CUE_MAX_WORDS + 1 },
        () => "detail",
      ).join(" "),
    },
    unit("conclusion", "conclude", ["fact-1"]),
  ]);

  assert.ok(issues.some((issue) => issue.code === "subheadline-too-long"));
  assert.ok(
    issues.some((issue) => issue.code === "continuation-cue-too-long"),
  );

  const redundant = evaluateCarouselNarrative([
    {
      ...unit("cover", "hook", ["fact-1"]),
      headline,
      subheadline: headline,
      continuationCue: "The evidence behind the headline",
    },
    unit("conclusion", "conclude", ["fact-1"]),
  ]);
  assert.ok(
    redundant.some((issue) => issue.code === "redundant-subheadline"),
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
