import "server-only";
import { withCreativeTextBudget } from "../stories/creative-text-meter";
import { generateOpenAiStructuredResponse } from "../stories/openai-structured-response";
import { generateAnthropicStructuredResponse } from "../stories/anthropic-structured-response";
import { getAnthropicRuntimeConfig, requireAnthropicApiKey } from "../stories/anthropic.config";
import { getCreativeProfile } from "../stories/creative-profile.repository";
import { activeDraft2Session, claimDraft2Session, getDraft2Session, updateDraft2Session, type Draft2SessionPatch } from "./draft2-session.repository";
import { draft2DevTrace } from "./draft2-dev-trace";
import { Draft2BusyError, Draft2InputError, type Draft2Threads, type Draft2TraceEntry } from "./draft2-facts.types";
import {
  DRAFT2_OPENING_EVALUATION_SCHEMA, DRAFT2_OPENING_SCHEMA, OPENING_CANDIDATES, OPENING_MAX_ROUNDS, bestCleanCandidate, keptOpeningIds, mechanicalOpeningIssues,
  mergeKeptCandidates, openingAcceptedWinner, openingReviewNote, openingRevisionRequest, openingRunSummary, parseOpeningCandidates, parseOpeningEvaluation,
  type Draft2Opening, type Draft2OpeningCandidate, type Draft2OpeningEvaluation, type Draft2OpeningIssue,
} from "./draft2-opening.types";
import { brandBrief, composeInstructions } from "./skills/draft2-skills";
import { HOOKS_SKILL } from "./skills/hooks";
import type { Draft2SessionRow } from "@/db/schema";

/** A round that would start after this point is left to a new request; the route allows 300 s. */
const TIME_BUDGET_MS = 230_000;
const WRITER_MAX_OUTPUT_TOKENS = 6_000;
/** Covers the verdict and Claude's thinking, which the API counts against the same ceiling. */
const JUDGE_MAX_OUTPUT_TOKENS = 12_000;

export type Draft2OpeningInput = { topicId: string; storyId: string; sessionId: string };

/**
 * Runs the Opening step on a session whose facts are verified: Sol writes
 * seven openings (cover + slide 2) in the conversation where it extracted
 * the facts, the program checks them, Claude judges them on its facts
 * transcript; they loop on Claude's suggestions for at most three rounds.
 * Every provider call is checkpointed, so a failure keeps its trace and the
 * conversations carry on to the next step.
 */
