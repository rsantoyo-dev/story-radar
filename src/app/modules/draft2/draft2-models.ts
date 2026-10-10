/** Sol, the model that writes in Draft 2 (the facts, the openings); Claude judges (anthropic.config). */
export const DEFAULT_DRAFT2_SOL_MODEL = "gpt-6.1-sol";

/** The configured Sol model; DRAFT2_EXTRACTOR_MODEL overrides the default for every Draft 2 step. */
export function draft2SolModel(env: NodeJS.ProcessEnv): string {
  return env.DRAFT2_EXTRACTOR_MODEL?.trim() || DEFAULT_DRAFT2_SOL_MODEL;
}
