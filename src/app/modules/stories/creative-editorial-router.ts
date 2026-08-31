import type {
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

export type CreativeRepairCandidate = {
  model: string;
  tier: CreativeRepairSeverity;
};

/**
 * Criticism is cheaper than rewriting and must not have a single point of
 * failure. Use one economical editor pass, then at most one stronger pass.
 * Luna is intentionally excluded from factual publication decisions.
 */
export function criticCandidates(
  models: CreativeEditorialModelConfig,
): string[] {
  const ordered = [
    models.criticModel,
    models.severeRepairModel,
  ];
  return [...new Set(ordered)];
}

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

/**
 * A provider timeout is an availability failure, not an editorial verdict.
 * Start with the model matched to the diagnosis, then try the other configured
 * tiers without issuing duplicate requests when two tiers share a model.
 */
export function repairCandidatesForSeverity(
  severity: CreativeRepairSeverity,
  models: CreativeEditorialModelConfig,
): CreativeRepairCandidate[] {
  const tierOrder: CreativeRepairSeverity[] =
    severity === "minor"
      ? ["minor", "structural", "severe"]
      : ["structural", "severe"];
  const seenModels = new Set<string>();

  return tierOrder.flatMap((tier) => {
    const model = repairModelForSeverity(tier, models);
    if (seenModels.has(model)) return [];
    seenModels.add(model);
    return [{ model, tier }];
  });
}

/**
 * A rewrite should be verified by an independent model. Terra rewrites are
 * checked by Sol; Sol rewrites return to Terra. Availability fallbacks remain
 * deduplicated, with Luna reserved for a provider outage rather than factual
 * adjudication.
 */
export function verificationCriticCandidates(
  repairModel: string,
  models: CreativeEditorialModelConfig,
): string[] {
  const ordered =
    repairModel === models.criticModel
      ? [models.severeRepairModel, models.criticModel, models.minorRepairModel]
      : [models.criticModel, models.severeRepairModel, models.minorRepairModel];
  return [...new Set(ordered)];
}
