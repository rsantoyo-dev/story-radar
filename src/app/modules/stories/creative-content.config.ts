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
  /** Optional final fallback using Cloudflare Workers AI JSON mode. */
  cloudflareAiAccountId?: string;
  cloudflareAiApiToken?: string;
  cloudflareAiModel?: string;
};

const DEFAULT_MAX_RUNS_PER_DAY = 40;
const DEFAULT_MAX_CONTENT_CHARACTERS = 15_000;

export function getCreativeContentRuntimeConfig(): CreativeContentRuntimeConfig {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  const groqApiKey = process.env.GROQ_API_KEY?.trim();
  const cloudflareAiAccountId = process.env.CLOUDFLARE_AI_ACCOUNT_ID?.trim();
  const cloudflareAiApiToken = process.env.CLOUDFLARE_AI_API_TOKEN?.trim();
  const cloudflareAiModel =
    process.env.CLOUDFLARE_AI_MODEL?.trim() ||
    "@cf/zai-org/glm-4.7-flash";
  const publicConfig = getCreativeContentPublicConfig();
  if (Boolean(cloudflareAiAccountId) !== Boolean(cloudflareAiApiToken)) {
    throw new CreativeContentConfigurationError(
      "CLOUDFLARE_AI_ACCOUNT_ID and CLOUDFLARE_AI_API_TOKEN must be configured together",
    );
  }
  const cloudflareFallback =
    cloudflareAiAccountId && cloudflareAiApiToken
      ? {
          cloudflareAiAccountId,
          cloudflareAiApiToken,
          cloudflareAiModel,
        }
      : {};

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
      ...cloudflareFallback,
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
    ...cloudflareFallback,
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
    briefPromptVersion: "creative-brief-v4",
    draftPromptVersions: {
      meme: "meme-draft-v9",
      carousel: "carousel-draft-v10",
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
