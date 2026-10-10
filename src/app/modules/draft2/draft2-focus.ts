import "server-only";
import { withCreativeTextBudget } from "../stories/creative-text-meter";
import { generateAnthropicStructuredResponse } from "../stories/anthropic-structured-response";
import { getAnthropicRuntimeConfig, requireAnthropicApiKey } from "../stories/anthropic.config";
import { getCreativeProfile } from "../stories/creative-profile.repository";
import { getStoryContent } from "../stories/story-content.repository";
import { activeEditorialLines, storyCollectionContexts } from "../editorial-lines/editorial-lines.repository";
import { activeDraft2Session, claimDraft2Session, getDraft2Session, touchDraft2Session, updateDraft2Session } from "./draft2-session.repository";
import { failedCall } from "./draft2-funnel";
import { draft2DevTrace } from "./draft2-dev-trace";
import { Draft2BusyError, Draft2InputError, type Draft2TraceEntry } from "./draft2-facts.types";
import {
  DRAFT2_FOCUS_SCHEMA, applyFocusEdit, decidedFocus, editorChoicesOf, focusDecisionRequest, focusLine, focusToday, parseFocusDecision, resetFocusField,
  type Draft2Focus, type Draft2FocusField,
} from "./draft2-focus.types";
import { OPENING_STALL_MS, openingFactsSnapshot } from "./draft2-opening.types";
import { brandBrief, composeInstructions } from "./skills/draft2-skills";
import { FOCUS_SKILL } from "./skills/focus";
import type { Draft2SessionRow } from "@/db/schema";

/** Every field and a reason for each, with Claude's thinking, which the API counts against the same ceiling. */
const MAX_OUTPUT_TOKENS = 12_000;
/** One call; the adapter's default limit (120 s) is short for high effort on a long facts list. */
const CALL_TIMEOUT_MS = 240_000;
/** Shows the decision is alive, well inside OPENING_STALL_MS (the window aliveSince() gives the focus too). */
const HEARTBEAT_MS = 30_000;

export type Draft2FocusInput = { topicId: string; storyId: string; sessionId: string };

/** Whether the session's facts are verified: a session past the Facts step has them, since every later step starts only on them. */
const factsVerified = (session: Draft2SessionRow) => Boolean(session.facts?.length) && (session.step !== "facts" || session.status === "ready");

/**
 * Decides the focus of a session whose facts are verified: one Claude call
 * reads the facts (cached), the brand brief, the profile's defaults, the
 * Topic's editorial lines and the lines that found the story, and returns
 * every field with a reason. A field the editor set stays theirs: Claude
 * receives it as an editor's choice and the program keeps it whatever the
 * answer says. A failure keeps the focus as it was before, with the trace.
 */
export async function decideDraft2Focus({ topicId, storyId, sessionId }: Draft2FocusInput): Promise<Draft2SessionRow> {
  const session = await getDraft2Session(topicId, sessionId);
  if (!session || session.storyId !== storyId) throw new Draft2InputError("This Draft 2 session was not found for the story. Reload the canvas.");
  if (await activeDraft2Session(topicId, storyId)) throw new Draft2BusyError("A Draft 2 run is already in progress for this story.");
  const facts = session.facts ?? [];
  if (!factsVerified(session)) throw new Draft2InputError("The focus builds only on verified facts. Verify the facts first.");
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
  const { instructions, skillVersions } = composeInstructions("focus-editor", [FOCUS_SKILL], brandBrief(profile));
  const verifiedFacts = openingFactsSnapshot(facts);
  const contents = focusDecisionRequest({ title: content.title, today: focusToday(timezone, new Date()), profile, lines, foundBy, editorChoices });

  const heartbeat = setInterval(() => { void touchDraft2Session(session.id).catch(() => undefined); }, HEARTBEAT_MS);
  let decided: Draft2Focus;
  try {
    decided = await withCreativeTextBudget({ topicId, storyId, runId: session.id }, async () => {
      draft2DevTrace({ step: "focus", round: 1, provider: "anthropic", model, operation: "draft2_focus", phase: "request", detail: { instructions, context: { verifiedFacts: `${verifiedFacts.length} facts (cached)` }, contents } });
      const at = new Date().toISOString();
      const begin = Date.now();
      try {
        const answered = await generateAnthropicStructuredResponse({
          apiKey, model, instructions, context: { verifiedFacts }, contents,
          schema: DRAFT2_FOCUS_SCHEMA, schemaName: "draft2_focus", maxOutputTokens: MAX_OUTPUT_TOKENS, effort: "high", timeoutMs: CALL_TIMEOUT_MS, auditContext,
        });
        const durationMs = Date.now() - begin;
        trace.push({ at, step: "focus", round: 1, provider: "anthropic", model, operation: "draft2_focus", durationMs, usage: answered.usage, cachedInputTokens: answered.cachedInputTokens, ...(answered.cacheWriteTokens ? { cacheWriteTokens: answered.cacheWriteTokens } : {}), answerCharacters: answered.text.length, outcome: "ok", skillVersions });
        draft2DevTrace({ step: "focus", round: 1, provider: "anthropic", model, operation: "draft2_focus", phase: "response", durationMs, detail: { usage: answered.usage, answer: answered.text } });
        const decision = parseFocusDecision(answered.text, { facts, lines: lineOptions, editorChoices });
        return decidedFocus(focus, decision, { provider: "anthropic", model }, new Date());
      } catch (error) {
        if (trace.length === session.trace.length) {
          const note = error instanceof Error ? error.message : "unknown error";
          trace.push({ at, step: "focus", round: 1, provider: "anthropic", model, operation: "draft2_focus", durationMs: Date.now() - begin, outcome: "error", note, ...failedCall(error), skillVersions });
          draft2DevTrace({ step: "focus", round: 1, provider: "anthropic", model, operation: "draft2_focus", phase: "error", durationMs: Date.now() - begin, detail: { error: note } });
        }
        throw error;
      }
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
