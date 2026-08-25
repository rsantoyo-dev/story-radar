import "server-only";

import type { CreativeFormat } from "./creative-content.types";

export type CreativeContentPublicConfig = {
  provider: "google";
  model: string;
  briefPromptVersion: string;
  draftPromptVersions: Record<CreativeFormat, string>;
  maxRunsPerDay: number;
  maxContentCharacters: number;
};

export type CreativeContentRuntimeConfig = CreativeContentPublicConfig & {
  apiKey: string;
};

const DEFAULT_MAX_RUNS_PER_DAY = 20;
const DEFAULT_MAX_CONTENT_CHARACTERS = 15_000;

export function getCreativeContentRuntimeConfig(): CreativeContentRuntimeConfig {
  const apiKey = process.env.GEMINI_API_KEY?.trim();

  if (!apiKey) {
    throw new CreativeContentConfigurationError(
      "GEMINI_API_KEY is not configured",
    );
  }

  return {
    apiKey,
    ...getCreativeContentPublicConfig(),
  };
}

export function getCreativeContentPublicConfig(): CreativeContentPublicConfig {
  return {
    provider: "google",
    model:
      process.env.CREATIVE_GEMINI_MODEL?.trim() ||
      process.env.GEMINI_MODEL?.trim() ||
      "gemini-3.6-flash",
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

function parsePositiveInteger(
  value: string | undefined,
  fallback: number,
): number {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export class CreativeContentConfigurationError extends Error {}
