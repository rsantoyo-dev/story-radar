/** Sol, the OpenAI model of Draft 2 (the facts extractor, the opening's judge); Claude is the Anthropic one (anthropic.config). */
export const DEFAULT_DRAFT2_SOL_MODEL = "gpt-6.1-sol";

/** The configured Sol model; DRAFT2_EXTRACTOR_MODEL overrides the default for every Draft 2 step. */
export function draft2SolModel(env: NodeJS.ProcessEnv): string {
  return env.DRAFT2_EXTRACTOR_MODEL?.trim() || DEFAULT_DRAFT2_SOL_MODEL;
}

/** Luna, OpenAI's light model: it locates the person on a real photo before its slide is composed (DRAFT2_MODEL_PORTRAIT names another). */
export const DEFAULT_DRAFT2_LUNA_MODEL = "gpt-6-luna";
export function draft2PortraitModel(env: NodeJS.ProcessEnv): string {
  return env.DRAFT2_MODEL_PORTRAIT?.trim() || DEFAULT_DRAFT2_LUNA_MODEL;
}

export type Draft2Provider = "openai" | "anthropic";
/** The environment as the knobs read it: process.env, or a test's literal. */
export type Draft2Env = Readonly<Record<string, string | undefined>>;
export type Draft2Effort = "low" | "medium" | "high";
export const DRAFT2_EFFORTS: readonly Draft2Effort[] = ["low", "medium", "high"];
const effortOf = (value: unknown): Draft2Effort | undefined => DRAFT2_EFFORTS.find((effort) => effort === (typeof value === "string" ? value.trim().toLowerCase() : value));

/**
 * The pipeline a session runs on (2026-10-16): v2, the one in use, kept as
 * it is; v3, the one being adjusted on top of it, a recipe over the same
 * engine (fewer, harder rounds; the judges at low effort; five distinct
 * openings; one visual script). A session keeps its pipeline, and every run
 * records the one it ran on, so a v2 story is never finished by v3 rules.
 */
export const DRAFT2_PIPELINES = ["v2", "v3"] as const;
export type Draft2Pipeline = (typeof DRAFT2_PIPELINES)[number];
export const DEFAULT_DRAFT2_PIPELINE: Draft2Pipeline = "v3";
export const parseDraft2Pipeline = (value: unknown): Draft2Pipeline | undefined => DRAFT2_PIPELINES.find((pipeline) => pipeline === value);

/**
 * The effort of a funnel round whose plan names none (the revision rounds).
 * v2: the writer thinks at "high"; the judge judges at "medium" since
 * 2026-10-10, when a shadow at medium named the same winner as high in 7
 * rounds of 7 at a third of the time. v3: the writer at "medium" and the
 * judge at "low" (48 shadow rounds of Luna at low beside medium, 2026-10-15/16:
 * the same winner on every visual script, three times faster, a point or two
 * apart). DRAFT2_REVISION_EFFORT_WRITER / DRAFT2_REVISION_EFFORT_JUDGE override
 * either. A round that names its effort keeps it.
 */
