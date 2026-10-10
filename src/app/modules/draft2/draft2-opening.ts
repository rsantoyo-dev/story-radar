import "server-only";
import { withCreativeTextBudget } from "../stories/creative-text-meter";
import { generateOpenAiStructuredResponse } from "../stories/openai-structured-response";
import { generateAnthropicStructuredResponse } from "../stories/anthropic-structured-response";
import { getAnthropicRuntimeConfig, requireAnthropicApiKey } from "../stories/anthropic.config";
import { getCreativeProfile } from "../stories/creative-profile.repository";
import { activeDraft2Session, claimDraft2Session, getDraft2Session, touchDraft2Session, updateDraft2Session, type Draft2SessionPatch } from "./draft2-session.repository";
import { draft2DevTrace } from "./draft2-dev-trace";
import { DRAFT2_OPENING_EARLIER_ROLES, DRAFT2_OPENING_ROLES, draft2ProviderName, draft2SolModel, type Draft2Provider } from "./draft2-models";
import { Draft2BusyError, Draft2InputError, type Draft2TraceEntry } from "./draft2-facts.types";
import {
  DRAFT2_OPENING_EVALUATION_SCHEMA, DRAFT2_OPENING_SCHEMA, OPENING_MAX_ROUNDS, bestOpeningVersions, mechanicalOpeningIssues, openingAcceptedWinner,
  openingExploreRequest, openingFactsSnapshot, openingFreshWanted, openingJudgeRequest, openingRefineRequest, openingRegressions, openingReviewNote,
  openingResumeRound, openingRunSummary, openingTargets, openingVersions, parseOpeningCandidates, parseOpeningEvaluation, renumberedProposals, writtenCandidates,
  type Draft2Opening, type Draft2OpeningRole,
} from "./draft2-opening.types";
import { brandBrief, composeInstructions } from "./skills/draft2-skills";
import { HOOKS_SKILL } from "./skills/hooks";
import type { Draft2SessionRow } from "@/db/schema";

/**
 * The route allows 300 s. A round that would start after TIME_BUDGET_MS, or
 * whose predecessor, repeated, would end past ROUND_DEADLINE_MS, is left to a
 * new request, and so is a judgment whose writer ended past TIME_BUDGET_MS:
 * the run pauses with everything saved and continues there.
 */
const TIME_BUDGET_MS = 230_000;
const ROUND_DEADLINE_MS = 280_000;
/** Fifteen openings, or fifteen scores and the proposals, with the model's thinking, which both APIs count against the same ceiling. */
const MAX_OUTPUT_TOKENS = 24_000;
/** Fifteen openings took 73 s to write and 111 s to judge in a real run; the adapters' default limit is 120 s. */
const CALL_TIMEOUT_MS = 240_000;
/** Shows the run is alive between checkpoints, well inside OPENING_STALL_MS. */
const HEARTBEAT_MS = 30_000;

export type Draft2OpeningInput = {
  topicId: string;
  storyId: string;
  sessionId: string;
  /** Continue a run that paused for time, or that stopped when its request or server died, instead of starting a new one. */
  resume?: boolean;
};

/**
 * Runs the Opening step on a session whose facts are verified, as a funnel
 * (OPENING_ROUND_PLAN). Claude writes and Sol judges (DRAFT2_OPENING_ROLES).
 * Round 1: the writer writes fifteen openings (cover + slide 2); the judge
 * scores them and proposes three of its own. Round 2: the writer revises the
 * three best clean versions against their own issues, develops the
 * proposals and writes three new angles; the judge scores the nine, not
 * told which ones grew from its proposals, and proposes one more. Round 3:
 * the writer revises the two best and develops the last proposal for the
 * judge's final pick. The program keeps the better of each version and its
 * revision, so a round never loses the best opening so far.
 *
 * Both models receive the same compact state on every call (the verified
 * facts first, so they are read from the prompt cache, then the round's
 * candidates, scores and issues) instead of a conversation that grows each
 * round. Every provider call is checkpointed, so a failure keeps its trace.
 * When a request's time cannot fit the next round or judgment, the run
 * pauses with every round saved; when a request or the server dies, the run
 * stops sending its heartbeat. Either way a continue request (resume) runs
 * on from the last checkpoint: a round already written is judged, not
 * written again.
 */
