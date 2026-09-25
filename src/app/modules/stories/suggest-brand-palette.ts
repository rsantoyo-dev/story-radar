import "server-only";

import { randomUUID } from "node:crypto";

import { CreativeContentConfigurationError } from "./creative-content.config";
import { getCreativeProfile } from "./creative-profile.repository";
import { generateOpenAiStructuredResponse } from "./openai-structured-response";
import {
  BRAND_PALETTE_SUGGESTION_PROMPT_VERSION,
  BRAND_PALETTE_SUGGESTION_SCHEMA,
  buildBrandPaletteSuggestionContents,
  buildBrandPaletteSuggestionInstructions,
  parseBrandPaletteSuggestion,
  validateBrandPalettePrompt,
  type BrandPaletteSuggestion,
} from "./brand-palette-suggestion";

/**
 * Server side of the brand palette assistant. One cheap Luna call per click;
 * nothing is persisted: the editor sees the proposal in the palette editor
 * and decides whether to save the profile. The call happens outside any
 * Creative Studio text budget scope, so the text meter leaves it unmetered by
 * design (it is not a story operation).
 */

const DEFAULT_MODEL = "gpt-5.6-luna";
const MAX_OUTPUT_TOKENS = 900;
const TIMEOUT_MS = 45_000;
/** Per-topic cap per UTC day for this server process; protects the key, not the budget. */
export const MAX_BRAND_PALETTE_SUGGESTIONS_PER_DAY = 40;

export class BrandPaletteSuggestionLimitError extends Error {}

const usage = new Map<string, number>();

function reserve(topicId: string): void {
  const key = `${new Date().toISOString().slice(0, 10)}:${topicId}`;
  const count = usage.get(key) ?? 0;
  if (count >= MAX_BRAND_PALETTE_SUGGESTIONS_PER_DAY) {
    throw new BrandPaletteSuggestionLimitError(
      "The daily limit of palette suggestions for this topic was reached on this server; try again tomorrow or edit the palette manually.",
    );
  }
  usage.set(key, count + 1);
}

function resolveModel(): string {
  return (
    process.env.CREATIVE_PALETTE_ASSISTANT_MODEL?.trim() ||
    process.env.AI_RESEARCH_OPENAI_MODEL?.trim() ||
    DEFAULT_MODEL
  );
}

export type BrandPaletteSuggestionResult = BrandPaletteSuggestion & {
  model: string;
  promptVersion: string;
};

export async function suggestBrandPalette(input: {
  topicId: string;
  prompt: unknown;
}): Promise<BrandPaletteSuggestionResult> {
  const prompt = validateBrandPalettePrompt(input.prompt);
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    throw new CreativeContentConfigurationError(
      "OPENAI_API_KEY is not configured; the palette assistant is unavailable",
    );
  }
  const model = resolveModel();
  const profile = await getCreativeProfile(input.topicId);
  reserve(input.topicId);

  const response = await generateOpenAiStructuredResponse({
    apiKey,
    model,
    instructions: buildBrandPaletteSuggestionInstructions(),
    contents: buildBrandPaletteSuggestionContents({
      prompt,
      currentPalette: profile.brandPalette,
      profile: {
        name: profile.name,
        platform: profile.platform,
        language: profile.language,
        region: profile.region,
        audience: profile.audience,
      },
    }),
    schema: BRAND_PALETTE_SUGGESTION_SCHEMA as unknown as Record<string, unknown>,
    schemaName: "brand_palette_suggestion",
    maxOutputTokens: MAX_OUTPUT_TOKENS,
    reasoningEffort: "low",
    timeoutMs: TIMEOUT_MS,
    auditContext: { runId: randomUUID(), topicId: input.topicId, storyId: "creative-profile" },
  });

  return {
    ...parseBrandPaletteSuggestion(response.text),
    model: response.model,
    promptVersion: BRAND_PALETTE_SUGGESTION_PROMPT_VERSION,
  };
}
