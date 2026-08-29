import assert from "node:assert/strict";
import test from "node:test";

import type {
  CreativeKeyFact,
  CreativeUnit,
  GeneratedCreativeBrief,
  GeneratedCreativeDraft,
} from "./creative-content.types";
import {
  deterministicBriefFactQualityIssues,
  deterministicFactQualityIssues,
  repairDeterministicBriefScope,
  repairDeterministicFactCopy,
} from "./creative-fact-guard";
import { visibleDraftLanguageIssues } from "./creative-quality";

const keyFacts: CreativeKeyFact[] = [
  {
    id: "fact-1",
    statement:
      "Over one-third of web pages published after ChatGPT's release show signs of AI authorship, according to Pew Research.",
    requiredQualifiers: ["over one-third", "show signs", "according to"],
    attribution: "Pew Research",
  },
  {
    id: "fact-2",
    statement:
      "Researchers analyzed nearly 500,000 English-language pages from the past five years.",
    requiredQualifiers: ["nearly"],
    attribution: "Pew Research",
  },
  {
    id: "fact-3",
    statement:
      "Open Pangram was used to detect pages likely written or heavily edited with AI.",
    requiredQualifiers: ["likely"],
    attribution: "Open Pangram",
  },
  {
    id: "fact-4",
    statement:
      "A July 2026 random sample of 10,000 pages found about 10% with significant AI-authorship signs.",
    requiredQualifiers: ["about", "significant signs"],
    attribution: "Pew Research",
  },
  {
    id: "fact-5",
    statement:
      "The one-third figure applies only to pages published after ChatGPT's release, while the random sample includes older pages.",
    requiredQualifiers: ["only", "includes older pages"],
    attribution: "Pew Research",
  },
  {
    id: "fact-6",
    statement:
      "Cloudflare reported that bot web traffic had overtaken human web traffic.",
    requiredQualifiers: ["reported"],
    attribution: "Cloudflare",
  },
];

const draft: GeneratedCreativeDraft = {
  concept: "AI authorship on the web",
  caption: "More than 33% of new web pages are AI-generated.",
  hashtags: [],
  altText: "Five slides about detected AI authorship signals.",
  units: [
    unit(1, "cover", "hook", "Over One-Third of New Web Pages Are AI-Generated", "Pew Research finds that after ChatGPT's launch, more than 33% of recently published pages show AI authorship signs.", ["fact-1"]),
    unit(2, "content", "explain", "How the Study Was Done", "Researchers scanned ~500,000 English pages from the past five years using Common Crawl and Open Pangram to detect AI signatures.", ["fact-2", "fact-3"]),
    unit(3, "content", "prove", "Evidence From Random Samples", "A July 2026 sample of 10,000 pages revealed about 10% with significant AI authorship signs, confirming the trend.", ["fact-4", "fact-5"]),
    unit(4, "content", "impact", "Why It Matters", "This aligns with Cloudflare's report that bot traffic now exceeds human traffic—changing how we find and trust information.", ["fact-6"]),
    unit(5, "conclusion", "conclude", "The takeaway?", undefined, ["fact-1"]),
  ],
};

test("detects certainty, scope, inference, and empty-conclusion blockers", () => {
  const codes = new Set(
    deterministicFactQualityIssues(draft, keyFacts).map((issue) => issue.code),
  );

  assert.ok(codes.has("CERTAINTY_UPGRADE"));
  assert.ok(codes.has("MISSING_SCOPE"));
  assert.ok(codes.has("UNSUPPORTED_INFERENCE"));
  assert.ok(codes.has("EMPTY_CONCLUSION"));
});