export async function runDraft2Opening({ topicId, storyId, sessionId, resume = false }: Draft2OpeningInput): Promise<Draft2SessionRow> {
  const session = await getDraft2Session(topicId, sessionId);
  if (!session || session.storyId !== storyId) throw new Draft2InputError("This Draft 2 session was not found for the story. Reload the canvas.");
  if (await activeDraft2Session(topicId, storyId)) throw new Draft2BusyError("A Draft 2 run is already in progress for this story.");
  const facts = session.facts ?? [];
  // A rerun of the opening is allowed in any state the busy check let through, including a run a timeout left "running".
  const factsVerified = session.step === "opening" || (session.step === "facts" && session.status === "ready");
  if (!facts.length || !factsVerified) throw new Draft2InputError("The opening builds only on verified facts. Verify the facts first.");
  // A run left "running" passed the busy check only because its heartbeat stopped: its request or server died.
  const stopped = session.opening && (session.opening.status === "paused" || session.opening.status === "running") ? session.opening : undefined;
  if (resume && (!stopped || openingResumeRound(stopped) > OPENING_MAX_ROUNDS)) throw new Draft2InputError("There is no paused or stopped opening to continue. Write the opening again.");

  const configuredOpenAiKey = process.env.OPENAI_API_KEY?.trim();
  if (!configuredOpenAiKey) throw new Draft2InputError("OPENAI_API_KEY is not configured; Sol needs it.");
  const openAiApiKey: string = configuredOpenAiKey;
  const anthropicApiKey = requireAnthropicApiKey();
  const modelOf = (provider: Draft2Provider): Draft2OpeningRole => ({ provider, model: provider === "openai" ? draft2SolModel(process.env) : getAnthropicRuntimeConfig().model });
  // A run keeps the roles it started with; a new run takes today's (Claude writes, Sol judges).
  const roles = resume && stopped
    ? { writer: stopped.writer ?? modelOf(DRAFT2_OPENING_EARLIER_ROLES.writer), judge: stopped.judge ?? modelOf(DRAFT2_OPENING_EARLIER_ROLES.judge) }
    : { writer: modelOf(DRAFT2_OPENING_ROLES.writer), judge: modelOf(DRAFT2_OPENING_ROLES.judge) };
  const judgeName = draft2ProviderName(roles.judge.provider);
  const brief = brandBrief(await getCreativeProfile(topicId));
  const writer = composeInstructions("opening-writer", [HOOKS_SKILL], brief);
  const judge = composeInstructions("opening-judge", [HOOKS_SKILL], brief);
  const verifiedFacts = openingFactsSnapshot(facts);

  const trace: Draft2TraceEntry[] = [...session.trace];
  // A continue request picks the run up at its last checkpoint; a new run starts fresh and keeps the earlier one, with the editor's choice.
  const firstRound = resume && stopped ? openingResumeRound(stopped) : 1;
  const opening: Draft2Opening = resume && stopped
    ? { ...stopped, status: "running", resumeRound: undefined, error: undefined, ...roles }
    : {
      status: "running", rounds: [], candidates: [], ...roles,
      ...(session.opening ? { previousRuns: [...(session.opening.previousRuns ?? []), openingRunSummary(session.opening)] } : {}),
    };
  const claimed = await claimDraft2Session(session.id, { step: "opening", opening, error: null });
  if (!claimed) throw new Draft2BusyError("A Draft 2 run is already in progress for this story.");
  const auditContext = { runId: session.id, topicId, storyId };
  const startedAt = Date.now();
  let lastRoundMs = 0;

  const checkpoint = (patch: Draft2SessionPatch = {}) => updateDraft2Session(session.id, { opening, trace, ...patch });

  /** Leaves the next round, or this round's judgment, to a new request; everything so far is saved and the best version stands in meanwhile. */
  async function pause(round: number, judgmentOnly = false) {
    const note = judgmentOnly
      ? `Paused before ${judgeName} judges round ${round}: this request's time is spent. The run continues in a new request.`
      : `Paused before round ${round}: this request's time is spent. The run continues from round ${round} in a new request.`;
    opening.status = "paused";
    opening.resumeRound = round;
    opening.error = note;
    await checkpoint({ status: "needs-review", error: note });
  }

  /** Ends the run without an accepted opening; the best version stands in until the editor chooses. */
  async function needsReview(lead: string) {
    const best = bestOpeningVersions(openingVersions(opening.rounds))[0];
    const note = openingReviewNote(best, opening.rounds[opening.rounds.length - 1], lead);
    opening.status = "needs-review";
    opening.error = note;
    if (best) opening.winnerId = best.candidate.id;
    await checkpoint({ status: "needs-review", error: note });
  }

  /**
   * One structured call to a role's model, with the verified facts where its
   * provider caches them: Claude's cached context block, or the head of Sol's
   * input (OpenAI caches a repeated prefix on its own).
   */
  function ask(role: Draft2OpeningRole, round: number, operation: string, request: { instructions: string; skillVersions: Record<string, string>; contents: Record<string, unknown>; schema: Record<string, unknown> }) {
    const { instructions, skillVersions, contents, schema } = request;
    if (role.provider === "anthropic") {
      const traceRequest = { instructions, context: { verifiedFacts: `${verifiedFacts.length} facts (cached)` }, contents };
      return traced(round, "anthropic", role.model, operation, skillVersions, traceRequest, () => generateAnthropicStructuredResponse({
        apiKey: anthropicApiKey, model: role.model, instructions, context: { verifiedFacts }, contents,
        schema, schemaName: operation, maxOutputTokens: MAX_OUTPUT_TOKENS, effort: "high", timeoutMs: CALL_TIMEOUT_MS, auditContext,
      }));
    }
    const input = { verifiedFacts, ...contents };
    return traced(round, "openai", role.model, operation, skillVersions, { instructions, contents: input }, () => generateOpenAiStructuredResponse({
      apiKey: openAiApiKey, model: role.model, instructions, contents: input,
      schema, schemaName: operation, maxOutputTokens: MAX_OUTPUT_TOKENS, reasoningEffort: role === roles.judge ? "high" : "medium", timeoutMs: CALL_TIMEOUT_MS, auditContext,
    }));
  }

  /** One provider call: traced on the console in development, recorded on the session always. */
  async function traced<T>(round: number, provider: "openai" | "anthropic", model: string, operation: string, skillVersions: Record<string, string>, request: unknown, call: () => Promise<T & { text: string; usage: Draft2TraceEntry["usage"]; cachedInputTokens?: number; cacheWriteTokens?: number }>): Promise<T & { text: string }> {
    draft2DevTrace({ step: "opening", round, provider, model, operation, phase: "request", detail: request });
    const at = new Date().toISOString();
    const begin = Date.now();
    try {
      const value = await call();
      const durationMs = Date.now() - begin;
      trace.push({ at, step: "opening", round, provider, model, operation, durationMs, usage: value.usage, cachedInputTokens: value.cachedInputTokens, ...(value.cacheWriteTokens ? { cacheWriteTokens: value.cacheWriteTokens } : {}), outcome: "ok", skillVersions });
      let answer: unknown = value.text;
      try { answer = JSON.parse(value.text); } catch { /* the parser reports a malformed answer */ }
      draft2DevTrace({ step: "opening", round, provider, model, operation, phase: "response", durationMs, detail: { usage: value.usage, cachedInputTokens: value.cachedInputTokens, cacheWriteTokens: value.cacheWriteTokens, answer } });
      return value;
    } catch (error) {
      const durationMs = Date.now() - begin;
      const note = error instanceof Error ? error.message : "unknown error";
      trace.push({ at, step: "opening", round, provider, model, operation, durationMs, outcome: "error", note, skillVersions });
      draft2DevTrace({ step: "opening", round, provider, model, operation, phase: "error", durationMs, detail: { error: note } });
      throw error;
    }
  }

  // Between checkpoints, the heartbeat shows the run is alive; when it stops, the run can be continued.
  const heartbeat = setInterval(() => { void touchDraft2Session(session.id).catch(() => undefined); }, HEARTBEAT_MS);
  try {
    await withCreativeTextBudget({ topicId, storyId, runId: session.id }, async () => {
      for (let round = firstRound; round <= OPENING_MAX_ROUNDS; round++) {
        const elapsed = Date.now() - startedAt;
        if (round > firstRound && (elapsed > TIME_BUDGET_MS || elapsed + lastRoundMs > ROUND_DEADLINE_MS)) {
          await pause(round);
          return;
        }
        const roundStartedAt = Date.now();
        const before = openingVersions(opening.rounds.filter((entry) => entry.round < round));
        const last = opening.rounds.find((entry) => entry.round === round - 1);
        // A round written before its request died, or paused before its judgment, is judged as it stands.
        const written = opening.rounds.find((entry) => entry.round === round && !entry.evaluation);
        let targets: ReturnType<typeof openingTargets>;
        let candidates: Draft2Opening["candidates"];
        let mechanical: NonNullable<typeof written>["mechanical"];
        if (written) {
          ({ candidates, mechanical } = written);
          // The versions its revisions revise, in the order the judge reads the revisions.
          targets = candidates.flatMap((candidate) => before.filter((version) => version.candidate.id === candidate.revisionOf));
        } else {
          // 1. The writer: new angles first; afterwards the best clean versions, each with its own issues, to revise,
          //    beside the new angles the round's plan asks for (more of them when too few versions are clean).
          targets = openingTargets(before, round);
          const fresh = openingFreshWanted(round, targets);
          // The judge's proposals from the last round, which this round develops.
          const proposals = round > 1 ? last?.evaluation?.proposals ?? [] : [];
          const writerContents = targets.length || proposals.length
            ? openingRefineRequest(targets, before, opening.rounds.flatMap((entry) => entry.regressions ?? []), last, fresh, proposals)
            : openingExploreRequest(fresh, last, before);
          const answered = await ask(roles.writer, round, "draft2_opening", { ...writer, contents: writerContents, schema: DRAFT2_OPENING_SCHEMA });
          const answer = parseOpeningCandidates(answered.text);
          candidates = writtenCandidates(targets.map((target) => target.candidate), answer, round, fresh, before, proposals);
          const revisions = candidates.filter((candidate) => candidate.revisionOf).length;
          const kind = revisions === 0 ? "explore" : revisions === candidates.length ? "refine" : "mixed";
          mechanical = mechanicalOpeningIssues(candidates, facts);
          opening.rounds.push({ round, kind, candidates, mechanical, at: new Date().toISOString() });
          opening.candidates = candidates;
          await checkpoint();
          if (Date.now() - startedAt > TIME_BUDGET_MS) {
            await pause(round, true);
            return;
          }
        }

        // 2. The judge: the facts, then this round's candidates beside the versions they revise.
        const judgeContents = openingJudgeRequest(round, candidates, mechanical, targets);
        const judged = await ask(roles.judge, round, "draft2_opening_review", { ...judge, contents: judgeContents, schema: DRAFT2_OPENING_EVALUATION_SCHEMA });
        const judgment = parseOpeningEvaluation(judged.text, candidates.map((candidate) => candidate.id));
        const evaluation = judgment.proposals ? { ...judgment, proposals: renumberedProposals(judgment.proposals, opening.rounds) } : judgment;
        const index = opening.rounds.findIndex((entry) => entry.round === round);
        opening.rounds[index] = { ...opening.rounds[index], evaluation };
        // A revision that came out worse never replaces the version it revised: the better one stays in front.
        const regressions = openingRegressions(openingVersions(opening.rounds).filter((version) => version.round === round), before);
        if (regressions.length) opening.rounds[index] = { ...opening.rounds[index], regressions };
        opening.evaluation = evaluation;

        const winnerId = openingAcceptedWinner(mechanical, evaluation);
        if (winnerId) {
          opening.status = "ready";
          opening.winnerId = winnerId;
          await checkpoint({ status: "ready", error: null });
          return;
        }
        if (round === OPENING_MAX_ROUNDS) {
          await needsReview(`${judgeName} did not accept an opening after ${OPENING_MAX_ROUNDS} rounds.`);
          return;
        }
        // The best version so far, kept on the row in case a later call fails.
        const best = bestOpeningVersions(openingVersions(opening.rounds))[0];
        if (best) opening.winnerId = best.candidate.id;
        lastRoundMs = Date.now() - roundStartedAt;
        await checkpoint();
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "The opening step failed.";
    opening.status = "failed";
    opening.error = message;
    await checkpoint({ status: "failed", error: message }).catch(() => undefined);
    throw error;
  } finally {
    clearInterval(heartbeat);
  }
  return (await updateDraft2Session(session.id, {})) ?? claimed;
}

/**
 * Records the editor's pick among every version the run scored; downstream
 * steps use it over the judge's winner. The choice is kept beside the
 * judge's scores so it can later calibrate the judge.
 */
export async function recordOpeningChoice({ topicId, sessionId, candidateId }: { topicId: string; sessionId: string; candidateId: string }): Promise<Draft2SessionRow> {
  const session = await getDraft2Session(topicId, sessionId);
  if (!session) throw new Draft2InputError("This Draft 2 session was not found. Reload the canvas.");
  const opening = session.opening;
  if (!opening?.candidates.length) throw new Draft2InputError("This session has no opening to choose from yet.");
  if (opening.status === "running") throw new Draft2BusyError("The opening is still being written; choose when the run finishes.");
  if (!openingVersions(opening.rounds).some((version) => version.candidate.id === candidateId)) throw new Draft2InputError(`${candidateId} is not one of this opening's versions.`);
  const updated = await updateDraft2Session(session.id, { opening: { ...opening, editorChoiceId: candidateId, editorChoiceAt: new Date().toISOString() } });
  if (!updated) throw new Draft2InputError("This Draft 2 session was not found. Reload the canvas.");
  return updated;
}
