import "server-only";
import { withCreativeTextBudget } from "../stories/creative-text-meter";
import { generateOpenAiStructuredResponse } from "../stories/openai-structured-response";
import { generateAnthropicStructuredResponse } from "../stories/anthropic-structured-response";
import { getAnthropicRuntimeConfig, requireAnthropicApiKey } from "../stories/anthropic.config";
import { getCreativeProfile } from "../stories/creative-profile.repository";
import { activeDraft2Session, claimDraft2Session, getDraft2Session, touchDraft2Session, updateDraft2Session, type Draft2SessionPatch } from "./draft2-session.repository";
import { draft2DevTrace } from "./draft2-dev-trace";
import { draft2ProviderName, draft2SolModel, type Draft2Provider } from "./draft2-models";
import { Draft2BusyError, Draft2InputError, type Draft2Fact, type Draft2TraceEntry } from "./draft2-facts.types";
import {
  factsSnapshot, failedCall, funnelAcceptedWinner, funnelBestVersions, funnelExtendable, funnelFreshWanted, funnelRegressions, funnelRenumberedProposals, funnelResumeRound,
  funnelReviewNote, funnelRunSummary, funnelTargets, funnelVersions, funnelWrittenCandidates,
  type FunnelCandidate, type FunnelEvaluation, type FunnelGate, type FunnelIssue, type FunnelPlanRound, type FunnelRegression, type FunnelRole,
  type FunnelRound, type FunnelRun, type FunnelScore, type FunnelVersion,
} from "./draft2-funnel";
import type { CreativeProfile } from "../stories/creative-content.types";
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

type Composed = { instructions: string; skillVersions: Record<string, string> };
/** The session columns a funnel step lives in. */
export type FunnelColumn = "opening" | "closing" | "deck" | "visual";

/** What a step gives the funnel for one run, once its prerequisites are met: the prompts, the cached context and the step's own contract. */
export type FunnelSetup<C extends FunnelCandidate, S extends FunnelScore, I extends FunnelIssue> = {
  writer: Composed;
  judge: Composed;
  /** What both models read before the facts, the same on every call of the run so it is read from the prompt cache. */
  context: Record<string, unknown>;
  schemas: { writer: Record<string, unknown>; judge: Record<string, unknown> };
  parseCandidates: (text: string) => C[];
  parseEvaluation: (text: string, candidateIds: readonly string[]) => FunnelEvaluation<C, S, I>;
  /** The program's findings on a round's candidates. */
  mechanical: (candidates: readonly C[]) => I[];
  explore: (candidatesWanted: number, last: FunnelRound<C, S, I> | undefined, versions: readonly FunnelVersion<C, S, I>[]) => Record<string, unknown>;
  refine: (targets: readonly FunnelVersion<C, S, I>[], versions: readonly FunnelVersion<C, S, I>[], regressions: readonly FunnelRegression[], last: FunnelRound<C, S, I> | undefined, newCandidates: number, proposals: readonly C[]) => Record<string, unknown>;
  judgeRequest: (round: number, candidates: readonly C[], mechanical: readonly I[], revised: readonly FunnelVersion<C, S, I>[]) => Record<string, unknown>;
  /** Whether an edit of a proposal changed nothing (it is then dropped). */
  same: (a: C, b: C) => boolean;
};

/** A writing step run on the funnel: its names, plan, gate, roles, prerequisites and setup. */
export type FunnelStep<C extends FunnelCandidate, S extends FunnelScore, I extends FunnelIssue, R extends FunnelRun<C, S, I> & { previousRuns?: unknown[] }, Snapshot> = {
  /** The session column the run lives in, and the trace's step. */
  step: FunnelColumn;
  /** How the notes name one result ("opening"), with its article ("an opening"), and several ("openings"). */
  noun: string;
  article: string;
  plural: string;
  /** The rounds, the same for every run, or chosen from what the run follows (the deck's depend on the story's structure). */
  plan: readonly FunnelPlanRound[] | ((snapshot: Snapshot) => readonly FunnelPlanRound[]);
  gate: FunnelGate;
  operations: { writer: string; judge: string };
  /** Who writes and who judges a new run. */
  roles: { writer: Draft2Provider; judge: Draft2Provider };
  /** Who played a stored run that records no roles. */
  earlierRoles?: { writer: Draft2Provider; judge: Draft2Provider };
  /** What the run follows (the focus, the opening…), from the session: an input error when a prerequisite is missing. A continued run passes the run it continues. */
  snapshot: (session: Draft2SessionRow, continuing: R | undefined) => Snapshot;
  /** What a new run records besides the funnel's bookkeeping: the snapshots it follows (and what of the profile it ran under). */
  newRun: (snapshot: Snapshot, profile: CreativeProfile) => Partial<R>;
  setup: (input: { snapshot: Snapshot; profile: CreativeProfile; facts: readonly Draft2Fact[]; plan: readonly FunnelPlanRound[] }) => FunnelSetup<C, S, I>;
};

