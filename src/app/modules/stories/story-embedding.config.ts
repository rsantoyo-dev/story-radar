import "server-only";

/**
 * Configuration for semantic "same news event" duplicate detection. The
 * embedding vector is provider-agnostic in storage; today it is produced by
 * OpenAI's embeddings API (the same key already used for AI research).
 */

const DEFAULT_MODEL = "text-embedding-3-small";
// Tuned on real Canada-topic data (title + lead sentence): same news event —
// including cross-language variants — lands ≥ 0.72, while the hardest
// same-topic/different-event pair stays ≤ 0.66.
const DEFAULT_COSINE_THRESHOLD = 0.7;
const DEFAULT_LEXICAL_THRESHOLD = 0.6;
const DEFAULT_WINDOW_DAYS = 14;

export class StoryEmbeddingConfigurationError extends Error {}

export type StoryEmbeddingConfig = {
  provider: "openai";
  model: string;
  /** Cosine similarity at or above which two stories are the same event. */
  cosineThreshold: number;
  /** Title-Jaccard fallback threshold when an embedding is missing. */
  lexicalThreshold: number;
  /** Only compare stories whose dates are within this many days. */
  windowDays: number;
};

export type StoryEmbeddingRuntimeConfig = StoryEmbeddingConfig & {
  apiKey: string;
};

export function getStoryEmbeddingConfig(): StoryEmbeddingConfig {
  return {
    provider: "openai",
    model: process.env.STORY_EMBEDDING_MODEL?.trim() || DEFAULT_MODEL,
    cosineThreshold: readUnitInterval(
      "STORY_DUPLICATE_COSINE_THRESHOLD",
      DEFAULT_COSINE_THRESHOLD,
    ),
    lexicalThreshold: readUnitInterval(
      "STORY_DUPLICATE_LEXICAL_THRESHOLD",
      DEFAULT_LEXICAL_THRESHOLD,
    ),
    windowDays: readPositiveInteger(
      "STORY_DUPLICATE_WINDOW_DAYS",
      DEFAULT_WINDOW_DAYS,
    ),
  };
}

export function getStoryEmbeddingRuntimeConfig(): StoryEmbeddingRuntimeConfig {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    throw new StoryEmbeddingConfigurationError(
      "OPENAI_API_KEY is not configured",
    );
  }
  return { ...getStoryEmbeddingConfig(), apiKey };
}

function readUnitInterval(name: string, fallback: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0 || value > 1) {
    throw new StoryEmbeddingConfigurationError(
      `${name} must be a number between 0 and 1`,
    );
  }
  return value;
}

function readPositiveInteger(name: string, fallback: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1) {
    throw new StoryEmbeddingConfigurationError(
      `${name} must be a positive integer`,
    );
  }
  return value;
}
