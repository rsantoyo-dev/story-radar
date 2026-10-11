/** Sol, the OpenAI model of Draft 2 (the facts extractor, the opening's judge); Claude is the Anthropic one (anthropic.config). */
export const DEFAULT_DRAFT2_SOL_MODEL = "gpt-6.1-sol";

/** The configured Sol model; DRAFT2_EXTRACTOR_MODEL overrides the default for every Draft 2 step. */
export function draft2SolModel(env: NodeJS.ProcessEnv): string {
  return env.DRAFT2_EXTRACTOR_MODEL?.trim() || DEFAULT_DRAFT2_SOL_MODEL;
}

export type Draft2Provider = "openai" | "anthropic";
/** The environment as the knobs read it: process.env, or a test's literal. */
export type Draft2Env = Readonly<Record<string, string | undefined>>;
export type Draft2Effort = "low" | "medium" | "high";
export const DRAFT2_EFFORTS: readonly Draft2Effort[] = ["low", "medium", "high"];
const effortOf = (value: string | undefined): Draft2Effort | undefined => DRAFT2_EFFORTS.find((effort) => effort === value?.trim().toLowerCase());

/**
 * The effort of a funnel round whose plan names none (the revision rounds):
 * "high", or DRAFT2_REVISION_EFFORT_WRITER / DRAFT2_REVISION_EFFORT_JUDGE from
 * the environment, so the revisions can run at medium while a judge shadow
 * (below) measures what high would have said. A round that names its effort
 * (round 1, medium) keeps it.
 */
export function draft2RevisionEffort(role: "writer" | "judge", env: Draft2Env): Draft2Effort {
  return effortOf(role === "judge" ? env.DRAFT2_REVISION_EFFORT_JUDGE : env.DRAFT2_REVISION_EFFORT_WRITER) ?? "high";
}

/**
 * A second judgment of every funnel round at this effort, run beside the
 * real one and recorded on the round (never deciding anything), so two
 * efforts can be compared on the same candidates: DRAFT2_SHADOW_JUDGE_EFFORT.
 * Undefined, or equal to the round's effort, means no shadow.
 */
export function draft2ShadowJudgeEffort(env: Draft2Env): Draft2Effort | undefined {
  return effortOf(env.DRAFT2_SHADOW_JUDGE_EFFORT);
}

/**
 * The model a step's role runs on: DRAFT2_MODEL_<STEP>_<ROLE> (for instance
 * DRAFT2_MODEL_OPENING_WRITER=claude-opus-5-5) when it names a model of the
 * role's provider, else the provider's default. The run records the model it
 * ran on, so a stored run keeps it whatever the environment says later.
 */
export function draft2RoleModel(step: string, role: "writer" | "judge", provider: Draft2Provider, env: Draft2Env, defaults: Record<Draft2Provider, string>): string {
  const configured = env[`DRAFT2_MODEL_${step.toUpperCase()}_${role.toUpperCase()}`]?.trim();
  const fits = configured && (provider === "anthropic" ? /^claude-[a-z0-9.-]+$/i.test(configured) : /^gpt-[a-z0-9.-]+$/i.test(configured));
  return fits ? configured : defaults[provider];
}

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

/** The Closing keeps the Opening's roles, so the story is written by one model and judged by the other end to end. */
export const DRAFT2_CLOSING_ROLES: { writer: Draft2Provider; judge: Draft2Provider } = DRAFT2_OPENING_ROLES;
/** The Deck too: one model writes the whole carousel and the other judges it. */
export const DRAFT2_DECK_ROLES: { writer: Draft2Provider; judge: Draft2Provider } = DRAFT2_OPENING_ROLES;
/** And the visual script: Claude writes it, Sol judges it. */
export const DRAFT2_VISUAL_ROLES: { writer: Draft2Provider; judge: Draft2Provider } = DRAFT2_OPENING_ROLES;
/** And the caption: the post's text by the model that wrote the carousel, judged by the other. */
export const DRAFT2_CAPTION_ROLES: { writer: Draft2Provider; judge: Draft2Provider } = DRAFT2_OPENING_ROLES;
