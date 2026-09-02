import type { EditorialProfileWeights } from "./editorial-profile.types";
import type { EditorialSignalScores } from "./editorial-evaluation.types";

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
