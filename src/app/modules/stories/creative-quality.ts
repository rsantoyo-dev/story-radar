import {
  blockingCarouselNarrativeIssues,
  evaluateCarouselNarrative,
  maximumFactsForGoal,
} from "./carousel-narrative";
import type {
  CreativeFormat,
  CreativeKeyFact,
  CreativeQualityIssue,
  CreativeQualityReview,
  CreativeQualityScores,
  GeneratedCreativeDraft,
} from "./creative-content.types";
import {
  deterministicFactQualityIssues,
  repairDeterministicFactCopy,
} from "./creative-fact-guard";

export const CREATIVE_QUALITY_THRESHOLDS = {
  factuality: 96,
  hook: 90,
  curiosity: 88,
  swipeReward: 80,
  continuity: 80,
  relevance: 80,
  clarity: 80,
  resolution: 88,
  cta: 75,
  overall: 92,
} as const satisfies CreativeQualityScores;

export const MAX_CREATIVE_EDITORIAL_REPAIRS = 1;

export function repairDeterministicCreativeCopy(
  draft: GeneratedCreativeDraft,
  format: CreativeFormat,
  keyFacts: readonly CreativeKeyFact[] = [],
  language?: string,
): GeneratedCreativeDraft {
  const repaired: GeneratedCreativeDraft = {
    ...draft,
    concept: repairMalformedGroupedNumbers(draft.concept),
    caption: repairMalformedGroupedNumbers(draft.caption),
    ...(draft.callToAction === undefined
      ? {}
      : { callToAction: repairMalformedGroupedNumbers(draft.callToAction) }),
    altText: repairMalformedGroupedNumbers(draft.altText),
    hashtags: [...draft.hashtags],
    units: draft.units.map((unit) => ({
      ...unit,
      headline: repairMalformedGroupedNumbers(unit.headline),
      ...(unit.body === undefined
        ? {}
        : { body: repairMalformedGroupedNumbers(unit.body) }),
      ...(unit.ctaQuestion === undefined
        ? {}
        : { ctaQuestion: repairMalformedGroupedNumbers(unit.ctaQuestion) }),
      factIds: [...unit.factIds],
      characterIds: [...(unit.characterIds ?? [])],
    })),
  };
  if (format === "carousel") {
    repaired.units.forEach((unit) => {
      if (unit.editorialGoal) {
        unit.factIds = unit.factIds.slice(
          0,
          maximumFactsForGoal(unit.editorialGoal),
        );
      }
      if (isSpanishProfileLanguage(language)) {
        // A critic can accidentally paste an English source excerpt into an
        // otherwise Spanish slide. Optional copy is safer to omit than to
        // publish a guessed translation of source evidence.
        if (
          unit.body &&
          hasLikelyEnglishSentence(unit.body) &&
          !hasLikelyEnglishSentence(unit.headline)
        ) {
          unit.body = localizedEvidenceFallback(unit.editorialGoal, language);
        }
        if (unit.ctaQuestion && hasLikelyEnglishSentence(unit.ctaQuestion)) {
          unit.ctaQuestion = localizedDebateQuestion(language);
        }
      }
      const evidence = evidenceForUnit(unit.factIds, keyFacts);
      unit.visualDirection = repairUnverifiedQuantitativeVisual(
        unit.visualDirection,
        evidence,
        language,
      );
      unit.headline = softenUnsupportedAbsolutes(unit.headline, evidence);
      if (unit.body) unit.body = softenUnsupportedAbsolutes(unit.body, evidence);
      if (unit.ctaQuestion) {
        unit.ctaQuestion = softenUnsupportedAbsolutes(unit.ctaQuestion, evidence);
      }
    });
    const closing = repaired.units.at(-1);
    if (closing) {
      if (
        closing.editorialGoal === "debate" &&
        !closing.ctaQuestion?.trim() &&
        ![closing.headline, closing.body].some((value) => value?.includes("?")) &&
        closing.viewerQuestion?.trim()
      ) {
        closing.ctaQuestion = localizedDebateQuestion(language);
      }
      if (
        closing.editorialGoal === "debate" &&
        closing.ctaQuestion?.trim() &&
        closing.viewerQuestion?.trim() &&
        normalizeQuestionCopy(closing.ctaQuestion) ===
          normalizeQuestionCopy(closing.viewerQuestion)
      ) {
        closing.ctaQuestion = localizedDebateQuestion(language);
      }
      if (
        closing.editorialGoal === "debate" &&
        closing.ctaQuestion?.trim() &&
        isSpanishProfileLanguage(language) &&
        hasLikelyEnglishSentence(closing.ctaQuestion)
      ) {
        closing.ctaQuestion = "¿Qué te sorprendió más de esta información?";
      }
      if (
        closing.editorialGoal === "debate" &&
        closing.ctaQuestion?.trim() &&
        !closing.ctaQuestion.includes("?")
      ) {
        closing.ctaQuestion = `${closing.ctaQuestion.replace(/[.!]+$/u, "").trim()}?`;
      }
      if (
        closing.editorialGoal === "debate" &&
        closing.ctaQuestion?.trim() &&
        isGenericClosingQuestion(closing.ctaQuestion)
      ) {
        closing.ctaQuestion = groundedClosingQuestion(
          repaired.concept,
          language,
          closing.viewerQuestion,
        );
      }

      const fields = ["headline", "body", "ctaQuestion"] as const;
      const questionFields = fields.filter(
        (field) => closing[field]?.includes("?"),
      );
      if (questionFields.length > 1) {
        const canonicalField = questionFields.includes("ctaQuestion")
          ? "ctaQuestion"
          : questionFields.includes("body")
            ? "body"
            : "headline";

        questionFields.forEach((field) => {
          if (field === canonicalField) return;
          const replacement = withoutQuestionSentences(closing[field]);
          if (field === "headline") {
            closing.headline =
              replacement || closingHeadlineFallback(closing.editorialGoal);
          } else if (replacement) {
            closing[field] = replacement;
          } else {
            delete closing[field];
          }
        });
      }
    }
  }
  const factRepaired = repairDeterministicFactCopy(
    repaired,
    keyFacts,
    language,
  );
  if (format === "carousel") {
    // Fact repair may add a uniquely matching numeric fact or restore a source
    // statement on an evidence slide. Re-apply presentation constraints last
    // so those useful factual repairs cannot violate the narrative budget or
    // leak source-language copy into the published slide.
    factRepaired.units.forEach((unit) => {
      if (unit.editorialGoal) {
        unit.factIds = unit.factIds.slice(
          0,
          maximumFactsForGoal(unit.editorialGoal),
        );
      }
      if (!isSpanishProfileLanguage(language)) return;
      if (
        unit.body &&
        hasLikelyEnglishSentence(unit.body) &&
        !hasLikelyEnglishSentence(unit.headline)
      ) {
        unit.body = localizedEvidenceFallback(unit.editorialGoal, language);
      }
      if (unit.ctaQuestion && hasLikelyEnglishSentence(unit.ctaQuestion)) {
        unit.ctaQuestion = localizedDebateQuestion(language);
      }
    });
  }
  return factRepaired;
}

