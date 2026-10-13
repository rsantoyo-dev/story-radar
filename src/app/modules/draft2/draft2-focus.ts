import "server-only";
import { withCreativeTextBudget } from "../stories/creative-text-meter";
import { generateAnthropicStructuredResponse } from "../stories/anthropic-structured-response";
import { generateOpenAiStructuredResponse } from "../stories/openai-structured-response";
import { getAnthropicRuntimeConfig, requireAnthropicApiKey } from "../stories/anthropic.config";
import { getCreativeProfile } from "../stories/creative-profile.repository";
import { getStoryContent } from "../stories/story-content.repository";
import { activeEditorialLines, storyCollectionContexts } from "../editorial-lines/editorial-lines.repository";
import { activeDraft2Session, claimDraft2Session, getDraft2Session, touchDraft2Session, updateDraft2Session } from "./draft2-session.repository";
import { failedCall } from "./draft2-funnel";
import { traceCost } from "./draft2-trace-cost";
import { draft2DevTrace } from "./draft2-dev-trace";
import { Draft2BusyError, Draft2InputError, Draft2ResponseError, type Draft2Fact, type Draft2TraceEntry } from "./draft2-facts.types";
import {
  CLASSIC_CONCEPT, CLASSIC_NARRATIVE, DRAFT2_FOCUS_PLAN_SCHEMA, DRAFT2_FOCUS_SCHEMA, DRAFT2_NARRATIVE_REVIEW_SCHEMA, FOCUS_PLAN_FIELDS, applyFocusEdit, conceptReviewRequest, decidedFocus, editorChoicesOf, focusDecisionRequest, focusForModels, focusLine, focusMaterial, focusToday,
  focusWithPlan, narrativeReviewRequest, parseFocusDecision, parseFocusPlan, parseNarrativeReview, resetFocusField,
  type Draft2CreativeReview, type Draft2Focus, type Draft2FocusField, type Draft2FocusMaterial,
} from "./draft2-focus.types";
import { draft2ModelName, draft2RoleModel, draft2SolModel } from "./draft2-models";
import { OPENING_STALL_MS, openingFactsSnapshot } from "./draft2-opening.types";
import { visualModeLine, type Draft2VisualMode } from "./draft2-visual.types";
import { resolveCreativeVisualGuidance } from "../stories/creative-visual-guidance";
import { brandBrief, composeInstructions, creativeSkills, type Draft2Skill } from "./skills/draft2-skills";
import { FOCUS_SKILL } from "./skills/focus";
import { NARRATIVES_SKILL } from "./skills/narratives";
import { DISCOVERY_SKILL } from "./skills/discovery";
import { ARCS_SKILL } from "./skills/arcs";
import { SPINE_SKILL } from "./skills/spine";
import type { Draft2SessionRow } from "@/db/schema";

/** Every field and a reason for each, with Claude's thinking, which the API counts against the same ceiling. */
const MAX_OUTPUT_TOKENS = 12_000;
/** The plan: the spine (up to ten beats) and the two directions, with Claude's thinking. */
const PLAN_MAX_OUTPUT_TOKENS = 10_000;
const DECISION_AGAIN = "Return the whole decision again, every field and every reason, with this fixed and nothing else changed.";
const PLAN_AGAIN = "Return the whole plan again, the spine, both directions and every reason, with this fixed and nothing else changed.";
/** One call; the adapter's default limit (120 s) is short for high effort on a long facts list. */
const CALL_TIMEOUT_MS = 240_000;
/** Shows the decision is alive, well inside OPENING_STALL_MS (the window aliveSince() gives the focus too). */
const HEARTBEAT_MS = 30_000;
/** One call, and one more when the answer breaks a rule of the contract (a field too long, a value outside it): the rule goes back as the correction to apply. */
const FOCUS_ATTEMPTS = 2;
/** The judge's look at a narrative form: a verdict and a reason, at low effort. */
const REVIEW_MAX_OUTPUT_TOKENS = 4_000;
const REVIEW_TIMEOUT_MS = 90_000;

