import type {
  CreativeFactClaimGuard,
  GeneratedCreativeBrief,
  CreativeKeyFact,
  CreativeQualityIssue,
  GeneratedCreativeDraft,
} from "./creative-content.types";
import { maximumFactsForGoal } from "./carousel-narrative";
import {
  collapseStackedEstimateQualifiers,
  extractCreativeNumericLiterals as extractNumericLiterals,
  normalizeCreativeNumericLiteral as normalizeNumber,
} from "./creative-number-normalization";

const CERTAINTY_UPGRADE_PATTERN =
  /\b(?:is|are|was|were)\s+(?:fully\s+|entirely\s+)?(?:ai[-‐‑‒–— ]generated|ai[-‐‑‒–— ]written|written by ai)\b|\bai[-‐‑‒–— ]written\s+(?:content|pages?|articles?|text)\b/iu;
const SIGNAL_PATTERN =
  /\b(?:show(?:s|ed)? signs?|significant signs?|authorship signs?|signals?|likely (?:written|edited|generated)|detect(?:ed|ion)|identify|identified)\b/iu;
const ESTIMATE_PATTERN =
  /~|\b(?:about|approximately|estimated|estimate|nearly|roughly|around|more than|aproximadamente|estimad[oa]s?|casi|alrededor de|cerca de|unos?|en promedio|más de)\b|(?<![-‐‑‒–—])\bover\b(?![-‐‑‒–—])/iu;
const PROJECTION_PATTERN = /\b(?:projected|forecast|expected to|could reach)\b/iu;
const ASSOCIATION_PATTERN = /\b(?:associated with|correlat(?:ed|ion)|linked to)\b/iu;
const REPORTED_PATTERN = /\b(?:according to|reported|report says|study says)\b/iu;

/**
 * Evidence that the source itself frames a claim as a suggestion. The noun
 * forms count: a key fact recorded as "with suggestions it may be contributing"
 * licenses draft copy that says "some outlets suggested". Matching only the
 * bare verb stem made the repair amputate that attributed clause and leave a
 * truncated fragment behind.
 */
const SUGGESTION_SOURCE_SUPPORT =
  /\b(?:suggest(?:s|ed|ing|ion|ions)?|impl(?:y|ies|ied|ying)|points? to)\b/iu;

/** Subject anchors for the pregnancy-specific inference guards below. */
const PREGNANCY_SUBJECT =
  /(?:pregnan\w*|gestation\w*|prenatal|fetal|fetus|embarazo|embarazada|gestaci[oó]n|feto|prenatales?)/;
const STAGE_NOUN = /(?:stages?|trimesters?|phases?|etapas?|trimestres?|fases?)/;

const UNSUPPORTED_INFERENCE_PATTERNS: Array<{
  pattern: RegExp;
  sourceSupport: RegExp;
}> = [
  {
    pattern: /\bconfirm(?:s|ed|ing)?\s+(?:the\s+)?trend\b/iu,
    sourceSupport: /\b(?:confirm|trend)\b/iu,
  },
  {
    pattern: /\b(?:proves?|proved|proving)\b/iu,
    sourceSupport: /\b(?:prove|proved|proof)\b/iu,
  },
  {
    pattern: /\b(?:causes?|caused|causing|leads? to|leading to|led to|drives?|driving)\b/iu,
    sourceSupport: /\b(?:cause|caused|lead(?:s|ing)? to|led to|drive|driving)\b/iu,
  },
  {
    pattern:
      /\b(?:factors?|reasons?|factores?|razones?)\b[^.!?]{0,80}\b(?:explain(?:s|ed|ing)?|explican?|explicar)\b/iu,
    sourceSupport:
      /\b(?:because|due to|explains?|explained by|caused by|porque|debido a|explica|explican)\b/iu,
  },
  {
    pattern: /\b(?:changing|reshaping|transforming)\s+how\b/iu,
    sourceSupport: /\b(?:changing|reshaping|transforming)\s+how\b/iu,
  },
  {
    pattern: /\b(?:therefore|which means|this means)\b/iu,
    sourceSupport: /\b(?:therefore|means)\b/iu,
  },
  {
    pattern:
      /\b(?:common|shared)\s+(?:(?:cloud|infrastructure)\s+)?(?:choke[ -]?point|single point of failure)\b/iu,
    sourceSupport: /\b(?:choke[ -]?point|single point of failure)\b/iu,
  },
  {
    pattern:
      /\b(?:wealth|home equity|equity advantage|financial head start|years? of (?:prior )?wealth|down payment advantage|patrimonio|plusval[ií]a|capital acumulado|ventaja financiera|a[nñ]os? de patrimonio|ventaja (?:en el )?pago inicial)\b/iu,
    sourceSupport:
      /\b(?:wealth|home equity|equity|financial head start|prior wealth|down payment|patrimonio|plusval[ií]a|capital acumulado|ventaja financiera|pago inicial)\b/iu,
  },
  {
    pattern: /\b(?:suggest(?:s|ed|ing)?|implies?|implying|points? to)\b/iu,
    sourceSupport: SUGGESTION_SOURCE_SUPPORT,
  },
  {
    pattern:
      /\b(?:widespread|far-reaching|massive|dramatic)\s+(?:impact|effect|reach)\b|\breach extends beyond\b/iu,
    sourceSupport:
      /\b(?:widespread|far-reaching|massive|dramatic)\s+(?:impact|effect|reach)\b|\breach extends beyond\b/iu,
  },
  {
    pattern: /\b(?:rise|rising|growth|growing|surge|shifted|shifting)\b/iu,
    sourceSupport: /\b(?:rise|rising|growth|growing|surge|shifted|shifting)\b/iu,
  },
  {
    pattern: /\b(?:gestational year|año gestacional)\b/iu,
    sourceSupport: /\b(?:gestational year|año gestacional)\b/iu,
  },
  {
    pattern:
      /\besto\s+(?:anticipa|permite|ayuda|mejora|reduce|garantiza)\b|\b(?:entender|conocer)\b[^.!?]{0,100}\b(?:te|les|nos)\s+(?:permite|ayuda)\s+(?:anticipar|prevenir|mejorar|reducir|planificar)\b/iu,
    sourceSupport:
      /\b(?:anticipat(?:e|es|ed|ing)?|allows?|helps?|improves?|reduces?|guarantees?|plans?|anticipa|permite|ayuda|mejora|reduce|garantiza|anticipar|prevenir|planificar)\b/iu,
  },
  {
    // Guards against inventing pregnancy stages/trimesters, so it must stay
    // anchored to that subject. Without the anchor it fired on any story that
    // legitimately described something in "dos etapas" / "two phases".
    pattern: new RegExp(
      `\\b${PREGNANCY_SUBJECT.source}\\b[^.!?]{0,80}\\b${STAGE_NOUN.source}\\b` +
        `|\\b${STAGE_NOUN.source}\\b[^.!?]{0,80}\\b${PREGNANCY_SUBJECT.source}\\b`,
      "iu",
    ),
    sourceSupport: new RegExp(STAGE_NOUN.source, "iu"),
  },
  {
    pattern:
      /\b(?:physical|emotional|físic[oa]s?|emocionales?)\b[^.!?]{0,60}\b(?:changes?|needs?|cambios?|necesidades?)\b|\b(?:practical tips?|consejos? prácticos?)\b|\b(?:prepar(?:e|es|ed|ing) parents?|preparación de (?:los )?padres)\b/iu,
    sourceSupport:
      /\b(?:physical|emotional|físic[oa]s?|emocionales?|practical tips?|consejos? prácticos?|prepar(?:e|es|ed|ing)|preparación)\b/iu,
  },
];

const GENERIC_CLOSING_PATTERN =
  /^(?:the\s+)?(?:takeaway|conclusion|bottom line|what next)\??$/iu;

// A broad "some sectors gained while others lost" conclusion still needs the
// fact that establishes both directions. Numbers alone cannot catch this
// assignment error, so keep this guard deliberately narrow: it only applies
// when the copy explicitly mentions sectors/industries and both movement
// directions, and only auto-assigns a uniquely matching fact.
const SECTOR_SCOPE_PATTERN =
  /\b(?:sector(?:es)?|industr(?:ia|ias|y|ies))\b/iu;
const POSITIVE_SECTOR_MOVEMENT_PATTERN =
  /\b(?:alza(?:s)?|avance(?:s)?|aument(?:o|os|aron)|subi(?:o|eron)|creci(?:o|eron)|sum(?:o|aron)|gan(?:o|aron)|growth|gain(?:s|ed)?|increase(?:s|d)?|rose|grew|added|up)\b/iu;
const NEGATIVE_SECTOR_MOVEMENT_PATTERN =
  /\b(?:descenso(?:s)?|descendi(?:o|eron)|retroceso(?:s)?|ca(?:ida|idas|yo|yeron)|baj(?:o|aron)|perdi(?:o|eron)|rest(?:o|aron)|decline(?:s|d)?|decrease(?:s|d)?|loss(?:es)?|fell|dropped|down)\b/iu;
const SECTOR_ENTITY_PATTERN =
  /\b(?:public administration|administracion publica|construction|construccion|manufacturing|manufactura|accommodation|alojamiento|food services?|servicios de comida|retail trade|comercio minorista)\b/iu;

// This guard covers one recurring labor-story synthesis: average earnings
// moved in one direction while aggregate payroll employment moved differently.
// Requiring an explicit contrast in the copy and exactly one evidence fact for
// each side keeps generic "wages and jobs" topic labels from being matched.
const EARNINGS_SCOPE_PATTERN =
  /\b(?:average weekly earnings?|weekly earnings?|earnings?|wages?|salar(?:y|ies|io|ios)|salari(?:al|ales)|ganancias? semanales?|ingresos? semanales?|remuneraci(?:o|ó)n semanal)\b/iu;
const AGGREGATE_EARNINGS_SCOPE_PATTERN =
  /\b(?:average weekly earnings?|national average earnings?|average wages?|weekly average earnings?|ganancias? semanales? promedio|ingresos? semanales? promedio|salarios? semanales? promedio|remuneraci(?:o|ó)n semanal promedio)\b/iu;
const PAYROLL_EMPLOYMENT_SCOPE_PATTERN =
  /\b(?:payroll employment|payroll employees?|employment|empleo(?: en nomina)?|empleados? en nomina|nomina)\b/iu;
const AGGREGATE_PAYROLL_SCOPE_PATTERN =
  /\b(?:payroll employment|payroll employees?|aggregate employment|total employment|national employment|employment (?:overall|nationally|across (?:the )?country)|empleo en nomina|empleados? en nomina|empleo (?:agregado|total|nacional)|nomina nacional|a nivel nacional|en todo el pais)\b/iu;
const LABOR_CONTRAST_PATTERN =
  /\b(?:while|whereas|but|however|versus|vs|contrast(?:s|ed)?|differ(?:s|ed|ent)?|not the same|does not (?:equal|mean)|mientras|mientras que|pero|sin embargo|frente a|en cambio|contrast(?:a|an)|difer(?:ente|entes|ia|ian)|distint(?:o|a|os|as)|no (?:miden|avanzan|crecen) (?:igual|lo mismo)|no equivale)\b/iu;
