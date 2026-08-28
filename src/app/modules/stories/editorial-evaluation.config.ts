import "server-only";

export const EDITORIAL_EVALUATION_PROVIDER = "google";
// v2 returns topic-agnostic signals and lets Press Craftor calculate the final
// priority with each topic's editorial-profile weights.
export const EDITORIAL_PROMPT_VERSION = "editorial-v2";

const DEFAULT_MODEL = "gemini-3.7-flash";
const DEFAULT_MAX_RUNS_PER_DAY = 6;
const DEFAULT_MAX_STORIES_PER_RUN = 10;
const DEFAULT_MAX_STORIES_PER_DAY = 60;
const DEFAULT_MAX_CONTENT_CHARACTERS = 500;
const DEFAULT_MAX_AGE_HOURS = 72;
const DEFAULT_MIN_LOCAL_SCORE = 25;

export type EditorialEvaluationLimits = {
  maxRunsPerDay: number;
  maxStoriesPerRun: number;
  maxStoriesPerDay: number;
  maxContentCharacters: number;
  maxAgeHours: number;
  minLocalScore: number;
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
    groqApiKey?: string;
    groqModel?: string;
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
  };
}

export function getEditorialEvaluationRuntimeConfig(): EditorialEvaluationRuntimeConfig {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  const groqApiKey = process.env.GROQ_API_KEY?.trim();
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
    ...(groqApiKey
      ? {
          groqApiKey,
          groqModel:
            process.env.EDITORIAL_GROQ_MODEL?.trim() ||
            process.env.CREATIVE_GROQ_MODEL?.trim() ||
            "openai/gpt-oss-20b",
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
