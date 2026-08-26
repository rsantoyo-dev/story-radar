import "server-only";

import type { CreativeFormat } from "./creative-content.types";

export type CreativeTextProvider = "gemini" | "groq";

export type CreativeContentPublicConfig = {
  provider: "google" | "groq";
  model: string;
  primaryProvider: CreativeTextProvider;
  briefPromptVersion: string;
  draftPromptVersions: Record<CreativeFormat, string>;
  maxRunsPerDay: number;
  maxContentCharacters: number;
};

export type CreativeContentRuntimeConfig = CreativeContentPublicConfig & {
  apiKey: string;
  /** Optional capacity/token-limit fallback for creative briefs and drafts. */
  groqApiKey?: string;
  groqModel?: string;
};

const DEFAULT_MAX_RUNS_PER_DAY = 20;
const DEFAULT_MAX_CONTENT_CHARACTERS = 15_000;

export function getCreativeContentRuntimeConfig(): CreativeContentRuntimeConfig {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  const groqApiKey = process.env.GROQ_API_KEY?.trim();
  const publicConfig = getCreativeContentPublicConfig();

  if (publicConfig.primaryProvider === "groq") {
    if (!groqApiKey) {
      throw new CreativeContentConfigurationError(
        "GROQ_API_KEY is not configured",
      );
    }

    return {
      apiKey: groqApiKey,
      groqApiKey,
      groqModel: publicConfig.model,
      ...publicConfig,
    };
  }

  if (!apiKey) {
    throw new CreativeContentConfigurationError(
      "GEMINI_API_KEY is not configured",
    );
  }

  return {
    apiKey,
    ...(groqApiKey
      ? {
          groqApiKey,
          groqModel:
            process.env.CREATIVE_GROQ_MODEL?.trim() || "openai/gpt-oss-20b",
        }
      : {}),
    ...publicConfig,
  };
}

export function getCreativeContentPublicConfig(): CreativeContentPublicConfig {
  const primaryProvider = creativeTextProvider();
  const geminiModel =
    process.env.CREATIVE_GEMINI_MODEL?.trim() ||
    process.env.GEMINI_MODEL?.trim() ||
    "gemini-3.6-flash";
  const groqModel =
    process.env.CREATIVE_GROQ_MODEL?.trim() || "openai/gpt-oss-20b";

  return {
    provider: primaryProvider === "groq" ? "groq" : "google",
    model: primaryProvider === "groq" ? groqModel : geminiModel,
    primaryProvider,
    briefPromptVersion: "creative-brief-v2",
    draftPromptVersions: {
      meme: "meme-draft-v2",
      carousel: "carousel-draft-v2",
    },
    maxRunsPerDay: parsePositiveInteger(
      process.env.CREATIVE_MAX_RUNS_PER_DAY,
      DEFAULT_MAX_RUNS_PER_DAY,
    ),
    maxContentCharacters: parsePositiveInteger(
      process.env.CREATIVE_MAX_CONTENT_CHARACTERS,
      DEFAULT_MAX_CONTENT_CHARACTERS,
    ),
  };
}

function creativeTextProvider(): CreativeTextProvider {
  return process.env.CREATIVE_TEXT_PROVIDER?.trim().toLowerCase() === "groq"
    ? "groq"
    : "gemini";
}

function parsePositiveInteger(
  value: string | undefined,
  fallback: number,
): number {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export class CreativeContentConfigurationError extends Error {}