const AGGREGATE_LABOR_MOVEMENT_PATTERN =
  /\b(?:changed? little|little changed|change(?:d|s)?|unchanged|nearly unchanged|almost unchanged|flat|stagnant|rose|grew|increased?|decreased?|fell|dropped|added|cambi(?:o|aron)|cambio poco|sin cambios?|casi sin cambios?|practicamente no cambio|aument(?:o|aron)|subi(?:o|eron)|creci(?:o|eron)|baj(?:o|aron)|cay(?:o|eron)|alza(?:s)?|descenso(?:s)?)\b/iu;

const ORDINAL_NUMBER_PATTERNS: ReadonlyArray<{
  number: string;
  pattern: RegExp;
}> = [
  { number: "1", pattern: /\bfirst\b/iu },
  { number: "2", pattern: /\bsecond\b/iu },
  { number: "3", pattern: /\bthird\b/iu },
  { number: "4", pattern: /\bfourth\b/iu },
  { number: "5", pattern: /\bfifth\b/iu },
  { number: "6", pattern: /\bsixth\b/iu },
  { number: "7", pattern: /\bseventh\b/iu },
  { number: "8", pattern: /\beighth\b/iu },
  { number: "9", pattern: /\bninth\b/iu },
  { number: "10", pattern: /\btenth\b/iu },
];

const VERBAL_RATIO_PATTERNS: ReadonlyArray<{
  pattern: RegExp;
  numbers: readonly string[];
}> = [
  { pattern: /\bone\s+in\s+four\b/iu, numbers: ["1", "4"] },
  { pattern: /\bone\s+in\s+twenty\b/iu, numbers: ["1", "20"] },
  { pattern: /\buna?\s+de\s+cada\s+cuatro\b/iu, numbers: ["1", "4"] },
  { pattern: /\buna?\s+de\s+cada\s+veinte\b/iu, numbers: ["1", "20"] },
];

const CARDINAL_NUMBER_PATTERNS: ReadonlyArray<{
  number: string;
  pattern: RegExp;
}> = [
  {
    number: "1",
    // Spanish "un/una" is normally an indefinite article ("una etapa"),
    // not the numeric claim 1. Explicit Spanish ratios and fractions are
    // handled by their dedicated patterns above.
    pattern:
      /(?<![\p{L}\p{N}_])one(?![- ](?:third|quarter))(?![\p{L}\p{N}_])/iu,
  },
  {
    number: "2",
    pattern:
      /(?<![\p{L}\p{N}_])(?:two|twice|double|dos|dos veces|doble)(?![\p{L}\p{N}_])/iu,
  },
  {
    number: "3",
    pattern: /(?<![\p{L}\p{N}_])(?:three|tres)(?![\p{L}\p{N}_])/iu,
  },
  {
    number: "4",
    pattern: /(?<![\p{L}\p{N}_])(?:four|cuatro)(?![\p{L}\p{N}_])/iu,
  },
  {
    number: "5",
    pattern: /(?<![\p{L}\p{N}_])(?:five|cinco)(?![\p{L}\p{N}_])/iu,
  },
  {
    number: "6",
    pattern: /(?<![\p{L}\p{N}_])(?:six|seis)(?![\p{L}\p{N}_])/iu,
  },
  {
    number: "7",
    pattern: /(?<![\p{L}\p{N}_])(?:seven|siete)(?![\p{L}\p{N}_])/iu,
  },
  {
    number: "8",
    pattern: /(?<![\p{L}\p{N}_])(?:eight|ocho)(?![\p{L}\p{N}_])/iu,
  },
  {
    number: "9",
    pattern: /(?<![\p{L}\p{N}_])(?:nine|nueve)(?![\p{L}\p{N}_])/iu,
  },
  {
    number: "10",
    // JavaScript's ASCII-only \b treats the accented í in "tenía" as a
    // boundary, so /\bten\b/ incorrectly inferred the number 10. Unicode
    // letter/number guards keep translated prose from becoming a statistic.
    pattern: /(?<![\p{L}\p{N}_])(?:ten|diez)(?![\p{L}\p{N}_])/iu,
  },
  {
    number: "20",
    pattern: /(?<![\p{L}\p{N}_])(?:twenty|veinte)(?![\p{L}\p{N}_])/iu,
  },
];

export function withCreativeFactClaimGuard(
  fact: CreativeKeyFact,
): CreativeKeyFact {
  const inferred = inferCreativeFactClaimGuard(fact);
  const existing = fact.claimGuard;
  const certainty =
    existing?.certainty === "estimated" && inferred.certainty !== "estimated"
      ? inferred.certainty
      : existing && isFactCertainty(existing.certainty)
        ? existing.certainty
        : inferred.certainty;
  return {
    ...fact,
    claimGuard: existing
      ? {
          certainty,
          requiredPhrases: mergeText(existing.requiredPhrases, inferred.requiredPhrases),
          forbiddenPhrases: mergeText(
            existing.forbiddenPhrases,
            inferred.forbiddenPhrases,
          ),
          scopePhrases: mergeText(existing.scopePhrases, inferred.scopePhrases),
          allowedNumbers: mergeText(
            existing.allowedNumbers,
            inferred.allowedNumbers,
          ).map(normalizeNumber),
        }
      : inferred,
  };
}

export function inferCreativeFactClaimGuard(
  fact: CreativeKeyFact,
): CreativeFactClaimGuard {
  const qualifierText = (fact.requiredQualifiers ?? []).join(" ");
  const source = `${fact.statement} ${fact.sourceExcerpt ?? ""} ${qualifierText}`;
  const certainty: CreativeFactClaimGuard["certainty"] = SIGNAL_PATTERN.test(source)
    ? "detected-signal"
    : PROJECTION_PATTERN.test(source)
      ? "projection"
      : ASSOCIATION_PATTERN.test(source)
        ? "association"
        : ESTIMATE_PATTERN.test(source)
          ? "estimated"
          : REPORTED_PATTERN.test(source)
            ? "reported"
            : "asserted";
  return {
    certainty,
    requiredPhrases: uniqueText(fact.requiredQualifiers ?? []),
    forbiddenPhrases:
      certainty === "detected-signal"
        ? ["is AI-generated", "are AI-generated", "is AI-written", "are AI-written"]
        : [],
    scopePhrases: extractScopePhrases(fact.statement),
    // The concise fact statement may intentionally spell out or omit details
    // that remain explicit in the cited excerpt. Both are evidence, so retain
    // numeric literals from each instead of rejecting faithful slide copy.
    allowedNumbers: uniqueText([
      ...extractAllowedNumbers(fact.statement),
      ...extractAllowedNumbers(fact.sourceExcerpt ?? ""),
      ...extractAllowedNumbers(qualifierText),
      ...extractExplicitEnumerationCounts(fact.statement),
    ]),
  };
}

