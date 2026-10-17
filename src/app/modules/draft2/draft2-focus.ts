import "server-only";
import { withCreativeTextBudget } from "../stories/creative-text-meter";
import { generateAnthropicStructuredResponse } from "../stories/anthropic-structured-response";
import { generateOpenAiStructuredResponse } from "../stories/openai-structured-response";
import { getAnthropicRuntimeConfig, requireAnthropicApiKey } from "../stories/anthropic.config";
import { getCreativeProfile } from "../stories/creative-profile.repository";
import { getStoryContent } from "../stories/story-content.repository";
import { activeEditorialLines, storyCollectionContexts } from "../editorial-lines/editorial-lines.repository";
import { activeDraft2Session, claimDraft2Session, getDraft2Session, recentDraft2CoverRows, recentDraft2Levers, touchDraft2Session, updateDraft2Session } from "./draft2-session.repository";
import { recentCovers, recentCoversForModels, type Draft2RecentCover } from "./draft2-cover-variety";
import { eligibleLevers } from "./draft2-levers.types";
import { failedCall } from "./draft2-funnel";
import { traceCost } from "./draft2-trace-cost";
import { draft2DevTrace } from "./draft2-dev-trace";
import { Draft2BusyError, Draft2InputError, Draft2ResponseError, type Draft2Fact, type Draft2TraceEntry } from "./draft2-facts.types";
import {
  CLASSIC_CONCEPT, CLASSIC_NARRATIVE, DRAFT2_FOCUS_PLAN_SCHEMA, focusWithSpineProblems, focusPresentation, presentationMaxBeats, spineRecurring, DRAFT2_FOCUS_SCHEMA, DRAFT2_NARRATIVE_REVIEW_SCHEMA, FOCUS_PLAN_FIELDS, applyFocusEdit, conceptReviewRequest, decidedFocus, editorChoicesOf, focusDecisionRequest, focusForModels, focusLine, focusMaterial, focusToday,
  focusWithPlan, narrativeReviewRequest, parseFocusDecision, parseFocusPlan, parseNarrativeReview, resetFocusField,
  type Draft2CreativeReview, type Draft2Focus, type Draft2FocusField, type Draft2FocusMaterial,
} from "./draft2-focus.types";
import { draft2ModelName, draft2RoleModel, draft2SolModel } from "./draft2-models";
import { OPENING_STALL_MS, openingFactsSnapshot } from "./draft2-opening.types";
import { visualModeLine, type Draft2VisualMode } from "./draft2-visual.types";
import { resolveCreativeVisualGuidance } from "../stories/creative-visual-guidance";
import { brandBrief, composeInstructions, creativeSkills, type Draft2Skill } from "./skills/draft2-skills";
import { avoidTerms } from "./draft2-image-rules";
import { FOCUS_SKILL } from "./skills/focus";
import { NARRATIVES_SKILL } from "./skills/narratives";
import { DISCOVERY_SKILL } from "./skills/discovery";
import { ARCS_SKILL } from "./skills/arcs";
import { SPINE_SKILL } from "./skills/spine";
import { LEVERS_SKILL } from "./skills/levers";
import { READER_SKILL } from "./skills/reader";
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
  // The forms the publication allows now, for the decision and for the editor's choice after it.
  const focus: Draft2Focus = { ...earlier, status: "running", error: undefined, lineOptions, narrativeForms: profile.narrativeForms };
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
      // One call, asked again once when its answer breaks a rule: the story and how it is told. The plan (the levers, the spine and the directions) is the Spine step's, written from the decision as it stands after the reviews.
      const decision = await focusCall({
        apiKey, model, trace, verifiedFacts, auditContext, operation: "draft2_focus", instructions, skillVersions, contents, schema: DRAFT2_FOCUS_SCHEMA, effort: "high", maxOutputTokens: MAX_OUTPUT_TOKENS,
        parse: (answer) => parseFocusDecision(answer, { facts, lines: lineOptions, editorChoices, material, narrativeForms: profile.narrativeForms }), again: DECISION_AGAIN,
      });
      const told = decidedFocus(focus, decision, { provider: "anthropic", model }, new Date());
      // The judge's reviews of the telling. A spine the editor owns stays (parseFocusDecision kept it); Claude's earlier spine and directions go with the decision they followed, and the Spine step writes new ones.
      // A spine the editor owns stays through the decision: its image problems are read again with the brand's avoid list as it stands.
      return { ...focusWithSpineProblems(await reviewChoices(told), avoidTerms(profile.creativeIdentity)), inventoryVersion: inventory.version };
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
  const edited = reset ? resetFocusField(focus, field, now) : applyFocusEdit(focus, field, value, now);
  if (edited === focus) return session;
  // A beat the editor changed: what its image line would make the images pay for is shown again, never blocking.
  const next = field === "spine" ? focusWithSpineProblems(edited, avoidTerms((await getCreativeProfile(topicId)).creativeIdentity)) : edited;
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
  effort: "medium" | "high"; maxOutputTokens: number; parse: (answer: string, attempt: number) => T; again: string;
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
      return parse(answered.text, attempt);
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
function planCall(focus: Draft2Focus, { facts, title, brief, editorChoices, material, recentLevers, avoid = [], covers = [], notes }: { facts: readonly Draft2Fact[]; title: string; brief: string; editorChoices: Record<string, unknown>; material?: Draft2FocusMaterial; recentLevers: readonly string[]; avoid?: readonly string[]; covers?: readonly Draft2RecentCover[]; notes?: string }) {
  const values = focus.values!;
  // The spine's words are what the writers say: the reader's words, never the source's abbreviations.
  const planner = composeInstructions("focus-planner", [FOCUS_SKILL, LEVERS_SKILL, SPINE_SKILL, READER_SKILL, ...creativeSkills(values)], brief);
  // The levers this story's facts, gravity and structure can carry; the publication's last ones, for the plan to vary.
  const eligible = eligibleLevers(facts, values);
  const owned = Object.fromEntries(Object.entries(editorChoices).filter(([key]) => (FOCUS_PLAN_FIELDS as readonly string[]).includes(key)));
  // The decision as the planner reads it: the directions still empty are left out.
  const told = Object.fromEntries(Object.entries(focusForModels(values)).filter(([, value]) => value !== ""));
  return {
    instructions: planner.instructions,
    skillVersions: planner.skillVersions,
    // People and places' material: the visual direction shows the people with a verified portrait through it, never anyone else.
    // The editor's notes on the plan the focus already carries: the planner revises it to follow them (the spine skill's "editor's notes").
    contents: { task: "plan", title, focus: told, ...(material ? { material } : {}), eligibleLevers: eligible, recentLevers, ...(covers.length ? { recentCovers: recentCoversForModels(covers) } : {}), editorChoices: owned, ...(notes ? { notes } : {}) } as Record<string, unknown>,
    // The first answer's image lines are checked and asked for again with what they break; the second's problems go to the editor as notes.
    // A panorama caps the slides and is one scene: its sections are not compared for their subjects.
    parse: (answer: string, attempt: number) => parseFocusPlan(answer, { known: new Set(facts.map((fact) => fact.id)), structure: values.structure, eligibleLevers: eligible, editorChoices: owned, maxBeats: presentationMaxBeats(values), ...(attempt < FOCUS_ATTEMPTS ? { imageCheck: { avoid, recurring: spineRecurring(values.narrative), panorama: focusPresentation(values).images === "panorama" }, coverage: facts } : {}) }),
  };
}

