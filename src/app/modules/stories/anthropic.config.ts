import "server-only";

/** The model Draft 2 steps use when none is configured: the evaluator tier, not the most expensive one. */
export const DEFAULT_ANTHROPIC_MODEL = "claude-sonnet-5-5";

export type AnthropicRuntimeConfig = {
  apiKey?: string;
  model: string;
};

export class AnthropicConfigurationError extends Error {}

/**
 * Claude is the Draft 2 pipeline's independent evaluator and fact verifier.
 * The key is optional until a Draft 2 step runs; the current studio never
 * reads it.
 */
export function getAnthropicRuntimeConfig(): AnthropicRuntimeConfig {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim() || undefined;
  const model = process.env.CREATIVE_ANTHROPIC_MODEL?.trim() || DEFAULT_ANTHROPIC_MODEL;
  return { ...(apiKey ? { apiKey } : {}), model };
}

/** The key a Draft 2 step needs before calling Claude; a missing key is a configuration error, not a provider failure. */
export function requireAnthropicApiKey(): string {
  const { apiKey } = getAnthropicRuntimeConfig();
  if (!apiKey) throw new AnthropicConfigurationError("ANTHROPIC_API_KEY is not configured. Add it to .env.local (or Vercel) to run Draft 2 steps.");
  return apiKey;
}
