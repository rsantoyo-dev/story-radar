/** Sol, the OpenAI model of Draft 2 (the facts extractor, the opening's judge); Claude is the Anthropic one (anthropic.config). */
export const DEFAULT_DRAFT2_SOL_MODEL = "gpt-6.1-sol";

/** The configured Sol model; DRAFT2_EXTRACTOR_MODEL overrides the default for every Draft 2 step. */
export function draft2SolModel(env: NodeJS.ProcessEnv): string {
  return env.DRAFT2_EXTRACTOR_MODEL?.trim() || DEFAULT_DRAFT2_SOL_MODEL;
}

export type Draft2Provider = "openai" | "anthropic";

/** The names the canvas and the notes give each provider's model. */
export function draft2ProviderName(provider: Draft2Provider): string {
  return provider === "openai" ? "Sol" : "Claude";
}

/**
 * Who writes the Opening and who judges it. Since the fifth run Claude writes
 * and Sol judges: Claude's own proposals made the strongest hooks of the run,
 * and Sol, asked to develop them, made each one more literal. A run stored
 * before the swap records no roles and had Sol writing and Claude judging.
 */
export const DRAFT2_OPENING_ROLES: { writer: Draft2Provider; judge: Draft2Provider } = { writer: "anthropic", judge: "openai" };
export const DRAFT2_OPENING_EARLIER_ROLES: { writer: Draft2Provider; judge: Draft2Provider } = { writer: "openai", judge: "anthropic" };
