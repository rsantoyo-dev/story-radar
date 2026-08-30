import assert from "node:assert/strict";
import test from "node:test";

import type {
  CreativeKeyFact,
  GeneratedCreativeDraft,
} from "./creative-content.types";
import {
  creativeQualityReviewHasUnresolvedBlockers,
  creativeQualityThresholdFailures,
  deterministicCreativeQualityIssues,
  repairDeterministicCreativeCopy,
} from "./creative-quality";

const facts: CreativeKeyFact[] = [
  {
    id: "fact-1",
    statement: "Automated audits detect design-token violations in CI.",
    sourceExcerpt:
      "The audit script returns exit code 1 when a hardcoded CSS value appears.",
    attribution: "the author",
  },
];

const draft: GeneratedCreativeDraft = {
  concept: "LLM-readable design systems",
  caption: "Make design constraints readable by coding agents.",
  hashtags: [],
  altText: "A carousel about design-system automation.",
  units: [
    {
      order: 1,
      type: "carousel-slide",
      role: "cover",
      editorialGoal: "hook",
      viewerQuestion: "Why does design drift happen?",
      headline: "Zero-drift enforcement in CI pipelines",
      body: "An automated audit catches raw CSS values.",
      visualDirection: "A CI terminal with a failed audit.",
      factIds: ["fact-1"],
      assetRequest: "generated-image",
      aspectRatio: "4:5",
      characterIds: [],
    },
    {
      order: 2,
      type: "carousel-slide",
      role: "call-to-action",
      editorialGoal: "debate",
      viewerQuestion: "How would this fit the viewer's workflow?",
      headline: "Move consistency into the build",
      body: "Use automated checks before review.",
      ctaQuestion: "What stands out most to you?",
      visualDirection: "A passing CI check.",
      factIds: ["fact-1"],
      assetRequest: "generated-image",
      aspectRatio: "4:5",
      characterIds: [],
    },
  ],
};

test("repairs unsupported absolutes and grounds a generic CTA", () => {
  const repaired = repairDeterministicCreativeCopy(
    draft,
    "carousel",
    facts,
    "English",
  );

  assert.equal(
    repaired.units[0]?.headline,
    "Automated drift enforcement in CI pipelines",
  );
  assert.equal(
    repaired.units[1]?.ctaQuestion,
    "How would this fit the viewer's workflow?",
  );
  const codes = deterministicCreativeQualityIssues(
    repaired,
    "carousel",
    facts,
    "English",
  ).map((issue) => issue.code);
  assert.ok(!codes.includes("UNSUPPORTED_ABSOLUTE"));
  assert.ok(!codes.includes("GENERIC_CTA"));
});

test("repairs whitespace inside grouped numbers before factual validation", () => {
  const malformed = structuredClone(draft);
  const amountFacts: CreativeKeyFact[] = [
    {
      id: "fact-amount",
      statement:
        "The median household income was $155,000 CAD for first-time buyers and $180,000 CAD for repeat buyers.",
      sourceExcerpt:
        "The median household income was $155,000 CAD for first-time buyers and $180,000 CAD for repeat buyers.",
    },
  ];
  malformed.units[0]!.factIds = ["fact-amount"];
  malformed.units[0]!.body =
    "El ingreso fue de 155. 000 CAD frente a 180, 000 CAD.";

  const before = deterministicCreativeQualityIssues(
    malformed,
    "carousel",
    amountFacts,
    "Spanish",
  );
  assert.ok(
    before.some((issue) => issue.code === "MALFORMED_NUMBER_FORMAT"),
  );

  const repaired = repairDeterministicCreativeCopy(
    malformed,
    "carousel",
    amountFacts,
    "Spanish",
  );
  assert.equal(
    repaired.units[0]!.body,
    "El ingreso fue de 155.000 CAD frente a 180,000 CAD.",
  );
  assert.equal(
    deterministicCreativeQualityIssues(
      repaired,
      "carousel",
      amountFacts,
      "Spanish",
    ).some((issue) => issue.code === "MALFORMED_NUMBER_FORMAT"),
    false,
  );
});

test("repairs a malformed concept-derived CTA without leaking structural numbers", () => {
  const malformed: GeneratedCreativeDraft = {
    ...draft,
    concept:
      "How Asana collapsed an expected five-year migration into about two weeks",
    units: draft.units.map((unit, index) =>
      index === draft.units.length - 1
        ? {
            ...unit,
            viewerQuestion: "What question should the viewer consider?",
            ctaQuestion:
              "Where would you apply how Asana collapsed an expected five-year migration into about two weeks first?",
          }
        : unit,
    ),
  };
  const repaired = repairDeterministicCreativeCopy(
    malformed,
    "carousel",
    facts,
    "English",
  );
  assert.equal(
    repaired.units.at(-1)?.ctaQuestion,
    "Where could this approach fit your workflow?",
  );
});

