import type {
  CreativeContentSufficiency,
  CreativeQualityIssue,
  CreativeQualityScores,
} from "./creative-content.types";

export type CreativeRepairSeverity = "minor" | "structural" | "severe";

export type CreativeEditorialModelConfig = {
  criticModel: string;
  minorRepairModel: string;
  structuralRepairModel: string;
  severeRepairModel: string;
};

const SEVERE_FACTUAL_CODES = new Set([
  "CERTAINTY_UPGRADE",
  "FACT_MISMATCH",
  "LOST_QUALIFIER",
  "MISATTRIBUTED",
  "MISSING_SCOPE",
  "OVERSTATED",
  "UNSUPPORTED",
  "UNSUPPORTED_INFERENCE",
  "UNSUPPORTED_NUMBER",
]);

const STRUCTURAL_CODES = new Set([
  "ABSTRACT_HOOK",
  "BURIED_HOOK",
  "HOOK_RESOLUTION_GAP",
  "LOW_HUMAN_CURIOSITY",
  "LOW_STORY_RELEVANCE",
  "SEMANTIC_REPETITION",
  "UNEARNED_PERSONAL_IMPACT",
  "VIEWER_QUESTION_MISMATCH",
  "WEAK_CONSEQUENCE",
  "WEAK_CONTINUITY",
  "WEAK_HOOK",
  "WEAK_RESOLUTION",
  "WEAK_SWIPE_REWARD",
]);

/**
 * Severity is decided in code, not by the model. This prevents an optimistic
 * critic from routing a factual failure to a lightweight copy editor.
 */
export function classifyCreativeRepairSeverity(
  issues: readonly CreativeQualityIssue[],
  scores: CreativeQualityScores,
): CreativeRepairSeverity {
  if (
    scores.factuality < 96 ||
    issues.some((issue) => SEVERE_FACTUAL_CODES.has(issue.code))
  ) {
    return "severe";
  }

  if (
    scores.hook < 90 ||
    scores.curiosity < 88 ||
    scores.resolution < 88 ||
    issues.some((issue) => STRUCTURAL_CODES.has(issue.code))
  ) {
    return "structural";
  }

  return "minor";
}

export function repairModelForSeverity(
  severity: CreativeRepairSeverity,
  models: CreativeEditorialModelConfig,
): string {
  switch (severity) {
    case "minor":
      return models.minorRepairModel;
    case "structural":
      return models.structuralRepairModel;
    case "severe":
      return models.severeRepairModel;
  }
}

export function evidenceSupportsSevereRepair(
  contentSufficiency: CreativeContentSufficiency,
): boolean {
  return contentSufficiency === "sufficient";
}
