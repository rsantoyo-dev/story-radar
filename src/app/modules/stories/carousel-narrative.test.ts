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
  stripRecapLabelPrefix,
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