export type FunnelStepInput = {
  topicId: string;
  storyId: string;
  sessionId: string;
  /** Continue a run that paused for time, that stopped when its request or server died, or that ended unaccepted before its plan gained rounds, instead of starting a new one. */
  resume?: boolean;
};

const runOf = <R>(session: Draft2SessionRow, column: FunnelColumn) => (session as unknown as Record<FunnelColumn, R | null>)[column] ?? undefined;

/**
 * Runs a funnel step on a session whose facts are verified and whose
 * prerequisites the step checks (its snapshot), as the step's plan says:
 * the writer writes new candidates, the judge scores them and proposes its
 * own; every later round revises the best clean versions against their own
 * issues beside the judge's proposals, as written and as edited. The program
 * keeps the better of each version and its revision, so a round never loses
 * the best version so far.
 *
 * Both models receive the same compact state on every call (the step's
 * context and the verified facts first, so they are read from the prompt
 * cache, then the round's candidates, scores and issues) instead of a
 * conversation that grows each round. Every provider call is checkpointed,
 * so a failure keeps its trace. When a request's time cannot fit the next
 * round or judgment, the run pauses with every round saved; when a request
 * or the server dies, the run stops sending its heartbeat. Either way a
 * continue request (resume) runs on from the last checkpoint: a round
 * already written is judged, not written again. A run that ended without an
 * accepted candidate continues the same way once its step's plan has gained
 * rounds, with only the added rounds.
 */