export function deterministicFactQualityIssues(
  draft: GeneratedCreativeDraft,
  keyFacts: readonly CreativeKeyFact[],
): CreativeQualityIssue[] {
  if (keyFacts.length === 0) return [];
  const factsById = new Map(
    keyFacts.map((fact) => {
      const guarded = withCreativeFactClaimGuard(fact);
      return [guarded.id, guarded] as const;
    }),
  );
  const issues: CreativeQualityIssue[] = [];

  const draftCopy = [
    draft.concept,
    draft.narrativeRationale,
    draft.caption,
    draft.callToAction,
    draft.altText,
  ]
    .filter(Boolean)
    .join(" ");
  const allFacts = [...factsById.values()];
  const allSourceCopy = allFacts.map((fact) => fact.statement).join(" ");
  if (
    allFacts.some(
      (fact) => fact.claimGuard?.certainty === "detected-signal",
    ) && CERTAINTY_UPGRADE_PATTERN.test(draftCopy)
  ) {
    issues.push({
      code: "CERTAINTY_UPGRADE",
      severity: "blocker",
      message:
        "The caption, call to action, or alt text turns detected AI-authorship signals into a categorical AI-generated claim.",
    });
  }
  const unsupportedDraftNumbers = extractBriefClaimNumbers(draftCopy).filter(
    (number) =>
      !allFacts.some((fact) =>
        fact.claimGuard?.allowedNumbers.includes(number),
      ),
  );
  if (unsupportedDraftNumbers.length > 0) {
    issues.push({
      code: "UNSUPPORTED_NUMBER",
      severity: "blocker",
      message: `The publishing copy uses ${unsupportedDraftNumbers.join(", ")} without support from the creative brief.`,
    });
  }
  if (
    UNSUPPORTED_INFERENCE_PATTERNS.some(
      ({ pattern, sourceSupport }) =>
        pattern.test(draftCopy) && !sourceSupport.test(allSourceCopy),
    )
  ) {
    issues.push({
      code: "UNSUPPORTED_INFERENCE",
      severity: "blocker",
      message:
        "The draft copy or narrative rationale adds a trend, causal effect, or consequence that the key facts do not establish.",
    });
  }
  const altTextMismatch = findAltTextSlideMismatch(draft);
  if (altTextMismatch) {
    issues.push({
      code: "ALT_TEXT_SLIDE_MISMATCH",
      severity: "blocker",
      unitOrder: altTextMismatch.claimedOrder,
      message: `The alt text attributes a numeric comparison to slide ${altTextMismatch.claimedOrder}, but that comparison appears on slide ${altTextMismatch.actualOrder}.`,
    });
  }

  draft.units.forEach((unit) => {
    const selectedFacts = unit.factIds.flatMap((id) => {
      const fact = factsById.get(id);
      return fact ? [fact] : [];
    });
    if (selectedFacts.length === 0) return;
    const visibleCopy = unitVisibleCopy(unit);
    const sourceCopy = selectedFacts.map((fact) => fact.statement).join(" ");

    if (
      selectedFacts.some(
        (fact) => fact.claimGuard?.certainty === "detected-signal",
      ) && CERTAINTY_UPGRADE_PATTERN.test(visibleCopy)
    ) {
      issues.push({
        code: "CERTAINTY_UPGRADE",
        severity: "blocker",
        unitOrder: unit.order,
        message: `Slide ${unit.order} turns detected AI-authorship signals into a categorical AI-generated claim. Preserve wording such as “shows signs” or “signals”.`,
      });
    }

    const unsupportedNumbers = extractAllowedNumbers(visibleCopy).filter(
      (number) =>
        !selectedFacts.some((fact) =>
          fact.claimGuard?.allowedNumbers.includes(number),
        ) &&
        !isBriefSupportedCalendarYear(number, allFacts),
    );
    if (unsupportedNumbers.length > 0) {
      issues.push({
        code: "UNSUPPORTED_NUMBER",
        severity: "blocker",
        unitOrder: unit.order,
        message: `Slide ${unit.order} uses ${unsupportedNumbers.join(", ")} without support from its selected facts.`,
      });
    }

    const missingLaborContrastFactIds =
      uniqueMissingLaborContrastFactIds(
        visibleCopy,
        selectedFacts,
        allFacts,
      );
    if (missingLaborContrastFactIds.length > 0) {
      issues.push({
        code: "MISSING_FACT_ASSIGNMENT",
        severity: "blocker",
        unitOrder: unit.order,
        message: `Slide ${unit.order} contrasts average earnings with aggregate payroll employment but does not select ${missingLaborContrastFactIds.join(", ")}, the uniquely supporting ${missingLaborContrastFactIds.length === 1 ? "fact" : "facts"}.`,
      });
    }

    const missingSectorMovementFactId =
      uniqueMissingSectorMovementFactId(
        visibleCopy,
        selectedFacts,
        allFacts,
      );
    if (missingSectorMovementFactId) {
      issues.push({
        code: "MISSING_FACT_ASSIGNMENT",
        severity: "blocker",
        unitOrder: unit.order,
        message: `Slide ${unit.order} summarizes gains and losses across sectors but does not select ${missingSectorMovementFactId}, the fact that establishes both movements.`,
      });
    }

    if (
      selectedFacts.some(
        (fact) =>
          factUsesNumberInCopy(fact, visibleCopy) &&
          factRequiresEstimateQualifier(fact),
      ) && !ESTIMATE_PATTERN.test(visibleCopy)
    ) {
      issues.push({
        code: "LOST_QUALIFIER",
        severity: "blocker",
        unitOrder: unit.order,
        message: `Slide ${unit.order} presents an approximate value as exact. Preserve a qualifier such as “about”, “nearly”, or “estimated”.`,
      });
    }

    const missingScopeFacts = selectedFacts.filter((fact) => {
      const scopes = fact.claimGuard?.scopePhrases ?? [];
      return scopes.length > 0 && !scopes.some((scope) => scopeMatches(visibleCopy, scope));
    });
    if (missingScopeFacts.length > 0) {
      issues.push({
        code: "MISSING_SCOPE",
        severity: "blocker",
        unitOrder: unit.order,
        message: `Slide ${unit.order} omits the population or timeframe needed for ${missingScopeFacts.map((fact) => fact.id).join(", ")}.`,
      });
    }

    if (
      UNSUPPORTED_INFERENCE_PATTERNS.some(
        ({ pattern, sourceSupport }) =>
          pattern.test(visibleCopy) && !sourceSupport.test(sourceCopy),
      )
    ) {
      issues.push({
        code: "UNSUPPORTED_INFERENCE",
        severity: "blocker",
        unitOrder: unit.order,
        message: `Slide ${unit.order} adds a trend, causal effect, or consequence that its selected facts do not establish.`,
      });
    }
  });

  draft.units.forEach((unit, unitIndex) => {
    const cue = unit.continuationCue?.trim();
    if (!cue) return;

    const nextUnit = draft.units[unitIndex + 1];
    const cueFacts = [...new Set([...unit.factIds, ...(nextUnit?.factIds ?? [])])]
      .flatMap((id) => {
        const fact = factsById.get(id);
        return fact ? [fact] : [];
      });
    const cueSourceCopy = cueFacts.map((fact) => fact.statement).join(" ");
    const unsupportedCueNumbers = extractAllowedNumbers(cue).filter(
      (number) =>
        !cueFacts.some((fact) =>
          fact.claimGuard?.allowedNumbers.includes(number),
        ) && !isBriefSupportedCalendarYear(number, allFacts),
    );
    if (unsupportedCueNumbers.length > 0) {
      issues.push({
        code: "UNSUPPORTED_NUMBER",
        severity: "blocker",
        unitOrder: unit.order,
        message: `Slide ${unit.order} continuation cue uses ${unsupportedCueNumbers.join(", ")} without support from this slide or the next slide.`,
      });
    }
    const cueNumberFacts = cueFacts.filter((fact) =>
      factUsesNumberInCopy(fact, cue),
    );
    if (
      cueNumberFacts.some(factRequiresEstimateQualifier) &&
      !ESTIMATE_PATTERN.test(cue)
    ) {
      issues.push({
        code: "LOST_QUALIFIER",
        severity: "blocker",
        unitOrder: unit.order,
        message: `Slide ${unit.order} continuation cue presents an approximate value as exact. Preserve its estimate qualifier.`,
      });
    }
    const missingCueScopeFacts = cueNumberFacts.filter((fact) => {
      const scopes = fact.claimGuard?.scopePhrases ?? [];
      return (
        scopes.length > 0 &&
        !scopes.some((scope) => scopeMatches(cue, scope))
      );
    });
    if (missingCueScopeFacts.length > 0) {
      issues.push({
        code: "MISSING_SCOPE",
        severity: "blocker",
        unitOrder: unit.order,
        message: `Slide ${unit.order} continuation cue omits the population or timeframe needed for ${missingCueScopeFacts.map((fact) => fact.id).join(", ")}.`,
      });
    }
    if (
      cueFacts.some(
        (fact) => fact.claimGuard?.certainty === "detected-signal",
      ) && CERTAINTY_UPGRADE_PATTERN.test(cue)
    ) {
      issues.push({
        code: "CERTAINTY_UPGRADE",
        severity: "blocker",
        unitOrder: unit.order,
        message: `Slide ${unit.order} continuation cue upgrades an uncertain source claim to certainty.`,
      });
    }
    if (hasUnsupportedInference(cue, cueSourceCopy)) {
      issues.push({
        code: "UNSUPPORTED_INFERENCE",
        severity: "blocker",
        unitOrder: unit.order,
        message: `Slide ${unit.order} continuation cue promises a consequence that this slide and the next slide do not establish.`,
      });
    }
  });

  const closing = draft.units.at(-1);
  if (
    closing?.editorialGoal === "conclude" &&
    !closing.body?.trim() &&
    !closing.ctaQuestion?.trim() &&
    GENERIC_CLOSING_PATTERN.test(closing.headline.trim())
  ) {
    issues.push({
      code: "EMPTY_CONCLUSION",
      severity: "blocker",
      unitOrder: closing.order,
      message: `Slide ${closing.order} promises a takeaway but contains no conclusion or closing question.`,
    });
  }

  return deduplicateIssues(issues);
}

export function deterministicBriefFactQualityIssues(
  brief: GeneratedCreativeBrief,
  sourceText?: string,
): CreativeQualityIssue[] {
  if (brief.keyFacts.length === 0) return [];
  const facts = brief.keyFacts.map(withCreativeFactClaimGuard);
  const factsById = new Map(facts.map((fact) => [fact.id, fact] as const));
  const allSourceCopy = facts.map((fact) => fact.statement).join(" ");
  const issues: CreativeQualityIssue[] = [];
  if (sourceText !== undefined) {
    const normalizedSource = normalizeText(sourceText);
    facts.forEach((fact) => {
      const excerpt = fact.sourceExcerpt?.trim();
      if (!excerpt) {
        issues.push({
          code: "MISSING_SOURCE_EVIDENCE",
          severity: "blocker",
          message: `${fact.id} does not include a source excerpt.`,
        });
        return;
      }
      if (!normalizedSource.includes(normalizeText(excerpt))) {
        issues.push({
          code: "SOURCE_EVIDENCE_NOT_FOUND",
          severity: "blocker",
          message: `${fact.id} cites evidence that does not appear verbatim in the supplied source.`,
        });
        return;
      }
      const evidenceNumbers = new Set(extractBriefClaimNumbers(excerpt));
      const unsupportedFactNumbers = extractBriefClaimNumbers(
        fact.statement,
      ).filter((number) => !evidenceNumbers.has(number));
      if (unsupportedFactNumbers.length > 0) {
        issues.push({
          code: "FACT_NUMBER_NOT_IN_EVIDENCE",
          severity: "blocker",
          message: `${fact.id} uses ${unsupportedFactNumbers.join(", ")} outside its cited source excerpt.`,
        });
      }
      if (hasUnsupportedInference(fact.statement, excerpt)) {
        issues.push({
          code: "FACT_EXCEEDS_SOURCE_EVIDENCE",
          severity: "blocker",
          message: `${fact.id} adds a topic, benefit, or interpretation not established by its cited source excerpt.`,
        });
      }
    });
  }
  const strategyCopy = [
    brief.keyMessage,
    brief.angle,
    brief.hook,
    ...brief.suggestedConcepts.flatMap((concept) => [
      concept.title,
      concept.concept,
    ]),
  ].join(" ");

  appendUnsupportedCopyIssues(
    issues,
    strategyCopy,
    allSourceCopy,
    facts,
    "The creative brief",
  );

  brief.carouselPlan?.slides.forEach((slide, index) => {
    const selectedFacts = slide.allowedFactIds.flatMap((id) => {
      const fact = factsById.get(id);
      return fact ? [fact] : [];
    });
    appendUnsupportedCopyIssues(
      issues,
      slide.viewerQuestion,
      selectedFacts.map((fact) => fact.statement).join(" "),
      selectedFacts,
      `Carousel plan slide ${index + 1}`,
      index + 1,
    );
  });

  return deduplicateIssues(issues);
}

/**
 * Narrows only unsupported strategy/planning copy to already verified facts.
 * This is deliberately conservative: it never repairs fact statements or
 * source excerpts, which must still pass the source-evidence gate unchanged.
 */
export function repairDeterministicBriefScope(
  brief: GeneratedCreativeBrief,
  language?: string,
): GeneratedCreativeBrief {
  if (brief.keyFacts.length === 0) return brief;
  const facts = brief.keyFacts.map(withCreativeFactClaimGuard);
  const allSourceCopy = facts.map((fact) => fact.statement).join(" ");
  let repaired = false;

  const repairStrategyCopy = (
    value: string,
    fallbackFact: CreativeKeyFact,
    maxLength?: number,
  ): string => {
    if (!briefCopyExceedsFacts(value, allSourceCopy, facts)) return value;
    repaired = true;
    return maxLength
      ? truncateWithoutBreakingWord(fallbackFact.statement, maxLength)
      : fallbackFact.statement;
  };

  const keyMessage = repairStrategyCopy(brief.keyMessage, facts[0]!);
  const angle = repairStrategyCopy(brief.angle, facts[1] ?? facts[0]!);
  const hook = repairStrategyCopy(brief.hook, facts[0]!, 300);
  const suggestedConcepts = brief.suggestedConcepts.map((concept, index) => {
    const fallbackFact = facts[index % facts.length]!;
    return {
      ...concept,
      title: repairStrategyCopy(concept.title, fallbackFact, 120),
      concept: repairStrategyCopy(concept.concept, fallbackFact, 500),
    };
  });
  const carouselPlan = brief.carouselPlan
    ? {
        ...brief.carouselPlan,
        slides: brief.carouselPlan.slides.map((slide) => {
          const selectedFacts = slide.allowedFactIds.flatMap((id) => {
            const fact = facts.find((candidate) => candidate.id === id);
            return fact ? [fact] : [];
          });
          const selectedSourceCopy = selectedFacts
            .map((fact) => fact.statement)
            .join(" ");
          if (
            selectedFacts.length === 0 ||
            !briefCopyExceedsFacts(
              slide.viewerQuestion,
              selectedSourceCopy,
              selectedFacts,
            )
          ) {
            return slide;
          }
          repaired = true;
          return {
            ...slide,
            viewerQuestion: localizedSourceQuestion(
              slide.viewerQuestion,
              language,
            ),
          };
        }),
      }
    : undefined;

  if (!repaired) return brief;
  const repairFlag =
    "Automated factual-scope repair narrowed the strategy to verified source evidence.";
  return {
    ...brief,
    keyMessage,
    angle,
    hook,
    contentSufficiency:
      brief.contentSufficiency === "insufficient" ? "insufficient" : "limited",
    riskFlags: uniqueText([...brief.riskFlags, repairFlag]).slice(0, 5),
    suggestedConcepts,
    ...(carouselPlan ? { carouselPlan } : {}),
  };
}