test("keeps an absolute claim when the cited excerpt explicitly supports it", () => {
  const supportedFacts: CreativeKeyFact[] = [
    {
      ...facts[0]!,
      sourceExcerpt: "The audit guarantees zero-drift enforcement in CI.",
    },
  ];
  const repaired = repairDeterministicCreativeCopy(
    draft,
    "carousel",
    supportedFacts,
    "English",
  );
  assert.equal(repaired.units[0]?.headline, draft.units[0]?.headline);
});

test("repairs carousel fact budgets and removes leaked English supporting copy", () => {
  const mixedLanguage: GeneratedCreativeDraft = {
    ...draft,
    units: draft.units.map((unit, index) =>
      index === 1
        ? {
            ...unit,
            factIds: ["fact-1", "fact-2"],
            body: "The embryo is now a fetus and all body parts are in place.",
            headline: "Un cambio importante",
          }
        : unit,
    ),
  };
  const repaired = repairDeterministicCreativeCopy(
    mixedLanguage,
    "carousel",
    facts,
    "espanol",
  );

  assert.deepEqual(repaired.units[1]?.factIds, ["fact-1"]);
  assert.equal(repaired.units[1]?.body, undefined);
  const issues = deterministicCreativeQualityIssues(
    repaired,
    "carousel",
    facts,
    "espanol",
  );
  assert.ok(!issues.some((issue) => issue.code === "FACT_BUDGET"));
  assert.ok(!issues.some((issue) => issue.code === "MIXED_LANGUAGE"));
});

test("repairs a short English CTA leaked into an otherwise Spanish closing slide", () => {
  const spanishDraft: GeneratedCreativeDraft = {
    ...draft,
    concept: "Comprar vivienda por primera vez",
    caption: "Datos sobre compradores de vivienda en Canadá.",
    altText: "Carrusel sobre compradores de vivienda.",
    units: draft.units.map((unit, index) =>
      index === draft.units.length - 1
        ? {
            ...unit,
            headline: "Lo que muestran los datos",
            body: "Los ingresos familiares medianos fueron distintos entre los dos grupos.",
            viewerQuestion: "¿Qué significa esta diferencia?",
            ctaQuestion:
              "What does this financial gap mean for those planning to buy their first home?",
          }
        : {
            ...unit,
            headline: "Una diferencia entre compradores",
            body: "La fuente compara dos grupos de compradores.",
          },
    ),
  };

  const repaired = repairDeterministicCreativeCopy(
    spanishDraft,
    "carousel",
    facts,
    "español",
  );

  assert.equal(
    repaired.units.at(-1)?.ctaQuestion,
    "¿Qué significa esta diferencia?",
  );
  assert.ok(
    !deterministicCreativeQualityIssues(
      repaired,
      "carousel",
      facts,
      "español",
    ).some((issue) => issue.code === "MIXED_LANGUAGE"),
  );
});

test("does not let a repaired critic blocker keep human approval disabled", () => {
  assert.equal(
    creativeQualityReviewHasUnresolvedBlockers(
      {
        status: "rejected",
        scores: {
          factuality: 0,
          hook: 0,
          curiosity: 0,
          swipeReward: 0,
          continuity: 0,
          relevance: 0,
          clarity: 0,
          resolution: 0,
          cta: 0,
          overall: 0,
        },
        issues: [
          {
            code: "MIXED_LANGUAGE",
            severity: "blocker",
            unitOrder: 3,
            message: "English copy leaked into slide 3.",
          },
        ],
        repairPasses: 0,
      },
      [],
    ),
    false,
  );
});

test("blocks drafts with weak earned curiosity or an unresolved opening promise", () => {
  const failures = creativeQualityThresholdFailures(
    {
      factuality: 98,
      hook: 90,
      curiosity: 79,
      swipeReward: 90,
      continuity: 90,
      relevance: 92,
      clarity: 92,
      resolution: 78,
      cta: 90,
      overall: 91,
    },
    "carousel",
    true,
  );
  const codes = failures.map((issue) => issue.code);
  assert.ok(codes.includes("QUALITY_CURIOSITY_BELOW_THRESHOLD"));
  assert.ok(codes.includes("QUALITY_RESOLUTION_BELOW_THRESHOLD"));
});
