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
 * the writer thinks at "high"; the judge judges at "medium" since 2026-10-10,
 * when a shadow at medium named the same winner as high in 7 rounds of 7 at
 * a third of the time. DRAFT2_REVISION_EFFORT_WRITER / DRAFT2_REVISION_EFFORT_JUDGE
 * override either. A round that names its effort (round 1, medium) keeps it.
 */
export function draft2RevisionEffort(role: "writer" | "judge", env: Draft2Env): Draft2Effort {
  return effortOf(role === "judge" ? env.DRAFT2_REVISION_EFFORT_JUDGE : env.DRAFT2_REVISION_EFFORT_WRITER) ?? (role === "judge" ? "medium" : "high");
}

/**
 * A second judgment of every funnel round, run beside the real one and
 * recorded on the round (never deciding anything), so another effort, another
 * model, or both can be compared with the real judge on the same candidates:
 * DRAFT2_SHADOW_JUDGE_EFFORT (else the round's effort) and
 * DRAFT2_SHADOW_JUDGE_MODEL (a model of the judge's provider; else the judge's
 * model). No shadow runs when both equal the real judgment's.
 */
export function draft2ShadowJudgeEffort(env: Draft2Env): Draft2Effort | undefined {
  return effortOf(env.DRAFT2_SHADOW_JUDGE_EFFORT);
}
export function draft2ShadowJudgeModel(env: Draft2Env, provider: Draft2Provider): string | undefined {
  const configured = env.DRAFT2_SHADOW_JUDGE_MODEL?.trim();
  return configured && modelFits(provider, configured) ? configured : undefined;
}

/** Whether a model name belongs to a provider: Claude's begin with "claude-", OpenAI's with "gpt-". */
const modelFits = (provider: Draft2Provider, model: string) => provider === "anthropic" ? /^claude-[a-z0-9.-]+$/i.test(model) : /^gpt-[a-z0-9.-]+$/i.test(model);

/**
 * The model a step's role runs on: DRAFT2_MODEL_<STEP>_<ROLE> (for instance
 * DRAFT2_MODEL_OPENING_WRITER=claude-opus-5-5), else DRAFT2_MODEL_<ROLE> for
 * every funnel step (DRAFT2_MODEL_JUDGE=gpt-6-luna), when it names a model of
 * the role's provider; else the provider's default. The run records the model
 * it ran on, so a stored run keeps it whatever the environment says later.
 */
export function draft2RoleModel(step: string, role: "writer" | "judge", provider: Draft2Provider, env: Draft2Env, defaults: Record<Draft2Provider, string>): string {
  const configured = (env[`DRAFT2_MODEL_${step.toUpperCase()}_${role.toUpperCase()}`] ?? env[`DRAFT2_MODEL_${role.toUpperCase()}`])?.trim();
  return configured && modelFits(provider, configured) ? configured : defaults[provider];
}

/** The name a provider's model had before runs recorded their model: Sol for OpenAI, Claude for Anthropic. */
export function draft2ProviderName(provider: Draft2Provider): string {
  return provider === "openai" ? "Sol" : "Claude";
}

/** A role played in a run: the provider and the exact model it runs on. */
export type Draft2ModelRole = { provider: Draft2Provider; model: string };

/**
 * The name the canvas and the run notes give a model, as the editor calls
 * it: an OpenAI model by its family (gpt-6.1-sol is Sol, gpt-6-luna Luna,
 * gpt-6.1-sol-mini Sol mini), a Claude model Claude, anything else its own
 * name; without a model, the provider's earlier name.
 */
export function draft2ModelName(model: string | undefined, provider?: Draft2Provider): string {
  const name = model?.trim() ?? "";
  const openai = /^gpt-[\d.]+-([a-z]+)(?:-([a-z0-9]+))?$/i.exec(name);
  if (openai) return `${openai[1][0].toUpperCase()}${openai[1].slice(1).toLowerCase()}${openai[2] ? ` ${openai[2].toLowerCase()}` : ""}`;
  if (/^claude-/i.test(name)) return "Claude";
  return name || (provider ? draft2ProviderName(provider) : "");
}

export type Draft2FunnelStepName = "opening" | "closing" | "deck" | "visual" | "caption";

/** Who plays each part in a run started now: the facts' extractor and reviewer, each funnel step's writer and judge, and the image reviews. */
export type Draft2Cast = {
  facts: { extractor: Draft2ModelRole; reviewer: Draft2ModelRole };
  funnel: Record<Draft2FunnelStepName, { writer: Draft2ModelRole; judge: Draft2ModelRole }>;
  imageReview: Draft2ModelRole;
};

/**
 * Today's cast, from the environment the runs read: Sol's model
 * (DRAFT2_EXTRACTOR_MODEL) extracts the facts and reviews the images, Claude
 * (the Anthropic default) reviews the facts, and each funnel step's writer
 * and judge are the models draft2RoleModel names. The canvas shows it for
 * runs not started yet; a stored run names the models it recorded.
 */
export function draft2Cast(env: Draft2Env, anthropicModel: string): Draft2Cast {
  const openaiModel = env.DRAFT2_EXTRACTOR_MODEL?.trim() || DEFAULT_DRAFT2_SOL_MODEL;
  const defaults: Record<Draft2Provider, string> = { openai: openaiModel, anthropic: anthropicModel };
  const play = (step: Draft2FunnelStepName, role: "writer" | "judge"): Draft2ModelRole => {
    const provider = FUNNEL_STEP_ROLES[step][role];
    return { provider, model: draft2RoleModel(step, role, provider, env, defaults) };
  };
  const steps = Object.keys(FUNNEL_STEP_ROLES) as Draft2FunnelStepName[];
  return {
    facts: { extractor: { provider: "openai", model: openaiModel }, reviewer: { provider: "anthropic", model: anthropicModel } },
    funnel: Object.fromEntries(steps.map((step) => [step, { writer: play(step, "writer"), judge: play(step, "judge") }])) as Draft2Cast["funnel"],
    imageReview: { provider: "openai", model: openaiModel },
  };
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

/** Each funnel step's providers, for today's cast. */
const FUNNEL_STEP_ROLES: Record<Draft2FunnelStepName, { writer: Draft2Provider; judge: Draft2Provider }> = {
  opening: DRAFT2_OPENING_ROLES, closing: DRAFT2_CLOSING_ROLES, deck: DRAFT2_DECK_ROLES, visual: DRAFT2_VISUAL_ROLES, caption: DRAFT2_CAPTION_ROLES,
};