function localizedDebateQuestion(language?: string): string {
  return isSpanishProfileLanguage(language)
    ? "¿Qué te sorprendió más de esta información?"
    : "What stands out most to you?";
}

function localizedEvidenceFallback(
  goal: GeneratedCreativeDraft["units"][number]["editorialGoal"],
  language?: string,
): string | undefined {
  if (goal === "conclude" || goal === "debate") return undefined;
  return isSpanishProfileLanguage(language)
    ? "Este es el dato clave señalado por la fuente."
    : "This is the key point established by the source.";
}

const GENERIC_CTA_PATTERN =
  /^(?:[¿¡\s]*(?:what stands out(?: most)? to you|what do you think|thoughts|what surprised you(?: most)?|qué te sorprendió más(?: de esta información)?|qué opinas|cuál es tu opinión)[?.!¿¡\s]*|where would you apply how\b.*\bfirst\?)$/iu;

const ABSOLUTE_PATTERNS: ReadonlyArray<{
  pattern: RegExp;
  support: RegExp;
  replacement: string;
}> = [
  { pattern: /\bzero[- ]drift\b/giu, support: /\bzero[- ]drift\b/iu, replacement: "automated drift" },
  { pattern: /\beliminat(?:e|es|ed|ing)\b/giu, support: /\beliminat(?:e|es|ed|ing)\b/iu, replacement: "reduces" },
  { pattern: /\bguarantee(?:s|d|ing)?\b/giu, support: /\bguarantee(?:s|d|ing)?\b/iu, replacement: "helps ensure" },
  { pattern: /\b(?:always|never)\b/giu, support: /\b(?:always|never)\b/iu, replacement: "consistently" },
];