function appendUnsupportedCopyIssues(
  issues: CreativeQualityIssue[],
  copy: string,
  sourceCopy: string,
  facts: readonly CreativeKeyFact[],
  label: string,
  unitOrder?: number,
): void {
  const unsupportedNumbers = extractBriefClaimNumbers(copy).filter(
    (number) =>
      !facts.some((fact) => fact.claimGuard?.allowedNumbers.includes(number)),
  );
  if (unsupportedNumbers.length > 0) {
    issues.push({
      code: "UNSUPPORTED_NUMBER",
      severity: "blocker",
      ...(unitOrder === undefined ? {} : { unitOrder }),
      message: `${label} uses ${unsupportedNumbers.join(", ")} without support from its facts.`,
    });
  }
  if (hasUnsupportedInference(copy, sourceCopy)) {
    issues.push({
      code: "UNSUPPORTED_BRIEF_SCOPE",
      severity: "blocker",
      ...(unitOrder === undefined ? {} : { unitOrder }),
      message: `${label} promises a topic, benefit, or interpretation that its facts do not establish.`,
    });
  }
}

export function repairDeterministicFactCopy(
  draft: GeneratedCreativeDraft,
  keyFacts: readonly CreativeKeyFact[],
  language?: string,
): GeneratedCreativeDraft {
  if (keyFacts.length === 0) return draft;
  const factsById = new Map(
    keyFacts.map((fact) => {
      const guarded = withCreativeFactClaimGuard(fact);
      return [guarded.id, guarded] as const;
    }),
  );
  const allFacts = [...factsById.values()];
  const allSourceCopy = allFacts.map((fact) => fact.statement).join(" ");
  // Array.map runs sequentially. Record the effective repaired assignments as
  // each unit completes so a later closing can reuse a fact recovered for an
  // earlier slide, while never treating its original broken assignment as
  // established evidence.
  const establishedFactIds = new Set<string>();
  const repaired: GeneratedCreativeDraft = {
    ...draft,
    caption: repairPublishingCopy(
      draft.caption,
      allSourceCopy,
      localizedFallback(language, "summary"),
      language,
      allFacts,
    ),
    altText: repairPublishingCopy(
      repairAltTextSlideReference(draft),
      allSourceCopy,
      localizedFallback(language, "alt-text"),
      language,
      allFacts,
    ),
    ...(draft.callToAction === undefined
      ? {}
      : {
          callToAction: repairPublishingCopy(
            draft.callToAction,
            allSourceCopy,
            "",
            language,
            allFacts,
          ) || undefined,
        }),
    units: draft.units.map((unit) => {
      const isClosingUnit =
        unit.editorialGoal === "conclude" ||
        unit.editorialGoal === "debate";
      const numericFactIds = repairNumericFactAssignments(
        unit,
        factsById,
        establishedFactIds,
      );
      const laborContrastFactIds = uniqueLaborContrastFactIds(
        unitVisibleCopy(unit),
        allFacts,
      );
      const narrowedUnsupportedClosingLaborContrast = Boolean(
        laborContrastFactIds &&
          isClosingUnit &&
          !laborContrastFactIds.every((id) => establishedFactIds.has(id)),
      );
      const contrastFactIds = repairLaborContrastFactAssignment(
        unit,
        numericFactIds,
        allFacts,
        establishedFactIds,
      );
      const selectedContrastFacts = contrastFactIds.flatMap((id) => {
        const fact = factsById.get(id);
        return fact ? [fact] : [];
      });
      const sectorMovementFactId = uniqueMissingSectorMovementFactId(
        unitVisibleCopy(unit),
        selectedContrastFacts,
        allFacts,
      );
      const factIds = repairSectorMovementFactAssignment(
        unit,
        contrastFactIds,
        factsById,
      );
      const prioritizedClosingLaborContrast = Boolean(
        laborContrastFactIds &&
          isClosingUnit &&
          !narrowedUnsupportedClosingLaborContrast,
      );
      const narrowedToSectorEvidence = Boolean(
        sectorMovementFactId &&
          factIds.length === 1 &&
          !contrastFactIds.includes(sectorMovementFactId),
      );
      const selectedFacts = factIds.flatMap((id) => {
        const fact = factsById.get(id);
        return fact ? [fact] : [];
      });
      const sourceCopy = selectedFacts
        .map((fact) => fact.statement)
        .join(" ");
      const repairedHeadline = hasUnsupportedInference(
        unit.headline,
        sourceCopy,
      )
        ? repairUnsupportedInference(unit.headline, sourceCopy)
        : unit.headline;
      let headline = localizeEstimateQualifiers(
        repairCertaintyUpgrade(repairedHeadline),
        language,
      ) || localizedEvidenceHeadline(language);
      let subheadline = unit.subheadline
        ? localizeEstimateQualifiers(
            repairCertaintyUpgrade(
              repairUnsupportedInference(unit.subheadline, sourceCopy),
            ),
            language,
          )
        : undefined;
      let body = unit.body
        ? localizeEstimateQualifiers(
            repairCertaintyUpgrade(
              repairUnsupportedInference(unit.body, sourceCopy),
            ),
            language,
        )
        : undefined;
      if (narrowedUnsupportedClosingLaborContrast) {
        headline = localizedNarrowedClosingHeadline(language);
        subheadline = undefined;
        body = undefined;
      }
      if (prioritizedClosingLaborContrast && body) {
        body = removeSectorMovementSentences(body);
      }
      if (narrowedToSectorEvidence && body) {
        body = retainSectorMovementSummary(body);
      }
      let ctaQuestion = unit.ctaQuestion
        ? localizeEstimateQualifiers(
          repairCertaintyUpgrade(unit.ctaQuestion),
          language,
        )
        : undefined;
      if (narrowedUnsupportedClosingLaborContrast) {
        ctaQuestion = localizedNarrowedClosingQuestion(language);
      }
      if (
        prioritizedClosingLaborContrast &&
        ctaQuestion &&
        isSectorMovementSummary(ctaQuestion)
      ) {
        ctaQuestion = localizedLaborContrastQuestion(language);
      }
      if (
        ctaQuestion &&
        hasUnsupportedInference(ctaQuestion, sourceCopy) &&
        (unit.editorialGoal === "conclude" ||
          unit.editorialGoal === "debate")
      ) {
        ctaQuestion = isSpanishLanguage(language)
          ? "¿Cómo interpretarías estos datos?"
          : "How would you interpret these findings?";
      }
      if (
        unit.editorialGoal === "prove" &&
        wordCount(body) <= 2 &&
        selectedFacts[0]
      ) {
        body = selectedFacts[0].statement;
      }
      let visibleCopy = [headline, subheadline, body, ctaQuestion]
        .filter(Boolean)
        .join(" ");
      {
        // Numeric claims need the same evidence rule on every slide. Earlier
        // slides may add a uniquely matching fact ID above; any remaining
        // number has no verified support and must not survive to review.
        const repairedHeadline = removeUnsupportedNumericClauses(
          headline,
          selectedFacts,
          allFacts,
        );
        const repairedBody = body
          ? removeUnsupportedNumericClauses(body, selectedFacts, allFacts)
          : undefined;
        const repairedSubheadline = subheadline
          ? removeUnsupportedNumericClauses(
              subheadline,
              selectedFacts,
              allFacts,
            )
          : undefined;
        const repairedCta = ctaQuestion
          ? removeUnsupportedNumericClauses(
              ctaQuestion,
              selectedFacts,
              allFacts,
            )
          : undefined;
        headline = repairedHeadline || localizedEvidenceHeadline(language);
        subheadline = repairedSubheadline || undefined;
        body = repairedBody || undefined;
        ctaQuestion =
          repairedCta ||
          (unit.editorialGoal === "debate"
            ? isSpanishLanguage(language)
              ? "¿Cómo interpretarías estos datos?"
              : "How would you interpret these findings?"
            : undefined);
        visibleCopy = [headline, subheadline, body, ctaQuestion]
          .filter(Boolean)
          .join(" ");
      }
      if (
        selectedFacts.some(
          (fact) =>
            factUsesNumberInCopy(fact, visibleCopy) &&
            factRequiresEstimateQualifier(fact),
        ) && !ESTIMATE_PATTERN.test(visibleCopy)
      ) {
        if (subheadline && extractAllowedNumbers(subheadline).length > 0) {
          subheadline = repairMissingEstimateQualifier(
            subheadline,
            selectedFacts,
            language,
          );
        } else if (body && extractAllowedNumbers(body).length > 0) {
          body = repairMissingEstimateQualifier(body, selectedFacts, language);
        } else {
          headline = repairMissingEstimateQualifier(
            headline,
            selectedFacts,
            language,
          );
        }
        visibleCopy = [headline, subheadline, body, ctaQuestion]
          .filter(Boolean)
          .join(" ");
      }
      const olderPagesFact = selectedFacts.find(
        (fact) =>
          fact.claimGuard?.scopePhrases.some(
            (scope) => normalizeText(scope) === "older pages",
          ) && !scopeMatches(visibleCopy, "older pages"),
      );
      if (olderPagesFact) {
        body = appendSentence(body, "The sample includes older pages.");
        visibleCopy = [headline, subheadline, body, ctaQuestion]
          .filter(Boolean)
          .join(" ");
      }
      const missingNumericScope = selectedFacts.find(
        (fact) =>
          factUsesNumberInCopy(fact, visibleCopy) &&
          (fact.claimGuard?.scopePhrases.length ?? 0) > 0 &&
          !fact.claimGuard?.scopePhrases.some((scope) =>
            scopeMatches(visibleCopy, scope),
          ),
      )?.claimGuard?.scopePhrases[0];
      if (missingNumericScope) {
        if (subheadline && extractAllowedNumbers(subheadline).length > 0) {
          subheadline = integrateScopeNaturally(
            subheadline,
            missingNumericScope,
            language,
          );
        } else if (body && extractAllowedNumbers(body).length > 0) {
          body = integrateScopeNaturally(body, missingNumericScope, language);
        } else {
          headline = integrateScopeNaturally(
            headline,
            missingNumericScope,
            language,
          );
        }
      }
      visibleCopy = [headline, subheadline, body, ctaQuestion]
        .filter(Boolean)
        .join(" ");
      const closingFact = selectedFacts[0];
      const closingNeedsSafeSynthesis = Boolean(
        closingFact &&
          (unit.editorialGoal === "conclude" ||
            unit.editorialGoal === "debate") &&
          (hasUnsupportedInference(visibleCopy, sourceCopy) ||
            CERTAINTY_UPGRADE_PATTERN.test(visibleCopy) ||
            (closingFact.claimGuard?.scopePhrases.length &&
              !closingFact.claimGuard.scopePhrases.some((scope) =>
                scopeMatches(visibleCopy, scope),
              ))),
      );
      if (closingFact && closingNeedsSafeSynthesis) {
        body =
          unit.editorialGoal === "debate" && ctaQuestion?.trim()
            ? undefined
            : safeConclusionForFact(closingFact, language);
      }
      const visualDirection = prioritizedClosingLaborContrast
        ? removeSectorMovementSentences(unit.visualDirection) ??
          localizedLaborContrastVisualDirection(language)
        : narrowedUnsupportedClosingLaborContrast
          ? localizedNarrowedClosingVisualDirection(language)
          : unit.visualDirection;
      const repairedUnit: GeneratedCreativeDraft["units"][number] = {
        ...unit,
        factIds,
        headline,
        visualDirection,
        ...(subheadline
          ? { subheadline }
          : { subheadline: undefined }),
        ...(body ? { body } : { body: undefined }),
        ...(ctaQuestion
          ? { ctaQuestion }
          : { ctaQuestion: undefined }),
      };
      repairedUnit.factIds.forEach((id) => establishedFactIds.add(id));
      return repairedUnit;
    }),
  };

  repaired.caption = repairMissingPublishingScope(
    repaired.caption,
    allFacts,
    language,
  );

  const closing = repaired.units.at(-1);
  if (
    closing &&
    uniqueLaborContrastFactIds(unitVisibleCopy(closing), allFacts)
  ) {
    repaired.altText = removeClosingSectorAltTextClause(
      repaired.altText,
      closing.order,
    );
  }
  if (
    closing?.editorialGoal === "debate" &&
    closing.factIds.length > 1 &&
    !isSectorMovementSummary(unitVisibleCopy(closing)) &&
    !uniqueLaborContrastFactIds(unitVisibleCopy(closing), allFacts)
  ) {
    const visibleNumbers = extractAllowedNumbers(
      [
        closing.headline,
        closing.subheadline,
        closing.body,
        closing.ctaQuestion,
      ]
        .filter(Boolean)
        .join(" "),
    );
    const fullySupportingFacts = closing.factIds.filter((id) => {
      const fact = factsById.get(id);
      return Boolean(
        fact &&
          visibleNumbers.length > 0 &&
          visibleNumbers.every((number) =>
            fact.claimGuard?.allowedNumbers.includes(number),
          ),
      );
    });
    if (fullySupportingFacts.length === 1) {
      closing.factIds = [fullySupportingFacts[0]!];
    }
  }
  if (
    closing?.editorialGoal === "conclude" &&
    !closing.body?.trim() &&
    !closing.ctaQuestion?.trim() &&
    GENERIC_CLOSING_PATTERN.test(closing.headline.trim())
  ) {
    const fact = closing.factIds.map((id) => factsById.get(id)).find(Boolean);
    if (fact) closing.body = safeConclusionForFact(fact, language);
  }
  repairContinuationCues(repaired, factsById, allFacts, language);
  return repaired;
}