export type Draft2FocusInput = { topicId: string; storyId: string; sessionId: string };

/** Whether the session's facts are verified: a session past the Facts step has them, since every later step starts only on them. */
const factsVerified = (session: Draft2SessionRow) => Boolean(session.facts?.length) && (session.step !== "facts" || session.status === "ready");

/**
 * Decides the focus of a session whose facts are verified and whose people
 * and places are found: one Claude call reads the facts (cached), the brand
 * brief, the profile's defaults, the Topic's editorial lines, the lines that
 * found the story and People and places' material, and returns every field
 * with a reason. A field the editor set stays theirs: Claude receives it as
 * an editor's choice and the program keeps it whatever the answer says. A
 * narrative form or a premise Claude chose (not classic, not the editor's)
 * goes to the judge, both side by side, which keeps each or sends it back to
 * classic; a review that cannot run leaves Claude's choice standing, with
 * why. A failure keeps the focus as it was before, with the trace.
 */
export async function decideDraft2Focus({ topicId, storyId, sessionId }: Draft2FocusInput): Promise<Draft2SessionRow> {
  const session = await getDraft2Session(topicId, sessionId);
  if (!session || session.storyId !== storyId) throw new Draft2InputError("This Draft 2 session was not found for the story. Reload the canvas.");
  if (await activeDraft2Session(topicId, storyId)) throw new Draft2BusyError("A Draft 2 run is already in progress for this story.");
  const facts = session.facts ?? [];
  if (!factsVerified(session)) throw new Draft2InputError("The focus builds only on verified facts. Verify the facts first.");
  const inventory = session.inventory;
  if (inventory?.status !== "ready") throw new Draft2InputError("Find the people and places first: the focus chooses the narrative form with them.");
  const material = focusMaterial(inventory);
  const apiKey = requireAnthropicApiKey();
  const model = getAnthropicRuntimeConfig().model;

  const [profile, lines, found, content] = await Promise.all([
    getCreativeProfile(topicId), activeEditorialLines(topicId), storyCollectionContexts(topicId, storyId), getStoryContent(topicId, storyId),
  ]);
  const lineOptions = lines.map(focusLine);
  const foundBy = [...new Set(found.map((entry) => entry.context.lineId))].filter((id) => lines.some((line) => line.id === id));
  const timezone = lines.find((line) => line.id === foundBy[0])?.timezone ?? lines[0]?.timezone;
  const earlier: Draft2Focus = session.focus ?? { status: "running", version: 0, edited: [], lineOptions };
  const focus: Draft2Focus = { ...earlier, status: "running", error: undefined, lineOptions };
  const editorChoices = editorChoicesOf(focus);

  const claimed = await claimDraft2Session(session.id, { step: "focus", focus, error: null });
  if (!claimed) throw new Draft2BusyError("A Draft 2 run is already in progress for this story.");
  const trace: Draft2TraceEntry[] = [...session.trace];
  const auditContext = { runId: session.id, topicId, storyId };
  // The visual identity in full, as the visual script reads it: the visual direction is decided within it.
  const brief = [brandBrief(profile), `# Visual identity\n${resolveCreativeVisualGuidance(profile)}`, visualModeLine(profile.visualFidelityMode as Draft2VisualMode)].join("\n\n");
  const { instructions, skillVersions } = composeInstructions("focus-editor", [FOCUS_SKILL, DISCOVERY_SKILL, ARCS_SKILL, NARRATIVES_SKILL, SPINE_SKILL], brief);
  const verifiedFacts = openingFactsSnapshot(facts);
  const contents = focusDecisionRequest({ title: content.title, today: focusToday(timezone, new Date()), profile, lines, foundBy, editorChoices, material });

  /**
   * The judge's look at a choice Claude made (a narrative form, a premise;
   * never classic, never the editor's): "classic" sends that choice back to
   * classic and keeps Claude's proposal beside it for the editor; the visual
   * direction Claude wrote stays as written. A call that cannot run keeps
   * Claude's choice, with why. Both reviews run side by side.
   */
  const review = async <T>({ value, role, skill, operation, contents: reviewContents, subject }: {
    value: T; role: "focus-narrative-judge" | "focus-concept-judge"; skill: Draft2Skill; operation: string; contents: unknown; subject: string;
  }): Promise<Draft2CreativeReview<T>> => {
    const judgeModel = draft2RoleModel("focus", "judge", "openai", process.env, { openai: draft2SolModel(process.env), anthropic: model });
    const by = { provider: "openai" as const, model: judgeModel };
    const at = new Date().toISOString();
    const openAiKey = process.env.OPENAI_API_KEY?.trim();
    if (!openAiKey) return { verdict: "unavailable", reason: `OPENAI_API_KEY is not configured: the ${subject} was not reviewed.`, by, at };
    const judge = composeInstructions(role, [skill], brief);
    draft2DevTrace({ step: "focus", round: 1, provider: "openai", model: judgeModel, operation, phase: "request", detail: { contents: reviewContents } });
    const begin = Date.now();
    try {
      const answered = await generateOpenAiStructuredResponse({
        apiKey: openAiKey, model: judgeModel, instructions: `${judge.instructions}\n\n# Verified facts\n${JSON.stringify(verifiedFacts)}`, contents: reviewContents,
        schema: DRAFT2_NARRATIVE_REVIEW_SCHEMA, schemaName: operation, maxOutputTokens: REVIEW_MAX_OUTPUT_TOKENS, reasoningEffort: "low", timeoutMs: REVIEW_TIMEOUT_MS, auditContext,
      });
      const durationMs = Date.now() - begin;
      trace.push({ at, step: "focus", round: 1, provider: "openai", model: judgeModel, operation, durationMs, usage: answered.usage, cachedInputTokens: answered.cachedInputTokens, answerCharacters: answered.text.length, outcome: "ok", skillVersions: judge.skillVersions, effort: "low", ...traceCost("openai", judgeModel, answered.usage, answered.cachedInputTokens) });
      draft2DevTrace({ step: "focus", round: 1, provider: "openai", model: judgeModel, operation, phase: "response", durationMs, detail: { usage: answered.usage, answer: answered.text } });
      const { verdict, reason } = parseNarrativeReview(answered.text);
      return verdict === "keep" ? { verdict, reason, by, at } : { verdict, reason, proposed: value, by, at };
    } catch (error) {
      const note = error instanceof Error ? error.message : "unknown error";
      trace.push({ at, step: "focus", round: 1, provider: "openai", model: judgeModel, operation, durationMs: Date.now() - begin, outcome: "error", note, ...failedCall(error), skillVersions: judge.skillVersions, effort: "low" });
      draft2DevTrace({ step: "focus", round: 1, provider: "openai", model: judgeModel, operation, phase: "error", durationMs: Date.now() - begin, detail: { error: note } });
      return { verdict: "unavailable", reason: `${draft2ModelName(judgeModel, "openai")} could not review the ${subject} (${note.slice(0, 160)}); it stands as Claude chose it.`, by, at };
    }
  };
  const reviewChoices = async (decided: Draft2Focus): Promise<Draft2Focus> => {
    const values = decided.values;
    if (!values) return decided;
    const narrative = values.narrative;
    const concept = values.concept;
    const reviewContents = { title: content.title, values, material };
    const [narrativeReview, conceptReview] = await Promise.all([
      narrative && narrative.form !== "classic" && !("narrative" in editorChoices)
        ? review({ value: narrative, role: "focus-narrative-judge", skill: NARRATIVES_SKILL, operation: "draft2_focus_narrative_review", contents: narrativeReviewRequest(reviewContents), subject: "narrative form" })
        : undefined,
      concept && concept.arc !== "classic" && !("concept" in editorChoices)
        ? review({
          value: concept, role: "focus-concept-judge", skill: concept.arc === "discovery" ? DISCOVERY_SKILL : ARCS_SKILL, operation: "draft2_focus_concept_review",
          contents: conceptReviewRequest(reviewContents), subject: concept.arc === "discovery" ? "premise" : `${concept.arc} arc`,
        })
        : undefined,
    ]);
    const backToClassic = { ...(narrativeReview?.verdict === "classic" ? { narrative: CLASSIC_NARRATIVE } : {}), ...(conceptReview?.verdict === "classic" ? { concept: CLASSIC_CONCEPT } : {}) };
    return {
      ...decided,
      values: { ...values, ...backToClassic },
      ...(decided.ai ? { ai: { ...decided.ai, ...backToClassic } } : {}),
      ...(narrativeReview ? { narrativeReview } : {}),
      ...(conceptReview ? { conceptReview } : {}),
    };
  };

  const heartbeat = setInterval(() => { void touchDraft2Session(session.id).catch(() => undefined); }, HEARTBEAT_MS);
  let decided: Draft2Focus;
  try {
    decided = await withCreativeTextBudget({ topicId, storyId, runId: session.id }, async () => {
      // Two calls, each asked again once when its answer breaks a rule: the story and how it is told, then the plan (the spine and the directions) from that decision.
      const decision = await focusCall({
        apiKey, model, trace, verifiedFacts, auditContext, operation: "draft2_focus", instructions, skillVersions, contents, schema: DRAFT2_FOCUS_SCHEMA, effort: "high", maxOutputTokens: MAX_OUTPUT_TOKENS,
        parse: (answer) => parseFocusDecision(answer, { facts, lines: lineOptions, editorChoices, material }), again: DECISION_AGAIN,
      });
      const told = decidedFocus(focus, decision, { provider: "anthropic", model }, new Date());
      // The judge's reviews of the telling and the plan written from it run side by side; a telling the judge sent back to classic gets its plan written again.
      const plan = (telling: Draft2Focus) => focusCall({
        apiKey, model, trace, verifiedFacts, auditContext, operation: "draft2_focus_plan", ...planCall(telling, { facts, title: content.title, brief, editorChoices, material }),
        schema: DRAFT2_FOCUS_PLAN_SCHEMA, effort: "high", maxOutputTokens: PLAN_MAX_OUTPUT_TOKENS, again: PLAN_AGAIN,
      });
      const [reviewed, planned] = await Promise.all([reviewChoices(told), plan(told)]);
      const flipped = reviewed.values?.concept?.arc !== told.values?.concept?.arc || reviewed.values?.narrative?.form !== told.values?.narrative?.form;
      return { ...focusWithPlan(reviewed, flipped ? await plan(reviewed) : planned, new Date(), { bump: false }), inventoryVersion: inventory.version };
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "The focus step failed.";
    // The values from before stand; only the status says the new decision failed.
    await updateDraft2Session(session.id, { focus: { ...focus, status: "failed", error: message }, trace, status: "failed", error: message }).catch(() => undefined);
    throw error;
  } finally {
    clearInterval(heartbeat);
  }
  return (await updateDraft2Session(session.id, { focus: decided, trace, status: "ready", error: null })) ?? claimed;
}

/**
 * Saves one field the editor changed (`value`), or gives one back to
 * Claude's value (`reset`); no provider call. Refused while Claude is
 * deciding the focus.
 */
export async function editDraft2Focus({ topicId, sessionId, field, value, reset = false }: { topicId: string; sessionId: string; field: Draft2FocusField; value?: unknown; reset?: boolean }): Promise<Draft2SessionRow> {
  const session = await getDraft2Session(topicId, sessionId);
  if (!session) throw new Draft2InputError("This Draft 2 session was not found. Reload the canvas.");
  const focus = session.focus;
  if (!focus?.values) throw new Draft2InputError("Decide the focus before changing it.");
  const deciding = focus.status === "running" && session.status === "running" && Date.now() - new Date(session.updatedAt).getTime() < OPENING_STALL_MS;
  if (deciding) throw new Draft2BusyError("Claude is deciding the focus; change it when it finishes.");
  const now = new Date();
  const next = reset ? resetFocusField(focus, field, now) : applyFocusEdit(focus, field, value, now);
  if (next === focus) return session;
  const updated = await updateDraft2Session(session.id, { focus: next });
  if (!updated) throw new Draft2InputError("This Draft 2 session was not found. Reload the canvas.");
  return updated;
}

/**
 * One structured call to Claude for the focus, asked again once when its
 * answer breaks a rule (the parse says which, as a response error); both calls
 * stay on the trace, since both were paid.
 */
async function focusCall<T>({ apiKey, model, trace, verifiedFacts, auditContext, operation, instructions, skillVersions, contents, schema, effort, maxOutputTokens, parse, again }: {
  apiKey: string; model: string; trace: Draft2TraceEntry[]; verifiedFacts: unknown; auditContext: { runId: string; topicId: string; storyId: string };
  operation: string; instructions: string; skillVersions: Record<string, string>; contents: Record<string, unknown>; schema: Record<string, unknown>;
  effort: "medium" | "high"; maxOutputTokens: number; parse: (answer: string) => T; again: string;
}): Promise<T> {
  let correction: string | undefined;
  for (let attempt = 1; attempt <= FOCUS_ATTEMPTS; attempt++) {
    const request = correction ? { ...contents, correction } : contents;
    draft2DevTrace({ step: "focus", round: attempt, provider: "anthropic", model, operation, phase: "request", detail: { instructions, context: { verifiedFacts: "cached" }, contents: request } });
    const at = new Date().toISOString();
    const begin = Date.now();
    let answered: Awaited<ReturnType<typeof generateAnthropicStructuredResponse>>;
    try {
      answered = await generateAnthropicStructuredResponse({ apiKey, model, instructions, context: { verifiedFacts }, contents: request, schema, schemaName: operation, maxOutputTokens, effort, timeoutMs: CALL_TIMEOUT_MS, auditContext });
    } catch (error) {
      const note = error instanceof Error ? error.message : "unknown error";
      trace.push({ at, step: "focus", round: attempt, provider: "anthropic", model, operation, durationMs: Date.now() - begin, outcome: "error", note, ...failedCall(error), skillVersions, effort });
      draft2DevTrace({ step: "focus", round: attempt, provider: "anthropic", model, operation, phase: "error", durationMs: Date.now() - begin, detail: { error: note } });
      throw error;
    }
    const durationMs = Date.now() - begin;
    trace.push({ at, step: "focus", round: attempt, provider: "anthropic", model, operation, durationMs, usage: answered.usage, cachedInputTokens: answered.cachedInputTokens, ...(answered.cacheWriteTokens ? { cacheWriteTokens: answered.cacheWriteTokens } : {}), answerCharacters: answered.text.length, outcome: "ok", skillVersions, effort, ...traceCost("anthropic", model, answered.usage, answered.cachedInputTokens, answered.cacheWriteTokens) });
    draft2DevTrace({ step: "focus", round: attempt, provider: "anthropic", model, operation, phase: "response", durationMs, detail: { usage: answered.usage, answer: answered.text } });
    try {
      return parse(answered.text);
    } catch (error) {
      // An answer outside the contract (a field too long, a value it does not accept) is asked for again once, with the rule it broke; a second one fails the step.
      if (!(error instanceof Draft2ResponseError) || attempt === FOCUS_ATTEMPTS) throw error;
      correction = `${error.message}. ${again}`;
      draft2DevTrace({ step: "focus", round: attempt, provider: "anthropic", model, operation, phase: "error", durationMs, detail: { correction } });
    }
  }
  throw new Draft2ResponseError(`The focus could not be decided (${operation}).`);
}

/**
 * The plan call for a focus as it stands: the planner's instructions (the
 * focus and spine skills, and the skills its telling needs), its request and
 * its parse, honoring the parts of the plan the editor owns.
 */
function planCall(focus: Draft2Focus, { facts, title, brief, editorChoices, material }: { facts: readonly Draft2Fact[]; title: string; brief: string; editorChoices: Record<string, unknown>; material?: Draft2FocusMaterial }) {
  const values = focus.values!;
  const planner = composeInstructions("focus-planner", [FOCUS_SKILL, SPINE_SKILL, ...creativeSkills(values)], brief);
  const owned = Object.fromEntries(Object.entries(editorChoices).filter(([key]) => (FOCUS_PLAN_FIELDS as readonly string[]).includes(key)));
  // The decision as the planner reads it: the directions still empty are left out.
  const told = Object.fromEntries(Object.entries(focusForModels(values)).filter(([, value]) => value !== ""));
  return {
    instructions: planner.instructions,
    skillVersions: planner.skillVersions,
    // People and places' material: the visual direction shows the people with a verified portrait through it, never anyone else.
    contents: { task: "plan", title, focus: told, ...(material ? { material } : {}), editorChoices: owned } as Record<string, unknown>,
    parse: (answer: string) => parseFocusPlan(answer, { known: new Set(facts.map((fact) => fact.id)), structure: values.structure, editorChoices: owned }),
  };
}

/**
 * Rewrites the plan (the spine and the two directions) from how the story is
 * now told, after the editor changed its concept, its form or its spine: one
 * Claude call; a part of the plan the editor owns stays theirs, the rest
 * becomes Claude's again, the version moves and the stale mark clears. The
 * Opening and the steps after it read the new plan through the focus version
 * they follow.
 */
export async function rewriteDraft2FocusPlan({ topicId, storyId, sessionId }: Draft2FocusInput): Promise<Draft2SessionRow> {
  const session = await getDraft2Session(topicId, sessionId);
  if (!session || session.storyId !== storyId) throw new Draft2InputError("This Draft 2 session was not found for the story. Reload the canvas.");
  const focus = session.focus;
  if (!focus?.values) throw new Draft2InputError("Decide the focus before rewriting its plan.");
  if (await activeDraft2Session(topicId, storyId)) throw new Draft2BusyError("A Draft 2 run is already in progress for this story.");
  const apiKey = requireAnthropicApiKey();
  const model = getAnthropicRuntimeConfig().model;
  const [profile, content] = await Promise.all([getCreativeProfile(topicId), getStoryContent(topicId, storyId)]);
  const brief = [brandBrief(profile), `# Visual identity\n${resolveCreativeVisualGuidance(profile)}`, visualModeLine(profile.visualFidelityMode as Draft2VisualMode)].join("\n\n");
  const facts = session.facts ?? [];
  const trace: Draft2TraceEntry[] = [...session.trace];
  const auditContext = { runId: session.id, topicId, storyId };
  let plan;
  try {
    plan = await withCreativeTextBudget({ topicId, storyId, runId: session.id }, () => focusCall({
      apiKey, model, trace, verifiedFacts: openingFactsSnapshot(facts), auditContext, operation: "draft2_focus_plan", ...planCall(focus, { facts, title: content.title, brief, editorChoices: editorChoicesOf(focus), ...(session.inventory?.status === "ready" ? { material: focusMaterial(session.inventory) } : {}) }),
      schema: DRAFT2_FOCUS_PLAN_SCHEMA, effort: "high", maxOutputTokens: PLAN_MAX_OUTPUT_TOKENS, again: PLAN_AGAIN,
    }));
  } catch (error) {
    await updateDraft2Session(session.id, { trace }).catch(() => undefined);
    throw error;
  }
  const updated = await updateDraft2Session(session.id, { focus: focusWithPlan(focus, plan, new Date()), trace });
  if (!updated) throw new Draft2InputError("This Draft 2 session was not found. Reload the canvas.");
  return updated;
}