function evidenceForUnit(
  factIds: readonly string[],
  keyFacts: readonly CreativeKeyFact[],
): string {
  return keyFacts
    .filter((fact) => factIds.includes(fact.id))
    .map((fact) => fact.sourceExcerpt?.trim() || fact.statement)
    .join(" ");
}

function softenUnsupportedAbsolutes(value: string, evidence: string): string {
  return ABSOLUTE_PATTERNS.reduce(
    (copy, rule) =>
      rule.support.test(evidence)
        ? copy
        : copy.replace(rule.pattern, (match) =>
            /^\p{Lu}/u.test(match)
              ? `${rule.replacement.charAt(0).toUpperCase()}${rule.replacement.slice(1)}`
              : rule.replacement,
          ),
    value,
  );
}

function containsUnsupportedAbsolute(value: string, evidence: string): boolean {
  return ABSOLUTE_PATTERNS.some(
    (rule) => rule.pattern.test(value) && !rule.support.test(evidence),
  );
}

function isGenericClosingQuestion(value: string): boolean {
  return GENERIC_CTA_PATTERN.test(value.trim());
}

function groundedClosingQuestion(
  concept: string,
  language?: string,
  viewerQuestion?: string,
): string {
  const internalQuestion = viewerQuestion?.trim();
  if (
    internalQuestion?.includes("?") &&
    !isInternalPlanningQuestion(internalQuestion) &&
    !isGenericClosingQuestion(internalQuestion) &&
    !(isSpanishProfileLanguage(language) && hasLikelyEnglishSentence(internalQuestion))
  ) {
    return internalQuestion;
  }
  const subject = concept
    .replace(
      /^a\s+\d+[- ](?:slide|part|step)\s+(?:breakdown|carousel|guide)\s+(?:of|to)\s+/iu,
      "",
    )
    .trim()
    .replace(/[?.!]+$/u, "");
  if (!subject) return localizedDebateQuestion(language);
  if (/^(?:how|cómo)\b/iu.test(subject)) {
    return isSpanishProfileLanguage(language)
      ? "¿Dónde podría encajar este enfoque en tu proceso?"
      : "Where could this approach fit your workflow?";
  }
  return isSpanishProfileLanguage(language)
    ? `¿Cómo cambiaría ${subject} tu enfoque?`
    : `How would ${subject} change your approach?`;
}

function isInternalPlanningQuestion(value: string): boolean {
  return /\b(?:what question should (?:the )?viewer|what should (?:the )?(?:viewer|readers?|audience) consider|why should (?:the viewer|i) care|what happened and why|viewer question|pregunta (?:interna|para el espectador))\b/iu.test(
    value,
  );
}

