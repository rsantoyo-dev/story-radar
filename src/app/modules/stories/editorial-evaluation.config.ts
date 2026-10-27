import "server-only";

export const EDITORIAL_EVALUATION_PROVIDER = "google";
// v3 returns topic-agnostic editorial signals plus independent acquisition
// signals. Press Craftor calculates both Editorial Priority and Growth Score
// deterministically, so the old cache must not be reused.
export const EDITORIAL_PROMPT_VERSION = "editorial-v3";

const DEFAULT_MODEL = "gemini-3.7-flash";
const DEFAULT_MAX_RUNS_PER_DAY = 6;
const DEFAULT_MAX_STORIES_PER_RUN = 10;
const DEFAULT_MAX_STORIES_PER_DAY = 60;
const DEFAULT_MAX_CONTENT_CHARACTERS = 500;
const DEFAULT_MAX_AGE_HOURS = 72;
const DEFAULT_MIN_LOCAL_SCORE = 25;
/** 2026-10-27: in 21 days 713 of 761 evaluated Brossard stories carried only their feed excerpt, and the evaluator left the good ones "for review" for want of text. Four fetches at a time, this covers about 20 stories. */
const DEFAULT_ENRICH_BEFORE_EVALUATION_MS = 45_000;

export type EditorialEvaluationLimits = {
  maxRunsPerDay: number;
  maxStoriesPerRun: number;
  maxStoriesPerDay: number;
  maxContentCharacters: number;
  maxAgeHours: number;
  minLocalScore: number;
  /** Time an evaluation run spends fetching the full article of candidates that have only an excerpt, before judging them; 0 turns it off. */
  enrichBeforeEvaluationMs: number;
};

export type EditorialEvaluationPublicConfig =
  EditorialEvaluationLimits & {
    provider: typeof EDITORIAL_EVALUATION_PROVIDER;
    model: string;
    promptVersion: typeof EDITORIAL_PROMPT_VERSION;
  };

export type EditorialEvaluationRuntimeConfig =
  EditorialEvaluationPublicConfig & {
    apiKey: string;
    paidGeminiApiKey?: string;
    openAiApiKey?: string;
    openAiModel?: string;
    cloudflareAiAccountId?: string;
    cloudflareAiApiToken?: string;
    cloudflareAiModel?: string;
  };

export function getEditorialEvaluationPublicConfig(): EditorialEvaluationPublicConfig {
  return {
    provider: EDITORIAL_EVALUATION_PROVIDER,
    model: process.env.GEMINI_MODEL?.trim() || DEFAULT_MODEL,
    promptVersion: EDITORIAL_PROMPT_VERSION,
    maxRunsPerDay: readPositiveInteger(
      "AI_MAX_RUNS_PER_DAY",
      DEFAULT_MAX_RUNS_PER_DAY,
    ),
    maxStoriesPerRun: readPositiveInteger(
      "AI_MAX_STORIES_PER_RUN",
      DEFAULT_MAX_STORIES_PER_RUN,
    ),
    maxStoriesPerDay: readPositiveInteger(
      "AI_MAX_STORIES_PER_DAY",
      DEFAULT_MAX_STORIES_PER_DAY,
    ),
    maxContentCharacters: readPositiveInteger(
      "AI_MAX_CONTENT_CHARS",
      DEFAULT_MAX_CONTENT_CHARACTERS,
    ),
    maxAgeHours: readPositiveNumber(
      "AI_CANDIDATE_MAX_AGE_HOURS",
      DEFAULT_MAX_AGE_HOURS,
    ),
    minLocalScore: readBoundedInteger(
      "AI_MIN_LOCAL_SCORE",
      DEFAULT_MIN_LOCAL_SCORE,
      0,
      100,
    ),
    enrichBeforeEvaluationMs: readBoundedInteger(
      "AI_ENRICH_BEFORE_EVALUATION_MS",
      DEFAULT_ENRICH_BEFORE_EVALUATION_MS,
      0,
      600_000,
    ),
  };
}

export function getEditorialEvaluationRuntimeConfig(): EditorialEvaluationRuntimeConfig {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  const paidGeminiApiKey = process.env.GEMINI_PAID_API_KEY?.trim();
  const openAiApiKey = process.env.OPENAI_API_KEY?.trim();
  const cloudflareAiAccountId = process.env.CLOUDFLARE_AI_ACCOUNT_ID?.trim();
  const cloudflareAiApiToken = process.env.CLOUDFLARE_AI_API_TOKEN?.trim();

  if (Boolean(cloudflareAiAccountId) !== Boolean(cloudflareAiApiToken)) {
    throw new EditorialEvaluationConfigurationError(
      "CLOUDFLARE_AI_ACCOUNT_ID and CLOUDFLARE_AI_API_TOKEN must be configured together",
    );
  }

  if (!apiKey) {
    throw new EditorialEvaluationConfigurationError(
      "GEMINI_API_KEY is not configured",
    );
  }

  return {
    ...getEditorialEvaluationPublicConfig(),
    apiKey,
    ...(paidGeminiApiKey && paidGeminiApiKey !== apiKey
      ? { paidGeminiApiKey }
      : {}),
    ...(openAiApiKey
      ? {
          openAiApiKey,
          openAiModel:
            process.env.EDITORIAL_OPENAI_MODEL?.trim() ||
            process.env.CREATIVE_MINOR_REPAIR_MODEL?.trim() ||
            "gpt-6.1-sol",
        }
      : {}),
    ...(cloudflareAiAccountId && cloudflareAiApiToken
      ? {
          cloudflareAiAccountId,
          cloudflareAiApiToken,
          cloudflareAiModel:
            process.env.EDITORIAL_CLOUDFLARE_AI_MODEL?.trim() ||
            process.env.CLOUDFLARE_AI_MODEL?.trim() ||
            "@cf/zai-org/glm-4.7-flash",
        }
      : {}),
  };
}

function readPositiveInteger(name: string, fallback: number): number {
  const rawValue = process.env[name]?.trim();

  if (!rawValue) {
    return fallback;
  }

  const value = Number(rawValue);

  if (!Number.isInteger(value) || value < 1) {
    throw new EditorialEvaluationConfigurationError(
      `${name} must be a positive integer`,
    );
  }

  return value;
}

function readPositiveNumber(name: string, fallback: number): number {
  const rawValue = process.env[name]?.trim();

  if (!rawValue) {
    return fallback;
  }

  const value = Number(rawValue);

  if (!Number.isFinite(value) || value <= 0) {
    throw new EditorialEvaluationConfigurationError(
      `${name} must be a positive number`,
    );
  }

  return value;
}

function readBoundedInteger(
  name: string,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  const rawValue = process.env[name]?.trim();

  if (!rawValue) {
    return fallback;
  }

  const value = Number(rawValue);

  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new EditorialEvaluationConfigurationError(
      `${name} must be an integer between ${minimum} and ${maximum}`,
    );
  }

  return value;
}

export class EditorialEvaluationConfigurationError extends Error {}
