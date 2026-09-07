import "server-only";

import { createHash } from "node:crypto";

/**
 * Runtime config for the optional AI visual analysis of a brand reference
 * (BRAND-02) — the repo's first multimodal call. Gemini only; on failure the
 * editor configures the contribution manually.
 */

export class BrandAnalyzerConfigurationError extends Error {}

/** Bump when the analyzer prompt or output schema changes — part of the cache key. */
export const BRAND_ANALYZER_PROMPT_VERSION = "brand-analyzer-v1";

/** Per-topic cap on distinct references analyzed per UTC day. */
export const MAX_BRAND_ANALYSES_PER_DAY = 30;

const DEFAULT_MODEL = "gemini-3.6-flash";
const TIMEOUT_MS = 30_000;
const MAX_OUTPUT_TOKENS = 2_000;

export type BrandAnalyzerConfig = {
  apiKey: string;
  model: string;
  promptVersion: string;
  timeoutMs: number;
  maxOutputTokens: number;
};

/**
 * Cache key for a stored analysis. Immutable image bytes (`imageSha256`) + the
 * analyzer model + the prompt version — any change is a fresh analysis.
 */
export function brandAnalysisCacheHash(input: {
  imageSha256: string;
  model: string;
  promptVersion: string;
}): string {
  return createHash("sha256")
    .update(
      JSON.stringify({
        image: input.imageSha256,
        model: input.model,
        promptVersion: input.promptVersion,
      }),
    )
    .digest("hex");
}

export function getBrandAnalyzerConfig(): BrandAnalyzerConfig {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    throw new BrandAnalyzerConfigurationError(
      "GEMINI_API_KEY is not configured; the brand reference analyzer is unavailable",
    );
  }
  const model =
    process.env.CREATIVE_BRAND_ANALYZER_MODEL?.trim() || DEFAULT_MODEL;
  return {
    apiKey,
    model,
    promptVersion: BRAND_ANALYZER_PROMPT_VERSION,
    timeoutMs: TIMEOUT_MS,
    maxOutputTokens: MAX_OUTPUT_TOKENS,
  };
}