function normalizeQuestionCopy(value: string): string {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

export function deterministicCreativeQualityIssues(
  draft: GeneratedCreativeDraft,
  format: CreativeFormat,
  keyFacts: readonly CreativeKeyFact[] = [],
  language?: string,
): CreativeQualityIssue[] {
  const narrativeIssues =
    format === "carousel"
      ? evaluateCarouselNarrative(
          draft.units,
          draft.narrativeRationale,
        ).map((issue) => ({
          code: issue.code.toUpperCase().replaceAll("-", "_"),
          severity: issue.severity === "blocker" ? "blocker" as const : "warning" as const,
          message: issue.message,
          ...(issue.unitIndex === undefined
            ? {}
            : { unitOrder: issue.unitIndex + 1 }),
        }))
      : [];
  const editorialPrecisionIssues = draft.units.flatMap((unit) => {
    const evidence = evidenceForUnit(unit.factIds, keyFacts);
    const visibleCopy = [unit.headline, unit.body, unit.ctaQuestion]
      .filter(Boolean)
      .join(" ");
    const issues: CreativeQualityIssue[] = containsUnsupportedAbsolute(visibleCopy, evidence)
      ? [{
          code: "UNSUPPORTED_ABSOLUTE",
          severity: "blocker" as const,
          unitOrder: unit.order,
          message: `Slide ${unit.order} uses an absolute promise that its selected evidence does not establish.`,
        }]
      : [];
    if (hasMalformedGroupedNumber(visibleCopy)) {
      issues.push({
        code: "MALFORMED_NUMBER_FORMAT",
        severity: "blocker",
        unitOrder: unit.order,
        message: `Slide ${unit.order} contains whitespace inside a grouped number. Use a form such as 155.000 or 155,000 without spaces around the separator.`,
      });
    }
    if (
      requestsQuantitativeChart(unit.visualDirection) &&
      substantiveEvidenceNumbers(evidence).length < 2 &&
      !declaresQualitativeVisual(unit.visualDirection)
    ) {
      issues.push({
        code: "UNVERIFIED_QUANTITATIVE_VISUAL",
        severity: "warning",
        unitOrder: unit.order,
        message: `Slide ${unit.order} requests a quantitative chart without enough exact values; use a clearly non-proportional conceptual comparison instead.`,
      });
    }
    return issues;
  });
  const closing = draft.units.at(-1);
  const ctaSpecificityIssues =
    format === "carousel" &&
    closing?.ctaQuestion?.trim() &&
    isGenericClosingQuestion(closing.ctaQuestion)
      ? [{
          code: "GENERIC_CTA",
          severity: "blocker" as const,
          unitOrder: closing.order,
          message:
            "The closing question is generic; connect it to the carousel's central concept.",
        }]
      : [];
  return [
    ...narrativeIssues,
    ...deterministicFactQualityIssues(draft, keyFacts),
    ...editorialPrecisionIssues,
    ...ctaSpecificityIssues,
    ...visibleDraftLanguageIssues(draft, language),
  ];
}

const MALFORMED_GROUPED_NUMBER_PATTERN =
  /\d\s*[.,]\s+(?=\d{3}\b)/gu;

function hasMalformedGroupedNumber(value: string): boolean {
  return new RegExp(MALFORMED_GROUPED_NUMBER_PATTERN).test(value);
}

function repairMalformedGroupedNumbers(value: string): string {
  return value.replace(/(\d)\s*([.,])\s+(?=\d{3}\b)/gu, "$1$2");
}

const AUTOMATICALLY_REPAIRABLE_REVIEW_CODES = new Set([
  "FACT_BUDGET",
  "MIXED_LANGUAGE",
  "GENERIC_CTA",
  "UNSUPPORTED_INFERENCE",
  "UNSUPPORTED_ABSOLUTE",
  "CLOSING_QUESTION_COUNT",
  "MISSING_DEBATE_QUESTION",
]);

/**
 * The saved critic review describes the generated copy, while approval first
 * applies deterministic repairs. A repaired mechanical finding must not keep
 * human approval disabled; subjective and factual critic findings still do.
 */
export function creativeQualityReviewHasUnresolvedBlockers(
  review: CreativeQualityReview | undefined,
  currentIssues: readonly CreativeQualityIssue[],
): boolean {
  if (review?.status !== "rejected") return false;

  const currentBlockerKeys = new Set(
    currentIssues
      .filter((issue) => issue.severity === "blocker")
      .map((issue) => `${issue.code}:${issue.unitOrder ?? 0}`),
  );
  return review.issues.some((issue) => {
    if (issue.severity !== "blocker") return false;
    if (!AUTOMATICALLY_REPAIRABLE_REVIEW_CODES.has(issue.code)) return true;
    return currentBlockerKeys.has(`${issue.code}:${issue.unitOrder ?? 0}`);
  });
}

export function visibleDraftLanguageIssues(
  draft: GeneratedCreativeDraft,
  language?: string,
): CreativeQualityIssue[] {
  if (!isSpanishProfileLanguage(language)) return [];
  const issues: CreativeQualityIssue[] = [];
  const publishingFields = [draft.concept, draft.caption, draft.callToAction, draft.altText];
  if (publishingFields.some(hasLikelyEnglishSentence)) {
    issues.push({
      code: "MIXED_LANGUAGE",
      severity: "blocker",
      message: "The publishing copy contains English sentences, but the creative profile requires Spanish.",
    });
  }
  draft.units.forEach((unit) => {
    if ([unit.headline, unit.body, unit.ctaQuestion].some(hasLikelyEnglishSentence)) {
      issues.push({
        code: "MIXED_LANGUAGE",
        severity: "blocker",
        unitOrder: unit.order,
        message: `Slide ${unit.order} contains English copy, but the creative profile requires Spanish.`,
      });
    }
  });
  return issues;
}

function isSpanishProfileLanguage(language?: string): boolean {
  return /^(?:es|spa|spanish|espanol|español)(?:\b|[-_])/iu.test(
    language?.trim() ?? "",
  );
}

function hasLikelyEnglishSentence(value?: string): boolean {
  if (!value?.trim()) return false;
  const markers = value.match(
    /\b(?:the|when|from|your|will|within|during|there|chance|age|count|backwards|end|cycle|estimate|fertile|occur|what|why|how|did|does|this|mean|for|those|planning|buy|their|first|home|should|could|would|with|who|which|most|stands|out|you|know|that|is|are|available|only|hours|long)\b/giu,
  );
  return (markers?.length ?? 0) >= 3;
}

const QUANTITATIVE_CHART_PATTERN =
  /\b(?:bar chart|column chart|line chart|comparison chart|comparative chart|quantitative chart|gr[aá]fic[oa] (?:de barras|de columnas|de l[ií]neas|comparativ[oa]|cuantitativ[oa])|barras? (?:comparativas?|proporcionales?)|ejes? (?:num[eé]ricos?|cuantitativos?)|plot)\b/iu;
const QUALITATIVE_VISUAL_PATTERN =
  /\b(?:qualitative|conceptual|non[- ]proportional|not to scale|without (?:a )?scale|sin escala|no proporcional|sin ejes|sin valores inventados)\b/iu;

function requestsQuantitativeChart(value: string): boolean {
  return QUANTITATIVE_CHART_PATTERN.test(value);
}

function declaresQualitativeVisual(value: string): boolean {
  return QUALITATIVE_VISUAL_PATTERN.test(value);
}

function substantiveEvidenceNumbers(value: string): string[] {
  const matches = value.match(/\b\d[\d,.]*(?:\s*%)?/gu) ?? [];
  return [...new Set(matches.flatMap((match) => {
    const normalized = match.replace(/[,%\s]/gu, "");
    const numeric = Number(normalized);
    if (!Number.isFinite(numeric) || (numeric >= 1900 && numeric <= 2100)) {
      return [];
    }
    return [normalized];
  }))];
}

function repairUnverifiedQuantitativeVisual(
  value: string,
  evidence: string,
  language?: string,
): string {
  if (
    !requestsQuantitativeChart(value) ||
    substantiveEvidenceNumbers(evidence).length >= 2 ||
    declaresQualitativeVisual(value)
  ) {
    return value;
  }
  const constraint = isSpanishProfileLanguage(language)
    ? "Representa la comparación de forma conceptual y no proporcional, sin escala, ejes, barras cuantitativas ni valores inventados."
    : "Show the comparison conceptually and non-proportionally, with no scale, axes, quantitative bars, or invented values.";
  return `${value.replace(/\s+$/u, "")} ${constraint}`;
}

export function creativeQualityThresholdFailures(
  scores: CreativeQualityScores,
  format: CreativeFormat,
  requireCta: boolean,
): CreativeQualityIssue[] {
  const failures: CreativeQualityIssue[] = [];
  const required = {
    factuality: CREATIVE_QUALITY_THRESHOLDS.factuality,
    hook: CREATIVE_QUALITY_THRESHOLDS.hook,
    curiosity: CREATIVE_QUALITY_THRESHOLDS.curiosity,
    relevance: CREATIVE_QUALITY_THRESHOLDS.relevance,
    clarity: CREATIVE_QUALITY_THRESHOLDS.clarity,
    resolution: CREATIVE_QUALITY_THRESHOLDS.resolution,
    ...(requireCta ? { cta: CREATIVE_QUALITY_THRESHOLDS.cta } : {}),
    overall: CREATIVE_QUALITY_THRESHOLDS.overall,
    ...(format === "carousel"
      ? {
          swipeReward: CREATIVE_QUALITY_THRESHOLDS.swipeReward,
          continuity: CREATIVE_QUALITY_THRESHOLDS.continuity,
        }
      : {}),
  } satisfies Partial<CreativeQualityScores>;

  Object.entries(required).forEach(([dimension, minimum]) => {
    const score = scores[dimension as keyof CreativeQualityScores];
    if (score < minimum) {
      failures.push({
        code: `QUALITY_${dimension.toUpperCase()}_BELOW_THRESHOLD`,
        severity: "blocker",
        message: `${qualityLabel(dimension)} scored ${score}; the minimum is ${minimum}.`,
      });
    }
  });
  return failures;
}

export function buildCreativeQualityReview({
  draft,
  format,
  scores,
  criticIssues,
  repairPasses,
  keyFacts = [],
}: {
  draft: GeneratedCreativeDraft;
  format: CreativeFormat;
  scores: CreativeQualityScores;
  criticIssues: CreativeQualityIssue[];
  repairPasses: number;
  keyFacts?: readonly CreativeKeyFact[];
}): CreativeQualityReview {
  const deterministicIssues = deterministicCreativeQualityIssues(
    draft,
    format,
    keyFacts,
  );
  const issues = deduplicateQualityIssues([
    ...deterministicIssues,
    ...criticIssues,
  ]);
  const calibratedScores = calibrateCreativeQualityScores(
    scores,
    issues,
    format,
  );
  const reviewedIssues = deduplicateQualityIssues([
    ...issues,
    ...creativeQualityThresholdFailures(
      calibratedScores,
      format,
      Boolean(
        draft.callToAction?.trim() ||
          draft.units.at(-1)?.ctaQuestion?.trim() ||
          draft.units.at(-1)?.editorialGoal === "debate",
      ),
    ),
  ]);
  const blocked = reviewedIssues.some((issue) => issue.severity === "blocker");
  return {
    status: blocked
      ? repairPasses >= MAX_CREATIVE_EDITORIAL_REPAIRS
        ? "rejected"
        : "needs-repair"
      : "accepted",
    scores: calibratedScores,
    issues: reviewedIssues,
    repairPasses,
  };
}

function calibrateCreativeQualityScores(
  input: CreativeQualityScores,
  issues: CreativeQualityIssue[],
  format: CreativeFormat,
): CreativeQualityScores {
  const scores = { ...input };
  const codes = new Set(issues.map((issue) => issue.code));
  const hasCode = (...values: string[]) => values.some((value) => codes.has(value));

  if (
    hasCode(
      "UNSUPPORTED",
      "OVERSTATED",
      "FACT_MISMATCH",
      "LOST_QUALIFIER",
      "MISATTRIBUTED",
      "CERTAINTY_UPGRADE",
      "UNSUPPORTED_NUMBER",
      "MISSING_SCOPE",
      "UNSUPPORTED_INFERENCE",
    )
  ) {
    scores.factuality = Math.min(scores.factuality, 94);
  }
  if (hasCode("WEAK_HOOK", "BURIED_HOOK")) {
    scores.hook = Math.min(scores.hook, 81);
  }
  if (
    hasCode(
      "LOW_HUMAN_CURIOSITY",
      "ABSTRACT_HOOK",
      "UNEARNED_PERSONAL_IMPACT",
    )
  ) {
    scores.curiosity = Math.min(scores.curiosity, 81);
  }
  if (hasCode("LOW_STORY_RELEVANCE", "NEW_CLOSING_FACT", "CLOSING_GOAL")) {
    scores.relevance = Math.min(scores.relevance, 79);
  }
  if (hasCode("VIEWER_QUESTION_MISMATCH", "WEAK_SWIPE_REWARD")) {
    scores.swipeReward = Math.min(scores.swipeReward, 79);
  }
  if (
    hasCode(
      "SEMANTIC_REPETITION",
      "WEAK_CONTINUITY",
      "NEW_CLOSING_FACT",
      "CLOSING_GOAL",
    )
  ) {
    scores.continuity = Math.min(scores.continuity, 79);
  }
  if (
    hasCode(
      "DUPLICATE_CTA",
      "WEAK_CTA",
      "CTA_CONFLICT",
      "MISSING_DEBATE_QUESTION",
      "CLOSING_QUESTION_COUNT",
      "CLOSING_GOAL",
      "GENERIC_CTA",
    )
  ) {
    scores.cta = Math.min(scores.cta, 74);
  }
  if (hasCode("CLOSING_QUESTION_COUNT", "FACT_BUDGET")) {
    scores.clarity = Math.min(scores.clarity, 84);
  }
  if (hasCode("EMPTY_CONCLUSION")) {
    scores.clarity = Math.min(scores.clarity, 79);
    scores.relevance = Math.min(scores.relevance, 79);
    scores.cta = Math.min(scores.cta, 74);
  }
  if (hasCode("WEAK_RESOLUTION", "HOOK_RESOLUTION_GAP")) {
    scores.resolution = Math.min(scores.resolution, 81);
  }

  const weightedOverall =
    format === "carousel"
      ? scores.factuality * 0.22 +
        scores.hook * 0.12 +
        scores.curiosity * 0.12 +
        scores.swipeReward * 0.08 +
        scores.continuity * 0.08 +
        scores.relevance * 0.12 +
        scores.clarity * 0.1 +
        scores.resolution * 0.08 +
        scores.cta * 0.08
      : scores.factuality * 0.28 +
        scores.hook * 0.16 +
        scores.curiosity * 0.16 +
        scores.relevance * 0.14 +
        scores.clarity * 0.12 +
        scores.resolution * 0.08 +
        scores.cta * 0.06;
  scores.overall = Math.min(scores.overall, Math.round(weightedOverall), 98);
  if (issues.some((issue) => issue.severity === "blocker")) {
    scores.overall = Math.min(scores.overall, 87);
  } else if (issues.length > 0) {
    scores.overall = Math.min(scores.overall, 92);
  }
  return scores;
}

export function assertNoDeterministicCreativeBlockers(
  draft: GeneratedCreativeDraft,
  format: CreativeFormat,
  keyFacts: readonly CreativeKeyFact[] = [],
): void {
  const blockers = [
    ...(format === "carousel"
      ? blockingCarouselNarrativeIssues(
          draft.units,
          draft.narrativeRationale,
        ).map((issue) => issue.message)
      : []),
    ...deterministicFactQualityIssues(draft, keyFacts)
      .filter((issue) => issue.severity === "blocker")
      .map((issue) => issue.message),
  ];
  if (blockers.length > 0) {
    throw new CreativeQualityGateError(
      blockers.join(" "),
    );
  }
}

function deduplicateQualityIssues(
  issues: CreativeQualityIssue[],
): CreativeQualityIssue[] {
  const seen = new Set<string>();
  return issues.filter((issue) => {
    const key = `${issue.code}:${issue.unitOrder ?? 0}:${issue.message}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function qualityLabel(dimension: string): string {
  return dimension.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/^./, (value) =>
    value.toUpperCase(),
  );
}

function withoutQuestionSentences(value?: string): string {
  if (!value?.trim()) return "";
  return (value.match(/[^.!?]+[.!?]?/gu) ?? [])
    .filter((sentence) => !sentence.includes("?"))
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

function closingHeadlineFallback(
  goal: GeneratedCreativeDraft["units"][number]["editorialGoal"],
): string {
  return goal === "debate" ? "The debate" : "The takeaway";
}

export class CreativeQualityGateError extends Error {}
