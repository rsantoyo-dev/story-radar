import type { StoryContentStatus } from "./story-candidate.types";

/**
 * Topic-agnostic signals returned by the editorial evaluator. These stay
 * separate from the legacy database columns so new topics do not inherit
 * assumptions such as a particular country or technology focus.
 */
export type EditorialSignalScores = {
  topicFit: number;
  evidenceDepth: number;
  noveltyTimeliness: number;
  audienceValue: number;
  socialPotential: number;
};

export type EditorialEvaluationDecision =
  | "reject"
  | "review"
  | "shortlist";

export type EditorialEvaluationCandidate = {
  storyId: string;
  sourceId: string;
  sourceName: string;
  title: string;
  url: string;
  contentPreview?: string;
  contentStatus: StoryContentStatus;
  language: string;
  region: string;
  tags: string[];
  publishedAt?: Date;
  localScore: number;
  inputHash: string;
};

export type StoryEditorialEvaluation = EditorialSignalScores & {
  storyId: string;
  /**
   * Deterministic weighted score calculated by Press Craftor from the generic
   * signals and the topic's editorial profile. This is the primary score for
   * new evaluations.
   */
  editorialPriority: number;
  /**
   * Legacy fields are deliberately retained while existing dashboard and
   * persistence consumers are migrated to generic signal names.
   *
   * For v2 evaluations they are populated as follows:
   * - editorialScore = editorialPriority
   * - canadaRelevance = audienceValue
   * - aiRelevance = topicFit
   * - novelty = noveltyTimeliness
   */
  editorialScore: number;
  canadaRelevance: number;
  aiRelevance: number;
  novelty: number;
  decision: EditorialEvaluationDecision;
  reason: string;
  suggestedAngles: string[];
  riskFlags: string[];
};

export type EditorialEvaluationUsage = {
  promptTokens: number;
  outputTokens: number;
  thoughtsTokens: number;
  totalTokens: number;
};

export type EditorialEvaluatorResult = {
  modelVersion?: string;
  evaluations: StoryEditorialEvaluation[];
  usage: EditorialEvaluationUsage;
};

export type EditorialDailyUsage = {
  runs: number;
  stories: number;
  evaluatedStories: number;
  promptTokens: number;
  outputTokens: number;
  thoughtsTokens: number;
  totalTokens: number;
};

export type EditorialEvaluationRunResult = {
  status: "completed" | "no-candidates";
  runId?: string;
  provider: string;
  model: string;
  promptVersion: string;
  candidatesScanned: number;
  cachedStories: number;
  evaluatedStories: number;
  usage: EditorialEvaluationUsage;
  daily: EditorialDailyUsage & {
    maxRuns: number;
    maxStories: number;
    remainingRuns: number;
    remainingStories: number;
  };
  evaluations: StoryEditorialEvaluation[];
};
