import "server-only";
import { withCreativeTextBudget } from "../stories/creative-text-meter";
import { generateAnthropicStructuredResponse } from "../stories/anthropic-structured-response";
import { requireAnthropicApiKey } from "../stories/anthropic.config";
import { getCreativeProfile } from "../stories/creative-profile.repository";
import { activeDraft2Session, claimDraft2Session, getDraft2Session, touchDraft2Session, updateDraft2Session } from "./draft2-session.repository";
import { callToActionBrief } from "./draft2-closing.types";
import { DRAFT2_DRAFT_SCHEMA, draftFindings, draftFixRequest, draftPlan, draftRequest, draftRuns, findingCount, findingLines, parseDraft, type Draft, type DraftFindings } from "./draft2-draft.types";
import { draft2DevTrace } from "./draft2-dev-trace";
import { Draft2BusyError, Draft2InputError, Draft2ResponseError, type Draft2TraceEntry } from "./draft2-facts.types";
import { focusFindings, focusForModels, focusMaterial, type Draft2FocusSnapshot } from "./draft2-focus.types";
import { failedCall, funnelRunSummary, type FunnelRole } from "./draft2-funnel";
import type { FunnelStepInput } from "./draft2-funnel-run";
import { eligibleLevers } from "./draft2-levers.types";
import { draft2RoleModel, DEFAULT_DRAFT2_SOL_MODEL } from "./draft2-models";
import { openingFactsSnapshot, type Draft2Opening } from "./draft2-opening.types";
import { traceCost } from "./draft2-trace-cost";
import { brandBrief, composeInstructions, creativeSkills } from "./skills/draft2-skills";
import { CLOSINGS_SKILL } from "./skills/closings";
import { DECKS_SKILL } from "./skills/decks";
import { DRAFTS_SKILL } from "./skills/drafts";
import { FAIRNESS_SKILL } from "./skills/fairness";
import { HOOKS_SKILL } from "./skills/hooks";
import { LEVERS_SKILL } from "./skills/levers";
import { READER_SKILL } from "./skills/reader";
import type { Draft2SessionRow } from "@/db/schema";

/** The draft's writer: Opus by default (2026-10-23 calibration: the strongest writer the words can have); DRAFT2_MODEL_DRAFT_WRITER names another Claude. */
export const DEFAULT_DRAFT_WRITER_MODEL = "claude-opus-5-5";
/** Two calls when the program refuses an answer's contract; the fix call for its findings is a third at most. */
const DRAFT_ATTEMPTS = 2;
/** The draft writes every slide's words with high effort: one call does the work of three funnels. */
const DRAFT_MAX_OUTPUT_TOKENS = 24_000;
const CALL_TIMEOUT_MS = 240_000;
/** A draft and its fix call take about two and a half minutes; a server pass with less left leaves it to the next. */
export const DRAFT_ESTIMATE_MS = 150_000;
const HEARTBEAT_MS = 20_000;

/** The focus the draft follows: decided, not being decided, free of program findings (as the Opening's). */
function draftFocus(session: Draft2SessionRow): Draft2FocusSnapshot {
  const focus = session.focus;
  if (!focus?.values) throw new Draft2InputError("The draft follows the story's focus. Decide the focus first.");
  if (focus.status === "running") throw new Draft2InputError("The focus was still being decided when its request ended. Decide it again first.");
  if (!focus.values.spine) throw new Draft2InputError("The draft follows the spine. Write the spine first.");
  const findings = focusFindings(focus.values, session.inventory ? focusMaterial(session.inventory) : undefined, session.facts ?? undefined);
  if (findings.length) throw new Draft2InputError(`Fix the focus first: ${findings.map((finding) => finding.detail).join(" ")}`);
  return { version: focus.version, values: focus.values };
}

/**
 * The v4 Opening step (2026-10-23, docs/features/draft2-v4.md): the whole
 * carousel's words in one call, the cover with two alternatives, slide 2, the
 * middle slides and the closing, from the focus and its spine. The program
 * checks every part as its funnel would; findings go back to the writer once,
 * and the program keeps the draft with fewer. The draft becomes the Opening,
 * the Closing and the Deck the later steps read (one version each), so the
 * visual script, the review, the images, the caption, the hand edits and the
 * publication work as they do. The earlier runs stay as summaries.
 */