function repairNumericFactAssignments(
  unit: GeneratedCreativeDraft["units"][number],
  factsById: ReadonlyMap<string, CreativeKeyFact>,
  establishedFactIds: ReadonlySet<string>,
): string[] {
  const isClosingUnit =
    unit.editorialGoal === "conclude" || unit.editorialGoal === "debate";
  const factIsEligible = (id: string): boolean =>
    factsById.has(id) && (!isClosingUnit || establishedFactIds.has(id));
  const factIds = unit.factIds.filter(factIsEligible);
  const visibleNumbers = extractAllowedNumbers(
    [unit.headline, unit.subheadline, unit.body, unit.ctaQuestion]
      .filter(Boolean)
      .join(" "),
  );

  for (const number of visibleNumbers) {
    const alreadySupported = factIds.some((id) =>
      factsById.get(id)?.claimGuard?.allowedNumbers.includes(number),
    );
    if (alreadySupported) continue;

    const matchingFacts = [...factsById.values()].filter(
      (fact) =>
        factIsEligible(fact.id) &&
        fact.claimGuard?.allowedNumbers.includes(number),
    );
    if (matchingFacts.length !== 1) continue;
    const matchingId = matchingFacts[0]!.id;
    if (!factIds.includes(matchingId) && factIds.length < 6) {
      factIds.push(matchingId);
    }
  }
  return factIds;
}

function repairContinuationCues(
  draft: GeneratedCreativeDraft,
  factsById: ReadonlyMap<string, CreativeKeyFact>,
  allFacts: readonly CreativeKeyFact[],
  language?: string,
): void {
  draft.units.forEach((unit, unitIndex) => {
    const originalCue = unit.continuationCue?.trim();
    const nextUnit = draft.units[unitIndex + 1];
    if (!originalCue || !nextUnit) {
      delete unit.continuationCue;
      return;
    }

    const cueFacts = [...new Set([...unit.factIds, ...nextUnit.factIds])]
      .flatMap((id) => {
        const fact = factsById.get(id);
        return fact ? [fact] : [];
      });
    const sourceCopy = cueFacts.map((fact) => fact.statement).join(" ");
    let cue = localizeEstimateQualifiers(
      repairCertaintyUpgrade(
        repairUnsupportedInference(originalCue, sourceCopy),
      ),
      language,
    );
    cue = removeUnsupportedNumericClauses(cue, cueFacts, allFacts);
    if (
      cue &&
      cueFacts.some(
        (fact) =>
          factUsesNumberInCopy(fact, cue) &&
          factRequiresEstimateQualifier(fact),
      ) &&
      !ESTIMATE_PATTERN.test(cue)
    ) {
      cue = repairMissingEstimateQualifier(cue, cueFacts, language);
    }
    if (cue) {
      const numericCueFacts = cueFacts.filter((fact) =>
        factUsesNumberInCopy(fact, cue),
      );
      for (const fact of numericCueFacts) {
        const scopes = fact.claimGuard?.scopePhrases ?? [];
        if (
          scopes.length === 0 ||
          scopes.some((scope) => scopeMatches(cue, scope))
        ) {
          continue;
        }
        const scopedCue = scopes
          .map((scope) => integrateScopeNaturally(cue, scope, language))
          .find((candidate, scopeIndex) =>
            scopeMatches(candidate, scopes[scopeIndex]!),
          );
        if (!scopedCue) {
          cue = "";
          break;
        }
        cue = scopedCue;
      }
    }

    if (!cue || hasUnsupportedInference(cue, sourceCopy)) {
      delete unit.continuationCue;
      return;
    }
    unit.continuationCue = cue;
  });
}

function repairLaborContrastFactAssignment(
  unit: GeneratedCreativeDraft["units"][number],
  factIds: readonly string[],
  allFacts: readonly CreativeKeyFact[],
  establishedFactIds: ReadonlySet<string>,
): string[] {
  const supportingIds = uniqueLaborContrastFactIds(
    unitVisibleCopy(unit),
    allFacts,
  );
  if (!supportingIds) return [...factIds];

  const isClosingUnit =
    unit.editorialGoal === "conclude" || unit.editorialGoal === "debate";
  if (
    isClosingUnit &&
    !supportingIds.every((id) => establishedFactIds.has(id))
  ) {
    // A closing may synthesize facts established earlier, but must never
    // introduce the missing half of a new contrast. The caller narrows this
    // unit to a non-factual closing prompt.
    return [];
  }

  // Prioritize the supporting pair, then preserve other known facts up to the
  // actual narrative budget. In particular, prove/compare legitimately allow
  // a third evidence fact.
  const prioritizedIds = [
    ...factIds.filter((id) => supportingIds.includes(id)),
    ...supportingIds.filter((id) => !factIds.includes(id)),
    ...factIds.filter((id) => !supportingIds.includes(id)),
  ];
  const budget = unit.editorialGoal
    ? maximumFactsForGoal(unit.editorialGoal)
    : prioritizedIds.length;
  return prioritizedIds.slice(0, budget);
}

function repairSectorMovementFactAssignment(
  unit: GeneratedCreativeDraft["units"][number],
  factIds: readonly string[],
  factsById: ReadonlyMap<string, CreativeKeyFact>,
): string[] {
  const selectedFacts = factIds.flatMap((id) => {
    const fact = factsById.get(id);
    return fact ? [fact] : [];
  });
  if (
    uniqueLaborContrastFactIds(
      unitVisibleCopy(unit),
      [...factsById.values()],
    )
  ) {
    // When the slide explicitly resolves the earnings-vs-employment hook, its
    // two uniquely supporting facts take precedence over a third sector fact.
    return [...factIds];
  }
  const matchingId = uniqueMissingSectorMovementFactId(
    unitVisibleCopy(unit),
    selectedFacts,
    [...factsById.values()],
  );
  if (!matchingId) return [...factIds];
  if (
    unit.editorialGoal === "conclude" ||
    unit.editorialGoal === "debate"
  ) {
    // A sector summary is one proposition. Replace unrelated assignments
    // instead of retaining facts that the closing copy no longer uses.
    return [matchingId];
  }
  if (factIds.length >= 6) return [...factIds];
  return [...factIds, matchingId];
}

function uniqueMissingLaborContrastFactIds(
  visibleCopy: string,
  selectedFacts: readonly CreativeKeyFact[],
  allFacts: readonly CreativeKeyFact[],
): string[] {
  const supportingIds = uniqueLaborContrastFactIds(visibleCopy, allFacts);
  if (!supportingIds) return [];
  const selectedIds = new Set(selectedFacts.map((fact) => fact.id));
  return supportingIds.filter((id) => !selectedIds.has(id));
}

function uniqueLaborContrastFactIds(
  visibleCopy: string,
  allFacts: readonly CreativeKeyFact[],
): string[] | undefined {
  if (!isLaborMarketContrast(visibleCopy)) return undefined;

  const earningsFacts = allFacts.filter(isEarningsMovementEvidenceFact);
  const payrollFacts = allFacts.filter(isAggregatePayrollMovementEvidenceFact);
  if (earningsFacts.length !== 1 || payrollFacts.length !== 1) {
    return undefined;
  }

  const requiredIds = new Set([
    earningsFacts[0]!.id,
    payrollFacts[0]!.id,
  ]);
  if (requiredIds.size !== 2) return undefined;

  // Retain brief order for stable persisted output and predictable tests.
  return allFacts
    .map((fact) => fact.id)
    .filter((id) => requiredIds.has(id));
}

function isLaborMarketContrast(value: string): boolean {
  const normalized = normalizeText(value);
  return (
    EARNINGS_SCOPE_PATTERN.test(normalized) &&
    PAYROLL_EMPLOYMENT_SCOPE_PATTERN.test(normalized) &&
    LABOR_CONTRAST_PATTERN.test(normalized)
  );
}

function isEarningsMovementEvidenceFact(fact: CreativeKeyFact): boolean {
  const evidence = normalizeText(
    [fact.statement, fact.sourceExcerpt].filter(Boolean).join(" "),
  );
  return (
    AGGREGATE_EARNINGS_SCOPE_PATTERN.test(evidence) &&
    AGGREGATE_LABOR_MOVEMENT_PATTERN.test(evidence) &&
    !SECTOR_SCOPE_PATTERN.test(evidence) &&
    !SECTOR_ENTITY_PATTERN.test(evidence)
  );
}

