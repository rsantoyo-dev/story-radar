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
 * Converts Gemini's generic editorial signals into the one score used to
 * rank a topic. We normalize by the total weight so a valid profile always
 * produces a 0–100 result, even while profiles are being edited or imported.
 */
export function calculateEditorialPriority(
  signals: EditorialSignalScores,
  weights: EditorialProfileWeights,
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

  return Math.round(weightedTotal / totalWeight);
}