/**
 * The Spine step: Claude writes the plan from the focus as it stands (the
 * story, its interest, how it is told): the hook's lever and where it is
 * paid, the misreadings the cover must prevent, one beat per slide and the
 * two directions. One Claude call, asked again once when its answer breaks a
 * rule; a part of the plan the editor owns stays theirs, the rest becomes
 * Claude's, the focus version moves and the stale mark clears. The Opening
 * and every step after it read the spine through the focus version they
 * follow. The session is claimed as the step "spine" while it runs; a failure
 * keeps the focus as it was, with the trace. With the editor's notes, Claude
 * revises the plan as it stands (the editor's changes in it) to follow them,
 * and the whole new plan is Claude's; the notes are kept on the focus.
 */
export async function planDraft2Spine({ topicId, storyId, sessionId, notes }: Draft2FocusInput & { notes?: string }): Promise<Draft2SessionRow> {
  const session = await getDraft2Session(topicId, sessionId);
  if (!session || session.storyId !== storyId) throw new Draft2InputError("This Draft 2 session was not found for the story. Reload the canvas.");
  const focus = session.focus;
  if (!focus?.values) throw new Draft2InputError("Decide the focus before writing its spine.");
  if (await activeDraft2Session(topicId, storyId)) throw new Draft2BusyError("A Draft 2 run is already in progress for this story.");
  const apiKey = requireAnthropicApiKey();
  const model = getAnthropicRuntimeConfig().model;
  const [profile, content, recentLevers, coverRows] = await Promise.all([getCreativeProfile(topicId), getStoryContent(topicId, storyId), recentDraft2Levers(topicId, session.id), recentDraft2CoverRows(topicId, session.id)]);
  const brief = [brandBrief(profile), `# Visual identity\n${resolveCreativeVisualGuidance(profile)}`, visualModeLine(profile.visualFidelityMode as Draft2VisualMode)].join("\n\n");
  const facts = session.facts ?? [];
  const avoid = avoidTerms(profile.creativeIdentity);
  // The publication's last covers: the plan's visual direction and cover beat vary from them.
  const covers = recentCovers(coverRows, { palette: profile.brandPalette ?? [], roster: session.inventory?.roster ?? [] });
  const claimed = await claimDraft2Session(session.id, { step: "spine", error: null });
  if (!claimed) throw new Draft2BusyError("A Draft 2 run is already in progress for this story.");
  const trace: Draft2TraceEntry[] = [...session.trace];
  const auditContext = { runId: session.id, topicId, storyId };
  const heartbeat = setInterval(() => { void touchDraft2Session(session.id).catch(() => undefined); }, HEARTBEAT_MS);
  let plan;
  try {
    plan = await withCreativeTextBudget({ topicId, storyId, runId: session.id }, () => focusCall({
      apiKey, model, trace, verifiedFacts: openingFactsSnapshot(facts), auditContext, operation: "draft2_focus_plan", ...planCall(focus, { facts, title: content.title, brief, editorChoices: notes ? {} : editorChoicesOf(focus), recentLevers, avoid, covers, notes, ...(session.inventory?.status === "ready" ? { material: focusMaterial(session.inventory) } : {}) }),
      schema: DRAFT2_FOCUS_PLAN_SCHEMA, effort: "high", maxOutputTokens: PLAN_MAX_OUTPUT_TOKENS, again: PLAN_AGAIN,
    }));
  } catch (error) {
    const message = error instanceof Error ? error.message : "The spine step failed.";
    // The focus from before stands; the session says the spine failed.
    await updateDraft2Session(session.id, { trace, status: "failed", error: message }).catch(() => undefined);
    throw error;
  } finally {
    clearInterval(heartbeat);
  }
  const updated = await updateDraft2Session(session.id, { focus: focusWithSpineProblems(focusWithPlan(focus, plan, new Date(), { notes }), avoid), trace, status: "ready", error: null });
  if (!updated) throw new Draft2InputError("This Draft 2 session was not found. Reload the canvas.");
  return updated;
}

/** The plan rewritten after the editor changed how the story is told: the Spine step, under the name the focus route's PATCH keeps. */
export const rewriteDraft2FocusPlan = planDraft2Spine;