function isAggregatePayrollMovementEvidenceFact(
  fact: CreativeKeyFact,
): boolean {
  const evidence = normalizeText(
    [fact.statement, fact.sourceExcerpt].filter(Boolean).join(" "),
  );
  return (
    AGGREGATE_PAYROLL_SCOPE_PATTERN.test(evidence) &&
    AGGREGATE_LABOR_MOVEMENT_PATTERN.test(evidence) &&
    !SECTOR_SCOPE_PATTERN.test(evidence) &&
    !SECTOR_ENTITY_PATTERN.test(evidence)
  );
}

function uniqueMissingSectorMovementFactId(
  visibleCopy: string,
  selectedFacts: readonly CreativeKeyFact[],
  allFacts: readonly CreativeKeyFact[],
): string | undefined {
  if (!isSectorMovementSummary(visibleCopy)) return undefined;
  if (selectedFacts.some(isSectorMovementEvidenceFact)) return undefined;

  const matchingFacts = allFacts.filter(isSectorMovementEvidenceFact);
  return matchingFacts.length === 1 ? matchingFacts[0]?.id : undefined;
}

function isSectorMovementSummary(value: string): boolean {
  const normalized = normalizeText(value);
  return (
    SECTOR_SCOPE_PATTERN.test(normalized) &&
    POSITIVE_SECTOR_MOVEMENT_PATTERN.test(normalized) &&
    NEGATIVE_SECTOR_MOVEMENT_PATTERN.test(normalized)
  );
}

function isSectorMovementEvidenceFact(fact: CreativeKeyFact): boolean {
  const evidence = normalizeText(
    [fact.statement, fact.sourceExcerpt].filter(Boolean).join(" "),
  );
  const hasSectorEvidence =
    SECTOR_SCOPE_PATTERN.test(evidence) || SECTOR_ENTITY_PATTERN.test(evidence);
  return (
    hasSectorEvidence &&
    POSITIVE_SECTOR_MOVEMENT_PATTERN.test(evidence) &&
    NEGATIVE_SECTOR_MOVEMENT_PATTERN.test(evidence)
  );
}

function retainSectorMovementSummary(value: string): string | undefined {
  for (const sentence of splitSentenceClauses(value)) {
    const candidates = sentence.split(
      /\b(?:pero|sin embargo|mientras que|but|however|while)\b/iu,
    );
    const supported = candidates.find(isSectorMovementSummary);
    if (supported) {
      const trimmed = supported.trim();
      return normalizePunctuation(
        `${trimmed.charAt(0).toUpperCase()}${trimmed.slice(1)}`,
      );
    }
  }
  return undefined;
}

function removeSectorMovementSentences(value: string): string | undefined {
  const retained = splitSentenceClauses(value).flatMap((sentence) => {
    if (!isSectorMovementSummary(sentence)) return [sentence];
    const narrowed = retainLaborContrastClause(sentence);
    return narrowed ? [narrowed] : [];
  });
  const result = retained.join(" ").replace(/\s+/gu, " ").trim();
  return result || undefined;
}

function retainLaborContrastClause(sentence: string): string | undefined {
  const connectorPattern =
    /(?:[,;]\s*|\s+)(?:y|pero|aunque|mientras que|and|but|although|while)\s+/giu;
  for (const match of sentence.matchAll(connectorPattern)) {
    if (match.index === undefined || !match[0]) continue;
    const prefix = sentence
      .slice(0, match.index)
      .replace(/[,;:\s]+$/gu, "")
      .trim();
    const sectorClause = sentence.slice(match.index + match[0].length).trim();
    if (
      prefix &&
      isSupportedLaborIndicatorClause(prefix) &&
      isSectorMovementSummary(sectorClause)
    ) {
      return normalizePunctuation(prefix);
    }
  }
  return undefined;
}

function isSupportedLaborIndicatorClause(value: string): boolean {
  const normalized = normalizeText(value);
  if (isLaborMarketContrast(normalized)) return true;
  if (
    SECTOR_SCOPE_PATTERN.test(normalized) ||
    SECTOR_ENTITY_PATTERN.test(normalized)
  ) {
    return false;
  }
  return (
    (PAYROLL_EMPLOYMENT_SCOPE_PATTERN.test(normalized) &&
      AGGREGATE_LABOR_MOVEMENT_PATTERN.test(normalized)) ||
    (EARNINGS_SCOPE_PATTERN.test(normalized) &&
      AGGREGATE_LABOR_MOVEMENT_PATTERN.test(normalized))
  );
}

function localizedLaborContrastQuestion(language?: string): string {
  return isSpanishLanguage(language)
    ? "¿Qué indicador refleja mejor lo que observas: ingresos o empleo?"
    : "Which indicator better reflects what you see: earnings or employment?";
}

function localizedLaborContrastVisualDirection(language?: string): string {
  return isSpanishLanguage(language)
    ? "Contraste editorial entre ingresos promedio y empleo de nómina."
    : "Editorial contrast between average earnings and payroll employment.";
}

function localizedNarrowedClosingHeadline(language?: string): string {
  return isSpanishLanguage(language)
    ? "Una pregunta para cerrar"
    : "One question before you go";
}

function localizedNarrowedClosingQuestion(language?: string): string {
  return isSpanishLanguage(language)
    ? "¿Qué observas en tu sector?"
    : "What are you seeing in your field?";
}

function localizedNarrowedClosingVisualDirection(language?: string): string {
  return isSpanishLanguage(language)
    ? "Cierre editorial tipográfico sin cifras ni comparaciones nuevas."
    : "Typographic editorial closing without new numbers or comparisons.";
}

function removeClosingSectorAltTextClause(
  value: string,
  finalOrder: number,
): string {
  return splitSentenceClauses(value)
    .map((sentence) => {
      if (!explicitlyReferencesSlideOrder(sentence, finalOrder, finalOrder)) {
        return sentence;
      }
      const withoutSectorClause = sentence.replace(
        /\s*(?:,?\s+y\s+|,?\s+and\s+)(?:resume|summarizes?)\b[^.!?]*(?:sector(?:es)?|industr(?:ia|ias|y|ies))[^.!?]*/giu,
        "",
      );
      return normalizePunctuation(withoutSectorClause);
    })
    .join(" ")
    .replace(/\s+/gu, " ")
    .trim();
}

const SPANISH_SLIDE_ORDINALS: Readonly<Record<number, string>> = {
  1: "primera",
  2: "segunda",
  3: "tercera",
  4: "cuarta",
  5: "quinta",
  6: "sexta",
  7: "septima",
  8: "octava",
};

function explicitlyReferencesSlideOrder(
  sentence: string,
  order: number,
  lastOrder: number,
): boolean {
  const explicitReference = extractExplicitSlideReference(sentence, lastOrder);
  if (explicitReference?.claimedOrder === order) return true;
  const ordinal = SPANISH_SLIDE_ORDINALS[order];
  return Boolean(
    ordinal &&
      new RegExp(`\\bla\\s+${ordinal}\\b`, "iu").test(normalizeText(sentence)),
  );
}

type AltTextSlideMismatch = {
  claimedOrder: number;
  actualOrder: number;
  referenceText: string;
  spanishReference: boolean;
};

function findAltTextSlideMismatch(
  draft: GeneratedCreativeDraft,
): AltTextSlideMismatch | undefined {
  if (draft.units.length < 2) return undefined;
  const lastOrder = Math.max(...draft.units.map((unit) => unit.order));

  for (const sentence of splitSentenceClauses(draft.altText)) {
    const reference = extractExplicitSlideReference(sentence, lastOrder);
    if (!reference) continue;
    const claimNumbers = extractBriefClaimNumbers(sentence);
    // Without a numeric fingerprint there is no inexpensive, deterministic
    // way to map a prose summary to exactly one slide.
    if (claimNumbers.length === 0) continue;

    const matchingOrders = draft.units
      .filter((unit) => {
        const unitNumbers = new Set(extractAllowedNumbers(unitVisibleCopy(unit)));
        return claimNumbers.every((number) => unitNumbers.has(number));
      })
      .map((unit) => unit.order);
    if (
      matchingOrders.length !== 1 ||
      matchingOrders[0] === reference.claimedOrder
    ) {
      continue;
    }

    return {
      ...reference,
      actualOrder: matchingOrders[0]!,
    };
  }
  return undefined;
}

function extractExplicitSlideReference(
  sentence: string,
  lastOrder: number,
): Omit<AltTextSlideMismatch, "actualOrder"> | undefined {
  const numbered =
    /\b(?:slide|panel|image|diapositiva|imagen|l[aá]mina)\s*(?:n(?:o|º|°|\.)?\.?\s*)?#?\s*(\d+)\b/iu.exec(
      sentence,
    );
  if (numbered?.[0] && numbered[1]) {
    return {
      claimedOrder: Number(numbered[1]),
      referenceText: numbered[0],
      spanishReference: /diapositiva|imagen|lamina/iu.test(
        normalizeText(numbered[0]),
      ),
    };
  }

  const finalReference =
    /\b(?:(?:the\s+)?(?:last|final)\s+(?:slide|panel|image)|(?:la\s+)?(?:[uú]ltima|final)\s+(?:diapositiva|imagen|l[aá]mina)|(?:la\s+)?(?:diapositiva|imagen|l[aá]mina)\s+final)\b/iu.exec(
      sentence,
    );
  if (!finalReference?.[0]) return undefined;
  return {
    claimedOrder: lastOrder,
    referenceText: finalReference[0],
    spanishReference: /diapositiva|imagen|lamina|ultima/iu.test(
      normalizeText(finalReference[0]),
    ),
  };
}

function repairAltTextSlideReference(draft: GeneratedCreativeDraft): string {
  const mismatch = findAltTextSlideMismatch(draft);
  if (!mismatch) return draft.altText;
  const replacement = mismatch.spanishReference
    ? `la diapositiva ${mismatch.actualOrder}`
    : `slide ${mismatch.actualOrder}`;
  return draft.altText.replace(mismatch.referenceText, replacement);
}

function repairCertaintyUpgrade(value: string): string {
  return value
    .replace(/\bun\s+aproximadamente\s+(?=~?\d)/giu, "aproximadamente un ")
    .replace(/\bare\s+(?:fully\s+|entirely\s+)?ai[-‐‑‒–— ]generated\b/giu, "show signs of AI authorship")
    .replace(/\bis\s+(?:fully\s+|entirely\s+)?ai[-‐‑‒–— ]generated\b/giu, "shows signs of AI authorship")
    .replace(/\bare\s+ai[-‐‑‒–— ]written\b/giu, "show signs of AI authorship")
    .replace(/\bis\s+ai[-‐‑‒–— ]written\b/giu, "shows signs of AI authorship")
    .replace(
      /\bai[-‐‑‒–— ]written\s+(content|pages?|articles?|text)\b/giu,
      (match, noun: string, offset: number, input: string) => {
        const sentenceStart =
          offset === 0 || /[.!?]\s*$/u.test(input.slice(0, offset));
        const normalizedNoun = sentenceStart
          ? `${noun.charAt(0).toUpperCase()}${noun.slice(1)}`
          : noun;
        return `${normalizedNoun} showing signs of AI authorship`;
      },
    );
}

function splitSentenceClauses(value: string): string[] {
  if (!value.trim()) return [];
  const pattern =
    /(?:\b(?:Dr|Mr|Mrs|Ms|vs|e\.g|i\.e|etc)\.|\.(?=\d)|[^.!?]|[.!?](?!\s|$))+[.!?]*/giu;
  return (value.match(pattern) ?? []).map((s) => s.trim()).filter(Boolean);
}