test("repairs safe factual defects without inventing new claims", () => {
  const repaired = repairDeterministicFactCopy(draft, keyFacts);

  assert.match(repaired.caption, /show signs of AI authorship/iu);
  assert.match(repaired.caption, /pages published after ChatGPT's release/iu);
  assert.doesNotMatch(repaired.caption, /\bscope\s*:/iu);
  assert.match(repaired.units[0].headline, /show signs of AI authorship/iu);
  assert.doesNotMatch(repaired.units[0].body ?? "", /\bscope\s*:/iu);
  assert.doesNotMatch(repaired.units[2].body ?? "", /confirming the trend/iu);
  assert.match(repaired.units[2].body ?? "", /includes older pages/iu);
  assert.doesNotMatch(repaired.units[3].body ?? "", /changing how/iu);
  assert.match(repaired.units[4].body ?? "", /signals—not certainty/iu);
  assert.deepEqual(
    deterministicFactQualityIssues(repaired, keyFacts).filter(
      (issue) => issue.severity === "blocker",
    ),
    [],
  );
});

test("blocks unsupported interpretive framing", () => {
  const interpretiveDraft: GeneratedCreativeDraft = {
    ...draft,
    units: draft.units.map((current) =>
      current.order === 4
        ? {
            ...current,
            headline: "Widespread Impact",
            body: "Cloudflare reported that bot traffic exceeded human traffic, suggesting the reach extends beyond commercial interests.",
          }
        : current,
    ),
  };

  assert.ok(
    deterministicFactQualityIssues(interpretiveDraft, keyFacts).some(
      (issue) =>
        issue.code === "UNSUPPORTED_INFERENCE" && issue.unitOrder === 4,
    ),
  );
});

test("accepts roughly one-third and since-launch as a cautious rendering of 35%", () => {
  const exactFact: CreativeKeyFact = {
    id: "fact-1",
    statement:
      "Pew Research found that 35% of web pages published after ChatGPT’s November 2022 launch show significant signs of AI authorship.",
    attribution: "Pew Research",
  };
  const cautiousDraft: GeneratedCreativeDraft = {
    concept: "AI authorship signals",
    caption:
      "Since ChatGPT launched, roughly one-third of web pages have shown AI-authorship signals.",
    hashtags: [],
    altText: "A graphic about detected AI-authorship signals.",
    units: [
      unit(
        1,
        "cover",
        "hook",
        "AI-authorship signals on the web",
        "Since ChatGPT launched, roughly one-third of web pages have shown signs of AI authorship.",
        ["fact-1"],
      ),
    ],
  };

  const codes = deterministicFactQualityIssues(cautiousDraft, [exactFact]).map(
    (issue) => issue.code,
  );
  assert.ok(!codes.includes("UNSUPPORTED_NUMBER"));
  assert.ok(!codes.includes("MISSING_SCOPE"));
});

test("repairs AI-written certainty upgrades that use a non-breaking hyphen", () => {
  const unicodeDraft: GeneratedCreativeDraft = {
    ...draft,
    units: draft.units.map((current) =>
      current.order === 5
        ? {
            ...current,
            body: "AI-written content is becoming common.",
            ctaQuestion: "Is the rise of AI‑written pages a problem?",
          }
        : current,
    ),
  };

  const repaired = repairDeterministicFactCopy(unicodeDraft, keyFacts);
  assert.doesNotMatch(
    `${repaired.units[4].body} ${repaired.units[4].ctaQuestion}`,
    /ai[-‐‑‒–— ]written/iu,
  );
});

test("normalizes sentence punctuation in persisted allowed numbers", () => {
  const publicationFact: CreativeKeyFact = {
    id: "fact-date",
    statement: "The study was published on August 24, 2026.",
    attribution: "JAMA Pediatrics",
    claimGuard: {
      certainty: "reported",
      requiredPhrases: [],
      forbiddenPhrases: [],
      scopePhrases: [],
      allowedNumbers: ["24", "2026."],
    },
  };
  const publicationDraft: GeneratedCreativeDraft = {
    concept: "Study publication",
    caption: "A newly published study.",
    hashtags: [],
    altText: "A slide about a published study.",
    units: [
      unit(
        1,
        "cover",
        "hook",
        "Published in 2026",
        "The study was published on August 24, 2026.",
        ["fact-date"],
      ),
    ],
  };

  assert.ok(
    !deterministicFactQualityIssues(publicationDraft, [publicationFact]).some(
      (issue) => issue.code === "UNSUPPORTED_NUMBER",
    ),
  );
});

test("accepts a numeric ordinal when the selected fact spells it out", () => {
  const dueDateFact: CreativeKeyFact = {
    id: "fact-due-date",
    statement:
      "The due date is calculated from the first day of the last menstrual period.",
    attribution: "INSPQ",
  };
  const dueDateDraft: GeneratedCreativeDraft = {
    concept: "Pregnancy timeline",
    caption: "A practical explanation of the pregnancy timeline.",
    hashtags: [],
    altText: "A calendar explaining how a pregnancy due date is calculated.",
    units: [
      unit(
        1,
        "content",
        "explain",
        "The secret of day 1",
        "The due date is calculated from the first day of the last menstrual period.",
        ["fact-due-date"],
      ),
    ],
  };

  assert.ok(
    !deterministicFactQualityIssues(dueDateDraft, [dueDateFact]).some(
      (issue) => issue.code === "UNSUPPORTED_NUMBER",
    ),
  );
});

test("accepts numeric ratios translated from verbal source ratios", () => {
  const probabilityFact: CreativeKeyFact = {
    id: "fact-probability",
    statement:
      "There is a one in four chance at age 20 and a one in twenty chance at age 40.",
    attribution: "INSPQ",
  };
  const probabilityDraft: GeneratedCreativeDraft = {
    concept: "Probabilidad por edad",
    caption: "Una comparación respaldada por la fuente.",
    hashtags: [],
    altText: "Comparación de probabilidades.",
    units: [
      unit(
        1,
        "content",
        "prove",
        "Probabilidad por edad",
        "La probabilidad es de 1 en 4 a los 20 años y de 1 en 20 a los 40 años.",
        ["fact-probability"],
      ),
    ],
  };

  assert.equal(
    deterministicFactQualityIssues(probabilityDraft, [probabilityFact]).some(
      (issue) => issue.code === "UNSUPPORTED_NUMBER",
    ),
    false,
  );
});

test("recognizes cardinal words and common verbal fractions", () => {
  const facts: CreativeKeyFact[] = [
    {
      id: "fact-pillars",
      statement: "The workflow has six foundations.",
      attribution: "Source",
    },
    {
      id: "fact-time",
      statement: "Workers waste a quarter of their workweek.",
      attribution: "Source",
    },
  ];
  const draft: GeneratedCreativeDraft = {
    concept: "Workflow",
    caption: "The workflow has 6 foundations.",
    hashtags: [],
    altText: "A workflow diagram.",
    units: [
      unit(1, "cover", "hook", "Workflow cost", "Workers waste 25% of their workweek.", ["fact-time"]),
    ],
  };

  assert.equal(
    deterministicFactQualityIssues(draft, facts).some(
      (issue) => issue.code === "UNSUPPORTED_NUMBER",
    ),
    false,
  );
});

test("repairs mixed-language estimates and unsupported Spanish synthesis", () => {
  const pregnancyFacts: CreativeKeyFact[] = [
    {
      id: "fact-1",
      statement: "Fertilization marks the beginning of pregnancy.",
      attribution: "INSPQ",
    },
    {
      id: "fact-2",
      statement: "Pregnancy lasts about 40 weeks, or roughly 9 months.",
      requiredQualifiers: ["about"],
      attribution: "INSPQ",
    },
    {
      id: "fact-3",
      statement:
        "The due date is calculated from the first day of the last menstrual period.",
      attribution: "INSPQ",
    },
  ];
  const pregnancyDraft: GeneratedCreativeDraft = {
    concept: "Calendario del embarazo",
    caption: "Tres referencias para entender el calendario del embarazo.",
    hashtags: [],
    altText: "Carrusel sobre la duración y el cálculo del embarazo.",
    units: [
      unit(
        1,
        "cover",
        "hook",
        "Paso a paso hacia tu embarazo",
        "La fecundación marca el comienzo.",
        ["fact-1"],
      ),
      unit(
        2,
        "content",
        "explain",
        "¿Cómo avanza la gestación?",
        "Tu viaje dura, en promedio, poco más de about 9 meses. Es lo que popularmente se conoce como un año gestacional.",
        ["fact-2"],
      ),
      unit(
        3,
        "content",
        "impact",
        "El secreto del día 1",
        "La fecha se calcula desde el primer día de la última menstruación. Esto anticipa tu calendario de cuidados.",
        ["fact-3"],
      ),
      {
        ...unit(
          4,
          "call-to-action",
          "debate",
          "Planificar el cuidado",
          "Entender las etapas te permite anticipar necesidades físicas y emocionales.",
          ["fact-1"],
        ),
        ctaQuestion:
          "¿Cuál es la mejor manera de usar esta información para planificar el cuidado del bebé?",
      },
    ],
  };

  const repaired = repairDeterministicFactCopy(
    pregnancyDraft,
    pregnancyFacts,
    "español",
  );

  assert.match(repaired.units[1]?.body ?? "", /aproximadamente 9 meses/iu);
  assert.doesNotMatch(repaired.units[1]?.body ?? "", /\babout\b|año gestacional/iu);
  assert.doesNotMatch(repaired.units[2]?.body ?? "", /anticipa.*cuidados/iu);
  assert.equal(repaired.units[3]?.body, undefined);
  assert.match(repaired.units[3]?.ctaQuestion ?? "", /planificar/iu);
  assert.deepEqual(
    deterministicFactQualityIssues(repaired, pregnancyFacts).filter(
      (issue) => issue.severity === "blocker",
    ),
    [],
  );
});

test("adds the uniquely supporting fact when a slide cites its numbers", () => {
  const facts: CreativeKeyFact[] = [
    {
      id: "fact-1",
      statement: "Sperm can live 72 to 120 hours.",
      attribution: "Source",
      claimGuard: {
        certainty: "asserted",
        requiredPhrases: [],
        forbiddenPhrases: [],
        scopePhrases: [],
        allowedNumbers: ["72", "120"],
      },
    },
    {
      id: "fact-2",
      statement: "The chance is one in four at age 20 and one in twenty at age 40.",
      attribution: "Source",
      claimGuard: {
        certainty: "asserted",
        requiredPhrases: [],
        forbiddenPhrases: [],
        scopePhrases: [],
        allowedNumbers: ["20", "40"],
      },
    },
  ];
  const draft: GeneratedCreativeDraft = {
    concept: "Fertility timing",
    caption: "Biological timing",
    hashtags: [],
    altText: "A fertility carousel",
    units: [{
      type: "carousel-slide",
      order: 1,
      role: "content",
      editorialGoal: "impact",
      viewerQuestion: "How does age affect probability?",
      headline: "Probability by age",
      body: "The comparison uses ages 20 and 40.",
      visualDirection: "A simple comparison.",
      factIds: ["fact-1"],
      assetRequest: "typography-only",
      aspectRatio: "4:5",
      characterIds: [],
    }],
  };

  const repaired = repairDeterministicFactCopy(draft, facts, "espanol");

  assert.deepEqual(repaired.units[0]?.factIds, ["fact-1", "fact-2"]);
  assert.equal(
    deterministicFactQualityIssues(repaired, facts).some(
      (issue) => issue.code === "UNSUPPORTED_NUMBER",
    ),
    false,
  );
});

test("blocks English visible copy when the profile language is Spanish", () => {
  const draft: GeneratedCreativeDraft = {
    concept: "Ventana fértil",
    caption: "Una explicación del ciclo menstrual.",
    hashtags: [],
    altText: "Carrusel sobre fertilidad.",
    units: [{
      type: "carousel-slide",
      order: 1,
      role: "content",
      editorialGoal: "explain",
      viewerQuestion: "¿Cómo se estima la ovulación?",
      headline: "Cálculo de la ovulación",
      body: "To estimate when you will ovulate, count backwards 14 days from the end of your menstrual cycle.",
      visualDirection: "Calendar illustration",
      factIds: ["fact-1"],
      assetRequest: "typography-only",
      aspectRatio: "4:5",
      characterIds: [],
    }],
  };

  assert.deepEqual(
    visibleDraftLanguageIssues(draft, "espanol").map((issue) => issue.code),
    ["MIXED_LANGUAGE"],
  );
});

test("does not treat carousel slide counts as factual claims", () => {
  const fact: CreativeKeyFact = {
    id: "fact-1",
    statement: "The source describes a biological process.",
    attribution: "Source",
  };
  const draft: GeneratedCreativeDraft = {
    concept: "Proceso biológico",
    caption: "Una explicación respaldada por la fuente.",
    hashtags: [],
    altText: "Carrusel educativo de 5 diapositivas sobre el proceso.",
    units: [unit(1, "cover", "hook", "Proceso biológico", "Información respaldada.", ["fact-1"])],
  };

  assert.equal(
    deterministicFactQualityIssues(draft, [fact]).some(
      (issue) => issue.code === "UNSUPPORTED_NUMBER",
    ),
    false,
  );
});

test("rejects a brief that promises pregnancy stages absent from its facts", () => {
  const brief: GeneratedCreativeBrief = {
    recommendedFormat: "carousel",
    fallbackFormat: "meme",
    formatScores: [
      { format: "carousel", score: 90, reason: "Needs explanation." },
      { format: "meme", score: 40, reason: "Too little depth." },
    ],
    confidence: 90,
    targetAudience: "Madres primerizas",
    keyMessage:
      "El embarazo avanza por etapas con cambios físicos y emocionales que preparan a los padres.",
    angle: "Explicar las etapas con consejos prácticos.",
    hook: "¿Conoces las tres etapas de tu embarazo?",
    tone: {
      primary: "informative",
      energy: 60,
      humor: 0,
      reason: "Tema educativo.",
    },
    contentSufficiency: "sufficient",
    keyFacts: [
      {
        id: "fact-1",
        statement: "Fertilization marks the beginning of pregnancy.",
      },
      {
        id: "fact-2",
        statement: "Pregnancy lasts about 40 weeks, or roughly 9 months.",
        requiredQualifiers: ["about"],
      },
      {
        id: "fact-3",
        statement:
          "The due date is calculated from the first day of the last menstrual period.",
      },
    ],
    carouselPlan: {
      slideCount: 3,
      rationale: "Hook, explanation, conclusion.",
      slides: [
        {
          editorialGoal: "hook",
          viewerQuestion: "¿Conoces las tres etapas del embarazo?",
          allowedFactIds: ["fact-1"],
        },
        {
          editorialGoal: "explain",
          viewerQuestion: "¿Cuánto dura aproximadamente?",
          allowedFactIds: ["fact-2"],
        },
        {
          editorialGoal: "conclude",
          viewerQuestion: "¿Cómo se calcula la fecha probable de parto?",
          allowedFactIds: ["fact-3"],
        },
      ],
    },
    riskFlags: [],
    suggestedConcepts: [
      {
        format: "carousel",
        title: "Las etapas del embarazo",
        concept: "Consejos prácticos para cada etapa.",
      },
      {
        format: "meme",
        title: "Calendario",
        concept: "Una referencia sobre la duración.",
      },
    ],
  };

  const issues = deterministicBriefFactQualityIssues(brief);
  assert.ok(issues.some((issue) => issue.code === "UNSUPPORTED_BRIEF_SCOPE"));
});

test("does not treat editorial ordinals in a brief as factual statistics", () => {
  const brief: GeneratedCreativeBrief = {
    recommendedFormat: "carousel",
    fallbackFormat: "meme",
    formatScores: [
      { format: "carousel", score: 80, reason: "First choice." },
      { format: "meme", score: 60, reason: "Second choice." },
    ],
    confidence: 80,
    targetAudience: "Parents",
    keyMessage: "A first look at fertilization.",
    angle: "Use a second explanatory beat.",
    hook: "First things first: fertilization begins pregnancy.",
    tone: {
      primary: "informative",
      energy: 50,
      humor: 0,
      reason: "Clear explanation.",
    },
    contentSufficiency: "limited",
    keyFacts: [
      {
        id: "fact-1",
        statement: "Fertilization marks the beginning of pregnancy.",
      },
    ],
    riskFlags: [],
    suggestedConcepts: [
      {
        format: "carousel",
        title: "First look",
        concept: "A concise explanation.",
      },
      {
        format: "meme",
        title: "Second option",
        concept: "A fourth editorial treatment.",
      },
    ],
  };

  assert.ok(
    !deterministicBriefFactQualityIssues(brief).some(
      (issue) => issue.code === "UNSUPPORTED_NUMBER",
    ),
  );
});

test("does not treat carousel structure numbers as factual statistics", () => {
  const brief: GeneratedCreativeBrief = {
    recommendedFormat: "carousel",
    fallbackFormat: "meme",
    formatScores: [
      { format: "carousel", score: 80, reason: "Use a 3-slide carousel." },
      { format: "meme", score: 60, reason: "Fallback." },
    ],
    confidence: 80,
    targetAudience: "Parents",
    keyMessage: "Fertilization marks the beginning of pregnancy.",
    angle: "A source-supported explanation.",
    hook: "Fertilization marks the beginning of pregnancy.",
    tone: {
      primary: "informative",
      energy: 50,
      humor: 0,
      reason: "Clear explanation.",
    },
    contentSufficiency: "limited",
    keyFacts: [
      {
        id: "fact-1",
        statement: "Fertilization marks the beginning of pregnancy.",
      },
    ],
    riskFlags: [],
    suggestedConcepts: [
      {
        format: "carousel",
        title: "3-slide carousel",
        concept: "Explain the source-supported finding.",
      },
      {
        format: "meme",
        title: "Source finding",
        concept: "Fertilization marks the beginning of pregnancy.",
      },
    ],
  };

  assert.ok(
    !deterministicBriefFactQualityIssues(brief).some(
      (issue) => issue.code === "UNSUPPORTED_NUMBER",
    ),
  );
});

test("narrows unsupported brief strategy to verified facts", () => {
  const brief: GeneratedCreativeBrief = {
    recommendedFormat: "carousel",
    fallbackFormat: "meme",
    formatScores: [
      { format: "carousel", score: 80, reason: "Educational sequence." },
      { format: "meme", score: 60, reason: "Less context." },
    ],
    confidence: 80,
    targetAudience: "First-time parents",
    keyMessage: "Three stages prepare parents for physical changes.",
    angle: "Practical tips for all 3 stages.",
    hook: "Do you know the 3 stages?",
    tone: {
      primary: "informative",
      energy: 50,
      humor: 0,
      reason: "Clear explanation.",
    },
    contentSufficiency: "sufficient",
    keyFacts: [
      {
        id: "fact-1",
        statement: "Pregnancy lasts about 40 weeks.",
        requiredQualifiers: ["about"],
      },
    ],
    carouselPlan: {
      slideCount: 3,
      rationale: "Hook, explanation, conclusion.",
      slides: [
        {
          editorialGoal: "hook",
          viewerQuestion: "What are the 3 stages?",
          allowedFactIds: ["fact-1"],
        },
        {
          editorialGoal: "explain",
          viewerQuestion: "What does the source establish?",
          allowedFactIds: ["fact-1"],
        },
        {
          editorialGoal: "conclude",
          viewerQuestion: "What does the source establish?",
          allowedFactIds: ["fact-1"],
        },
      ],
    },
    riskFlags: [],
    suggestedConcepts: [
      {
        format: "carousel",
        title: "3 stages",
        concept: "Practical advice for physical and emotional changes.",
      },
      {
        format: "meme",
        title: "40 weeks",
        concept: "Pregnancy lasts about 40 weeks.",
      },
    ],
  };

  const repaired = repairDeterministicBriefScope(brief);

  assert.equal(repaired.contentSufficiency, "limited");
  assert.equal(repaired.hook, "Pregnancy lasts about 40 weeks.");
  assert.equal(
    repaired.carouselPlan?.slides[0]?.viewerQuestion,
    "What does the source establish here?",
  );
  assert.deepEqual(deterministicBriefFactQualityIssues(repaired), []);
});

test("requires every generated fact to cite evidence present in the source", () => {
  const source =
    "Pregnancy lasts about 40 weeks, or roughly 9 months. The estimated due date is calculated from the first day of the last menstrual period.";
  const grounded: GeneratedCreativeBrief = {
    recommendedFormat: "carousel",
    fallbackFormat: "meme",
    formatScores: [
      { format: "carousel", score: 80, reason: "Two facts to explain." },
      { format: "meme", score: 50, reason: "Less explanatory space." },
    ],
    confidence: 85,
    targetAudience: "Expecting parents",
    keyMessage: "Pregnancy lasts about 40 weeks.",
    angle: "Explain pregnancy duration.",
    hook: "How long does pregnancy last?",
    tone: {
      primary: "informative",
      energy: 50,
      humor: 0,
      reason: "Clear health education.",
    },
    contentSufficiency: "limited",
    keyFacts: [
      {
        id: "fact-1",
        statement: "Pregnancy lasts about 40 weeks, or roughly 9 months.",
        sourceExcerpt:
          "Pregnancy lasts about 40 weeks, or roughly 9 months.",
        requiredQualifiers: ["about"],
      },
    ],
    riskFlags: [],
    suggestedConcepts: [
      {
        format: "carousel",
        title: "Pregnancy duration",
        concept: "Explain the reported duration.",
      },
      {
        format: "meme",
        title: "40 weeks",
        concept: "Highlight the approximate duration.",
      },
    ],
  };

  assert.ok(
    !deterministicBriefFactQualityIssues(grounded, source).some((issue) =>
      [
        "MISSING_SOURCE_EVIDENCE",
        "SOURCE_EVIDENCE_NOT_FOUND",
        "FACT_NUMBER_NOT_IN_EVIDENCE",
      ].includes(issue.code),
    ),
  );

  const inventedEvidence: GeneratedCreativeBrief = {
    ...grounded,
    keyFacts: grounded.keyFacts.map((fact) => ({
      ...fact,
      sourceExcerpt: "Pregnancy always lasts exactly 42 weeks.",
    })),
  };
  assert.ok(
    deterministicBriefFactQualityIssues(inventedEvidence, source).some(
      (issue) => issue.code === "SOURCE_EVIDENCE_NOT_FOUND",
    ),
  );
});

test("accepts a causal phrase when the selected fact explicitly supports it", () => {
  const workflowFact: CreativeKeyFact = {
    id: "fact-workflow",
    statement:
      "Figma's VP of Product describes the expanded scope of work as leading to collapsed workflows.",
    attribution: "Figma VP of Product",
    requiredQualifiers: ["describes", "as leading to"],
  };
  const workflowDraft: GeneratedCreativeDraft = {
    concept: "Collapsed workflows",
    caption: "A carousel about changing product workflows.",
    hashtags: [],
    altText: "A carousel about product workflows.",
    units: [
      unit(
        1,
        "cover",
        "hook",
        "Collapsed workflows",
        "The expansion of tasks leads to collapsed workflows.",
        ["fact-workflow"],
      ),
    ],
  };

  assert.ok(
    !deterministicFactQualityIssues(workflowDraft, [workflowFact]).some(
      (issue) => issue.code === "UNSUPPORTED_INFERENCE",
    ),
  );
});

function unit(
  order: number,
  role: CreativeUnit["role"],
  editorialGoal: NonNullable<CreativeUnit["editorialGoal"]>,
  headline: string,
  body: string | undefined,
  factIds: string[],
): CreativeUnit {
  return {
    order,
    type: "carousel-slide",
    role,
    editorialGoal,
    viewerQuestion: "What does this slide establish?",
    headline,
    ...(body ? { body } : {}),
    visualDirection: "Editorial infographic with concise supporting visuals.",
    factIds,
    assetRequest: "generated-image",
    aspectRatio: "4:5",
    characterIds: [],
  };
}