export async function runDraft2Draft(input: FunnelStepInput): Promise<Draft2SessionRow> {
  const session = await getDraft2Session(input.topicId, input.sessionId);
  if (!session || session.storyId !== input.storyId) throw new Draft2InputError("This Draft 2 session was not found for the story. Reload the canvas.");
  if (await activeDraft2Session(input.topicId, input.storyId)) throw new Draft2BusyError("A Draft 2 run is already in progress for this story.");
  const facts = session.facts ?? [];
  if (!facts.length || (session.step === "facts" && session.status !== "ready")) throw new Draft2InputError("The draft builds only on verified facts. Verify the facts first.");
  const focus = draftFocus(session);
  const writer: FunnelRole = { provider: "anthropic", model: draft2RoleModel("draft", "writer", "anthropic", process.env, { anthropic: DEFAULT_DRAFT_WRITER_MODEL, openai: DEFAULT_DRAFT2_SOL_MODEL }) };
  const placeholder = (status: Draft2Opening["status"], error?: string): Draft2Opening => ({
    status, rounds: [], candidates: [], writer, pipeline: "v4", plannedRounds: 1, focus,
    ...(error ? { error, resumeRound: 1 } : {}),
    ...(session.opening && session.opening.pipeline !== "v4" ? { previousRuns: [...(session.opening.previousRuns ?? []), funnelRunSummary(session.opening)] } : session.opening?.previousRuns ? { previousRuns: session.opening.previousRuns } : {}),
  } as Draft2Opening);
  // A server pass with too little left pauses the draft before it starts; the next pass writes it.
  if (input.deadline && Date.now() + DRAFT_ESTIMATE_MS > input.deadline) {
    const paused = await updateDraft2Session(session.id, { opening: placeholder("paused", "Paused before the draft: this request's time is spent. The draft is written in a new request.") });
    return paused ?? session;
  }
  const profile = await getCreativeProfile(input.topicId);
  const emojis = profile.allowEmojis ? Math.max(0, profile.maxEmojis) : 0;
  const levers = eligibleLevers(facts, focus.values);
  const plan = draftPlan(focus, levers, emojis);
  const reader = { address: profile.readerAddress, language: profile.language };
  const entities = (session.inventory?.entities ?? []).map(({ name, kind, factIds }) => ({ name, kind, factIds }));
  const brief = `${brandBrief(profile)}\n\n${callToActionBrief({ style: profile.callToActionStyle, emojis })}`;
  const composed = composeInstructions("draft-writer", [DRAFTS_SKILL, HOOKS_SKILL, LEVERS_SKILL, DECKS_SKILL, CLOSINGS_SKILL, FAIRNESS_SKILL, READER_SKILL, ...creativeSkills(focus.values)], brief);
  const context = { verifiedFacts: openingFactsSnapshot(facts), focus: focusForModels(focus.values), eligibleLevers: levers };
  const apiKey = requireAnthropicApiKey();
  const auditContext = { runId: session.id, topicId: input.topicId, storyId: input.storyId };

  const claimed = await claimDraft2Session(session.id, { step: "opening", opening: placeholder("running"), error: null });
  if (!claimed) throw new Draft2BusyError("A Draft 2 run is already in progress for this story.");
  const trace: Draft2TraceEntry[] = [...session.trace];
  const heartbeat = setInterval(() => { void touchDraft2Session(session.id).catch(() => undefined); }, HEARTBEAT_MS);

  /** One call to the writer, asked again once when its answer breaks the contract; every call stays on the trace. */
  async function write(round: number, operation: string, contents: Record<string, unknown>): Promise<{ draft: Draft; text: string }> {
    let correction: string | undefined;
    for (let attempt = 1; attempt <= DRAFT_ATTEMPTS; attempt++) {
      const request = correction ? { ...contents, correction } : contents;
      draft2DevTrace({ step: "opening", round, provider: "anthropic", model: writer.model, operation, phase: "request", detail: { instructions: composed.instructions, context: { verifiedFacts: "cached" }, contents: request } });
      const at = new Date().toISOString();
      const begin = Date.now();
      let answered: Awaited<ReturnType<typeof generateAnthropicStructuredResponse>>;
      try {
        answered = await generateAnthropicStructuredResponse({ apiKey, model: writer.model, instructions: composed.instructions, context, contents: request, schema: DRAFT2_DRAFT_SCHEMA as unknown as Record<string, unknown>, schemaName: operation, maxOutputTokens: DRAFT_MAX_OUTPUT_TOKENS, effort: "high", timeoutMs: CALL_TIMEOUT_MS, auditContext });
      } catch (error) {
        const note = error instanceof Error ? error.message : "unknown error";
        trace.push({ at, step: "opening", round, provider: "anthropic", model: writer.model, operation, durationMs: Date.now() - begin, outcome: "error", note, ...failedCall(error), skillVersions: composed.skillVersions, effort: "high" });
        throw error;
      }
      const durationMs = Date.now() - begin;
      trace.push({ at, step: "opening", round, provider: "anthropic", model: writer.model, operation, durationMs, usage: answered.usage, cachedInputTokens: answered.cachedInputTokens, ...(answered.cacheWriteTokens ? { cacheWriteTokens: answered.cacheWriteTokens } : {}), answerCharacters: answered.text.length, outcome: "ok", skillVersions: composed.skillVersions, effort: "high", ...traceCost("anthropic", writer.model, answered.usage, answered.cachedInputTokens, answered.cacheWriteTokens) });
      draft2DevTrace({ step: "opening", round, provider: "anthropic", model: writer.model, operation, phase: "response", durationMs, detail: { usage: answered.usage, answer: answered.text } });
      try {
        return { draft: parseDraft(answered.text, plan.closingShape, { round }), text: answered.text };
      } catch (error) {
        if (!(error instanceof Draft2ResponseError)) throw error;
        const call = trace[trace.length - 1];
        if (call) call.note = `Refused by the program: ${error.message}`.slice(0, 600);
        if (attempt === DRAFT_ATTEMPTS) throw error;
        correction = `${error.message}. Return the whole carousel again, every part, with this fixed and nothing else changed.`;
      }
    }
    throw new Draft2ResponseError("The draft could not be written.");
  }

  try {
    const rounds = await withCreativeTextBudget({ topicId: input.topicId, storyId: input.storyId, runId: session.id }, async () => {
      const first = await write(1, "draft2_draft", draftRequest(plan));
      const checks = { facts, reader, entities };
      const firstFindings: DraftFindings = draftFindings(first.draft, plan, checks);
      const made = [{ draft: first.draft, findings: firstFindings }];
      // What the program found goes back to the writer once; the program then keeps the draft with fewer findings.
      if (findingCount(firstFindings)) {
        const fixed = await write(2, "draft2_draft_fix", draftFixRequest(plan, first.text, findingLines(firstFindings)));
        made.push({ draft: fixed.draft, findings: draftFindings(fixed.draft, plan, checks) });
      }
      return made;
    });
    const runs = draftRuns({ rounds, plan, writer, at: new Date().toISOString() });
    const opening = { ...runs.opening, ...(placeholder("running").previousRuns ? { previousRuns: placeholder("running").previousRuns } : {}) };
    const keep = <R extends { pipeline?: string; previousRuns?: unknown[] }>(current: R | null, next: R): R => current && current.pipeline !== "v4"
      ? { ...next, previousRuns: [...(current.previousRuns ?? []), funnelRunSummary(current as never)] }
      : current?.previousRuns ? { ...next, previousRuns: current.previousRuns } : next;
    const closing = keep(session.closing as never, runs.closing as never);
    const deck = keep(session.deck as never, runs.deck as never);
    const clean = runs.opening.status === "ready" && runs.closing.status === "ready" && runs.deck.status === "ready";
    const updated = await updateDraft2Session(session.id, { opening, closing, deck, step: "deck", status: clean ? "ready" : "needs-review", error: null, trace } as never);
    if (!updated) throw new Draft2InputError("This Draft 2 session was not found. Reload the canvas.");
    return updated;
  } catch (error) {
    const message = error instanceof Error ? error.message : "The draft failed.";
    await updateDraft2Session(session.id, { opening: placeholder("failed", message), status: "failed", error: message, trace } as never).catch(() => undefined);
    throw error;
  } finally {
    clearInterval(heartbeat);
  }
}