export async function runFunnelStep<C extends FunnelCandidate, S extends FunnelScore, I extends FunnelIssue, R extends FunnelRun<C, S, I> & { previousRuns?: unknown[] }, Snapshot>(
  def: FunnelStep<C, S, I, R, Snapshot>, { topicId, storyId, sessionId, resume = false }: FunnelStepInput,
): Promise<Draft2SessionRow> {
  const session = await getDraft2Session(topicId, sessionId);
  if (!session || session.storyId !== storyId) throw new Draft2InputError("This Draft 2 session was not found for the story. Reload the canvas.");
  if (await activeDraft2Session(topicId, storyId)) throw new Draft2BusyError("A Draft 2 run is already in progress for this story.");
  const facts = session.facts ?? [];
  // Every step after Facts starts only on verified facts, so a session past Facts has them. A rerun is allowed in any state the busy check let through.
  const factsVerified = session.step !== "facts" || session.status === "ready";
  if (!facts.length || !factsVerified) throw new Draft2InputError(`The ${def.noun} builds only on verified facts. Verify the facts first.`);
  const current = runOf<R>(session, def.step);
  // A run left "running" passed the busy check only because its heartbeat stopped: its request or server died.
  // A run that ended unaccepted continues only with rounds its plan gained since; a plan chosen per run is known once the snapshot is (checked below).
  const ended = current && funnelExtendable(current, typeof def.plan === "function" ? Infinity : def.plan.length) ? current : undefined;
  const stopped = current && (current.status === "paused" || current.status === "running") ? current : ended;
  const nothingToContinue = `There is no paused or stopped ${def.noun} to continue. Write the ${def.noun} again.`;
  if (resume && !stopped) throw new Draft2InputError(nothingToContinue);
  const snapshot = def.snapshot(session, resume ? stopped : undefined);
  const plan = typeof def.plan === "function" ? def.plan(snapshot) : def.plan;
  const maxRounds = plan.length;
  if (resume && stopped && (funnelResumeRound(stopped) > maxRounds || (stopped.status === "needs-review" && !funnelExtendable(stopped, maxRounds)))) throw new Draft2InputError(nothingToContinue);

  const configuredOpenAiKey = process.env.OPENAI_API_KEY?.trim();
  if (!configuredOpenAiKey) throw new Draft2InputError("OPENAI_API_KEY is not configured; Sol needs it.");
  const openAiApiKey: string = configuredOpenAiKey;
  const anthropicApiKey = requireAnthropicApiKey();
  const modelOf = (provider: Draft2Provider): FunnelRole => ({ provider, model: provider === "openai" ? draft2SolModel(process.env) : getAnthropicRuntimeConfig().model });
  // A run keeps the roles it started with; a new run takes today's.
  const earlier = def.earlierRoles ?? def.roles;
  const roles = resume && stopped
    ? { writer: stopped.writer ?? modelOf(earlier.writer), judge: stopped.judge ?? modelOf(earlier.judge) }
    : { writer: modelOf(def.roles.writer), judge: modelOf(def.roles.judge) };
  const judgeName = draft2ProviderName(roles.judge.provider);
  const profile = await getCreativeProfile(topicId);
  const setup = def.setup({ snapshot, profile, facts, plan });
  const verifiedFacts = factsSnapshot(facts);

  const trace: Draft2TraceEntry[] = [...session.trace];
  // A continue request picks the run up at its last checkpoint; a new run starts fresh and keeps the earlier one, with the editor's choice.
  const firstRound = resume && stopped ? funnelResumeRound(stopped) : 1;
  const run = (resume && stopped
    ? { ...stopped, status: "running", resumeRound: undefined, error: undefined, ...roles }
    : {
      status: "running", rounds: [], candidates: [], ...roles, ...def.newRun(snapshot, profile),
      ...(current ? { previousRuns: [...(current.previousRuns ?? []), funnelRunSummary(current)] } : {}),
    }) as R;
  const claimed = await claimDraft2Session(session.id, { step: def.step, [def.step]: run, error: null } as unknown as Draft2SessionPatch);
  if (!claimed) throw new Draft2BusyError("A Draft 2 run is already in progress for this story.");
  const auditContext = { runId: session.id, topicId, storyId };
  const startedAt = Date.now();
  let lastRoundMs = 0;

  const checkpoint = (patch: Draft2SessionPatch = {}) => updateDraft2Session(session.id, { [def.step]: run, trace, ...patch } as unknown as Draft2SessionPatch);

  /** Leaves the next round, or this round's judgment, to a new request; everything so far is saved and the best version stands in meanwhile. */
  async function pause(round: number, judgmentOnly = false) {
    const note = judgmentOnly
      ? `Paused before ${judgeName} judges round ${round}: this request's time is spent. The run continues in a new request.`
      : `Paused before round ${round}: this request's time is spent. The run continues from round ${round} in a new request.`;
    run.status = "paused";
    run.resumeRound = round;
    run.error = note;
    await checkpoint({ status: "needs-review", error: note });
  }

  /** Ends the run without an accepted candidate; the best version stands in until the editor chooses. */
  async function needsReview(lead: string) {
    const best = funnelBestVersions(funnelVersions(run.rounds))[0];
    const note = funnelReviewNote(best, run.rounds[run.rounds.length - 1], lead, def.gate, def.article);
    run.status = "needs-review";
    run.error = note;
    if (best) run.winnerId = best.candidate.id;
    await checkpoint({ status: "needs-review", error: note });
  }

  /**
   * One structured call to a role's model, with the step's context and the
   * verified facts where its provider caches them: Claude's cached context
   * block, or the head of Sol's input (OpenAI caches a repeated prefix on
   * its own).
   */
  function ask(role: FunnelRole, round: number, operation: string, request: Composed & { contents: Record<string, unknown>; schema: Record<string, unknown> }) {
    const { instructions, skillVersions, contents, schema } = request;
    // The round's effort, for the writer and the judge alike; Sol writing a stored run keeps medium.
    const effort = plan[round - 1]?.effort ?? "high";
    if (role.provider === "anthropic") {
      const traceRequest = { instructions, context: { ...setup.context, verifiedFacts: `${verifiedFacts.length} facts (cached)` }, contents, effort };
      return traced(round, "anthropic", role.model, operation, skillVersions, traceRequest, () => generateAnthropicStructuredResponse({
        apiKey: anthropicApiKey, model: role.model, instructions, context: { ...setup.context, verifiedFacts }, contents,
        schema, schemaName: operation, maxOutputTokens: MAX_OUTPUT_TOKENS, effort, timeoutMs: CALL_TIMEOUT_MS, auditContext,
      }));
    }
    const input = { ...setup.context, verifiedFacts, ...contents };
    const reasoningEffort = role === roles.judge ? effort : "medium";
    return traced(round, "openai", role.model, operation, skillVersions, { instructions, contents: input, reasoningEffort }, () => generateOpenAiStructuredResponse({
      apiKey: openAiApiKey, model: role.model, instructions, contents: input,
      schema, schemaName: operation, maxOutputTokens: MAX_OUTPUT_TOKENS, reasoningEffort, timeoutMs: CALL_TIMEOUT_MS, auditContext,
    }));
  }

  /** One provider call: traced on the console in development, recorded on the session always. */
  async function traced<T>(round: number, provider: "openai" | "anthropic", model: string, operation: string, skillVersions: Record<string, string>, request: unknown, call: () => Promise<T & { text: string; usage: Draft2TraceEntry["usage"]; cachedInputTokens?: number; cacheWriteTokens?: number }>): Promise<T & { text: string }> {
    draft2DevTrace({ step: def.step, round, provider, model, operation, phase: "request", detail: request });
    const at = new Date().toISOString();
    const begin = Date.now();
    try {
      const value = await call();
      const durationMs = Date.now() - begin;
      trace.push({ at, step: def.step, round, provider, model, operation, durationMs, usage: value.usage, cachedInputTokens: value.cachedInputTokens, ...(value.cacheWriteTokens ? { cacheWriteTokens: value.cacheWriteTokens } : {}), answerCharacters: value.text.length, outcome: "ok", skillVersions });
      let answer: unknown = value.text;
      try { answer = JSON.parse(value.text); } catch { /* the parser reports a malformed answer */ }
      draft2DevTrace({ step: def.step, round, provider, model, operation, phase: "response", durationMs, detail: { usage: value.usage, cachedInputTokens: value.cachedInputTokens, cacheWriteTokens: value.cacheWriteTokens, answer } });
      return value;
    } catch (error) {
      const durationMs = Date.now() - begin;
      const note = error instanceof Error ? error.message : "unknown error";
      trace.push({ at, step: def.step, round, provider, model, operation, durationMs, outcome: "error", note, ...failedCall(error), skillVersions });
      draft2DevTrace({ step: def.step, round, provider, model, operation, phase: "error", durationMs, detail: { error: note, ...failedCall(error) } });
      throw error;
    }
  }

  // Between checkpoints, the heartbeat shows the run is alive; when it stops, the run can be continued.
  const heartbeat = setInterval(() => { void touchDraft2Session(session.id).catch(() => undefined); }, HEARTBEAT_MS);
  try {
    await withCreativeTextBudget({ topicId, storyId, runId: session.id }, async () => {
      for (let round = firstRound; round <= maxRounds; round++) {
        const elapsed = Date.now() - startedAt;
        if (round > firstRound && (elapsed > TIME_BUDGET_MS || elapsed + lastRoundMs > ROUND_DEADLINE_MS)) {
          await pause(round);
          return;
        }
        const roundStartedAt = Date.now();
        const before = funnelVersions(run.rounds.filter((entry) => entry.round < round));
        const last = run.rounds.find((entry) => entry.round === round - 1);
        // A round written before its request died, or paused before its judgment, is judged as it stands.
        const written = run.rounds.find((entry) => entry.round === round && !entry.evaluation);
        let targets: FunnelVersion<C, S, I>[];
        let candidates: C[];
        let mechanical: I[];
        if (written) {
          ({ candidates, mechanical } = written);
          // The versions its revisions revise, in the order the judge reads the revisions.
          targets = candidates.flatMap((candidate) => before.filter((version) => version.candidate.id === candidate.revisionOf));
        } else {
          // 1. The writer: new candidates first; afterwards the best clean versions, each with its own issues, to revise,
          //    beside the new candidates the round's plan asks for (more of them when too few versions are clean).
          targets = funnelTargets(before, round, plan);
          const fresh = funnelFreshWanted(round, targets, plan);
          // The judge's proposals from the last round, which this round sets beside the writer's edits.
          const proposals = round > 1 ? last?.evaluation?.proposals ?? [] : [];
          const writerContents = targets.length || proposals.length
            ? setup.refine(targets, before, run.rounds.flatMap((entry) => entry.regressions ?? []), last, fresh, proposals)
            : setup.explore(fresh, last, before);
          const answered = await ask(roles.writer, round, def.operations.writer, { ...setup.writer, contents: writerContents, schema: setup.schemas.writer });
          const answer = setup.parseCandidates(answered.text);
          candidates = funnelWrittenCandidates(targets.map((target) => target.candidate), answer, round, fresh, before, proposals, setup.same, def.plural);
          const revisions = candidates.filter((candidate) => candidate.revisionOf).length;
          const kind = revisions === 0 ? "explore" : revisions === candidates.length ? "refine" : "mixed";
          mechanical = setup.mechanical(candidates);
          run.rounds.push({ round, kind, candidates, mechanical, at: new Date().toISOString() });
          run.candidates = candidates;
          await checkpoint();
          if (Date.now() - startedAt > TIME_BUDGET_MS) {
            await pause(round, true);
            return;
          }
        }

        // 2. The judge: the facts, then this round's candidates beside the versions they revise.
        const judgeContents = setup.judgeRequest(round, candidates, mechanical, targets);
        const judged = await ask(roles.judge, round, def.operations.judge, { ...setup.judge, contents: judgeContents, schema: setup.schemas.judge });
        const judgment = setup.parseEvaluation(judged.text, candidates.map((candidate) => candidate.id));
        const evaluation = judgment.proposals ? { ...judgment, proposals: funnelRenumberedProposals(judgment.proposals, run.rounds) } : judgment;
        const index = run.rounds.findIndex((entry) => entry.round === round);
        run.rounds[index] = { ...run.rounds[index], evaluation };
        // A revision that came out worse never replaces the version it revised: the better one stays in front.
        const regressions = funnelRegressions(funnelVersions(run.rounds).filter((version) => version.round === round), before, def.gate.criteria);
        if (regressions.length) run.rounds[index] = { ...run.rounds[index], regressions };
        run.evaluation = evaluation;

        const winnerId = funnelAcceptedWinner(mechanical, evaluation, def.gate);
        if (winnerId) {
          run.status = "ready";
          run.winnerId = winnerId;
          await checkpoint({ status: "ready", error: null });
          return;
        }
        if (round === maxRounds) {
          await needsReview(`${judgeName} did not accept ${def.article} after ${maxRounds} rounds.`);
          return;
        }
        // The best version so far, kept on the row in case a later call fails.
        const best = funnelBestVersions(funnelVersions(run.rounds))[0];
        if (best) run.winnerId = best.candidate.id;
        lastRoundMs = Date.now() - roundStartedAt;
        await checkpoint();
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : `The ${def.noun} step failed.`;
    run.status = "failed";
    run.error = message;
    await checkpoint({ status: "failed", error: message }).catch(() => undefined);
    throw error;
  } finally {
    clearInterval(heartbeat);
  }
  return (await updateDraft2Session(session.id, {})) ?? claimed;
}

/**
 * Records the editor's pick among every version a run scored; downstream
 * steps use it over the judge's winner. The choice is kept beside the
 * judge's scores so it can later calibrate the judge.
 */
export async function recordFunnelChoice(def: { step: FunnelColumn; noun: string }, { topicId, sessionId, candidateId }: { topicId: string; sessionId: string; candidateId: string }): Promise<Draft2SessionRow> {
  const session = await getDraft2Session(topicId, sessionId);
  if (!session) throw new Draft2InputError("This Draft 2 session was not found. Reload the canvas.");
  const run = runOf<FunnelRun>(session, def.step);
  if (!run?.candidates.length) throw new Draft2InputError(`This session has no ${def.noun} to choose from yet.`);
  if (run.status === "running") throw new Draft2BusyError(`The ${def.noun} is still being written; choose when the run finishes.`);
  if (!funnelVersions(run.rounds).some((version) => version.candidate.id === candidateId)) throw new Draft2InputError(`${candidateId} is not one of this ${def.noun}'s versions.`);
  const updated = await updateDraft2Session(session.id, { [def.step]: { ...run, editorChoiceId: candidateId, editorChoiceAt: new Date().toISOString() } } as unknown as Draft2SessionPatch);
  if (!updated) throw new Draft2InputError("This Draft 2 session was not found. Reload the canvas.");
  return updated;
}
