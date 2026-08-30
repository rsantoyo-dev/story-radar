import type {
  RelevanceField,
  RelevanceKeywordRule,
  StoryKeywordPreferences,
  StoryRelevanceConfig,
} from "./story-relevance.config";
import {
  DEFAULT_STORY_KEYWORD_PREFERENCES,
  FAVORED_TERM_WEIGHT,
  storyRelevanceConfig,
  UNFAVORED_TERM_WEIGHT,
} from "./story-relevance.config";
import type {
  StoryCandidate,
  StoryCandidateInput,
  StoryProcessingDecision,
} from "./story-candidate.types";

type NormalizedFields = Record<RelevanceField, string>;

export function evaluateStoryRelevance(
  candidate: StoryCandidateInput,
  now = new Date(),
  preferences: StoryKeywordPreferences = DEFAULT_STORY_KEYWORD_PREFERENCES,
  config: StoryRelevanceConfig = storyRelevanceConfig,
): StoryCandidate {
  const fields = normalizeCandidateFields(candidate);
  const hardReject = findHardReject(fields, config);

  if (hardReject) {
    return {
      ...candidate,
      relevance: {
        score: 0,
        decision: "rejected",
        reasons: [`hard-reject: ${hardReject}`],
      },
    };
  }

  let score = config.baseScore;
  const reasons = [`base: +${config.baseScore}`];

  score += applyKeywordRules(fields, config.positive, config, reasons);
  score += applyKeywordRules(fields, config.negative, config, reasons);
  score += applyKeywordRules(
    fields,
    createPreferenceRules(preferences),
    config,
    reasons,
  );

  const sourceWeight = config.sourceWeights[candidate.sourceId] ?? 0;

  if (sourceWeight !== 0) {
    score += sourceWeight;
    reasons.push(`source ${candidate.sourceId}: ${formatSigned(sourceWeight)}`);
  }

  const sourcePriorityBonus = getSourcePriorityBonus(candidate, config);

  if (sourcePriorityBonus > 0) {
    score += sourcePriorityBonus;
    reasons.push(
      `source priority ${normalizeSourcePriority(candidate.sourcePriority)}: +${sourcePriorityBonus}`,
    );
  }

  const recencyBonus = getRecencyBonus(candidate, now, config);

  if (recencyBonus > 0) {
    score += recencyBonus;
    reasons.push(`recency: +${recencyBonus}`);
  }

  const normalizedScore = Math.max(0, Math.min(100, Math.round(score)));

  return {
    ...candidate,
    relevance: {
      score: normalizedScore,
      decision: resolveDecision(candidate, normalizedScore, config),
      reasons,
    },
  };
}

export function getSourcePriorityBonus(
  candidate: Pick<StoryCandidateInput, "sourcePriority">,
  config: Pick<StoryRelevanceConfig, "sourcePriorityMaxBonus"> =
    storyRelevanceConfig,
): number {
  return Math.round(
    (normalizeSourcePriority(candidate.sourcePriority) / 100) *
      config.sourcePriorityMaxBonus,
  );
}

function normalizeSourcePriority(value: number | undefined): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.min(100, Math.round(value ?? 0)));
}

function createPreferenceRules(
  preferences: StoryKeywordPreferences,
): RelevanceKeywordRule[] {
  return [
    ...(preferences.favoredTerms.length > 0
      ? [
          {
            id: "manual-favored",
            terms: preferences.favoredTerms,
            weight: FAVORED_TERM_WEIGHT,
            fields: ["title", "content"] as const,
          },
        ]
      : []),
    ...(preferences.unfavoredTerms.length > 0
      ? [
          {
            id: "manual-unfavored",
            terms: preferences.unfavoredTerms,
            weight: UNFAVORED_TERM_WEIGHT,
            fields: ["title", "content"] as const,
          },
        ]
      : []),
  ];
}

export function normalizeRelevanceText(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLocaleLowerCase("en")
    .replace(/&/g, " and ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeCandidateFields(
  candidate: StoryCandidateInput,
): NormalizedFields {
  return {
    title: normalizeRelevanceText(candidate.title),
    content: normalizeRelevanceText(candidate.content.text ?? ""),
    tags: normalizeRelevanceText(candidate.tags.join(" ")),
  };
}

function findHardReject(
  fields: NormalizedFields,
  config: StoryRelevanceConfig,
): string | undefined {
  for (const rule of config.hardReject) {
    for (const field of rule.fields) {
      const matchedTerm = findMatchedTerm(fields[field], rule.terms);

      if (matchedTerm) {
        return `${rule.id} (${field}: ${matchedTerm})`;
      }
    }
  }

  return undefined;
}

function applyKeywordRules(
  fields: NormalizedFields,
  rules: readonly RelevanceKeywordRule[],
  config: StoryRelevanceConfig,
  reasons: string[],
): number {
  let total = 0;

  rules.forEach((rule) => {
    const matches = rule.fields.flatMap((field) => {
      const matchedTerm = findMatchedTerm(fields[field], rule.terms);

      return matchedTerm
        ? [
            {
              field,
              matchedTerm,
              value: rule.weight * config.fieldMultipliers[field],
            },
          ]
        : [];
    });
    const bestMatch = matches.sort(
      (left, right) => Math.abs(right.value) - Math.abs(left.value),
    )[0];

    if (!bestMatch) {
      return;
    }

    total += bestMatch.value;
    reasons.push(
      `${rule.id} (${bestMatch.field}: ${bestMatch.matchedTerm}): ${formatSigned(bestMatch.value)}`,
    );
  });

  return total;
}

function findMatchedTerm(
  normalizedValue: string,
  terms: readonly string[],
): string | undefined {
  if (!normalizedValue) {
    return undefined;
  }

  const paddedValue = ` ${normalizedValue} `;

  return terms.find((term) => {
    const normalizedTerm = normalizeRelevanceText(term);

    return normalizedTerm && paddedValue.includes(` ${normalizedTerm} `);
  });
}

function getRecencyBonus(
  candidate: StoryCandidateInput,
  now: Date,
  config: StoryRelevanceConfig,
): number {
  const effectiveDate = candidate.publishedAt ?? candidate.fetchedAt;
  const ageHours = Math.max(
    0,
    (now.getTime() - effectiveDate.getTime()) / (60 * 60 * 1_000),
  );

  return (
    [...config.recencyBonuses]
      .sort((left, right) => left.maxAgeHours - right.maxAgeHours)
      .find((bonus) => ageHours <= bonus.maxAgeHours)?.score ?? 0
  );
}

function resolveDecision(
  candidate: StoryCandidateInput,
  score: number,
  config: StoryRelevanceConfig,
): StoryProcessingDecision {
  if (score < config.reviewScore) {
    return "rejected";
  }

  if (score < config.readyScore) {
    return "new";
  }

  return candidate.content.status === "full" ||
    candidate.content.status === "likely-full"
    ? "ready"
    : "needs-enrichment";
}

function formatSigned(value: number): string {
  return value >= 0 ? `+${value}` : String(value);
}
