import assert from "node:assert/strict";
import test from "node:test";

import {
  CAROUSEL_CONTINUATION_CUE_MAX_WORDS,
  CAROUSEL_SUBHEADLINE_MAX_WORDS,
  alignCarouselPlanWithConversionGoal,
  carouselNarrativePolicyForPrompt,
  evaluateCarouselNarrative,
  getPreferredCarouselArc,
  isInstitutionFirstCoverCopy,
  maximumFactsForGoal,
  repairCarouselPlanEvidence,
  repairCarouselPlanQuestions,
  stripRecapLabelPrefix,
  trailingSentenceFragment,
  type CarouselPlan,
  validateCarouselPlan,
} from "./carousel-narrative";
import { repairDeterministicCreativeCopy } from "./creative-quality";
import type { GeneratedCreativeDraft } from "./creative-content.types";

test("compound plan questions are narrowed before validation without changing facts or losing repair provenance", () => {
  const original = 'What does OpenAI call “misalignment,” and what will its framework track?';
  const plan: CarouselPlan = { slideCount: 3, rationale: "Explain the framework", slides: [slide("hook", ["fact-1"]), { ...slide("explain", ["fact-2"]), viewerQuestion: original }, slide("conclude", ["fact-1"])] };
  const repaired = repairCarouselPlanQuestions(plan);
  assert.equal(repaired.slides[1].viewerQuestion, 'What does OpenAI call “misalignment”?');
  assert.deepEqual(repaired.slides.map(s => s.allowedFactIds), plan.slides.map(s => s.allowedFactIds));
  assert.equal(plan.slides[1].viewerQuestion, original);
  assert.equal(repaired.questionRepairs?.[0].original, original);
  assert.deepEqual(repairCarouselPlanQuestions(repaired), repaired);
  assert.equal(validateCarouselPlan(repaired, new Set(["fact-1", "fact-2"])).length, 0);
});

test("narrows a Spanish question whose second clause fronts a preposition before the question word", () => {
  // Live production failure: "¿A quiénes involucra esta nueva autenticación
  // y cuál es su objetivo de seguridad?" hard-failed carouselPlan validation
  // because the repair's start-of-clause check only recognized a bare
  // question word ("quién"), not one preceded by a preposition ("a quiénes"),
  // so the whole brief generation aborted with no fallback.
  const original = "¿A quiénes involucra esta nueva autenticación y cuál es su objetivo de seguridad?";
  const plan: CarouselPlan = { slideCount: 3, rationale: "Explain who is affected", slides: [slide("hook", ["fact-1"]), { ...slide("explain", ["fact-2"]), viewerQuestion: original }, slide("conclude", ["fact-1"])] };
  const repaired = repairCarouselPlanQuestions(plan);
  assert.equal(repaired.slides[1].viewerQuestion, "¿A quiénes involucra esta nueva autenticación?");
  assert.equal(repaired.questionRepairs?.[0].original, original);
  assert.equal(validateCarouselPlan(repaired, new Set(["fact-1", "fact-2"])).length, 0);
});

test("plan question validation distinguishes embedded questions from separate editorial jobs", () => {
  for (const [question, multiple] of [
    ["What changed in how files are shared?", false],
    ["¿Qué cambió en cómo se comparten los archivos?", false],
    ["Why does it matter who can access the file?", false],
    ["What changed and why does it matter?", true],
    ["¿Qué cambió y cómo afecta a los usuarios?", true],
    ["What changed? Who is affected?", true],
  ] as const) {
    const plan: CarouselPlan = {
      slideCount: 3, rationale: "One job per slide",
      slides: [slide("hook", ["fact-1"]), { ...slide("explain", ["fact-2"]), viewerQuestion: question }, slide("conclude", ["fact-2"])],
    };
    assert.equal(validateCarouselPlan(plan, new Set(["fact-1", "fact-2"])).some(error => error.includes("multiple editorial questions")), multiple, question);
  }
});

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
  // The model's question for this story survives the goal change; it is not
  // swapped for the goal's (English) template.
  assert.equal(aligned.plan.slides.at(-1)?.viewerQuestion, plan.slides.at(-1)?.viewerQuestion);
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
  // The closing reuses established evidence and combines the arc rather than
  // carrying one figure: the middle slide's fact leads, the cover's follows.
  assert.deepEqual(plan.slides[2]?.allowedFactIds, ["fact-2", "fact-1"]);
  assert.deepEqual(
    validateCarouselPlan(
      plan,
      new Set(["fact-1", "fact-2", "fact-3"]),
    ),
    [],
  );
});

