import {
  blockingCarouselNarrativeIssues,
  evaluateCarouselNarrative,
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
  factuality: 95,
  hook: 82,
  swipeReward: 80,
  continuity: 80,
  relevance: 80,
  clarity: 80,
  cta: 75,
  overall: 88,
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
    hashtags: [...draft.hashtags],
    units: draft.units.map((unit) => ({
      ...unit,
      factIds: [...unit.factIds],
      characterIds: [...(unit.characterIds ?? [])],
    })),
  };
  if (format === "carousel") {
    const closing = repaired.units.at(-1);
    if (closing) {
      if (
        closing.editorialGoal === "debate" &&
        !closing.ctaQuestion?.trim() &&
        ![closing.headline, closing.body].some((value) => value?.includes("?")) &&
        closing.viewerQuestion?.trim()
      ) {
        closing.ctaQuestion = ensureQuestion(closing.viewerQuestion);
      }
      if (
        closing.editorialGoal === "debate" &&
        closing.ctaQuestion?.trim() &&
        !closing.ctaQuestion.includes("?")
      ) {
        closing.ctaQuestion = `${closing.ctaQuestion.replace(/[.!]+$/u, "").trim()}?`;
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
  return repairDeterministicFactCopy(repaired, keyFacts, language);
}

function ensureQuestion(value: string): string {
  const question = value.trim().replace(/[.!]+$/u, "");
  return question.includes("?") ? question : `${question}?`;
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
  return [
    ...narrativeIssues,
    ...deterministicFactQualityIssues(draft, keyFacts),
    ...visibleDraftLanguageIssues(draft, language),
  ];
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
    /\b(?:the|when|from|your|will|within|during|there|chance|age|count|backwards|end|cycle|estimate|fertile|occur)\b/giu,
  );
  return (markers?.length ?? 0) >= 3;
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
    relevance: CREATIVE_QUALITY_THRESHOLDS.relevance,
    clarity: CREATIVE_QUALITY_THRESHOLDS.clarity,
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

  const weightedOverall =
    format === "carousel"
      ? scores.factuality * 0.25 +
        scores.hook * 0.15 +
        scores.swipeReward * 0.1 +
        scores.continuity * 0.1 +
        scores.relevance * 0.15 +
        scores.clarity * 0.15 +
        scores.cta * 0.1
      : scores.factuality * 0.3 +
        scores.hook * 0.2 +
        scores.relevance * 0.2 +
        scores.clarity * 0.2 +
        scores.cta * 0.1;
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
