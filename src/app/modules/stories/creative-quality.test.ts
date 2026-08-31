import assert from "node:assert/strict";
import test from "node:test";

import type {
  CreativeKeyFact,
  CreativeQualityReview,
  GeneratedCreativeDraft,
} from "./creative-content.types";
import {
  buildCreativeQualityReview,
  CREATIVE_QUALITY_THRESHOLDS,
  creativeQualityReviewHasUnresolvedBlockers,
  creativeQualityThresholdFailures,
  deterministicCreativeQualityIssues,
  getCreativeDraftApprovalState,
  repairDeterministicCreativeCopy,
  visibleDraftLanguageIssues,
} from "./creative-quality";

test("sets the automated editorial target to 9.5 with stricter factuality", () => {
  assert.equal(CREATIVE_QUALITY_THRESHOLDS.overall, 95);
  assert.equal(CREATIVE_QUALITY_THRESHOLDS.factuality, 96);
});

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
    "What is your reading of these findings?",
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

test("flags short English editorial phrases in Spanish caption, headline, and body", () => {
  const spanishBase: GeneratedCreativeDraft = {
    ...draft,
    concept: "Señales del mercado laboral canadiense",
    caption: "Las cifras muestran cambios distintos entre sectores.",
    callToAction: "Compara estas cifras con la realidad de tu sector.",
    altText: "Carrusel sobre el mercado laboral de Canadá.",
    units: draft.units.map((unit, index) => ({
      ...unit,
      headline:
        index === 0
          ? "El empleo cambió poco en junio"
          : "La lectura depende del sector",
      body:
        index === 0
          ? "Los datos nacionales muestran un movimiento moderado."
          : "Cada industria presenta condiciones diferentes.",
      ...(index === draft.units.length - 1
        ? { ctaQuestion: "¿Qué ocurre en tu sector?" }
        : { ctaQuestion: undefined }),
    })),
  };
  const cases: Array<{
    label: string;
    mutate: (candidate: GeneratedCreativeDraft) => void;
    unitOrder?: number;
  }> = [
    {
      label: "caption",
      mutate: (candidate) => {
        candidate.caption =
          "Los ingresos semanales aumentaron 3.4% year-over-year.";
      },
    },
    {
      label: "headline",
      mutate: (candidate) => {
        candidate.units[0]!.headline = "Las vacantes edged up";
      },
      unitOrder: 1,
    },
    {
      label: "body",
      mutate: (candidate) => {
        candidate.units[0]!.body =
          "En junio, las vacantes edged up hasta 509,100.";
      },
      unitOrder: 1,
    },
  ];

  cases.forEach(({ label, mutate, unitOrder }) => {
    const candidate = structuredClone(spanishBase);
    mutate(candidate);

    assert.deepEqual(
      visibleDraftLanguageIssues(candidate, "español").map((issue) => ({
        code: issue.code,
        unitOrder: issue.unitOrder,
      })),
      [{ code: "MIXED_LANGUAGE", unitOrder }],
      label,
    );
  });
});

