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
  withCreativeFactClaimGuard,
} from "./creative-fact-guard";
import {
  repairDeterministicCreativeCopy,
  visibleDraftLanguageIssues,
} from "./creative-quality";
import { blockingCarouselNarrativeIssues } from "./carousel-narrative";

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

test("removes unsupported numeric publishing copy before editorial review", () => {
  const supportedFacts: CreativeKeyFact[] = [
    {
      id: "fact-supported",
      statement: "The report found that 60% of respondents completed the survey.",
      sourceExcerpt:
        "The report found that 60% of respondents completed the survey.",
    },
  ];
  const leakingDraft: GeneratedCreativeDraft = {
    concept: "Survey completion",
    caption: "Completion ranged from 15%, to 25%, to 50%.",
    callToAction: "Follow after comparing 15%, 25%, and 50%.",
    hashtags: [],
    altText: "A chart showing 15%, 25%, and 50% completion.",
    units: [
      unit(
        1,
        "cover",
        "hook",
        "Survey completion",
        "The report found that 60% of respondents completed the survey. It also compares 15%, 25%, and 50%.",
        ["fact-supported"],
      ),
    ],
  };

  const repaired = repairDeterministicFactCopy(
    leakingDraft,
    supportedFacts,
    "English",
  );

  assert.equal(repaired.callToAction, undefined);
  assert.equal(
    deterministicFactQualityIssues(repaired, supportedFacts).some(
      (issue) => issue.code === "UNSUPPORTED_NUMBER",
    ),
    false,
  );
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

test("removes an unsupported wealth inference from an income comparison", () => {
  const housingFact: CreativeKeyFact = {
    id: "fact-1",
    statement:
      "In 2023, repeat home buyers had higher median family incomes than first-time buyers in the reported jurisdictions except British Columbia.",
    sourceExcerpt:
      "The median family income of first-time home buyers was lower than that of repeat buyers in all jurisdictions with available data except British Columbia.",
    attribution: "Statistics Canada",
  };
  const housingDraft: GeneratedCreativeDraft = {
    concept: "Ingresos de compradores de vivienda",
    caption: "Una comparación de ingresos familiares medianos.",
    hashtags: [],
    altText: "Carrusel que compara ingresos de compradores.",
    units: [
      unit(
        1,
        "conclusion",
        "conclude",
        "Entrar al mercado exige competir con años de patrimonio previo",
        "Los compradores recurrentes tuvieron ingresos familiares medianos más altos, salvo en Columbia Británica.",
        ["fact-1"],
      ),
    ],
  };

  assert.ok(
    deterministicFactQualityIssues(housingDraft, [housingFact]).some(
      (issue) => issue.code === "UNSUPPORTED_INFERENCE",
    ),
  );
  const repaired = repairDeterministicFactCopy(
    housingDraft,
    [housingFact],
    "español",
  );
  assert.equal(repaired.units[0]?.headline, "Lo que muestran los datos");
  assert.ok(
    !deterministicFactQualityIssues(repaired, [housingFact]).some(
      (issue) => issue.code === "UNSUPPORTED_INFERENCE",
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

test("accepts Spanish month-year scope for an English source fact", () => {
  const payrollFact: CreativeKeyFact = {
    id: "fact-payroll",
    statement:
      "There were 2.9 unemployed persons for every job vacancy in June 2026, down from 3.1 in June 2025.",
    sourceExcerpt:
      "There were 2.9 unemployed persons for every job vacancy in June 2026, down from 3.1 in June 2025.",
    requiredQualifiers: ["in June 2026"],
    attribution: "Statistics Canada",
  };
  const spanishDraft: GeneratedCreativeDraft = {
    concept: "Vacantes de empleo en Canadá",
    caption: "Una comparación del mercado laboral canadiense.",
    hashtags: [],
    altText: "Gráfico sobre personas desempleadas y vacantes.",
    units: [
      unit(
        1,
        "cover",
        "hook",
        "2.9 personas desempleadas por vacante",
        "En junio de 2026 hubo 2.9 personas desempleadas por vacante, frente a 3.1 en junio de 2025.",
        ["fact-payroll"],
      ),
    ],
  };

  assert.ok(
    !deterministicFactQualityIssues(spanishDraft, [payrollFact]).some(
      (issue) => issue.code === "MISSING_SCOPE",
    ),
  );
});

test("repairs a missing English month-year scope in Spanish copy", () => {
  const payrollFact: CreativeKeyFact = {
    id: "fact-payroll",
    statement:
      "There were 2.9 unemployed persons for every job vacancy in June 2026.",
    sourceExcerpt:
      "There were 2.9 unemployed persons for every job vacancy in June 2026.",
    requiredQualifiers: ["in June 2026"],
    attribution: "Statistics Canada",
  };
  const spanishDraft: GeneratedCreativeDraft = {
    concept: "Vacantes de empleo en Canada",
    caption: "En junio hubo 2.9 personas desempleadas por vacante.",
    hashtags: [],
    altText: "Grafico sobre personas desempleadas y vacantes.",
    units: [
      unit(
        1,
        "cover",
        "hook",
        "2.9 personas desempleadas por vacante",
        "En junio hubo 2.9 personas desempleadas por vacante.",
        ["fact-payroll"],
      ),
    ],
  };

  const repaired = repairDeterministicFactCopy(
    spanishDraft,
    [payrollFact],
    "espanol",
  );

  assert.match(repaired.units[0]?.body ?? "", /junio de 2026/iu);
  assert.match(repaired.caption, /junio de 2026/iu);
  assert.ok(
    !deterministicFactQualityIssues(repaired, [payrollFact]).some(
      (issue) => issue.code === "MISSING_SCOPE",
    ),
  );
});

test("allows a brief-supported calendar year as slide context", () => {
  const earningsFact: CreativeKeyFact = {
    id: "fact-earnings",
    statement: "Average weekly earnings reached $1,344 in June.",
    attribution: "Statistics Canada",
  };
  const datedVacancyFact: CreativeKeyFact = {
    id: "fact-date",
    statement: "The vacancy ratio was measured in June 2026.",
    attribution: "Statistics Canada",
  };
  const datedDraft: GeneratedCreativeDraft = {
    concept: "Mercado laboral canadiense",
    caption: "Resumen del mercado laboral de junio de 2026.",
    hashtags: [],
    altText: "Resumen del mercado laboral canadiense.",
    units: [
      unit(
        1,
        "conclusion",
        "debate",
        "Un mercado laboral mixto en 2026",
        "El promedio semanal fue de $1,344.",
        ["fact-earnings"],
      ),
    ],
  };

  const issues = deterministicFactQualityIssues(datedDraft, [
    earningsFact,
    datedVacancyFact,
  ]);
  assert.ok(
    !issues.some(
      (issue) =>
        issue.code === "UNSUPPORTED_NUMBER" && issue.unitOrder === 1,
    ),
  );
});

test("grounds localized effective dates and numeric required qualifiers", () => {
  const noticeFact: CreativeKeyFact = {
    id: "fact-notice",
    statement: "The change takes effect Jan. 1, 2027.",
    requiredQualifiers: ["Landlords must provide three months of notice."],
    attribution: "Government of British Columbia",
  };
  const localizedDraft: GeneratedCreativeDraft = {
    concept: "Cambio en el aviso de alquiler",
    caption: "La medida entra en vigor el 1 de enero de 2027.",
    hashtags: [],
    altText: "Carrusel sobre el nuevo aviso de alquiler.",
    units: [
      unit(
        1,
        "cover",
        "hook",
        "El cambio llega en enero",
        "La medida entra en vigor el 1 de enero de 2027.",
        ["fact-notice"],
      ),
      unit(
        2,
        "content",
        "explain",
        "El aviso requiere anticipación",
        "Los propietarios deben dar tres meses de aviso.",
        ["fact-notice"],
      ),
    ],
  };

  const unsupportedNumbers = deterministicFactQualityIssues(
    localizedDraft,
    [noticeFact],
  ).filter((issue) => issue.code === "UNSUPPORTED_NUMBER");

  assert.deepEqual(unsupportedNumbers, []);
  assert.deepEqual(
    withCreativeFactClaimGuard(noticeFact).claimGuard?.allowedNumbers,
    ["1", "2027", "3"],
  );
});

test("keeps an unsupported slash ratio blocked as factual copy", () => {
  const leaseFact: CreativeKeyFact = {
    id: "fact-lease",
    statement: "The policy applies to eligible residential leases.",
    attribution: "Government source",
  };
  const ratioDraft: GeneratedCreativeDraft = {
    concept: "Política de alquiler",
    caption: "Resumen de la política de alquiler.",
    hashtags: [],
    altText: "Carrusel sobre una política de alquiler.",
    units: [
      unit(
        1,
        "cover",
        "hook",
        "A quién se aplica",
        "La medida alcanza a 1/3 de los contratos.",
        ["fact-lease"],
      ),
    ],
  };

  const unsupported = deterministicFactQualityIssues(
    ratioDraft,
    [leaseFact],
  ).find(
    (issue) =>
      issue.code === "UNSUPPORTED_NUMBER" && issue.unitOrder === 1,
  );

  assert.match(unsupported?.message ?? "", /1, 3/u);
});

test("removes unsupported numbers from a closing slide instead of trapping the repair loop", () => {
  const earningsFact: CreativeKeyFact = {
    id: "fact-1",
    statement:
      "Average weekly earnings rose 3.4% year-over-year to $1,344 in June 2026.",
    sourceExcerpt:
      "Average weekly earnings rose 3.4% year-over-year to $1,344 in June 2026.",
    attribution: "Statistics Canada",
  };
  const closingDraft: GeneratedCreativeDraft = {
    concept: "Mercado laboral canadiense",
    caption: "Resumen del mercado laboral canadiense.",
    hashtags: [],
    altText: "Carrusel sobre salarios en Canadá.",
    units: [
      unit(
        1,
        "content",
        "explain",
        "El dato salarial",
        "El reporte establece el promedio semanal.",
        ["fact-1"],
      ),
      {
        ...unit(
          2,
          "conclusion",
          "debate",
          "El ingreso promedio aumentó 3.4%",
          "El promedio fue de $1,344 CAD. Dos provincias duplicaron esa cifra.",
          ["fact-1"],
        ),
        ctaQuestion: "¿Tu sector supera este promedio?",
      },
    ],
  };

  const repaired = repairDeterministicFactCopy(
    closingDraft,
    [earningsFact],
    "español",
  );
  assert.match(
    repaired.units.at(-1)?.body ?? "",
    /^El promedio fue de \$1,344 CAD\./u,
  );
  assert.doesNotMatch(repaired.units.at(-1)?.body ?? "", /dos provincias/iu);
  assert.ok(
    !deterministicFactQualityIssues(repaired, [earningsFact]).some(
      (issue) => issue.code === "UNSUPPORTED_NUMBER",
    ),
  );
});

test("normalizes Spanish estimate qualifiers around currency and signed values", () => {
  const earningsFact: CreativeKeyFact = {
    id: "fact-earnings",
    statement:
      "Average weekly earnings were up 3.4% to $1,344 in June 2026.",
    sourceExcerpt:
      "Average weekly earnings were up 3.4% to $1,344 in June 2026.",
    requiredQualifiers: ["approximately"],
    attribution: "Statistics Canada",
  };
  const malformedDraft: GeneratedCreativeDraft = {
    concept: "Ingresos semanales en Canadá",
    caption: "Datos de ingresos semanales.",
    hashtags: [],
    altText: "Gráfico de ingresos semanales.",
    units: [
      unit(
        1,
        "cover",
        "hook",
        "Ingresos semanales",
        "El promedio fue de $aproximadamente 1,344 CAD, con un avance del aproximadamente 3.4% y una variación de +aproximadamente 3.4%.",
        ["fact-earnings"],
      ),
    ],
  };

  const repaired = repairDeterministicFactCopy(
    malformedDraft,
    [earningsFact],
    "español",
  );
  const body = repaired.units[0]?.body ?? "";
  assert.match(body, /aproximadamente \$1,344 CAD/iu);
  assert.match(body, /de aproximadamente 3.4%/iu);
  assert.match(body, /aproximadamente \+3.4%/iu);
  assert.doesNotMatch(body, /[$+-]aproximadamente/iu);
});

test("moves the capital with the qualifier at the start of a sentence", () => {
  const householdFact: CreativeKeyFact = {
    id: "fact-households",
    statement: "About 40% of households notice it.",
    sourceExcerpt: "About 40% of households notice it.",
    requiredQualifiers: ["about"],
    attribution: "Source",
  };
  const build = (body: string): GeneratedCreativeDraft => ({
    concept: "Hogares en Canadá",
    caption: "Datos de hogares.",
    hashtags: [],
    altText: "Gráfico de hogares.",
    units: [
      unit(1, "content", "explain", "Titular", body, ["fact-households"]),
    ],
  });
  const repairedBody = (body: string) =>
    repairDeterministicFactCopy(build(body), [householdFact], "español")
      .units[0]?.body ?? "";

  assert.equal(
    repairedBody("El 40% de los hogares lo nota."),
    "Aproximadamente el 40% de los hogares lo nota.",
  );
  assert.equal(
    repairedBody("Lo nota el 40% de los hogares."),
    "Lo nota aproximadamente el 40% de los hogares.",
  );
  assert.equal(
    repairedBody("Del 40% depende el resultado."),
    "De aproximadamente 40% depende el resultado.",
  );
});

test("places an inserted estimate qualifier after a preposition and before an article", () => {
  const rateFact: CreativeKeyFact = {
    id: "fact-rate",
    statement:
      "Inflation was approximately 3% recently, or about 2.2% excluding gasoline.",
    sourceExcerpt:
      "Inflation was approximately 3% recently, or about 2.2% excluding gasoline.",
    requiredQualifiers: ["approximately", "about"],
    attribution: "Bank of Canada",
  };
  const rateDraft: GeneratedCreativeDraft = {
    concept: "Inflación en Canadá",
    caption: "Datos de inflación reciente.",
    hashtags: [],
    altText: "Gráfico de inflación reciente.",
    units: [
      unit(
        1,
        "content",
        "explain",
        "La inflación reciente",
        "La inflación general rondó el 3% y, sin gasolina, fue del 2.2%.",
        ["fact-rate"],
      ),
    ],
  };

  const body =
    repairDeterministicFactCopy(rateDraft, [rateFact], "español").units[0]
      ?.body ?? "";
  assert.match(body, /aproximadamente el 3%/iu);
  assert.match(body, /de aproximadamente 2\.2%/iu);
  assert.doesNotMatch(body, /\b(?:el|del) aproximadamente\b/iu);
});

test("matches localized Spanish statistics to English source numbers", () => {
  const localizedFacts: CreativeKeyFact[] = [
    {
      id: "fact-1",
      statement: "The reported shares were 21.8% and 10.4%.",
      sourceExcerpt: "The reported shares were 21.8% and 10.4%.",
      attribution: "Statistics Canada",
    },
    {
      id: "fact-2",
      statement:
        "The reported counts were 726,820 and 251,585, with shares of 0.9%, 2.0%, and 42.1%.",
      sourceExcerpt:
        "The reported counts were 726,820 and 251,585, with shares of 0.9%, 2.0%, and 42.1%.",
      attribution: "Statistics Canada",
    },
    {
      id: "fact-3",
      statement: "The reported shares were 12.7% and 9.9%.",
      sourceExcerpt: "The reported shares were 12.7% and 9.9%.",
      attribution: "Statistics Canada",
    },
    {
      id: "fact-4",
      statement: "The reported shares were 59.8%, 78.3%, and 44.7%.",
      sourceExcerpt: "The reported shares were 59.8%, 78.3%, and 44.7%.",
      attribution: "Statistics Canada",
    },
  ];
  const localizedDraft: GeneratedCreativeDraft = {
    concept: "Retrato de la población latinoamericana en Canadá",
    caption:
      "El estudio reportó 726.820 personas y proporciones de 21,8 %, 10,4 % y 42,1 %.",
    hashtags: [],
    altText: "Carrusel sobre la población latinoamericana en Canadá.",
    units: [
      unit(
        1,
        "cover",
        "hook",
        "Proporciones que definían el retrato",
        "La población tenía proporciones reportadas de 21,8 % y 10,4 %.",
        ["fact-1"],
      ),
      unit(
        2,
        "content",
        "explain",
        "El tamaño de la población",
        "Los datos reportaron 726.820 y 251.585 personas; las proporciones fueron 0,9 %, 2,0 % y 42,1 %.",
        ["fact-2"],
      ),
      unit(
        3,
        "content",
        "prove",
        "Otra comparación",
        "Las proporciones reportadas fueron 12,7 % y 9,9 %.",
        ["fact-3"],
      ),
      unit(
        4,
        "content",
        "impact",
        "Tres resultados adicionales",
        "Las proporciones reportadas fueron 59,8 %, 78,3 % y 44,7 %.",
        ["fact-4"],
      ),
    ],
  };

  const issues = deterministicFactQualityIssues(
    localizedDraft,
    localizedFacts,
  );
  assert.deepEqual(
    issues.filter((issue) => issue.code === "UNSUPPORTED_NUMBER"),
    [],
  );

  const changedStatistic = structuredClone(localizedDraft);
  changedStatistic.units[0]!.body =
    "La población tenía proporciones reportadas de 21,9 % y 10,4 %.";
  assert.ok(
    deterministicFactQualityIssues(changedStatistic, localizedFacts).some(
      (issue) =>
        issue.code === "UNSUPPORTED_NUMBER" && issue.unitOrder === 1,
    ),
  );
});

test("does not mistake year-over-year or month-over-month for estimates", () => {
  const annual = withCreativeFactClaimGuard({
    id: "fact-annual",
    statement: "Average weekly earnings rose 3.4% year-over-year.",
    requiredQualifiers: ["year-over-year"],
    attribution: "Statistics Canada",
    claimGuard: {
      certainty: "estimated",
      requiredPhrases: ["year-over-year"],
      forbiddenPhrases: [],
      scopePhrases: [],
      allowedNumbers: ["3.4%"],
    },
  });
  const monthly = withCreativeFactClaimGuard({
    id: "fact-monthly",
    statement: "Payroll employment rose 0.8% month-over-month.",
    requiredQualifiers: ["month-over-month"],
    attribution: "Statistics Canada",
  });

  assert.equal(annual.claimGuard?.certainty, "asserted");
  assert.equal(monthly.claimGuard?.certainty, "asserted");
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

test("accepts a comma-separated calendar date and a numeric required qualifier", () => {
  const rentFacts: CreativeKeyFact[] = [
    {
      id: "fact-date",
      statement:
        "The maximum annual allowable rent increase takes effect Jan. 1, 2027.",
      sourceExcerpt:
        "The maximum annual allowable rent increase takes effect Jan. 1, 2027.",
      attribution: "Government of British Columbia",
      // Mimic an older persisted guard produced before date punctuation was
      // normalized correctly. Runtime inference must supplement, not trust,
      // this stale representation.
      claimGuard: {
        certainty: "asserted",
        requiredPhrases: [],
        forbiddenPhrases: [],
        scopePhrases: [],
        allowedNumbers: ["2027", "1.2027"],
      },
    },
    {
      id: "fact-notice",
      statement:
        "Landlords can only increase rent once every 12 months.",
      sourceExcerpt:
        "Landlords can only increase rent once every 12 months.",
      requiredQualifiers: ["required minimum of three months notice"],
      attribution: "Government of British Columbia",
      claimGuard: {
        certainty: "asserted",
        requiredPhrases: ["required minimum of three months notice"],
        forbiddenPhrases: [],
        scopePhrases: [],
        allowedNumbers: ["12"],
      },
    },
  ];
  const rentDraft: GeneratedCreativeDraft = {
    concept: "The 2027 rent increase rules",
    caption: "The rules take effect in 2027.",
    hashtags: [],
    altText: "The second slide says the rules take effect on January 1, 2027.",
    units: [
      {
        ...unit(
          2,
          "content",
          "explain",
          "When the increase can apply",
          "A landlord may increase rent once every 12 months with the required minimum notice of three months.",
          ["fact-date", "fact-notice"],
        ),
        subheadline: "The 2027 limit takes effect January 1.",
      },
    ],
  };

  assert.deepEqual(
    deterministicFactQualityIssues(rentDraft, rentFacts).filter(
      (issue) => issue.code === "UNSUPPORTED_NUMBER",
    ),
    [],
  );
});

test("accepts numbers preserved in a fact source excerpt", () => {
  const microDecisionFact: CreativeKeyFact = {
    id: "fact-decisions",
    statement:
      "AI coding agents make hundreds of visual micro-decisions during a session.",
    sourceExcerpt:
      "The AI made somewhere between 200 and 300 visual micro-decisions during that session.",
    attribution: "the author",
  };
  const microDecisionDraft: GeneratedCreativeDraft = {
    concept: "Design-system drift",
    caption: "Why AI coding sessions drift.",
    hashtags: [],
    altText: "A carousel about design-system drift.",
    units: [
      unit(
        1,
        "cover",
        "hook",
        "Why AI coding sessions drift",
        "In a single session, an AI makes somewhere between 200 and 300 visual micro-decisions.",
        ["fact-decisions"],
      ),
    ],
  };

  assert.ok(
    !deterministicFactQualityIssues(microDecisionDraft, [
      microDecisionFact,
    ]).some((issue) => issue.code === "UNSUPPORTED_NUMBER"),
  );
});

test("accepts the numeric count of an explicit multi-item fact list", () => {
  const architectureFact: CreativeKeyFact = {
    id: "fact-architecture",
    statement:
      "An LLM-readable design system uses structured spec files, a closed token layer, automated audit scripts, and upstream drift detection.",
    attribution: "the author",
  };
  const architectureDraft: GeneratedCreativeDraft = {
    concept: "LLM-readable architecture",
    caption: "A machine-readable design system.",
    hashtags: [],
    altText: "A carousel explaining an LLM-readable design system.",
    units: [
      unit(
        1,
        "content",
        "explain",
        "The 4-part machine-readable architecture",
        "Structured specs, closed tokens, automated audits, and drift detection keep agents aligned.",
        ["fact-architecture"],
      ),
    ],
  };

  assert.ok(
    !deterministicFactQualityIssues(architectureDraft, [
      architectureFact,
    ]).some((issue) => issue.code === "UNSUPPORTED_NUMBER"),
  );
});

test("treats compact currency suffixes as equivalent to full amounts", () => {
  const costFact: CreativeKeyFact = {
    id: "fact-cost",
    statement:
      "Infrastructure cost about $12,000 versus a roughly $6 million staffing estimate.",
    attribution: "Asana",
    requiredQualifiers: ["about", "roughly", "estimate"],
  };
  const costDraft: GeneratedCreativeDraft = {
    concept: "Migration economics",
    caption: "A comparison of migration costs.",
    hashtags: [],
    altText: "A cost comparison.",
    units: [
      unit(
        1,
        "content",
        "prove",
        "About $12K vs a roughly $6M estimate",
        "Infrastructure cost about $12,000.",
        ["fact-cost"],
      ),
    ],
  };

  assert.ok(
    !deterministicFactQualityIssues(costDraft, [costFact]).some(
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

test("does not treat a Spanish indefinite article as the number one", () => {
  const pregnancyFact: CreativeKeyFact = {
    id: "fact-20-weeks",
    statement: "Around 20 weeks, the baby's movements can be felt.",
    attribution: "INSPQ",
  };
  const pregnancyDraft: GeneratedCreativeDraft = {
    concept: "Movimientos del bebé",
    caption: "Un dato sobre el desarrollo fetal.",
    hashtags: [],
    altText: "Carrusel sobre movimientos fetales.",
    units: [
      unit(
        1,
        "content",
        "impact",
        "Una etapa importante",
        "Alrededor de las 20 semanas, los movimientos pueden sentirse.",
        ["fact-20-weeks"],
      ),
    ],
  };

  assert.equal(
    deterministicFactQualityIssues(pregnancyDraft, [pregnancyFact]).some(
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

test("repairs a closing sector summary and an alt-text slide mismatch without another model call", () => {
  const laborFacts: CreativeKeyFact[] = [
    {
      id: "fact-1",
      statement: "Payroll employment changed little in June, up 4,800 (+0.0%).",
      attribution: "Statistics Canada",
    },
    {
      id: "fact-2",
      statement:
        "Average weekly earnings rose 3.4% year-over-year to $1,344 in June.",
      attribution: "Statistics Canada",
    },
    {
      id: "fact-3",
      statement:
        "There were 2.9 unemployed persons per vacancy in June 2026, down from 3.0 in May and 3.1 in June 2025.",
      attribution: "Statistics Canada",
    },
    {
      id: "fact-4",
      statement:
        "Payroll employment increased in public administration and construction but decreased in manufacturing, accommodation and food services, and retail trade.",
      attribution: "Statistics Canada",
    },
  ];
  const laborDraft: GeneratedCreativeDraft = {
    concept: "El mercado laboral canadiense en junio",
    caption: "Datos de empleo, ingresos y vacantes en Canadá.",
    hashtags: [],
    altText:
      "Carrusel de cinco diapositivas sobre el empleo en Canadá. La última diapositiva compara la proporción en junio de 2026 con junio de 2025.",
    units: [
      unit(
        1,
        "cover",
        "hook",
        "El empleo de nómina cambió poco",
        "El movimiento total fue mínimo.",
        ["fact-1"],
      ),
      unit(
        2,
        "content",
        "explain",
        "Los sectores no se movieron igual",
        "Hubo aumentos y descensos entre actividades económicas.",
        ["fact-4"],
      ),
      unit(
        3,
        "content",
        "prove",
        "Los ingresos semanales aumentaron",
        "El dato nacional ofrece otra señal del mercado.",
        ["fact-2"],
      ),
      unit(
        4,
        "content",
        "impact",
        "La competencia por vacante bajó",
        "En junio de 2026 hubo 2.9 personas desempleadas por vacante, frente a 3.0 en mayo y 3.1 en junio de 2025.",
        ["fact-3"],
      ),
      {
        ...unit(
          5,
          "conclusion",
          "debate",
          "La cifra nacional no cuenta toda la historia",
          "El empleo de nómina cambió poco en total, pero hubo avances y retrocesos según el sector. Por eso, una misma cifra nacional puede sentirse distinta.",
          ["fact-1"],
        ),
        ctaQuestion:
          "¿En tu sector ves más o menos competencia que hace un año?",
      },
    ],
  };

  const originalIssues = deterministicFactQualityIssues(
    laborDraft,
    laborFacts,
  );
  assert.ok(
    originalIssues.some(
      (issue) =>
        issue.code === "MISSING_FACT_ASSIGNMENT" && issue.unitOrder === 5,
    ),
  );
  assert.ok(
    originalIssues.some(
      (issue) =>
        issue.code === "ALT_TEXT_SLIDE_MISMATCH" && issue.unitOrder === 5,
    ),
  );

  const repaired = repairDeterministicCreativeCopy(
    laborDraft,
    "carousel",
    laborFacts,
    "español",
  );
  assert.deepEqual(repaired.units[4]?.factIds, ["fact-4"]);
  assert.equal(
    repaired.units[4]?.body,
    "Hubo avances y retrocesos según el sector.",
  );
  assert.match(repaired.altText, /la diapositiva 4 compara/iu);
  assert.equal(
    deterministicFactQualityIssues(repaired, laborFacts).some((issue) =>
      ["MISSING_FACT_ASSIGNMENT", "ALT_TEXT_SLIDE_MISMATCH"].includes(
        issue.code,
      ),
    ),
    false,
  );
});

test("prioritizes the two-fact earnings and payroll contrast in the current labor closing", () => {
  const laborFacts: CreativeKeyFact[] = [
    {
      id: "fact-1",
      statement: "Payroll employment changed little, up 4,800 (+0.0%).",
      attribution: "Statistics Canada",
    },
    {
      id: "fact-2",
      statement:
        "Average weekly earnings rose 3.4% year-over-year to $1,344.",
      attribution: "Statistics Canada",
    },
    {
      id: "fact-4",
      statement:
        "Payroll employment increased in public administration and construction but decreased in manufacturing, accommodation and food services, and retail trade.",
      attribution: "Statistics Canada",
    },
  ];
  const laborDraft: GeneratedCreativeDraft = {
    concept: "Ingresos y empleo no avanzaron de la misma manera",
    caption: "Resumen de los indicadores laborales de Statistics Canada.",
    hashtags: [],
    altText:
      "Carrusel sobre ingresos y empleo en Canadá. La quinta aclara que el alza de las ganancias promedio no equivale a un aumento del empleo y resume los movimientos opuestos entre industrias.",
    units: [
      unit(
        1,
        "cover",
        "hook",
        "Ingresos al alza, empleo casi sin cambios",
        "Las ganancias semanales aumentaron mientras el empleo de nómina cambió poco.",
        ["fact-1", "fact-2"],
      ),
      {
        ...unit(
          5,
          "conclusion",
          "debate",
          "El promedio salarial y el empleo no miden lo mismo",
          "El alza de las ganancias semanales promedio no equivale a un aumento del empleo. En junio, el empleo en nómina cambió poco y las alzas de algunas industrias fueron parcialmente compensadas por descensos en otras.",
          ["fact-1"],
        ),
        ctaQuestion:
          "¿Tu sector estuvo entre los que aumentaron o entre los que descendieron?",
        visualDirection:
          "Cierre editorial que contraste el indicador ascendente de ganancias semanales promedio con un indicador de empleo en nómina casi plano. Añadir una composición equilibrada de industrias en aumento y descenso, sin incorporar datos nuevos.",
      },
    ],
  };

  assert.ok(
    deterministicFactQualityIssues(laborDraft, laborFacts).some(
      (issue) =>
        issue.code === "MISSING_FACT_ASSIGNMENT" &&
        issue.unitOrder === 5 &&
        issue.message.includes("fact-2"),
    ),
  );

  const repaired = repairDeterministicCreativeCopy(
    laborDraft,
    "carousel",
    laborFacts,
    "español",
  );
  const closing = repaired.units.at(-1);
  assert.deepEqual(closing?.factIds, ["fact-1", "fact-2"]);
  assert.equal(
    closing?.body,
    "El alza de las ganancias semanales promedio no equivale a un aumento del empleo. En junio, el empleo en nómina cambió poco.",
  );
  assert.equal(
    closing?.ctaQuestion,
    "¿Qué indicador refleja mejor lo que observas: ingresos o empleo?",
  );
  assert.doesNotMatch(closing?.body ?? "", /industrias|descensos/iu);
  assert.doesNotMatch(
    closing?.visualDirection ?? "",
    /industrias|descenso/iu,
  );
  assert.match(
    closing?.visualDirection ?? "",
    /ganancias semanales promedio.*empleo en nómina/iu,
  );
  assert.doesNotMatch(repaired.altText, /resume.*industrias/iu);
  assert.match(repaired.altText, /la quinta aclara.*aumento del empleo\./iu);
  assert.equal(
    deterministicFactQualityIssues(repaired, laborFacts).some(
      (issue) => issue.code === "MISSING_FACT_ASSIGNMENT",
    ),
    false,
  );
});

test("does not post-collapse a numbered earnings-payroll closing to one fact", () => {
  const facts: CreativeKeyFact[] = [
    {
      id: "fact-payroll",
      statement: "Payroll employment changed little overall in June 2026.",
      attribution: "Statistics Canada",
    },
    {
      id: "fact-earnings",
      statement: "Average weekly earnings rose 3.4% year-over-year.",
      attribution: "Statistics Canada",
    },
  ];
  const numberedDraft: GeneratedCreativeDraft = {
    concept: "Ingresos frente a empleo",
    caption: "Dos indicadores laborales.",
    hashtags: [],
    altText: "Carrusel sobre ingresos y empleo.",
    units: [
      unit(
        1,
        "cover",
        "hook",
        "Dos señales laborales",
        "En junio de 2026, ingresos y empleo dieron señales distintas.",
        ["fact-payroll", "fact-earnings"],
      ),
      {
        ...unit(
          2,
          "conclusion",
          "debate",
          "Ingresos al alza, empleo casi sin cambios",
          "En junio de 2026, los ingresos semanales aumentaron 3.4% interanual, mientras el empleo de nómina cambió poco.",
          ["fact-payroll", "fact-earnings"],
        ),
        ctaQuestion: "¿Qué indicador refleja mejor tu realidad?",
      },
    ],
  };

  const repaired = repairDeterministicCreativeCopy(
    numberedDraft,
    "carousel",
    facts,
    "español",
  );
  assert.deepEqual(repaired.units.at(-1)?.factIds, [
    "fact-payroll",
    "fact-earnings",
  ]);
  assert.equal(
    deterministicFactQualityIssues(repaired, facts).some(
      (issue) =>
        issue.code === "MISSING_FACT_ASSIGNMENT" ||
        issue.code === "MISSING_SCOPE",
    ),
    false,
  );
});

test("does not introduce an unestablished fact in a closing contrast", () => {
  const facts: CreativeKeyFact[] = [
    {
      id: "fact-payroll",
      statement: "Payroll employment changed little in June 2026.",
      attribution: "Statistics Canada",
    },
    {
      id: "fact-earnings",
      statement: "Average weekly earnings rose 3.4% year-over-year.",
      attribution: "Statistics Canada",
    },
  ];
  const draftWithNewClosingFact: GeneratedCreativeDraft = {
    concept: "Empleo en Canadá",
    caption: "Un indicador laboral.",
    hashtags: [],
    altText: "Carrusel sobre empleo.",
    units: [
      unit(1, "cover", "hook", "El empleo cambió poco", "En junio de 2026, el total se mantuvo casi plano.", ["fact-payroll"]),
      {
        ...unit(
          2,
          "conclusion",
          "debate",
          "Ingresos al alza, empleo casi sin cambios",
          "Los ingresos semanales aumentaron 3.4%, mientras el empleo de nómina cambió poco.",
          ["fact-payroll"],
        ),
        ctaQuestion: "¿Cuál refleja mejor tu realidad?",
      },
    ],
  };

  const repaired = repairDeterministicCreativeCopy(
    draftWithNewClosingFact,
    "carousel",
    facts,
    "español",
  );
  const closing = repaired.units.at(-1);
  assert.deepEqual(closing?.factIds, []);
  assert.equal(closing?.headline, "Una pregunta para cerrar");
  assert.equal(closing?.body, undefined);
  assert.doesNotMatch(
    `${closing?.headline} ${closing?.ctaQuestion}`,
    /ingresos|salari|ganancias/iu,
  );
  assert.equal(
    deterministicFactQualityIssues(repaired, facts).some(
      (issue) =>
        issue.code === "MISSING_FACT_ASSIGNMENT" ||
        issue.code === "MISSING_SCOPE",
    ),
    false,
  );
  assert.equal(
    blockingCarouselNarrativeIssues(repaired.units).some(
      (issue) => issue.code === "new-closing-fact",
    ),
    false,
  );
});

test("lets a closing reuse a contrast pair repaired onto an earlier cover", () => {
  const facts: CreativeKeyFact[] = [
    {
      id: "fact-payroll",
      statement: "Payroll employment changed little overall.",
      attribution: "Statistics Canada",
    },
    {
      id: "fact-earnings",
      statement: "Average weekly earnings rose 3.4% year-over-year.",
      attribution: "Statistics Canada",
    },
  ];
  const draft: GeneratedCreativeDraft = {
    concept: "Ingresos frente a empleo",
    caption: "Dos indicadores laborales.",
    hashtags: [],
    altText: "Carrusel sobre ingresos y empleo.",
    units: [
      unit(
        1,
        "cover",
        "hook",
        "Ingresos al alza, empleo casi sin cambios",
        "Los ingresos semanales aumentaron 3.4%, mientras el empleo de nómina cambió poco.",
        ["fact-payroll"],
      ),
      {
        ...unit(
          2,
          "conclusion",
          "debate",
          "Ingresos y empleo no avanzaron igual",
          "Los ingresos semanales aumentaron, mientras el empleo de nómina cambió poco.",
          ["fact-payroll"],
        ),
        ctaQuestion: "¿Qué indicador refleja mejor tu realidad?",
      },
    ],
  };

  const repaired = repairDeterministicCreativeCopy(
    draft,
    "carousel",
    facts,
    "español",
  );
  assert.deepEqual(repaired.units[0]?.factIds, [
    "fact-payroll",
    "fact-earnings",
  ]);
  assert.deepEqual(repaired.units.at(-1)?.factIds, [
    "fact-payroll",
    "fact-earnings",
  ]);
  assert.equal(
    blockingCarouselNarrativeIssues(repaired.units).some(
      (issue) => issue.code === "new-closing-fact",
    ),
    false,
  );
  assert.equal(
    deterministicFactQualityIssues(repaired, facts).some(
      (issue) => issue.code === "MISSING_FACT_ASSIGNMENT",
    ),
    false,
  );
});

for (const editorialGoal of ["prove", "compare"] as const) {
  test(`preserves a third known fact within the ${editorialGoal} budget`, () => {
    const facts: CreativeKeyFact[] = [
      {
        id: "fact-payroll",
        statement: "Payroll employment increased by 4,800 overall.",
        attribution: "Statistics Canada",
      },
      {
        id: "fact-earnings",
        statement: "Average weekly earnings rose 3.4%.",
        attribution: "Statistics Canada",
      },
      {
        id: "fact-vacancies",
        statement: "Job vacancies reached 509,100.",
        attribution: "Statistics Canada",
      },
    ];
    const evidenceDraft: GeneratedCreativeDraft = {
      concept: "Indicadores laborales",
      caption: "Datos laborales.",
      hashtags: [],
      altText: "Gráfico de indicadores laborales.",
      units: [
        unit(
          1,
          "content",
          editorialGoal,
          "Señales del mercado laboral",
          "Los ingresos semanales aumentaron 3.4%, mientras el empleo de nómina sumó 4,800; las vacantes llegaron a 509,100.",
          ["fact-payroll", "fact-vacancies"],
        ),
      ],
    };

    const repaired = repairDeterministicCreativeCopy(
      evidenceDraft,
      "carousel",
      facts,
      "español",
    );
    assert.equal(repaired.units[0]?.factIds.length, 3);
    assert.deepEqual(new Set(repaired.units[0]?.factIds), new Set(facts.map((fact) => fact.id)));
    assert.deepEqual(
      deterministicFactQualityIssues(repaired, facts).filter((issue) =>
        ["UNSUPPORTED_NUMBER", "MISSING_FACT_ASSIGNMENT"].includes(issue.code),
      ),
      [],
    );
  });
}

test("does not classify sector or generic employment facts as aggregate payroll evidence", () => {
  const earningsFact: CreativeKeyFact = {
    id: "fact-earnings",
    statement: "Average weekly earnings increased 3.4%.",
    attribution: "Statistics Canada",
  };
  for (const employmentFact of [
    {
      id: "fact-construction",
      statement: "Construction payroll employment increased.",
      attribution: "Statistics Canada",
    },
    {
      id: "fact-generic",
      statement: "Employment increased.",
      attribution: "Statistics Canada",
    },
  ] satisfies CreativeKeyFact[]) {
    const facts = [earningsFact, employmentFact];
    const contrastDraft: GeneratedCreativeDraft = {
      concept: "Ingresos y empleo",
      caption: "Indicadores laborales.",
      hashtags: [],
      altText: "Carrusel laboral.",
      units: [
        unit(
          1,
          "cover",
          "hook",
          "Ingresos frente a empleo",
          "Los ingresos semanales aumentaron, mientras el empleo cambió.",
          ["fact-earnings"],
        ),
      ],
    };

    assert.equal(
      deterministicFactQualityIssues(contrastDraft, facts).some(
        (issue) => issue.code === "MISSING_FACT_ASSIGNMENT",
      ),
      false,
    );
    assert.deepEqual(
      repairDeterministicFactCopy(contrastDraft, facts).units[0]?.factIds,
      ["fact-earnings"],
    );
  }

  const sectorEarningsFact: CreativeKeyFact = {
    id: "fact-manufacturing-wages",
    statement: "Manufacturing wages rose.",
    attribution: "Statistics Canada",
  };
  const aggregatePayrollFact: CreativeKeyFact = {
    id: "fact-payroll",
    statement: "Payroll employment changed little overall.",
    attribution: "Statistics Canada",
  };
  const wageContrastDraft: GeneratedCreativeDraft = {
    concept: "Salarios y empleo",
    caption: "Indicadores laborales.",
    hashtags: [],
    altText: "Carrusel laboral.",
    units: [
      unit(
        1,
        "cover",
        "hook",
        "Salarios frente a empleo",
        "Los salarios aumentaron, mientras el empleo de nómina cambió poco.",
        ["fact-payroll"],
      ),
    ],
  };
  assert.equal(
    deterministicFactQualityIssues(wageContrastDraft, [
      sectorEarningsFact,
      aggregatePayrollFact,
    ]).some((issue) => issue.code === "MISSING_FACT_ASSIGNMENT"),
    false,
  );
});

test("does not infer an earnings-payroll contrast from a generic topic label", () => {
  const laborFacts: CreativeKeyFact[] = [
    {
      id: "fact-earnings",
      statement: "Average weekly earnings increased.",
      attribution: "Statistics Canada",
    },
    {
      id: "fact-payroll",
      statement: "Payroll employment changed little.",
      attribution: "Statistics Canada",
    },
  ];
  const topicDraft: GeneratedCreativeDraft = {
    concept: "Salarios y empleo en Canadá",
    caption: "Dos temas del reporte laboral.",
    hashtags: [],
    altText: "Carrusel sobre salarios y empleo.",
    units: [
      unit(
        1,
        "cover",
        "hook",
        "Salarios y empleo en Canadá",
        "Dos indicadores incluidos en el reporte.",
        ["fact-payroll"],
      ),
    ],
  };

  assert.equal(
    deterministicFactQualityIssues(topicDraft, laborFacts).some(
      (issue) => issue.code === "MISSING_FACT_ASSIGNMENT",
    ),
    false,
  );
  assert.deepEqual(
    repairDeterministicFactCopy(topicDraft, laborFacts).units[0]?.factIds,
    ["fact-payroll"],
  );
});

test("recognizes Spanish alzas and descensos as a sector movement summary", () => {
  const sectorFacts: CreativeKeyFact[] = [
    {
      id: "fact-total",
      statement: "Payroll employment changed little overall.",
      attribution: "Statistics Canada",
    },
    {
      id: "fact-sectors",
      statement:
        "Some industries recorded gains while manufacturing and retail trade recorded losses.",
      attribution: "Statistics Canada",
    },
  ];
  const sectorDraft: GeneratedCreativeDraft = {
    concept: "Movimientos por industria",
    caption: "Resumen sectorial.",
    hashtags: [],
    altText: "Carrusel sobre movimientos sectoriales.",
    units: [
      unit(
        1,
        "conclusion",
        "debate",
        "Movimientos distintos por sector",
        "Hubo alzas y descensos según la industria.",
        ["fact-total"],
      ),
    ],
  };

  assert.ok(
    deterministicFactQualityIssues(sectorDraft, sectorFacts).some(
      (issue) => issue.code === "MISSING_FACT_ASSIGNMENT",
    ),
  );
  assert.deepEqual(
    repairDeterministicFactCopy(
      sectorDraft,
      sectorFacts,
      "español",
    ).units[0]?.factIds,
    ["fact-sectors"],
  );
});

test("cleans sector copy only from the sentence that explicitly names the final slide", () => {
  const facts: CreativeKeyFact[] = [
    {
      id: "fact-payroll",
      statement: "Payroll employment changed little overall.",
      attribution: "Statistics Canada",
    },
    {
      id: "fact-earnings",
      statement: "Average weekly earnings increased.",
      attribution: "Statistics Canada",
    },
  ];
  const makeDraft = (closingOrder: number): GeneratedCreativeDraft => ({
    concept: "Ingresos y empleo",
    caption: "Indicadores laborales.",
    hashtags: [],
    altText:
      `La segunda compara datos y resume movimientos opuestos entre industrias. La quinta contrasta ingresos y empleo y resume movimientos opuestos entre industrias.${closingOrder === 6 ? " La sexta contrasta ingresos y empleo." : ""}`,
    units: [
      unit(1, "cover", "hook", "Ingresos y empleo", "Dos indicadores.", ["fact-payroll", "fact-earnings"]),
      {
        ...unit(
          closingOrder,
          "conclusion",
          "debate",
          "Ingresos y empleo no avanzaron igual",
          "Los ingresos semanales aumentaron, mientras el empleo de nómina cambió poco.",
          ["fact-payroll", "fact-earnings"],
        ),
        ctaQuestion: "¿Qué observas?",
      },
    ],
  });

  const fiveSlideRepair = repairDeterministicFactCopy(
    makeDraft(5),
    facts,
    "español",
  );
  assert.match(
    fiveSlideRepair.altText,
    /La segunda compara datos y resume movimientos opuestos entre industrias\./u,
  );
  assert.doesNotMatch(fiveSlideRepair.altText, /La quinta[^.]*resume/iu);

  const sixSlideRepair = repairDeterministicFactCopy(
    makeDraft(6),
    facts,
    "español",
  );
  assert.match(
    sixSlideRepair.altText,
    /La quinta contrasta ingresos y empleo y resume movimientos opuestos entre industrias\./u,
  );
});

test("removes a trailing sector clause without deleting the labor contrast in the same sentence", () => {
  const facts: CreativeKeyFact[] = [
    {
      id: "fact-payroll",
      statement: "Payroll employment changed little overall.",
      attribution: "Statistics Canada",
    },
    {
      id: "fact-earnings",
      statement: "Average weekly earnings increased.",
      attribution: "Statistics Canada",
    },
  ];
  const mixedSentenceDraft: GeneratedCreativeDraft = {
    concept: "Ingresos y empleo",
    caption: "Indicadores laborales.",
    hashtags: [],
    altText: "Carrusel sobre ingresos y empleo.",
    units: [
      unit(1, "cover", "hook", "Dos indicadores", "Ingresos y empleo.", ["fact-payroll", "fact-earnings"]),
      {
        ...unit(
          2,
          "conclusion",
          "debate",
          "Ingresos al alza, empleo casi sin cambios",
          "Los ingresos semanales aumentaron mientras el empleo de nómina cambió poco, y algunas industrias registraron alzas y descensos.",
          ["fact-payroll", "fact-earnings"],
        ),
        ctaQuestion: "¿Qué indicador refleja mejor tu realidad?",
      },
    ],
  };

  const repaired = repairDeterministicFactCopy(
    mixedSentenceDraft,
    facts,
    "español",
  );
  assert.equal(
    repaired.units.at(-1)?.body,
    "Los ingresos semanales aumentaron mientras el empleo de nómina cambió poco.",
  );
  assert.deepEqual(repaired.units.at(-1)?.factIds, [
    "fact-payroll",
    "fact-earnings",
  ]);
});

test("does not guess an alt-text slide from a prose-only description", () => {
  const fact: CreativeKeyFact = {
    id: "fact-1",
    statement:
      "Some sectors gained payroll employees while other sectors lost them.",
    attribution: "Statistics Canada",
  };
  const proseOnlyDraft: GeneratedCreativeDraft = {
    concept: "Movimientos sectoriales",
    caption: "Resumen del mercado laboral.",
    hashtags: [],
    altText:
      "Carrusel sobre el mercado laboral; la última diapositiva resume diferencias sectoriales.",
    units: [
      unit(1, "cover", "hook", "El mercado laboral", undefined, ["fact-1"]),
      unit(
        2,
        "conclusion",
        "debate",
        "Diferencias por sector",
        "Algunos sectores ganaron empleos y otros los perdieron.",
        ["fact-1"],
      ),
    ],
  };

  const repaired = repairDeterministicFactCopy(
    proseOnlyDraft,
    [fact],
    "español",
  );
  assert.equal(repaired.altText, proseOnlyDraft.altText);
  assert.equal(
    deterministicFactQualityIssues(repaired, [fact]).some(
      (issue) => issue.code === "ALT_TEXT_SLIDE_MISMATCH",
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

test("does not score AI model version numbers against the cited excerpt", () => {
  const sourceText =
    "OpenAI's ChatGPT, Anthropic's Claude, and xAI's Grok are all down Thursday morning, according to Downdetector. " +
    "Anthropic's Claude dashboard is experiencing outages across Opus 4.8 and Opus 5, and says all other models have recovered to baseline error rate.";
  const brief: GeneratedCreativeBrief = {
    recommendedFormat: "carousel",
    fallbackFormat: "meme",
    formatScores: [
      { format: "carousel", score: 80, reason: "Breaking sequence." },
      { format: "meme", score: 60, reason: "Fallback." },
    ],
    confidence: 70,
    targetAudience: "AI users",
    keyMessage: "Three major AI assistants went down at once.",
    angle: "A rare simultaneous outage.",
    hook: "ChatGPT, Claude and Grok all went dark this morning.",
    tone: { primary: "informative", energy: 50, humor: 0, reason: "Clear." },
    contentSufficiency: "limited",
    keyFacts: [
      {
        id: "fact-1",
        statement:
          "ChatGPT, Claude, and Grok are all down Thursday morning, according to Downdetector.",
        sourceExcerpt:
          "OpenAI's ChatGPT, Anthropic's Claude, and xAI's Grok are all down Thursday morning, according to Downdetector.",
        attribution: "Downdetector",
      },
      {
        id: "fact-2",
        statement:
          "Anthropic reports outages across Claude Opus 4.8 and Opus 5 on its dashboard.",
        sourceExcerpt:
          "Anthropic's Claude dashboard is experiencing outages across Opus 4.8 and Opus 5, and says all other models have recovered to baseline error rate.",
        attribution: "Anthropic",
      },
    ],
    riskFlags: [],
    suggestedConcepts: [
      {
        format: "carousel",
        title: "The simultaneous outage",
        concept: "Walk through which assistants are affected.",
      },
      {
        format: "meme",
        title: "All down at once",
        concept: "The rare triple outage.",
      },
    ],
  };

  const issues = deterministicBriefFactQualityIssues(brief, sourceText);
  assert.ok(
    !issues.some((issue) => issue.code === "FACT_NUMBER_NOT_IN_EVIDENCE"),
    JSON.stringify(issues),
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

test("guards optional subheadline numbers with the slide's selected facts", () => {
  const guardedDraft: GeneratedCreativeDraft = {
    concept: "AI authorship signals",
    caption: "A sourced comparison.",
    hashtags: [],
    altText: "A sourced comparison.",
    units: [
      {
        ...unit(
          1,
          "cover",
          "hook",
          "What the study detected",
          undefined,
          ["fact-1"],
        ),
        subheadline: "The unsupported figure is 99%",
      },
    ],
  };

  assert.ok(
    deterministicFactQualityIssues(guardedDraft, keyFacts).some(
      (issue) =>
        issue.code === "UNSUPPORTED_NUMBER" && issue.unitOrder === 1,
    ),
  );
});

test("grounds a continuation cue in the current or following slide", () => {
  const cueDraft: GeneratedCreativeDraft = {
    concept: "AI authorship signals",
    caption: "A sourced comparison.",
    hashtags: [],
    altText: "A sourced comparison.",
    units: [
      {
        ...unit(
          1,
          "cover",
          "hook",
          "What the study detected",
          undefined,
          ["fact-6"],
        ),
        continuationCue: "The result was about 10%",
      },
      unit(
        2,
        "content",
        "prove",
        "The sample result",
        "A July 2026 random sample found about 10% with significant signs.",
        ["fact-4"],
      ),
      unit(
        3,
        "conclusion",
        "conclude",
        "What the report established",
        "Cloudflare reported that bot traffic had overtaken human traffic.",
        ["fact-6"],
      ),
    ],
  };

  const initialIssues = deterministicFactQualityIssues(cueDraft, keyFacts);
  assert.ok(
    !initialIssues.some(
      (issue) =>
        issue.code === "UNSUPPORTED_NUMBER" && issue.unitOrder === 1,
    ),
  );
  assert.ok(
    initialIssues.some(
      (issue) => issue.code === "MISSING_SCOPE" && issue.unitOrder === 1,
    ),
  );

  const repaired = repairDeterministicFactCopy(cueDraft, keyFacts, "English");
  assert.match(repaired.units[0]!.continuationCue ?? "", /July 2026/iu);
  assert.ok(
    !deterministicFactQualityIssues(repaired, keyFacts).some(
      (issue) => issue.code === "MISSING_SCOPE" && issue.unitOrder === 1,
    ),
  );

  cueDraft.units[0]!.continuationCue = "An unsupported result of 77%";
  assert.ok(
    deterministicFactQualityIssues(cueDraft, keyFacts).some(
      (issue) =>
        issue.code === "UNSUPPORTED_NUMBER" && issue.unitOrder === 1,
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
