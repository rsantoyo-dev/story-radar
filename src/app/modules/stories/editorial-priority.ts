import type { EditorialProfileWeights } from "./editorial-profile.types";
import type {
  EditorialSignalScores,
  GrowthPotentialSignals,
} from "./editorial-evaluation.types";

const EDITORIAL_SIGNAL_KEYS = [
  "topicFit",
  "evidenceDepth",
  "noveltyTimeliness",
  "audienceValue",
  "socialPotential",
] as const satisfies readonly (keyof EditorialSignalScores)[];

/**
 * AI research is a curated discovery source, not a replacement for the
 * editorial review. Its web-grounded selection confidence can therefore
 * refine, but never dominate, the profile-based editorial assessment.
 */
export const AI_RESEARCH_CONFIDENCE_WEIGHT = 0.2;

/**
 * Growth is an acquisition lens, not an editorial-selection lens. The model
 * scores each signal in the context of the configured channel and we apply a
 * stable, transparent weighting so results are comparable across stories.
 */
export const GROWTH_POTENTIAL_WEIGHTS = {
  newAudienceReach: 0.35,
  viralPotential: 0.3,
  constructiveTension: 0.2,
  explainability: 0.15,
} as const satisfies Record<keyof GrowthPotentialSignals, number>;

/**
 * Converts Gemini's generic editorial signals into the one score used to
 * rank a topic. We normalize by the total weight so a valid profile always
 * produces a 0–100 result, even while profiles are being edited or imported.
 */
export function calculateEditorialPriority(
  signals: EditorialSignalScores,
  weights: EditorialProfileWeights,
  researchConfidence?: number,
): number {
  let weightedTotal = 0;
  let totalWeight = 0;

  EDITORIAL_SIGNAL_KEYS.forEach((key) => {
    const score = signals[key];
    const weight = weights[key];

    if (!Number.isFinite(score) || score < 0 || score > 100) {
      throw new RangeError(`${key} must be a score between 0 and 100`);
    }

    if (!Number.isFinite(weight) || weight < 0) {
      throw new RangeError(`${key} weight must be a non-negative number`);
    }

    weightedTotal += score * weight;
    totalWeight += weight;
  });

  if (totalWeight <= 0) {
    throw new RangeError("At least one editorial profile weight must be positive");
  }

  const profilePriority = weightedTotal / totalWeight;

  if (researchConfidence === undefined) {
    return Math.round(profilePriority);
  }

  if (
    !Number.isFinite(researchConfidence) ||
    researchConfidence < 0 ||
    researchConfidence > 100
  ) {
    throw new RangeError("researchConfidence must be a score between 0 and 100");
  }

  return Math.round(
    profilePriority * (1 - AI_RESEARCH_CONFIDENCE_WEIGHT) +
      researchConfidence * AI_RESEARCH_CONFIDENCE_WEIGHT,
  );
}

/**
 * Computes the Growth Score without looking at profile weights, editorial
 * signals, or the evaluator's shortlist/review/reject decision. The profile
 * informs the AI's four input signals, while this calculation stays stable
 * and independently auditable.
 */
export function calculateGrowthScore(
  signals: GrowthPotentialSignals,
): number {
  const entries = Object.entries(
    GROWTH_POTENTIAL_WEIGHTS,
  ) as Array<[keyof GrowthPotentialSignals, number]>;

  return Math.round(
    entries.reduce((total, [key, weight]) => {
      const score = signals[key];

      if (!Number.isFinite(score) || score < 0 || score > 100) {
        throw new RangeError(`${key} must be a score between 0 and 100`);
      }

      return total + score * weight;
    }, 0),
  );
}