export function draft2RevisionEffort(role: "writer" | "judge", env: Draft2Env, pipeline: Draft2Pipeline = "v2"): Draft2Effort {
  const fallback = pipeline === "v3" ? (role === "judge" ? "low" : "medium") : (role === "judge" ? "medium" : "high");
  return effortOf(role === "judge" ? env.DRAFT2_REVISION_EFFORT_JUDGE : env.DRAFT2_REVISION_EFFORT_WRITER) ?? fallback;
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

/** Who plays each part in a run started now: the facts' extractor and reviewer, the judge of a narrative form, each funnel step's writer and judge, and the image reviews. */
export type Draft2Cast = {
  facts: { extractor: Draft2ModelRole; reviewer: Draft2ModelRole };
  /** Reviews a narrative form Claude chose in the Focus: the judges' model unless DRAFT2_MODEL_FOCUS_JUDGE names another. */
  focusReview: Draft2ModelRole;
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
    focusReview: { provider: "openai", model: draft2RoleModel("focus", "judge", "openai", env, defaults) },
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

/** A model the editor may choose for the funnel's writer or judge, with its list price per million tokens (the cost meter's rates, creative-text-cost.ts). */
export type Draft2ModelOption = { model: string; provider: Draft2Provider; name: string; input: number; output: number };
export const DRAFT2_MODEL_OPTIONS: readonly Draft2ModelOption[] = [
  { model: "claude-sonnet-5-5", provider: "anthropic", name: "Claude Sonnet 5.5", input: 2, output: 10 },
  { model: "claude-opus-5-5", provider: "anthropic", name: "Claude Opus 5.5", input: 4, output: 20 },
  { model: "gpt-6.1-sol", provider: "openai", name: "GPT-6.1 Sol", input: 2, output: 10 },
  { model: "gpt-6-luna", provider: "openai", name: "GPT-6 Luna", input: 0.1, output: 0.5 },
];

/**
 * The editor's choice for one funnel step: who writes and who judges it, and
 * how hard each thinks on every round (over the step's plan). Since
 * 2026-10-16, per step, so one story can test Sol judging the Opening while
 * Luna judges the rest and the results compare step by step.
 */
export type Draft2StepChoice = { writer?: Draft2ModelRole; judge?: Draft2ModelRole; writerEffort?: Draft2Effort; judgeEffort?: Draft2Effort };

/**
 * The editor's choice of who writes and who judges a session's funnel steps
 * (Opening, Closing, Deck, Visual script, Caption), kept on the session: a
 * choice for every step (writer, judge), and one per step over it (steps). A
 * role left out runs on today's cast (the environment); an effort left out,
 * on the step's plan. A run records the models and efforts it started with,
 * so a run in progress keeps them whatever the choice says later.
 */
export type Draft2ModelChoice = { writer?: Draft2ModelRole; judge?: Draft2ModelRole; steps?: Partial<Record<Draft2FunnelStepName, Draft2StepChoice>> };

export const DRAFT2_FUNNEL_STEP_NAMES: readonly Draft2FunnelStepName[] = ["opening", "closing", "deck", "visual", "caption"];

/** A role's model as the canvas sends it (a model id, or the stored role), when it is one of the offered models. */
function pickModel(entry: unknown): Draft2ModelRole | undefined {
  const id = typeof entry === "string" ? entry : entry && typeof entry === "object" ? (entry as { model?: unknown }).model : undefined;
  const option = DRAFT2_MODEL_OPTIONS.find((candidate) => candidate.model === id);
  return option ? { provider: option.provider, model: option.model } : undefined;
}

/**
 * The choice as the canvas sends it ({ writer: "gpt-6.1-sol", judge:
 * "claude-sonnet-5-5", steps: { opening: { judge: "gpt-6.1-sol", judgeEffort:
 * "medium" } } }, a role's model id or nothing): only the offered models and
 * the three efforts are kept; a step with nothing chosen is left out.
 */
export function parseDraft2ModelChoice(value: unknown): Draft2ModelChoice {
  const body = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const writer = pickModel(body.writer);
  const judge = pickModel(body.judge);
  const stepsBody = body.steps && typeof body.steps === "object" && !Array.isArray(body.steps) ? body.steps as Record<string, unknown> : {};
  const steps: Partial<Record<Draft2FunnelStepName, Draft2StepChoice>> = {};
  for (const step of DRAFT2_FUNNEL_STEP_NAMES) {
    const entry = stepsBody[step];
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
    const given = entry as Record<string, unknown>;
    const choice: Draft2StepChoice = {};
    const stepWriter = pickModel(given.writer);
    const stepJudge = pickModel(given.judge);
    const writerEffort = effortOf(given.writerEffort);
    const judgeEffort = effortOf(given.judgeEffort);
    if (stepWriter) choice.writer = stepWriter;
    if (stepJudge) choice.judge = stepJudge;
    if (writerEffort) choice.writerEffort = writerEffort;
    if (judgeEffort) choice.judgeEffort = judgeEffort;
    if (Object.keys(choice).length) steps[step] = choice;
  }
  return { ...(writer ? { writer } : {}), ...(judge ? { judge } : {}), ...(Object.keys(steps).length ? { steps } : {}) };
}

/** Whether a choice chooses anything; an empty one is stored as nothing. */
export const draft2ChoiceIsEmpty = (choice: Draft2ModelChoice | null | undefined): boolean => !choice?.writer && !choice?.judge && !Object.keys(choice?.steps ?? {}).length;

/** What the choice says for one step: the step's own choice over the one for every step; a part left out stays undefined. */
export function draft2StepChoice(choice: Draft2ModelChoice | null | undefined, step: Draft2FunnelStepName): Draft2StepChoice {
  const own = choice?.steps?.[step] ?? {};
  const writer = own.writer ?? choice?.writer;
  const judge = own.judge ?? choice?.judge;
  return { ...(writer ? { writer } : {}), ...(judge ? { judge } : {}), ...(own.writerEffort ? { writerEffort: own.writerEffort } : {}), ...(own.judgeEffort ? { judgeEffort: own.judgeEffort } : {}) };
}

/** Today's cast with the session's choice in place: every funnel step's writer and judge. */
export function castWithChoice(cast: Draft2Cast, choice: Draft2ModelChoice | null | undefined): Draft2Cast {
  if (draft2ChoiceIsEmpty(choice)) return cast;
  const funnel = Object.fromEntries(Object.entries(cast.funnel).map(([step, roles]) => {
    const chosen = draft2StepChoice(choice, step as Draft2FunnelStepName);
    return [step, { writer: chosen.writer ?? roles.writer, judge: chosen.judge ?? roles.judge }];
  })) as Draft2Cast["funnel"];
  return { ...cast, funnel };
}