test("narrows a middle slide that shares evidence with the slide before to its own facts, without inventing any", () => {
  const known = new Set(["fact-1", "fact-2", "fact-3", "fact-4"]);
  // Partial overlap: slide 3 keeps fact-3 and drops fact-2, which slide 2 already carries.
  const overlap: CarouselPlan = {
    slideCount: 4,
    rationale: "Closure, works, detour, conclusion.",
    slides: [slide("hook", ["fact-1"]), slide("explain", ["fact-2"]), slide("impact", ["fact-2", "fact-3"]), slide("conclude", ["fact-1", "fact-3"])],
  };
  const narrowed = repairCarouselPlanEvidence(overlap, known);
  assert.equal(narrowed.repaired, true);
  assert.deepEqual(narrowed.plan.slides[2]?.allowedFactIds, ["fact-3"]);
  assert.deepEqual(validateCarouselPlan(narrowed.plan, known), []);
  // Full repetition with nothing unspent left cannot be repaired: the validator still refuses it.
  const thin: CarouselPlan = {
    ...overlap,
    slides: [slide("hook", ["fact-1"]), slide("explain", ["fact-2", "fact-3"]), slide("impact", ["fact-2"]), slide("conclude", ["fact-1", "fact-3"])],
  };
  const stuck = repairCarouselPlanEvidence(thin, new Set(["fact-1", "fact-2", "fact-3"]));
  assert.deepEqual(stuck.plan.slides[2]?.allowedFactIds, ["fact-2"]);
  assert.match(validateCarouselPlan(stuck.plan, new Set(["fact-1", "fact-2", "fact-3"])).join("\n"), /slides 2 and 3 reuse evidence/);
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

test("a closing that copies any single middle slide is re-spread across the arc", () => {
  // A live plan gave the closing exactly slide 2's facts. The check only
  // compared the closing with the cover and the slide before it, so the copy
  // passed and the ending restated slide 2 word for word (Resolution 66).
  const original: CarouselPlan = {
    slideCount: 5,
    rationale: "Hook, venues, outdoor works, gallery, conclusion.",
    slides: [
      slide("hook", ["fact-1"]),
      slide("explain", ["fact-2", "fact-7"]),
      slide("prove", ["fact-3", "fact-5"]),
      slide("impact", ["fact-4", "fact-6"]),
      slide("conclude", ["fact-2", "fact-7"]),
    ],
  };
  const known = new Set(["fact-1", "fact-2", "fact-3", "fact-4", "fact-5", "fact-6", "fact-7", "fact-8"]);

  const { plan, repaired } = repairCarouselPlanEvidence(original, known);

  assert.equal(repaired, true);
  const closing = plan.slides[4]!.allowedFactIds;
  const slideTwo = new Set(["fact-2", "fact-7"]);
  assert.ok(!closing.every((id) => slideTwo.has(id)), `the closing still copies slide 2: ${closing.join(", ")}`);
  const origins = new Set(closing.map((id) => original.slides.findIndex((s) => s.allowedFactIds.includes(id))));
  assert.ok(origins.size >= 2, `the closing should combine at least two slides, got ${closing.join(", ")}`);
  for (let index = 0; index < 4; index += 1) {
    assert.deepEqual(plan.slides[index]!.allowedFactIds, original.slides[index]!.allowedFactIds, "middle slides are left as planned");
  }
  assert.deepEqual(validateCarouselPlan(plan, known), []);
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

test("flags two slides that share the same headline", () => {
  const issues = evaluateCarouselNarrative([
    { ...unit("cover", "hook", ["fact-1"]), headline: "Your AI backup may be down too" },
    { ...unit("content", "explain", ["fact-2"]), headline: "What the data shows" },
    { ...unit("content", "impact", ["fact-3"]), headline: "The disruption was uneven" },
    { ...unit("conclusion", "conclude", ["fact-1"]), headline: "What the data shows" },
  ]);

  assert.ok(
    issues.some(
      (issue) =>
        issue.code === "duplicate-headline" &&
        issue.severity === "warning" &&
        issue.message.includes("Slides 2 and 4"),
    ),
  );
});

test("flags supporting copy that ends on a truncated noun phrase", () => {
  const issues = evaluateCarouselNarrative([
    { ...unit("cover", "hook", ["fact-1"]), headline: "Three AI tools went dark" },
    {
      ...unit("content", "explain", ["fact-2"]),
      headline: "One shared cloud sits underneath",
      body: "Microsoft Azure also experienced outages. Some tech outlets.",
    },
    { ...unit("content", "impact", ["fact-3"]), headline: "The disruption was uneven" },
    { ...unit("conclusion", "conclude", ["fact-1"]), headline: "Plan for a shared dependency" },
  ]);

  assert.ok(
    issues.some(
      (issue) =>
        issue.code === "truncated-supporting-copy" &&
        issue.severity === "blocker" &&
        issue.message.includes("Slide 2"),
    ),
  );
});

test("flags a generic analysis label as the final slide headline", () => {
  const issues = evaluateCarouselNarrative([
    { ...unit("cover", "hook", ["fact-1"]), headline: "Your AI backup was down too" },
    { ...unit("content", "explain", ["fact-2"]), headline: "One shared cloud underneath" },
    { ...unit("content", "impact", ["fact-3"]), headline: "The disruption was uneven" },
    { ...unit("conclusion", "conclude", ["fact-1"]), headline: "What the data shows" },
  ]);

  // One issue only: the per-slide blocker covers the final slide too, and its
  // message carries the closing-specific guidance.
  const generic = issues.filter(
    (issue) => issue.code === "generic-analysis-headline",
  );
  assert.equal(generic.length, 1);
  assert.equal(generic[0]?.severity, "blocker");
  assert.match(generic[0]?.message ?? "", /actual conclusion/iu);
});

test("blocks a generic analysis label on a middle slide", () => {
  const issues = evaluateCarouselNarrative([
    { ...unit("cover", "hook", ["fact-1"]), headline: "Your AI backup was down too" },
    { ...unit("content", "explain", ["fact-2"]), headline: "What the data shows" },
    { ...unit("content", "impact", ["fact-3"]), headline: "The disruption was uneven" },
    { ...unit("conclusion", "conclude", ["fact-1"]), headline: "Plan for a shared dependency" },
  ]);

  assert.ok(
    issues.some(
      (issue) =>
        issue.code === "generic-analysis-headline" &&
        issue.severity === "blocker" &&
        issue.message.includes("Slide 2"),
    ),
  );
});

test("accepts a final slide headline that states the actual takeaway", () => {
  const issues = evaluateCarouselNarrative([
    { ...unit("cover", "hook", ["fact-1"]), headline: "Your AI backup was down too" },
    { ...unit("content", "explain", ["fact-2"]), headline: "One shared cloud underneath" },
    { ...unit("content", "impact", ["fact-3"]), headline: "The disruption was uneven" },
    {
      ...unit("conclusion", "conclude", ["fact-1"]),
      headline: "A second chatbot is not an independent backup",
    },
  ]);

  assert.ok(
    !issues.some((issue) => issue.code === "generic-analysis-headline"),
  );
});

test("flags a sentence that stops on a bare copula", () => {
  for (const body of [
    "Microsoft Azure was also experiencing outages. A possible contribution to the AI disruptions was.",
    "Azure was also experiencing outages, but its possible contribution was only.",
  ]) {
    const issues = evaluateCarouselNarrative([
      { ...unit("cover", "hook", ["fact-1"]), headline: "Three AI tools went dark" },
      { ...unit("content", "explain", ["fact-2"]), headline: "One shared cloud underneath", body },
      { ...unit("content", "impact", ["fact-3"]), headline: "The disruption was uneven" },
      { ...unit("conclusion", "conclude", ["fact-1"]), headline: "Plan for a shared dependency" },
    ]);
    assert.ok(
      issues.some((issue) => issue.code === "truncated-supporting-copy"),
      body,
    );
  }
});

test("does not flag a comparative that ends on a pronoun + copula", () => {
  const issues = evaluateCarouselNarrative([
    { ...unit("cover", "hook", ["fact-1"]), headline: "Three AI tools went dark" },
    {
      ...unit("content", "explain", ["fact-2"]),
      headline: "One shared cloud underneath",
      body: "Recovery was slower this time. Uptime is lower than it was.",
    },
    { ...unit("content", "impact", ["fact-3"]), headline: "The disruption was uneven" },
    { ...unit("conclusion", "conclude", ["fact-1"]), headline: "Plan for a shared dependency" },
  ]);
  assert.ok(
    !issues.some((issue) => issue.code === "truncated-supporting-copy"),
  );
});

test("flags a hanging 'and some X' clause without touching Oxford-comma lists", () => {
  const flagged = evaluateCarouselNarrative([
    { ...unit("cover", "hook", ["fact-1"]), headline: "Three AI tools went dark" },
    {
      ...unit("content", "explain", ["fact-2"]),
      headline: "One shared cloud underneath",
      body: "Microsoft Azure was also experiencing outages, and some tech outlets.",
    },
    { ...unit("content", "impact", ["fact-3"]), headline: "The disruption was uneven" },
    { ...unit("conclusion", "conclude", ["fact-1"]), headline: "Plan for a shared dependency" },
  ]);
  assert.ok(
    flagged.some((issue) => issue.code === "truncated-supporting-copy"),
  );

  const clean = evaluateCarouselNarrative([
    { ...unit("cover", "hook", ["fact-1"]), headline: "Three AI tools went dark" },
    {
      ...unit("content", "explain", ["fact-2"]),
      headline: "One shared cloud underneath",
      body: "Downdetector logged outages affecting ChatGPT, Claude, and Grok.",
    },
    { ...unit("content", "impact", ["fact-3"]), headline: "The disruption was uneven" },
    { ...unit("conclusion", "conclude", ["fact-1"]), headline: "Plan for a shared dependency" },
  ]);
  assert.ok(
    !clean.some((issue) => issue.code === "truncated-supporting-copy"),
  );
});

test("flags supporting copy that ends on a dangling connector, any length", () => {
  const issues = evaluateCarouselNarrative([
    { ...unit("cover", "hook", ["fact-1"]), headline: "Three AI tools went dark" },
    { ...unit("content", "explain", ["fact-2"]), headline: "One shared cloud sits underneath" },
    { ...unit("content", "impact", ["fact-3"]), headline: "The disruption was uneven" },
    {
      ...unit("conclusion", "conclude", ["fact-1"]),
      headline: "Plan for a shared dependency",
      body:
        "Switching among the three could not restore access. Azure's outage was a possible contributing factor, as.",
    },
  ]);

  assert.ok(
    issues.some(
      (issue) =>
        issue.code === "truncated-supporting-copy" &&
        issue.message.includes("Slide 4"),
    ),
  );
});

test("does not mistake the French noun 'but' (goal/net) for the English dangling conjunction", () => {
  const issues = evaluateCarouselNarrative([
    { ...unit("cover", "hook", ["fact-1"]), headline: "Deux séances locales sont prévues lundi" },
    { ...unit("content", "explain", ["fact-2"]), headline: "Le prochain repère confirmé arrive mercredi" },
    {
      ...unit("content", "prove", ["fact-3"]),
      headline: "La formation rassemble trois groupes de joueurs",
      body: "La formation du camp d’entraînement compte 31 attaquants, 19 défenseurs et sept gardiens de but.",
    },
    { ...unit("conclusion", "conclude", ["fact-1"]), headline: "Le camp se poursuit jusqu’au 26 septembre" },
  ]);
  assert.ok(
    !issues.some((issue) => issue.code === "truncated-supporting-copy"),
  );
  // A genuinely dangling English "but" is still caught elsewhere in the deck.
  assert.equal(trailingSentenceFragment("The outage spread quickly, but."), "The outage spread quickly, but.");
});

test("does not flag a short final supporting sentence that carries a verb", () => {
  const issues = evaluateCarouselNarrative([
    { ...unit("cover", "hook", ["fact-1"]), headline: "Three AI tools went dark" },
    {
      ...unit("content", "explain", ["fact-2"]),
      headline: "One shared cloud sits underneath",
      body: "Microsoft Azure runs all three assistants. It also went down.",
    },
    { ...unit("content", "impact", ["fact-3"]), headline: "The disruption was uneven" },
    { ...unit("conclusion", "conclude", ["fact-1"]), headline: "Plan for a shared dependency" },
  ]);

  assert.ok(
    !issues.some((issue) => issue.code === "truncated-supporting-copy"),
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

test("blocks a final slide that opens with a summary label instead of the answer", () => {
  const issues = evaluateCarouselNarrative([
    unit("cover", "hook", ["fact-1"]),
    unit("content", "explain", ["fact-2"]),
    {
      ...unit("conclusion", "conclude", ["fact-1"]),
      headline: "La conclusión: no hubo cambio",
      body: "Por ahora la tasa objetivo sigue igual.",
    },
  ]);

  assert.ok(
    issues.some(
      (issue) =>
        issue.code === "recap-label-headline" &&
        issue.severity === "blocker" &&
        issue.unitIndex === 2,
    ),
  );
});

test("blocks summary-label synonyms on the final slide headline", () => {
  for (const headline of [
    "La clave: tasa estable no significa precios quietos",
    "El punto: los aranceles pueden empujar precios",
    "En pocas palabras: nada cambió hoy",
  ]) {
    const issues = evaluateCarouselNarrative([
      unit("cover", "hook", ["fact-1"]),
      unit("content", "explain", ["fact-2"]),
      { ...unit("conclusion", "conclude", ["fact-1"]), headline },
    ]);
    assert.ok(
      issues.some((issue) => issue.code === "recap-label-headline"),
      `expected recap-label-headline for "${headline}"`,
    );
  }
});

test("blocks a summary-label continuation cue on a middle slide", () => {
  const issues = evaluateCarouselNarrative([
    {
      ...unit("cover", "hook", ["fact-1"]),
      continuationCue: "Por qué la gasolina pesa en la inflación",
    },
    {
      ...unit("content", "explain", ["fact-2"]),
      continuationCue: "La conclusión: tasa estable, precios bajo vigilancia",
    },
    unit("conclusion", "conclude", ["fact-1"]),
  ]);

  assert.ok(
    issues.some(
      (issue) =>
        issue.code === "generic-continuation-cue" &&
        issue.severity === "blocker" &&
        issue.unitIndex === 1,
    ),
  );
});

test("warns when the final slide only restates the cover's fact and wording", () => {
  const sharedHeadline = "La tasa objetivo se queda en dos veinticinco";
  const sharedBody =
    "El banco central mantuvo su tasa objetivo para operaciones a un dia.";
  const issues = evaluateCarouselNarrative([
    {
      ...unit("cover", "hook", ["fact-1"]),
      headline: sharedHeadline,
      body: sharedBody,
    },
    unit("content", "explain", ["fact-2"]),
    {
      ...unit("conclusion", "conclude", ["fact-1"]),
      headline: sharedHeadline,
      body: sharedBody,
    },
  ]);

  assert.ok(
    issues.some(
      (issue) =>
        issue.code === "redundant-closing" &&
        issue.severity === "warning" &&
        issue.unitIndex === 2,
    ),
  );
});

test("does not flag a closing slide that resolves the cover with new wording", () => {
  const issues = evaluateCarouselNarrative([
    {
      ...unit("cover", "hook", ["fact-1"]),
      headline: "La economia crecio pero los precios no ceden",
      body: "El indice de precios ronda el tres por ciento por la gasolina.",
    },
    unit("content", "explain", ["fact-2"]),
    {
      ...unit("conclusion", "conclude", ["fact-1"]),
      headline: "Sin recorte, el costo de vida sigue tenso",
      body: "La decision deja el alivio inmediato fuera de la mesa este trimestre.",
    },
  ]);

  assert.ok(
    !issues.some((issue) =>
      ["recap-label-headline", "redundant-closing"].includes(issue.code),
    ),
  );
});

test("blocks an institution-first cover when the profile asks for reader-consequence framing", () => {
  const units = [
    {
      ...unit("cover", "hook", ["fact-1"]),
      headline: "El Banco de Canadá mantuvo su tasa en 2,25%",
    },
    unit("content", "explain", ["fact-2"]),
    unit("conclusion", "conclude", ["fact-1"]),
  ];

  assert.ok(
    !evaluateCarouselNarrative(units).some(
      (issue) => issue.code === "cover-not-reader-framed",
    ),
    "no framing strategy means no cover-not-reader-framed check",
  );

  const issues = evaluateCarouselNarrative(
    units,
    undefined,
    undefined,
    "reader-consequence",
  );
  assert.ok(
    issues.some(
      (issue) =>
        issue.code === "cover-not-reader-framed" &&
        issue.severity === "blocker" &&
        issue.unitIndex === 0,
    ),
  );

  const bareStatus = evaluateCarouselNarrative(
    [
      {
        ...unit("cover", "hook", ["fact-1"]),
        headline: "La tasa se mantiene en 2,25%",
      },
      unit("content", "explain", ["fact-2"]),
      unit("conclusion", "conclude", ["fact-1"]),
    ],
    undefined,
    undefined,
    "reader-consequence",
  );
  assert.ok(
    bareStatus.some((issue) => issue.code === "cover-not-reader-framed"),
  );
});

test("blocks a withheld-answer yes/no question cover under reader-consequence", () => {
  const withQuestionCover = (headline: string) => [
    { ...unit("cover", "hook", ["fact-1"]), headline },
    unit("content", "explain", ["fact-2"]),
    unit("conclusion", "conclude", ["fact-1"]),
  ];

  const blocked = evaluateCarouselNarrative(
    withQuestionCover("¿Bajó hoy la tasa objetivo del 2,25%?"),
    undefined,
    undefined,
    "reader-consequence",
  );
  assert.ok(
    blocked.some(
      (issue) =>
        issue.code === "cover-not-reader-framed" && issue.unitIndex === 0,
    ),
  );

  // A wh-question and a stake-bearing question are both fine.
  for (const headline of [
    "¿Cuánto más vas a pagar por tu hipoteca este año?",
    "¿La pausa del banco te ayuda o te perjudica?",
  ]) {
    const ok = evaluateCarouselNarrative(
      withQuestionCover(headline),
      undefined,
      undefined,
      "reader-consequence",
    );
    assert.ok(
      !ok.some((issue) => issue.code === "cover-not-reader-framed"),
      `expected no block for "${headline}"`,
    );
  }
});

test("flags a closing that restates the cover's number with different words", () => {
  const issues = evaluateCarouselNarrative([
    {
      ...unit("cover", "hook", ["fact-1"]),
      headline: "¿Bajó hoy la tasa objetivo del 2,25%?",
      body: "El banco comunicó hoy su decisión.",
    },
    unit("content", "explain", ["fact-2"]),
    {
      ...unit("conclusion", "conclude", ["fact-1"]),
      headline: "No hubo rebaja: la tasa objetivo sigue en 2,25%",
      body: "El banco mantuvo hoy su tasa objetivo en 2,25%.",
    },
  ]);

  assert.ok(
    issues.some(
      (issue) =>
        issue.code === "redundant-closing" && issue.unitIndex === 2,
    ),
  );
});

test("warns when a continuation cue repeats the next slide's headline verbatim", () => {
  const issues = evaluateCarouselNarrative([
    {
      ...unit("cover", "hook", ["fact-1"]),
      continuationCue: "Algunas compras podrían encarecerse con el tiempo",
    },
    {
      ...unit("content", "impact", ["fact-2"]),
      headline: "Algunas compras podrían encarecerse con el tiempo",
    },
    unit("conclusion", "conclude", ["fact-1"]),
  ]);

  assert.ok(
    issues.some(
      (issue) =>
        issue.code === "cue-echoes-next-headline" && issue.unitIndex === 0,
    ),
  );
});

test("flags a closing that resolves with figures instead of the reader's stake", () => {
  const issues = evaluateCarouselNarrative(
    [
      {
        ...unit("cover", "hook", ["fact-1"]),
        headline: "Tus deudas variables: sin nuevo recorte oficial",
        continuationCue: "Por qué el banco no recortó",
      },
      unit("content", "explain", ["fact-2"]),
      {
        ...unit("conclusion", "conclude", ["fact-1"]),
        headline: "No hubo un nuevo recorte de la tasa objetivo",
        body: "La tasa objetivo se mantuvo en 2,25%. La tasa de depósito quedó en 2,20%.",
      },
    ],
    undefined,
    undefined,
    "reader-consequence",
  );

  assert.ok(
    issues.some(
      (issue) =>
        issue.code === "closing-not-reader-resolved" && issue.unitIndex === 2,
    ),
  );

  const readerResolved = evaluateCarouselNarrative(
    [
      {
        ...unit("cover", "hook", ["fact-1"]),
        headline: "Tus deudas variables: sin nuevo recorte oficial",
        continuationCue: "Por qué el banco no recortó",
      },
      unit("content", "explain", ["fact-2"]),
      {
        ...unit("conclusion", "conclude", ["fact-1"]),
        headline: "Tu tasa variable no baja: sigue en 2,25%",
        body: "Para tus pagos, no cambia nada este mes: la tasa objetivo se mantuvo en 2,25%.",
      },
    ],
    undefined,
    undefined,
    "reader-consequence",
  );
  assert.ok(
    !readerResolved.some(
      (issue) => issue.code === "closing-not-reader-resolved",
    ),
  );
});

test("catches 'permanece' / 'no sube' bare-status covers under reader-consequence", () => {
  for (const headline of [
    "La tasa no sube: permanece en 2,25%",
    "La tasa de referencia sigue en 2,25%",
    "El tipo de interés no bajó: queda en 2,25%",
  ]) {
    const issues = evaluateCarouselNarrative(
      [
        { ...unit("cover", "hook", ["fact-1"]), headline },
        unit("content", "explain", ["fact-2"]),
        unit("conclusion", "conclude", ["fact-1"]),
      ],
      undefined,
      undefined,
      "reader-consequence",
    );
    assert.ok(
      issues.some((issue) => issue.code === "cover-not-reader-framed"),
      `expected block for "${headline}"`,
    );
  }
});

test("flags a cover whose supporting text restates the headline's thesis number", () => {
  const issues = evaluateCarouselNarrative([
    {
      ...unit("cover", "hook", ["fact-1"]),
      headline: "La tasa no sube: permanece en 2,25%",
      body: "La decisión conserva la tasa de referencia en 2,25%.",
      continuationCue: "Por qué no hubo recorte",
    },
    unit("content", "explain", ["fact-2"]),
    unit("conclusion", "conclude", ["fact-1"]),
  ]);
  assert.ok(
    issues.some(
      (issue) =>
        issue.code === "redundant-cover-body" && issue.unitIndex === 0,
    ),
  );
});

test("warns when a hold cover's supporting text restates the hold instead of the second signal", () => {
  const deck = [
    {
      ...unit("cover", "hook", ["fact-1"]),
      headline:
        "Para tu deuda, no cambió la tasa; para tus compras, vigila la inflación",
      body: "La tasa objetivo se mantiene hoy. Eso deja una señal estable para quienes siguen su presupuesto.",
      continuationCue: "¿Qué empuja la inflación?",
    },
    unit("content", "explain", ["fact-2"]),
    unit("conclusion", "conclude", ["fact-1"]),
  ];
  assert.ok(
    !evaluateCarouselNarrative(deck).some(
      (issue) => issue.code === "cover-supporting-restates-hold",
    ),
    "no framing strategy means no check",
  );
  assert.ok(
    evaluateCarouselNarrative(deck, undefined, undefined, "reader-consequence").some(
      (issue) => issue.code === "cover-supporting-restates-hold",
    ),
  );

  // Supporting text that carries the second signal passes.
  const withSecondSignal = evaluateCarouselNarrative(
    [
      {
        ...deck[0]!,
        body: "La gasolina ha mantenido la inflación cerca del 3% en meses recientes.",
      },
      deck[1]!,
      deck[2]!,
    ],
    undefined,
    undefined,
    "reader-consequence",
  );
  assert.ok(
    !withSecondSignal.some(
      (issue) => issue.code === "cover-supporting-restates-hold",
    ),
  );
});

test("allows a two-clause reader-contrast cover headline to run longer", () => {
  const headline =
    "Para tu deuda, no cambió la tasa objetivo; para tus compras, vigila la inflación";
  const issues = evaluateCarouselNarrative([
    { ...unit("cover", "hook", ["fact-1"]), headline, continuationCue: "¿Por qué?" },
    unit("content", "explain", ["fact-2"]),
    unit("conclusion", "conclude", ["fact-1"]),
  ]);
  assert.ok(
    !issues.some((issue) => issue.code === "headline-too-long"),
    "a semicolon-separated two-clause cover gets a 16-word budget",
  );

  const longSingle = evaluateCarouselNarrative([
    {
      ...unit("cover", "hook", ["fact-1"]),
      headline:
        "El Banco de Canadá mantuvo la tasa objetivo de referencia sin cambios en dos veinticinco por ciento",
      continuationCue: "¿Por qué?",
    },
    unit("content", "explain", ["fact-2"]),
    unit("conclusion", "conclude", ["fact-1"]),
  ]);
  assert.ok(
    longSingle.some((issue) => issue.code === "headline-too-long"),
    "a single-clause cover keeps the 12-word budget",
  );
});

test("warns (never blocks) on a missing cover continuation cue", () => {
  const deck = [
    {
      ...unit("cover", "hook", ["fact-1"]),
      headline: "Tu tasa variable no baja: sigue en 2,25%",
    },
    unit("content", "explain", ["fact-2"]),
    unit("conclusion", "conclude", ["fact-1"]),
  ];
  for (const framing of [undefined, "reader-consequence" as const]) {
    assert.equal(
      evaluateCarouselNarrative(deck, undefined, undefined, framing).find(
        (issue) => issue.code === "missing-cover-continuation-cue",
      )?.severity,
      "warning",
    );
  }
});

test("detects a capitalized institution lead, not only a lowercased one", () => {
  for (const headline of [
    "El Banco de Canadá anunció su decisión de diciembre",
    "La Reserva Federal mantuvo el tipo de referencia",
    "Anthropic announced a new model",
  ]) {
    assert.ok(
      isInstitutionFirstCoverCopy(headline),
      `expected institution-first for "${headline}"`,
    );
  }
  for (const headline of [
    "Tu hipoteca no sube este mes",
    "La gasolina explica la inflación reciente",
  ]) {
    assert.ok(
      !isInstitutionFirstCoverCopy(headline),
      `expected no flag for "${headline}"`,
    );
  }
});

test("only raises a recap-label blocker the repair can actually clear", () => {
  const labelled = (headline: string) => [
    {
      ...unit("cover", "hook", ["fact-1"]),
      continuationCue: "Por qué cambia",
    },
    unit("content", "explain", ["fact-2"]),
    { ...unit("conclusion", "conclude", ["fact-1"]), headline },
  ];

  // A comma-delimited label is both detected and strippable.
  const commaLabel = "En resumen, tu pago mensual sigue igual";
  assert.ok(
    evaluateCarouselNarrative(labelled(commaLabel)).some(
      (issue) => issue.code === "recap-label-headline",
    ),
  );
  assert.equal(
    stripRecapLabelPrefix(commaLabel),
    "Tu pago mensual sigue igual",
  );

  // Every raised blocker must be clearable: the repaired headline stops flagging.
  assert.ok(
    !evaluateCarouselNarrative(
      labelled(stripRecapLabelPrefix(commaLabel)),
    ).some((issue) => issue.code === "recap-label-headline"),
  );

  // A label word inside an ordinary sentence is not a label prefix.
  const sentence = "La clave está en los precios";
  assert.equal(stripRecapLabelPrefix(sentence), sentence);
  assert.ok(
    !evaluateCarouselNarrative(labelled(sentence)).some(
      (issue) => issue.code === "recap-label-headline",
    ),
  );
});

test("accepts a reader-first cover under reader-consequence framing", () => {
  const issues = evaluateCarouselNarrative(
    [
      {
        ...unit("cover", "hook", ["fact-1"]),
        headline: "Tu hipoteca no sube, pero la gasolina sigue cara",
      },
      unit("content", "explain", ["fact-2"]),
      unit("conclusion", "conclude", ["fact-1"]),
    ],
    undefined,
    undefined,
    "reader-consequence",
  );

  assert.ok(
    !issues.some((issue) => issue.code === "cover-not-reader-framed"),
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

test("rejects a premature conclusion during planning rather than waiting for script role validation", () => {
  const plan: CarouselPlan = {slideCount: 4, rationale: "Explain and conclude", slides: [slide("hook", ["fact-1"]), slide("explain", ["fact-2"]), slide("conclude", ["fact-1"]), slide("conclude", ["fact-2"])]};
  const ids = new Set(["fact-1", "fact-2", "fact-3"]);
  assert.ok(validateCarouselPlan(plan, ids).some(error => error.includes("slide 3 closes the story before the final slide")));
  const corrected = {...plan, slides: [plan.slides[0], plan.slides[1], slide("impact", ["fact-3"]), plan.slides[3]]};
  assert.deepEqual(validateCarouselPlan(corrected, ids), []);
});

test("a closing planned on the cover's evidence alone is given something to synthesize", () => {
  const known = new Set(["fact-1", "fact-2", "fact-3"]);
  // Exactly the plan that produced the repeated ending live: the cover and the
  // conclusion both carry fact-1, so the closing can only restate the opening.
  const plan: CarouselPlan = {
    slideCount: 3,
    rationale: "Cover the rise, show the range, close on the takeaway.",
    slides: [
      { editorialGoal: "hook" as const, viewerQuestion: "How much more does a fill cost?", allowedFactIds: ["fact-1"] },
      { editorialGoal: "impact" as const, viewerQuestion: "How did the price move?", allowedFactIds: ["fact-2", "fact-3"] },
      { editorialGoal: "conclude" as const, viewerQuestion: "What should I remember?", allowedFactIds: ["fact-1"] },
    ],
  };
  const { plan: repaired, repaired: changed } = repairCarouselPlanEvidence(plan, known);
  assert.equal(changed, true);
  const closing = repaired.slides[2].allowedFactIds;
  assert.ok(
    closing.some((id) => !plan.slides[0].allowedFactIds.includes(id)),
    "the closing now carries evidence the cover did not",
  );
  for (const id of closing) {
    assert.ok(["fact-1", "fact-2", "fact-3"].includes(id), "no invented evidence");
  }
  // Everything it cites was already shown to the reader earlier in the arc.
  const establishedBeforeClosing = new Set([...plan.slides[0].allowedFactIds, ...plan.slides[1].allowedFactIds]);
  for (const id of closing) assert.ok(establishedBeforeClosing.has(id), `${id} was established earlier`);
});

test("a closing echoing only the previous slide is widened to span the arc", () => {
  const known = new Set(["fact-1", "fact-2"]);
  const plan: CarouselPlan = {
    slideCount: 3,
    rationale: "Sound arc.",
    slides: [
      { editorialGoal: "hook" as const, viewerQuestion: "What changed?", allowedFactIds: ["fact-1"] },
      { editorialGoal: "explain" as const, viewerQuestion: "Why?", allowedFactIds: ["fact-2"] },
      { editorialGoal: "conclude" as const, viewerQuestion: "So what?", allowedFactIds: ["fact-2"] },
    ],
  };
  const { plan: out } = repairCarouselPlanEvidence(plan, known);
  assert.deepEqual(out.slides[2].allowedFactIds, ["fact-2", "fact-1"], "the ending combines both beats");
});

test("a middle slide repeating the slide before it spends unused evidence instead", () => {
  // Exactly the live plan that produced REPEATED_EVIDENCE_NO_NEW_REWARD: the
  // explain slide restated the cover while fact-3 was never used at all.
  const known = new Set(["fact-1", "fact-2", "fact-3"]);
  const plan: CarouselPlan = {
    slideCount: 4,
    rationale: "Cover, explain, impact, conclude.",
    slides: [
      { editorialGoal: "hook" as const, viewerQuestion: "How much more?", allowedFactIds: ["fact-1"] },
      { editorialGoal: "explain" as const, viewerQuestion: "How did it move?", allowedFactIds: ["fact-1"] },
      { editorialGoal: "impact" as const, viewerQuestion: "What were the extremes?", allowedFactIds: ["fact-2"] },
      { editorialGoal: "conclude" as const, viewerQuestion: "What should I take away?", allowedFactIds: ["fact-2"] },
    ],
  };
  const { plan: out, repaired } = repairCarouselPlanEvidence(plan, known);
  assert.equal(repaired, true);
  assert.notDeepEqual(out.slides[1].allowedFactIds, ["fact-1"], "the explain slide no longer echoes the cover");
  assert.ok(out.slides[1].allowedFactIds.every((id) => known.has(id)), "no invented evidence");
  const closing = out.slides[3].allowedFactIds;
  assert.ok(closing.length >= 2, "the closing synthesizes rather than echoing slide 3");
  assert.notDeepEqual(closing, out.slides[2].allowedFactIds);
});

test("a slide whose supporting text only restates its headline's figure is flagged", () => {
  // Observed live: headline "La moyenne observée : 182,8 ¢/L", body "La moyenne
  // observée s'établit à 182,8 ¢/L." Three fields, one fact, nothing earned by
  // the swipe. The critic reported it as SWIPE_REWARD_REPETITION and it held
  // swipeReward at 78 against a bar of 80.
  const issues = evaluateCarouselNarrative(
    [
      { role: "cover", editorialGoal: "hook", viewerQuestion: "Combien?",
        headline: "Votre plein coûte 9,5 ¢ de plus le litre", body: "Le dernier relevé s'établit à 184,2 ¢/L.",
        continuationCue: "Comment les prix ont oscillé.", factIds: ["fact-1"] },
      { role: "content", editorialGoal: "impact", viewerQuestion: "Où se situe la moyenne?",
        headline: "La moyenne observée : 182,8 ¢/L", subheadline: "Le repère établi par les relevés.",
        body: "La moyenne observée s'établit à 182,8 ¢/L.",
        continuationCue: "Et pour votre budget?", factIds: ["fact-2"] },
      { role: "conclusion", editorialGoal: "conclude", viewerQuestion: "Que retenir?",
        headline: "Surveillez la pompe avant vos déplacements",
        body: "Au dernier relevé, chaque litre coûte 9,5 ¢ de plus, à 184,2 ¢/L contre une moyenne de 182,8 ¢/L.",
        ctaQuestion: "Abonnez-vous à Salut St-Jean.", factIds: ["fact-1", "fact-2"] },
    ],
    undefined, "followers", "reader-consequence",
  );
  const restating = issues.filter((issue) => issue.code === "slide-restates-itself");
  assert.equal(restating.length, 1, "only the slide that adds nothing is flagged");
  assert.equal(restating[0]?.unitIndex, 1, "slide 2 is the one repeating its own figure");
  assert.match(restating[0]?.message ?? "", /182,8/, "the repeated figure is named so a patch can aim at it");
});

test("supporting text that advances the slide is not flagged as restatement", () => {
  const issues = evaluateCarouselNarrative(
    [
      { role: "cover", editorialGoal: "hook", viewerQuestion: "Combien?",
        headline: "Un creux fin août, un sommet mi-septembre",
        body: "Du 25 août au 22 septembre 2026, sur 29 relevés, le régulier a oscillé entre 173,2 ¢/L et 187,8 ¢/L.",
        continuationCue: "Et la moyenne?", factIds: ["fact-1"] },
      { role: "conclusion", editorialGoal: "conclude", viewerQuestion: "Que retenir?",
        headline: "Surveillez la pompe", body: "Le prix reste au-dessus de la moyenne récente.",
        ctaQuestion: "Abonnez-vous.", factIds: ["fact-1"] },
    ],
    undefined, "followers", "reader-consequence",
  );
  assert.equal(issues.filter((issue) => issue.code === "slide-restates-itself").length, 0);
});