function removeUnsupportedNumericClauses(
  value: string,
  selectedFacts: readonly CreativeKeyFact[],
  allFacts: readonly CreativeKeyFact[],
): string {
  return splitSentenceClauses(value)
    .filter((sentence) =>
      extractAllowedNumbers(sentence).every(
        (number) =>
          selectedFacts.some((fact) =>
            fact.claimGuard?.allowedNumbers.includes(number),
          ) || isBriefSupportedCalendarYear(number, allFacts),
      ),
    )
    .join(" ")
    .replace(/\s+/gu, " ")
    .trim();
}

function repairPublishingCopy(
  value: string,
  sourceCopy: string,
  fallback: string,
  language?: string,
  facts: readonly CreativeKeyFact[] = [],
): string {
  const repaired = localizeEstimateQualifiers(
    repairCertaintyUpgrade(repairUnsupportedInference(value, sourceCopy)),
    language,
  );
  const safeSentences = splitSentenceClauses(repaired).filter(
    (sentence) =>
      !hasUnsupportedInference(sentence, sourceCopy) &&
      extractBriefClaimNumbers(sentence).every(
        (number) =>
          facts.some((fact) => fact.claimGuard?.allowedNumbers.includes(number)) ||
          isBriefSupportedCalendarYear(number, facts),
      ),
  );
  const result = safeSentences.join(" ").replace(/\s+/gu, " ").trim();
  return result || fallback;
}

function hasUnsupportedInference(value: string, sourceCopy: string): boolean {
  return UNSUPPORTED_INFERENCE_PATTERNS.some(
    ({ pattern, sourceSupport }) =>
      pattern.test(value) && !sourceSupport.test(sourceCopy),
  );
}

function repairUnsupportedInference(
  value: string,
  sourceCopy: string,
): string {
  // Only remove a trailing "…, as some outlets suggested" clause when the
  // source does not frame the claim that way. When it does, the attribution is
  // the supported form and cutting it leaves a fragment ("…, as.").
  const withoutUnsupportedSuggestion = SUGGESTION_SOURCE_SUPPORT.test(sourceCopy)
    ? value
    : value.replace(
        /,?\s*(?:suggest(?:s|ed|ing)?|implies?|implying|points? to)\b[^.?!]*[.?!]?\s*$/iu,
        "",
      );
  const partiallyRepaired = withoutUnsupportedSuggestion
      .replace(/,?\s*confirm(?:s|ed|ing)?\s+(?:the\s+)?trend\.?\s*$/iu, "")
      .replace(/[—–-]\s*(?:changing|reshaping|transforming)\s+how\b[^.?!]*[.?!]?\s*$/iu, "");
  const safeSentences = splitSentenceClauses(partiallyRepaired).filter(
    (sentence) => !hasUnsupportedInference(sentence, sourceCopy),
  );
  return normalizePunctuation(safeSentences.join(" "));
}

function repairMissingEstimateQualifier(
  value: string,
  facts: readonly CreativeKeyFact[],
  language?: string,
): string {
  const allowedApproximateNumbers = new Set(
    facts
      .filter(factRequiresEstimateQualifier)
      .flatMap((fact) => fact.claimGuard?.allowedNumbers ?? []),
  );
  const qualifier = facts
    .flatMap((fact) => fact.requiredQualifiers ?? [])
    .map((candidate) => estimatePrefix(candidate, language))
    .find(Boolean) ?? defaultEstimateQualifier(language);
  const inserted = value.replace(
    /(\b(?:del|al|de|a|el|la|los|las|un|una)\s+)?(~?\d[\d,.]*(?:\s*%|\s*percent)?)/giu,
    (match: string, lead: string | undefined, number: string) => {
      if (
        !allowedApproximateNumbers.has(normalizeNumber(number)) ||
        ESTIMATE_PATTERN.test(number)
      ) {
        return match;
      }
      if (!lead) return `${qualifier} ${number}`;
      const raw = lead.trimEnd();
      const article = raw.trim().toLocaleLowerCase();
      // The lead word may open a sentence. Whenever the qualifier moves in front
      // of it, the capital has to move too, or the copy reads
      // "aproximadamente El 40%".
      const leadIsCapitalized = raw !== raw.toLocaleLowerCase();
      const opener = leadIsCapitalized
        ? qualifier.charAt(0).toLocaleUpperCase() + qualifier.slice(1)
        : qualifier;
      const spacing = lead.slice(raw.length) || " ";
      // The qualifier reads before a definite/indefinite article ("aproximadamente
      // el 3%") but after a preposition ("de aproximadamente 2,2%"). "del" and
      // "al" contract a preposition with an article, so split them.
      if (["el", "la", "los", "las", "un", "una"].includes(article)) {
        return `${opener} ${article}${spacing}${number}`;
      }
      if (article === "del") {
        return `${leadIsCapitalized ? "De" : "de"} ${qualifier} ${number}`;
      }
      if (article === "al") {
        return `${leadIsCapitalized ? "A" : "a"} ${qualifier} ${number}`;
      }
      return `${raw}${spacing}${qualifier} ${number}`;
    },
  );
  return collapseStackedEstimateQualifiers(inserted);
}

function estimatePrefix(
  value: string,
  language?: string,
): string | undefined {
  const normalized = normalizeText(value);
  if (normalized.includes("more than") || normalized.startsWith("over ")) {
    return isSpanishLanguage(language) ? "más de" : "more than";
  }
  const prefix = normalized.match(
    /\b(?:about|approximately|estimated|nearly|roughly|around)\b/iu,
  )?.[0];
  if (!prefix || !isSpanishLanguage(language)) return prefix;
  return prefix === "nearly" ? "casi" : "aproximadamente";
}

function repairMissingPublishingScope(
  caption: string,
  facts: readonly CreativeKeyFact[],
  language?: string,
): string {
  const matchingFact = facts.find(
    (fact) =>
      factUsesNumberInCopy(fact, caption) &&
      (fact.claimGuard?.scopePhrases.length ?? 0) > 0 &&
      !fact.claimGuard?.scopePhrases.some((scope) =>
        scopeMatches(caption, scope),
      ),
  );
  const scope = matchingFact?.claimGuard?.scopePhrases[0];
  return scope ? integrateScopeNaturally(caption, scope, language) : caption;
}

function integrateScopeNaturally(
  value: string,
  scope: string,
  language?: string,
): string {
  if (scopeMatches(value, scope)) return value;
  const monthYear = normalizeText(scope).match(
    /^(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{4})$/u,
  );
  if (monthYear?.[1] && monthYear[2]) {
    const month = isSpanishLanguage(language)
      ? SPANISH_MONTHS[monthYear[1]]
      : monthYear[1];
    if (month) {
      const scopedMonth = isSpanishLanguage(language)
        ? `${month} de ${monthYear[2]}`
        : `${month} ${monthYear[2]}`;
      const unscopedMonth = new RegExp(
        `\\b${month}(?!\\s+(?:de\\s+)?${monthYear[2]})\\b`,
        "iu",
      );
      if (unscopedMonth.test(value)) {
        return value.replace(unscopedMonth, scopedMonth);
      }
      return appendSentence(
        value,
        isSpanishLanguage(language)
          ? `Periodo: ${scopedMonth}.`
          : `Period: ${scopedMonth}.`,
      );
    }
  }
  const afterPublication = scope.match(/^pages?\s+published\s+after\s+(.+)$/iu);
  if (!afterPublication?.[1]) return value;

  const event = afterPublication[1].trim();
  if (/\b(?:after|since)\b/iu.test(value)) {
    return value
      .replace(/\bnew content\b/iu, "new web pages")
      .replace(/\bweb pages appears\b/iu, "web pages appear");
  }
  return value.replace(
    /\b(?:new\s+|recently\s+published\s+)?(?:(web)\s+)?pages?(?:\s+published)?\b/iu,
    (_, web: string | undefined) =>
      `${web ? "web " : ""}pages published after ${event}`,
  );
}

function isBriefSupportedCalendarYear(
  number: string,
  facts: readonly CreativeKeyFact[],
): boolean {
  return (
    /^(?:19|20)\d{2}$/u.test(number) &&
    facts.some((fact) => fact.claimGuard?.allowedNumbers.includes(number))
  );
}

function safeConclusionForFact(
  fact: CreativeKeyFact,
  language?: string,
): string {
  if (fact.claimGuard?.certainty === "detected-signal") {
    const event = fact.statement.match(
      /pages?\s+published\s+after\s+(.+?)(?=\s+(?:show|were|had|display)|[,.;]|$)/iu,
    )?.[1];
    if (isSpanishLanguage(language)) {
      return event
        ? `Para las páginas publicadas después de ${event}, estos resultados describen señales de autoría con IA, no certeza sobre cómo se escribió cada página.`
        : "Estos resultados describen señales de autoría con IA, no certeza sobre cómo se escribió cada página.";
    }
    return event
      ? `For pages published after ${event}, these findings describe AI-authorship signals—not certainty about how every page was written.`
      : "These findings describe AI-authorship signals—not certainty about how every page was written.";
  }
  return fact.statement;
}

function localizedEvidenceHeadline(language?: string): string {
  return isSpanishLanguage(language)
    ? "Lo que muestran los datos"
    : "What the data shows";
}

function localizeEstimateQualifiers(
  value: string,
  language?: string,
): string {
  if (!isSpanishLanguage(language)) return value;
  return value
    .replace(
      /\bpoco más de\s+(?:about|approximately|roughly|around)\s+(?=~?\d)/giu,
      "aproximadamente ",
    )
    .replace(
      /\b(?:about|approximately|roughly|around)\s+(?=~?\d)/giu,
      "aproximadamente ",
    )
    .replace(/\bnearly\s+(?=~?\d)/giu, "casi ")
    .replace(/\bmore than\s+(?=~?\d)/giu, "más de ")
    .replace(
      /([$€£])\s*aproximadamente\s+([+-]?\d)/giu,
      "aproximadamente $1$2",
    )
    .replace(/([+-])\s*aproximadamente\s+(\d)/giu, "aproximadamente $1$2")
    .replace(/\bdel\s+aproximadamente\b/giu, "de aproximadamente");
}

function defaultEstimateQualifier(language?: string): string {
  return isSpanishLanguage(language) ? "aproximadamente" : "about";
}

function localizedFallback(
  language: string | undefined,
  kind: "summary" | "alt-text",
): string {
  if (isSpanishLanguage(language)) {
    return kind === "summary"
      ? "Resumen de la información respaldada por la fuente."
      : "Carrusel que explica información respaldada por la fuente.";
  }
  return kind === "summary"
    ? "A summary of information supported by the source."
    : "A carousel explaining information supported by the source.";
}

function isSpanishLanguage(language: string | undefined): boolean {
  const normalized = normalizeText(language ?? "");
  return (
    normalized === "es" ||
    normalized.startsWith("es ") ||
    normalized.includes("espanol") ||
    normalized.includes("spanish")
  );
}

