export type StoryContentStatus =
  | "excerpt"
  | "full"
  | "likely-full"
  | "missing";

export type StoryProcessingDecision =
  | "new"
  | "needs-enrichment"
  | "ready"
  | "rejected";

export type StoryCandidateInput = {
  externalId: string;
  sourceId: string;
  sourceName: string;
  sourcePriority?: number;

  title: string;
  url: string;
  content: {
    text?: string;
    status: StoryContentStatus;
  };

  language: string;
  region: string;
  tags: string[];

  publishedAt?: Date;
  fetchedAt: Date;

  /** Selection metadata supplied by a web-grounded AI research source. */
  research?: {
    score: number;
    reasons: string[];
  };

  /**
   * Other contributions that carried this same Story in the batch and were
   * merged into it by deduplication. Persisted as their own `story_sources`
   * rows so their provenance stays reviewable (AGENTS.md §5).
   */
  mergedContributions?: StoryContributionRef[];
};

/** Provenance of one source contribution: who carried it, where and when. */
export type StoryContributionRef = {
  sourceId: string;
  sourceName: string;
  externalId: string;
  url: string;
  fetchedAt: Date;
  research?: {
    score: number;
    reasons: string[];
  };
};

export type StoryRelevanceEvaluation = {
  score: number;
  decision: StoryProcessingDecision;
  reasons: string[];
};

export type StoryCandidate = StoryCandidateInput & {
  relevance: StoryRelevanceEvaluation;
};

export type StorySourceCollectionResult = {
  sourceId: string;
  sourceName: string;
  status: "successful" | "failed";
  fetchedItems: number;
  includedItems: number;
  filteredOutItems: number;
  duplicatesRemoved: number;
  error?: string;
};

export type StoryRadarResult = {
  generatedAt: Date;
  sources: {
    requested: number;
    successful: number;
    failed: number;
    details: StorySourceCollectionResult[];
  };
  counts: {
    fetched: number;
    included: number;
    filteredOut: number;
    duplicatesRemoved: number;
    exactDuplicatesRemoved: number;
    similarDuplicatesRemoved: number;
    relevance: {
      ready: number;
      needsEnrichment: number;
      review: number;
      rejected: number;
    };
  };
  items: StoryCandidate[];
};
