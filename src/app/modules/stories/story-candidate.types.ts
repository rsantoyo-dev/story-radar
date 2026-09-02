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
