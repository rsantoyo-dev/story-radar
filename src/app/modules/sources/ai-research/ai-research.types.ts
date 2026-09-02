export const AI_RESEARCH_ORIENTATIONS = [
  "informative",
  "trend",
  "provocative",
] as const;

export type AiResearchOrientation = (typeof AI_RESEARCH_ORIENTATIONS)[number];

export type AiResearchSourceConfig = {
  topicId: string;
  topicName: string;
  topicDescription?: string;
  enabled: boolean;
  instruction: string;
  orientation: AiResearchOrientation;
  resultLimit: number;
  lookbackHours: number;
  language: string;
  region: string;
  includeContent: boolean;
  priority: number;
  updatedAt: Date;
};

export type UpdateAiResearchSourceInput = {
  enabled?: unknown;
  instruction?: unknown;
  orientation?: unknown;
  resultLimit?: unknown;
  lookbackHours?: unknown;
  language?: unknown;
  region?: unknown;
  includeContent?: unknown;
  priority?: unknown;
};