export async function runDraft2Opening({ topicId, storyId, sessionId }: Draft2OpeningInput): Promise<Draft2SessionRow> {
  const session = await getDraft2Session(topicId, sessionId);
  if (!session || session.storyId !== storyId) throw new Draft2InputError("This Draft 2 session was not found for the story. Reload the canvas.");
  if (await activeDraft2Session(topicId, storyId)) throw new Draft2BusyError("A Draft 2 run is already in progress for this story.");
  const facts = session.facts ?? [];
  // A rerun of the opening is allowed in any state the busy check let through, including a run a timeout left "running".
  const factsVerified = session.step === "opening" || (session.step === "facts" && session.status === "ready");
  if (!facts.length || !factsVerified) throw new Draft2InputError("The opening builds only on verified facts. Verify the facts first.");
  const writerThread = session.threads.openai;
  const judgeHistory = session.threads.anthropic?.history ?? [];
  if (!writerThread?.responseId || !judgeHistory.length) throw new Draft2InputError("The facts conversations are missing from this session. Run the facts again.");

  const openAiApiKey = process.env.OPENAI_API_KEY?.trim();
  if (!openAiApiKey) throw new Draft2InputError("OPENAI_API_KEY is not configured; the writer needs it.");
  // Sol continues the conversation that holds the article and the facts, on the model that stored it.
  const writerModel = writerThread.model;
  const anthropicApiKey = requireAnthropicApiKey();
  const judgeModel = getAnthropicRuntimeConfig().model;
  const brief = brandBrief(await getCreativeProfile(topicId));
  const writer = composeInstructions("opening-writer", [HOOKS_SKILL], brief);
  const judge = composeInstructions("opening-judge", [HOOKS_SKILL], brief);

  const threads: Draft2Threads = { ...session.threads };
  const trace: Draft2TraceEntry[] = [...session.trace];
  // A rerun starts a fresh opening; the earlier one stays on the row, with the editor's choice.
  const opening: Draft2Opening = {
    status: "running", rounds: [], candidates: [],
    ...(session.opening ? { previousRuns: [...(session.opening.previousRuns ?? []), openingRunSummary(session.opening)] } : {}),
  };
  const claimed = await claimDraft2Session(session.id, { step: "opening", opening, error: null });
  if (!claimed) throw new Draft2BusyError("A Draft 2 run is already in progress for this story.");
  const auditContext = { runId: session.id, topicId, storyId };
  const startedAt = Date.now();
  let candidates: Draft2OpeningCandidate[] = [];
  let mechanical: Draft2OpeningIssue[] = [];
  let evaluation: Draft2OpeningEvaluation | undefined;

  const checkpoint = (patch: Draft2SessionPatch = {}) => updateDraft2Session(session.id, { opening, threads, trace, ...patch });

  /** Ends the run without an accepted opening; the best clean candidate stands in until the editor chooses. */
  async function needsReview(lead: string) {
    const best = evaluation ? bestCleanCandidate(mechanical, evaluation) : undefined;
    const note = evaluation ? openingReviewNote(mechanical, evaluation, lead) : lead;
    opening.status = "needs-review";
    opening.error = note;
    if (best) opening.winnerId = best.candidateId;
    await checkpoint({ status: "needs-review", error: note });
  }

  /** One provider call: traced on the console in development, recorded on the session always. */
  async function traced<T>(round: number, provider: "openai" | "anthropic", model: string, operation: string, skillVersions: Record<string, string>, request: unknown, call: () => Promise<T & { text: string; usage: Draft2TraceEntry["usage"]; cachedInputTokens?: number }>): Promise<T & { text: string }> {
    draft2DevTrace({ step: "opening", round, provider, model, operation, phase: "request", detail: request });
    const at = new Date().toISOString();
    const begin = Date.now();
    try {
      const value = await call();
      const durationMs = Date.now() - begin;
      trace.push({ at, step: "opening", round, provider, model, operation, durationMs, usage: value.usage, cachedInputTokens: value.cachedInputTokens, outcome: "ok", skillVersions });
      let answer: unknown = value.text;
      try { answer = JSON.parse(value.text); } catch { /* the parser reports a malformed answer */ }
      draft2DevTrace({ step: "opening", round, provider, model, operation, phase: "response", durationMs, detail: { usage: value.usage, cachedInputTokens: value.cachedInputTokens, answer } });
      return value;
    } catch (error) {
      const durationMs = Date.now() - begin;
      const note = error instanceof Error ? error.message : "unknown error";
      trace.push({ at, step: "opening", round, provider, model, operation, durationMs, outcome: "error", note, skillVersions });
      draft2DevTrace({ step: "opening", round, provider, model, operation, phase: "error", durationMs, detail: { error: note } });
      throw error;
    }
  }

  try {
    await withCreativeTextBudget({ topicId, storyId, runId: session.id }, async () => {
      for (let round = 1; round <= OPENING_MAX_ROUNDS; round++) {
        if (round > 1 && Date.now() - startedAt > TIME_BUDGET_MS) {
          await needsReview(`Stopped before round ${round}: the request's time budget is spent.`);
          return;
        }
        // 1. The writer: the verified facts on the first round; afterwards the judge's findings and what to keep, in the same stored conversation.
        const keep = round === 1 ? [] : keptOpeningIds(mechanical, evaluation!);
        const writerContents = round === 1
          ? { task: "openings", facts, candidatesWanted: OPENING_CANDIDATES }
          : openingRevisionRequest(mechanical, evaluation!, keep);
        const writerRequest = { instructions: writer.instructions, contents: writerContents, previousResponseId: threads.openai?.responseId };
        const written = await traced(round, "openai", writerModel, "draft2_opening", writer.skillVersions, writerRequest, () => generateOpenAiStructuredResponse({
          apiKey: openAiApiKey, model: writerModel, instructions: writer.instructions, contents: writerContents,
          schema: DRAFT2_OPENING_SCHEMA, schemaName: "draft2_opening", maxOutputTokens: WRITER_MAX_OUTPUT_TOKENS, reasoningEffort: "medium",
          store: true, previousResponseId: threads.openai?.responseId, auditContext,
        }));
        const revised = parseOpeningCandidates(written.text);
        // A kept candidate stays exactly as the judge scored it, even when the writer drops or rewrites it.
        const merged = round === 1 ? { candidates: revised, restored: [] } : mergeKeptCandidates(candidates, revised, keep);
        candidates = merged.candidates;
        if (written.responseId) threads.openai = { model: writerModel, responseId: written.responseId };
        mechanical = mechanicalOpeningIssues(candidates, facts);
        opening.rounds.push({ round, candidates, mechanical, ...(merged.restored.length ? { restored: merged.restored } : {}), at: new Date().toISOString() });
        opening.candidates = candidates;
        await checkpoint();

        // 2. The judge: the facts are already in Claude's transcript; each round adds the candidates and the program's findings.
        const history = threads.anthropic?.history ?? [];
        const judgeContents = { task: "openings", round, candidates, mechanicalFindings: mechanical };
        const judgeRequest = { instructions: judge.instructions, history: history.map((turn) => ({ role: turn.role, characters: turn.text.length })), contents: judgeContents };
        const judged = await traced(round, "anthropic", judgeModel, "draft2_opening_review", judge.skillVersions, judgeRequest, () => generateAnthropicStructuredResponse({
          apiKey: anthropicApiKey, model: judgeModel, instructions: judge.instructions, contents: judgeContents, history,
          schema: DRAFT2_OPENING_EVALUATION_SCHEMA, schemaName: "draft2_opening_review", maxOutputTokens: JUDGE_MAX_OUTPUT_TOKENS, effort: "high", auditContext,
        }));
        evaluation = parseOpeningEvaluation(judged.text, candidates.map((candidate) => candidate.id));
        threads.anthropic = { model: judgeModel, history: [...history, { role: "user", text: JSON.stringify(judgeContents) }, { role: "assistant", text: judged.text }] };
        opening.rounds[opening.rounds.length - 1] = { ...opening.rounds[opening.rounds.length - 1], evaluation };
        opening.evaluation = evaluation;

        const winnerId = openingAcceptedWinner(mechanical, evaluation);
        if (winnerId) {
          opening.status = "ready";
          opening.winnerId = winnerId;
          await checkpoint({ status: "ready", error: null });
          return;
        }
        if (round === OPENING_MAX_ROUNDS) {
          await needsReview(`Claude did not accept an opening after ${OPENING_MAX_ROUNDS} rounds.`);
          return;
        }
        await checkpoint();
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "The opening step failed.";
    opening.status = "failed";
    opening.error = message;
    await checkpoint({ status: "failed", error: message }).catch(() => undefined);
    throw error;
  }
  return (await updateDraft2Session(session.id, {})) ?? claimed;
}

/**
 * Records the editor's pick among the last round's candidates; downstream
 * steps use it over the judge's winner. The choice is kept beside the
 * judge's scores so it can later calibrate the judge.
 */
export async function recordOpeningChoice({ topicId, sessionId, candidateId }: { topicId: string; sessionId: string; candidateId: string }): Promise<Draft2SessionRow> {
  const session = await getDraft2Session(topicId, sessionId);
  if (!session) throw new Draft2InputError("This Draft 2 session was not found. Reload the canvas.");
  const opening = session.opening;
  if (!opening?.candidates.length) throw new Draft2InputError("This session has no opening to choose from yet.");
  if (opening.status === "running") throw new Draft2BusyError("The opening is still being written; choose when the run finishes.");
  if (!opening.candidates.some((candidate) => candidate.id === candidateId)) throw new Draft2InputError(`${candidateId} is not one of this opening's candidates.`);
  const updated = await updateDraft2Session(session.id, { opening: { ...opening, editorChoiceId: candidateId, editorChoiceAt: new Date().toISOString() } });
  if (!updated) throw new Draft2InputError("This Draft 2 session was not found. Reload the canvas.");
  return updated;
}