test("does not flag common English loanwords in otherwise Spanish copy", () => {
  const spanishWithLoanwords: GeneratedCreativeDraft = {
    ...draft,
    concept: "Software para pequeñas empresas",
    caption:
      "Una startup canadiense usa software de marketing para organizar su trabajo.",
    altText: "Carrusel sobre una plataforma de software.",
    units: draft.units.map((unit, index) => ({
      ...unit,
      headline: "Tecnología para equipos canadienses",
      body: "La empresa combina software y edge computing.",
      ...(index === draft.units.length - 1
        ? { ctaQuestion: "¿Usas una herramienta similar?" }
        : { ctaQuestion: undefined }),
    })),
  };

  assert.deepEqual(
    visibleDraftLanguageIssues(spanishWithLoanwords, "español"),
    [],
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

test("does not keep a stale unsupported-number review after current validation passes", () => {
  const review: CreativeQualityReview = {
    status: "rejected",
    scores: {
      factuality: 94,
      hook: 98,
      curiosity: 98,
      swipeReward: 98,
      continuity: 98,
      relevance: 98,
      clarity: 98,
      resolution: 98,
      cta: 98,
      overall: 87,
    },
    issues: [
      {
        code: "UNSUPPORTED_NUMBER",
        severity: "blocker",
        unitOrder: 1,
        message: "Slide 1 uses 218% without support from its selected facts.",
      },
    ],
    repairPasses: 2,
  };

  assert.equal(
    creativeQualityReviewHasUnresolvedBlockers(review, []),
    false,
  );
  assert.equal(
    creativeQualityReviewHasUnresolvedBlockers(review, [
      {
        code: "UNSUPPORTED_NUMBER",
        severity: "blocker",
        unitOrder: 1,
        message: "Slide 1 uses 21.9% without support from its selected facts.",
      },
    ]),
    true,
  );
});

test("does not reject copy for an unsupported number reported only by the critic", () => {
  const review = buildCreativeQualityReview({
    draft: repairDeterministicCreativeCopy(
      draft,
      "carousel",
      facts,
      "English",
    ),
    format: "carousel",
    scores: {
      factuality: 99,
      hook: 99,
      curiosity: 99,
      swipeReward: 99,
      continuity: 99,
      relevance: 99,
      clarity: 99,
      resolution: 99,
      cta: 99,
      overall: 99,
    },
    criticIssues: [
      {
        code: "UNSUPPORTED_NUMBER",
        severity: "blocker",
        unitOrder: 1,
        message: "The critic could not match a localized number.",
      },
    ],
    repairPasses: 1,
    keyFacts: facts,
  });

  assert.equal(review.status, "accepted");
  assert.ok(
    review.issues.some(
      (issue) =>
        issue.code === "CRITIC_VALIDATOR_DISAGREEMENT" &&
        issue.severity === "warning" &&
        issue.unitOrder === 1,
    ),
  );
});

test("requires explicit acknowledgement for unresolved automated review notes", () => {
  const review: CreativeQualityReview = {
    status: "rejected",
    scores: {
      factuality: 100,
      hook: 72,
      curiosity: 70,
      swipeReward: 100,
      continuity: 100,
      relevance: 100,
      clarity: 100,
      resolution: 100,
      cta: 100,
      overall: 80,
    },
    issues: [
      {
        code: "QUALITY_HOOK_BELOW_THRESHOLD",
        severity: "blocker",
        message: "Hook scored 72; the minimum is 90.",
      },
    ],
    repairPasses: 1,
  };

  assert.deepEqual(
    getCreativeDraftApprovalState({
      deterministicIssues: [],
      qualityReview: review,
      qualityReviewIsCurrent: true,
    }),
    {
      blockers: [],
      requiresHumanReviewAcknowledgement: true,
    },
  );
  assert.deepEqual(
    getCreativeDraftApprovalState({
      deterministicIssues: [
        {
          code: "UNSUPPORTED_INFERENCE",
          severity: "blocker",
          message: "The headline needs a supported claim.",
        },
      ],
      qualityReview: review,
      qualityReviewIsCurrent: true,
    }),
    {
      blockers: [
        {
          code: "UNSUPPORTED_INFERENCE",
          severity: "blocker",
          message: "The headline needs a supported claim.",
        },
      ],
      requiresHumanReviewAcknowledgement: false,
    },
  );
});

test("treats weak editorial scores as repair signals instead of factual blockers", () => {
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
  assert.ok(failures.every((issue) => issue.severity === "warning"));
});

test("accepts a factually safe draft after one editorial rewrite despite subjective score misses", () => {
  const factuallySafeDraft = repairDeterministicCreativeCopy(
    draft,
    "carousel",
    facts,
    "English",
  );
  const scores = {
    factuality: 98,
    hook: 84,
    curiosity: 82,
    swipeReward: 84,
    continuity: 85,
    relevance: 92,
    clarity: 91,
    resolution: 83,
    cta: 80,
    overall: 86,
  };

  const initial = buildCreativeQualityReview({
    draft: factuallySafeDraft,
    format: "carousel",
    scores,
    criticIssues: [],
    repairPasses: 0,
    keyFacts: facts,
  });
  const afterRewrite = buildCreativeQualityReview({
    draft: factuallySafeDraft,
    format: "carousel",
    scores,
    criticIssues: [
      {
        code: "WEAK_HOOK",
        severity: "blocker",
        message: "The hook could be stronger.",
      },
    ],
    repairPasses: 1,
    keyFacts: facts,
  });

  assert.equal(initial.status, "needs-repair");
  assert.equal(afterRewrite.status, "accepted");
  assert.equal(
    afterRewrite.issues.find((issue) => issue.code === "WEAK_HOOK")?.severity,
    "warning",
  );
});

test("does not block on a low factuality score without a concrete factual issue", () => {
  const review = buildCreativeQualityReview({
    draft: repairDeterministicCreativeCopy(
      draft,
      "carousel",
      facts,
      "English",
    ),
    format: "carousel",
    scores: {
      factuality: 70,
      hook: 94,
      curiosity: 92,
      swipeReward: 92,
      continuity: 92,
      relevance: 94,
      clarity: 94,
      resolution: 92,
      cta: 92,
      overall: 94,
    },
    criticIssues: [],
    repairPasses: 1,
    keyFacts: facts,
  });

  assert.equal(review.status, "accepted");
  assert.equal(
    review.issues.find(
      (issue) => issue.code === "QUALITY_FACTUALITY_BELOW_THRESHOLD",
    )?.severity,
    "warning",
  );
});