function extractScopePhrases(statement: string): string[] {
  const matches = [
    ...statement.matchAll(/\bolder pages?\b/giu),
    ...statement.matchAll(/\bnew(?:er)? pages?\b/giu),
    ...statement.matchAll(/\bpages?\s+published\s+(?:after|before|since)\s+(.+?)(?=\s+(?:show|were|had|display)|[,.;]|$)/giu),
    ...statement.matchAll(/\bfrom the past\s+(?:\w+|\d+)\s+years?\b/giu),
    ...statement.matchAll(/\brandom sample\b/giu),
    ...statement.matchAll(/\b(?:january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{4}\b/giu),
  ];
  return uniqueText(matches.map((match) => match[0]));
}

function extractAllowedNumbers(value: string): string[] {
  const numbers = extractNumericLiterals(value);
  // Key facts often express an ordinal in words while concise slide copy uses
  // its numeric form (for example, "the first day" -> "day 1"). Treat those
  // forms as equivalent so an accurate shortening is not rejected as an
  // invented statistic.
  const ordinalCopy = value.replace(
    /\b(?:one[- ]third|two[- ]thirds)\b/giu,
    "",
  );
  ORDINAL_NUMBER_PATTERNS.forEach(({ number, pattern }) => {
    if (pattern.test(ordinalCopy)) numbers.push(number);
  });
  VERBAL_RATIO_PATTERNS.forEach(({ pattern, numbers: ratioNumbers }) => {
    if (pattern.test(value)) numbers.push(...ratioNumbers);
  });
  CARDINAL_NUMBER_PATTERNS.forEach(({ number, pattern }) => {
    if (pattern.test(value)) numbers.push(number);
  });
  if (/\b(?:a|one) quarter\b|\buna? cuarta parte\b/iu.test(value)) {
    numbers.push("25%");
  }
  if (/\bone[- ]third\b/iu.test(value)) numbers.push("33%");
  if (/\btwo[- ]thirds\b/iu.test(value)) numbers.push("67%");
  // 35% is commonly and accurately summarized as "roughly one-third".
  // Preserve both normalized forms so the guard does not reject a cautious
  // verbal approximation of the source statistic.
  if (numbers.includes("35%")) numbers.push("33%");
  return uniqueText(numbers);
}

function extractExplicitEnumerationCounts(value: string): string[] {
  const counts: string[] = [];
  const sentences = splitSentenceClauses(value);

  for (const sentence of sentences) {
    // Only infer a count from an explicit list of at least three items. This
    // supports concise labels such as "4-part architecture" without treating
    // an ordinary two-clause sentence as a numbered factual claim.
    const commaParts = sentence.split(/\s*,\s*/u);
    if (commaParts.length < 3) continue;
    const finalPart = commaParts.at(-1) ?? "";
    if (!/^(?:and|or|y|o)\s+/iu.test(finalPart.trim())) continue;
    const count = commaParts.length;
    if (count >= 3 && count <= 10) counts.push(String(count));
  }

  return uniqueText(counts);
}

// Product and model version tokens ("Opus 4.8", "GPT-5", "Gemini 2.5 Pro",
// "o3", "v4.8"). They name which software is involved, not a quantity a fact
// claims, so — like slide/page numbers — they must not be scored against a
// cited excerpt. This matters constantly for AI/tech coverage.
const MODEL_VERSION_PATTERN =
  /\b(?:gpt|chatgpt|claude|opus|sonnet|haiku|gemini|gemma|bard|palm|llama|grok|mistral|mixtral|qwen|deepseek|phi|command|titan|nova|olmo|falcon|codex|copilot|dall-?e|imagen|sora|veo|flux|sdxl|midjourney)\s*-?\s*v?\d+(?:\.\d+)*(?:\s*-?\s*(?:o|pro|max|mini|turbo|flash|ultra|nano|lite|preview|instruct|base|chat|opus|sonnet|haiku))?\b/giu;
const SHORT_MODEL_VERSION_PATTERN = /\bo\d+(?:-(?:mini|preview|pro))?\b/giu;
const GENERIC_VERSION_PATTERN =
  /\b(?:v|version|versi[oó]n|ver\.?)\s*\d+(?:\.\d+)+\b/giu;

function extractBriefClaimNumbers(value: string): string[] {
  // Slide/page/part numbers describe document structure, not factual claims.
  const factualCopy = value
    .replace(
      /\b(?:slide|page|part|diapositiva|pagina|página|parte)\s*#?\s*\d+\b/giu,
      " ",
    )
    .replace(
      /\b\d+\s*[- ]?\s*(?:slides?|pages?|parts?|diapositivas?|paginas?|páginas?|partes?)\b/giu,
      " ",
    )
    .replace(
      /\b(?:carousel|carrusel)\s+(?:of|de|with|con)\s+\d+\b/giu,
      " ",
    )
    .replace(MODEL_VERSION_PATTERN, " ")
    .replace(SHORT_MODEL_VERSION_PATTERN, " ")
    .replace(GENERIC_VERSION_PATTERN, " ");
  const numbers = extractNumericLiterals(factualCopy);
  if (/\bone[- ]third\b/iu.test(factualCopy)) numbers.push("33%");
  if (/\btwo[- ]thirds\b/iu.test(factualCopy)) numbers.push("67%");
  return uniqueText(numbers);
}

function briefCopyExceedsFacts(
  copy: string,
  sourceCopy: string,
  facts: readonly CreativeKeyFact[],
): boolean {
  const unsupportedNumber = extractBriefClaimNumbers(copy).some(
    (number) =>
      !facts.some((fact) => fact.claimGuard?.allowedNumbers.includes(number)),
  );
  return unsupportedNumber || hasUnsupportedInference(copy, sourceCopy);
}

function localizedSourceQuestion(
  existingQuestion: string,
  language?: string,
): string {
  if (isSpanishLanguage(language)) {
    return "¿Qué establece la fuente aquí?";
  }
  if (/^(?:fr|fra|french|français|francais)(?:\b|[-_])/iu.test(language ?? "")) {
    return "Que rapporte la source ici ?";
  }
  if (
    /[¿áéíóúñ]|\b(?:que|qué|como|cómo|cual|cuál|embarazo|fuente)\b/iu.test(
      existingQuestion,
    )
  ) {
    return "¿Qué establece la fuente aquí?";
  }
  if (
    /[àâçéèêëîïôûùüÿœ]|\b(?:que|quoi|comment|source)\b/iu.test(
      existingQuestion,
    )
  ) {
    return "Que rapporte la source ici ?";
  }
  return "What does the source establish here?";
}

function truncateWithoutBreakingWord(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;
  const shortened = value.slice(0, maxLength + 1).replace(/\s+\S*$/u, "");
  return (shortened || value.slice(0, maxLength)).trim();
}

function factUsesNumberInCopy(fact: CreativeKeyFact, copy: string): boolean {
  const copyNumbers = new Set(extractAllowedNumbers(copy));
  return (fact.claimGuard?.allowedNumbers ?? []).some((number) =>
    copyNumbers.has(number),
  );
}

function factRequiresEstimateQualifier(fact: CreativeKeyFact): boolean {
  return (fact.requiredQualifiers ?? []).some((qualifier) =>
    ESTIMATE_PATTERN.test(qualifier),
  );
}

function scopeMatches(copy: string, scope: string): boolean {
  const normalizedCopy = normalizeText(copy);
  const normalizedScope = normalizeText(scope);
  if (normalizedCopy.includes(normalizedScope)) return true;
  const monthYear = normalizedScope.match(
    /^(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{4})$/u,
  );
  if (monthYear?.[1] && monthYear[2]) {
    const spanishMonth = SPANISH_MONTHS[monthYear[1]];
    if (
      spanishMonth &&
      (normalizedCopy.includes(`${spanishMonth} ${monthYear[2]}`) ||
        normalizedCopy.includes(`${spanishMonth} de ${monthYear[2]}`))
    ) {
      return true;
    }
  }
  if (normalizedScope === "older pages") {
    return /\b(?:older|pre-chatgpt|published before)\b.*\bpages?\b/iu.test(copy);
  }
  if (normalizedScope.startsWith("pages published after")) {
    const anchor = normalizedScope.replace(/^pages published /u, "");
    if (normalizedCopy.includes(anchor.replace(/ release$/u, ""))) return true;
    const eventTerms = anchor
      .replace(/^after /u, "")
      .split(" ")
      .map((term) => term.replace(/s$/u, ""))
      .filter(
        (term) =>
          term.length > 2 &&
          !/^\d{4}$/u.test(term) &&
          ![
            "january",
            "february",
            "march",
            "april",
            "may",
            "june",
            "july",
            "august",
            "september",
            "october",
            "november",
            "december",
            "launch",
            "launched",
            "release",
            "released",
          ].includes(term),
      );
    return (
      /\b(?:after|since)\b/iu.test(copy) &&
      /\bpages?\b/iu.test(copy) &&
      eventTerms.every((term) => normalizedCopy.includes(term))
    );
  }
  if (normalizedScope === "random sample") return /\bsample\b/iu.test(copy);
  return false;
}

const SPANISH_MONTHS: Record<string, string> = {
  january: "enero",
  february: "febrero",
  march: "marzo",
  april: "abril",
  may: "mayo",
  june: "junio",
  july: "julio",
  august: "agosto",
  september: "septiembre",
  october: "octubre",
  november: "noviembre",
  december: "diciembre",
};

function unitVisibleCopy(
  unit: GeneratedCreativeDraft["units"][number],
): string {
  return [
    unit.headline,
    unit.subheadline,
    unit.body,
    unit.ctaQuestion,
  ]
    .filter(Boolean)
    .join(" ");
}

function appendSentence(value: string | undefined, sentence: string): string {
  const current = value?.trim();
  if (!current) return sentence;
  return `${normalizePunctuation(current)} ${sentence}`;
}

function wordCount(value: string | undefined): number {
  return value?.trim().split(/\s+/u).filter(Boolean).length ?? 0;
}

function normalizePunctuation(value: string): string {
  const trimmed = value.replace(/\s+/gu, " ").trim();
  return trimmed && !/[.!?]$/u.test(trimmed) ? `${trimmed}.` : trimmed;
}

function normalizeText(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/gu, "")
    .replace(/[’']/gu, "")
    .replace(/[^a-z0-9%]+/giu, " ")
    .toLowerCase()
    .trim();
}

function mergeText(
  first: readonly string[] | undefined,
  second: readonly string[] | undefined,
): string[] {
  return uniqueText([...(first ?? []), ...(second ?? [])]);
}

function uniqueText(values: readonly string[]): string[] {
  const seen = new Set<string>();
  return values.flatMap((value) => {
    const trimmed = typeof value === "string" ? value.trim() : "";
    const key = normalizeText(trimmed);
    if (!trimmed || seen.has(key)) return [];
    seen.add(key);
    return [trimmed];
  });
}

function isFactCertainty(
  value: unknown,
): value is CreativeFactClaimGuard["certainty"] {
  return [
    "asserted",
    "reported",
    "estimated",
    "detected-signal",
    "projection",
    "association",
  ].includes(String(value));
}

function deduplicateIssues(
  issues: CreativeQualityIssue[],
): CreativeQualityIssue[] {
  const seen = new Set<string>();
  return issues.filter((issue) => {
    const key = `${issue.code}:${issue.unitOrder ?? 0}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
