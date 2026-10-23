import "server-only";
import { getStoryContent } from "../stories/story-content.repository";
import { withCreativeTextBudget } from "../stories/creative-text-meter";
import { generateOpenAiStructuredResponse } from "../stories/openai-structured-response";
import { generateAnthropicStructuredResponse } from "../stories/anthropic-structured-response";
import { getAnthropicRuntimeConfig, requireAnthropicApiKey } from "../stories/anthropic.config";
import { activeDraft2Session, createDraft2Session, getDraft2Session, updateDraft2Session } from "./draft2-session.repository";
import type { Draft2ModelChoice, Draft2Pipeline } from "./draft2-models";
import { draft2DevTrace } from "./draft2-dev-trace";
import {
  DRAFT2_FACTS_MAX_ROUNDS, DRAFT2_FACTS_REVIEW_SCHEMA, DRAFT2_FACTS_SCHEMA, Draft2BusyError, Draft2InputError, draft2FactsAreValid, mechanicalFactIssues, mergeRevisedFacts,
  parseDraft2Facts, parseDraft2FactsEvaluation, revisionRequest,
  type Draft2Fact, type Draft2FactsEvaluation, type Draft2FactsRound, type Draft2Threads, type Draft2TraceEntry, editedFacts, applyFactsRepair, factsRepairable, repairRequest } from "./draft2-facts.types";
import { draft2SolModel } from "./draft2-models";
import { traceCost } from "./draft2-trace-cost";
import { composeInstructions } from "./skills/draft2-skills";
import { FACTS_SKILL } from "./skills/facts";
import type { Draft2SessionRow } from "@/db/schema";

export { Draft2BusyError, Draft2InputError } from "./draft2-facts.types";

/** A round that would start after this point is left to a new request; the route allows 300 s. */
const TIME_BUDGET_MS = 230_000;
const EXTRACTOR_MAX_OUTPUT_TOKENS = 6_000;
/** Covers the verdict and Claude's thinking, which the API counts against the same ceiling. */
const REVIEWER_MAX_OUTPUT_TOKENS = 12_000;

/** The prompts the Facts step was verified with, composed from the facts skill (skills/facts.ts). */
const EXTRACTOR = composeInstructions("extractor", [FACTS_SKILL]);
const REVIEWER = composeInstructions("reviewer", [FACTS_SKILL]);

export type Draft2FactsInput = { topicId: string; storyId: string; /** The editor's choice of the funnel's writer and judge, kept on the new session. */ models?: Draft2ModelChoice; /** The pipeline the new session runs on (v2 or v3); the table's default (v2) when absent. */ pipeline?: Draft2Pipeline; /** When the request ends (epoch ms), from a server pass; the route's own limit otherwise. */ deadline?: number };

/**
 * Runs the Facts step for a story: extract, check, revise, at most three
 * extractions. Every provider call is checkpointed on the session so the
 * conversations survive for the next step and a failure keeps its trace.
 */
export async function runDraft2Facts({ topicId, storyId, models, pipeline, deadline }: Draft2FactsInput): Promise<Draft2SessionRow> {
  const content = await getStoryContent(topicId, storyId);
  const articleText = content.text?.trim() ?? "";
  if (!articleText) throw new Draft2InputError("The story has no article text yet. Prepare the content in the studio first.");
  if (await activeDraft2Session(topicId, storyId)) throw new Draft2BusyError("A Draft 2 run is already in progress for this story.");

  const openAiApiKey = process.env.OPENAI_API_KEY?.trim();
  if (!openAiApiKey) throw new Draft2InputError("OPENAI_API_KEY is not configured; the extractor needs it.");
  const extractorModel = draft2SolModel(process.env);
  const anthropicApiKey = requireAnthropicApiKey();
  const reviewerModel = getAnthropicRuntimeConfig().model;

  const session = await createDraft2Session({ topicId, storyId, step: "facts", models, pipeline });
  const auditContext = { runId: session.id, topicId, storyId };
  const article = { title: content.title, url: content.url, text: articleText };
  const startedAt = Date.now();
  const rounds: Draft2FactsRound[] = [];
  const trace: Draft2TraceEntry[] = [];
  const threads: Draft2Threads = {};
  let facts: Draft2Fact[] | undefined;
  let evaluation: Draft2FactsEvaluation | undefined;
  let mechanical: ReturnType<typeof mechanicalFactIssues> = [];

  const checkpoint = (patch: Parameters<typeof updateDraft2Session>[1]) => updateDraft2Session(session.id, { rounds, threads, trace, ...patch });

  /** One provider call: traced on the console in development, recorded on the session always. */
  async function traced<T>(round: number, provider: "openai" | "anthropic", model: string, operation: string, effort: "medium" | "high", request: unknown, call: () => Promise<T & { usage: Draft2TraceEntry["usage"]; cachedInputTokens?: number; cacheWriteTokens?: number }>, summarize: (value: T) => unknown): Promise<T> {
    draft2DevTrace({ step: "facts", round, provider, model, operation, phase: "request", detail: request });
    const at = new Date().toISOString();
    const begin = Date.now();
    try {
      const value = await call();
      const durationMs = Date.now() - begin;
      trace.push({ at, step: "facts", round, provider, model, operation, durationMs, usage: value.usage, cachedInputTokens: value.cachedInputTokens, ...(value.cacheWriteTokens ? { cacheWriteTokens: value.cacheWriteTokens } : {}), outcome: "ok", skillVersions: EXTRACTOR.skillVersions, effort, ...traceCost(provider, model, value.usage, value.cachedInputTokens, value.cacheWriteTokens) });
      draft2DevTrace({ step: "facts", round, provider, model, operation, phase: "response", durationMs, detail: { usage: value.usage, cachedInputTokens: value.cachedInputTokens, answer: summarize(value) } });
      return value;
    } catch (error) {
      const durationMs = Date.now() - begin;
      const note = error instanceof Error ? error.message : "unknown error";
      trace.push({ at, step: "facts", round, provider, model, operation, durationMs, outcome: "error", note, skillVersions: EXTRACTOR.skillVersions, effort });
      draft2DevTrace({ step: "facts", round, provider, model, operation, phase: "error", durationMs, detail: { error: note } });
      throw error;
    }
  }

  try {
    await withCreativeTextBudget({ topicId, storyId, runId: session.id }, async () => {
      for (let round = 1; round <= DRAFT2_FACTS_MAX_ROUNDS; round++) {
        if (round > 1 && Date.now() > (deadline ? deadline - 70_000 : startedAt + TIME_BUDGET_MS)) {
          await checkpoint({ status: "needs-review", facts: facts ?? null, evaluation: evaluation ?? null, error: `Stopped before round ${round}: the request's time budget is spent. Run the facts again to continue from the reviewer's suggestions.` });
          return;
        }
        // 1. The extractor: the article on the first round; afterwards only the reviewer's findings, in the same stored conversation.
        const extractorContents = round === 1 ? { article } : revisionRequest(facts!, mechanical, evaluation!);
        const extractorRequest = { instructions: EXTRACTOR.instructions, contents: extractorContents, previousResponseId: threads.openai?.responseId };
        const extracted = await traced(round, "openai", extractorModel, "draft2_facts", "medium", extractorRequest, () => generateOpenAiStructuredResponse({
          apiKey: openAiApiKey, model: extractorModel, instructions: EXTRACTOR.instructions, contents: extractorContents,
          schema: DRAFT2_FACTS_SCHEMA, schemaName: "draft2_facts", maxOutputTokens: EXTRACTOR_MAX_OUTPUT_TOKENS, reasoningEffort: "medium",
          store: true, previousResponseId: threads.openai?.responseId, auditContext,
        }), (value) => JSON.parse(value.text));
        const revised = parseDraft2Facts(extracted.text);
        // A revision that silently drops valid facts is a regression the program repairs before the review.
        const merged = round === 1 ? { facts: revised, restored: [] } : mergeRevisedFacts(facts!, revised, [...mechanical, ...evaluation!.issues]);
        facts = merged.facts;
        if (merged.restored.length) draft2DevTrace({ step: "facts", round, provider: "openai", model: extractorModel, operation: "draft2_facts", phase: "response", detail: { restoredByProgram: merged.restored } });
        if (extracted.responseId) threads.openai = { model: extractorModel, responseId: extracted.responseId };
        mechanical = mechanicalFactIssues(facts, articleText, content.title);
        rounds.push({ round, facts, mechanical, ...(merged.restored.length ? { restored: merged.restored } : {}), at: new Date().toISOString() });
        await checkpoint({ facts });

        // 2. The reviewer: the article as cached context on every round; a revised list travels with the reviewer's earlier verdict beside it,
        //    never a conversation that grows each round (real runs resent 9k → 16k → 23k tokens, cached only from the third).
        const reviewerContents = round === 1
          ? { facts, mechanicalFindings: mechanical }
          : { round, revisedFacts: facts, mechanicalFindings: mechanical, ...(merged.restored.length ? { restoredByProgram: merged.restored } : {}), earlierReview: { round: round - 1, verdict: evaluation!.verdict, score: evaluation!.score, issues: evaluation!.issues, suggestions: evaluation!.suggestions } };
        const reviewerRequest = { instructions: REVIEWER.instructions, context: { article: `${articleText.length} characters (cached)` }, contents: reviewerContents };
        const reviewed = await traced(round, "anthropic", reviewerModel, "draft2_facts_review", "high", reviewerRequest, () => generateAnthropicStructuredResponse({
          apiKey: anthropicApiKey, model: reviewerModel, instructions: REVIEWER.instructions, context: { article }, contents: reviewerContents,
          schema: DRAFT2_FACTS_REVIEW_SCHEMA, schemaName: "draft2_facts_review", maxOutputTokens: REVIEWER_MAX_OUTPUT_TOKENS, effort: "high", auditContext,
        }), (value) => JSON.parse(value.text));
        evaluation = parseDraft2FactsEvaluation(reviewed.text);
        rounds[rounds.length - 1] = { ...rounds[rounds.length - 1], evaluation };

        if (draft2FactsAreValid(mechanical, evaluation)) {
          await checkpoint({ status: "ready", facts, evaluation, error: null });
          return;
        }
        if (round === DRAFT2_FACTS_MAX_ROUNDS) {
          // The repair (2026-10-23): the reviewer names a few facts; one call fixes those, and the program accepts the list when every one is addressed and grounded.
          const timeLeft = (deadline ?? startedAt + TIME_BUDGET_MS) - Date.now();
          let remaining = "Review the remaining issues.";
          if (factsRepairable(mechanical, evaluation) && timeLeft >= 60_000) {
            const issues = [...mechanical, ...evaluation.issues];
            const repairContents = repairRequest(facts, mechanical, evaluation);
            const repairedAnswer = await traced(round + 1, "openai", extractorModel, "draft2_facts_repair", "medium", { instructions: EXTRACTOR.instructions, contents: repairContents, previousResponseId: threads.openai?.responseId }, () => generateOpenAiStructuredResponse({
              apiKey: openAiApiKey, model: extractorModel, instructions: EXTRACTOR.instructions, contents: repairContents,
              schema: DRAFT2_FACTS_SCHEMA, schemaName: "draft2_facts", maxOutputTokens: EXTRACTOR_MAX_OUTPUT_TOKENS, reasoningEffort: "medium",
              store: true, previousResponseId: threads.openai?.responseId, auditContext,
            }), (value) => JSON.parse(value.text));
            if (repairedAnswer.responseId) threads.openai = { model: extractorModel, responseId: repairedAnswer.responseId };
            const applied = applyFactsRepair(facts, parseDraft2Facts(repairedAnswer.text), issues);
            const repairedMechanical = mechanicalFactIssues(applied.facts, articleText, content.title);
            if (!applied.unaddressed.length && !repairedMechanical.length) {
              facts = applied.facts;
              const accepted: Draft2FactsEvaluation = { ...evaluation, accepted: { by: "program", at: new Date().toISOString(), repaired: applied.repair } };
              rounds.push({ round: round + 1, facts, mechanical: [], repair: applied.repair, evaluation: accepted, at: new Date().toISOString() });
              await checkpoint({ status: "ready", facts, evaluation: accepted, error: null });
              return;
            }
            remaining = `The program's repair left ${[...applied.unaddressed, ...repairedMechanical.map((issue) => `${issue.code}${issue.factId ? ` (${issue.factId})` : ""}`)].join(", ")}: review the remaining issues.`;
          }
          await checkpoint({ status: "needs-review", facts, evaluation, error: `The reviewer did not accept the facts after ${DRAFT2_FACTS_MAX_ROUNDS} extractions. ${remaining}` });
          return;
        }
        await checkpoint({ evaluation });
      }
    });
  } catch (error) {
    await checkpoint({ status: "failed", facts: facts ?? null, evaluation: evaluation ?? null, error: error instanceof Error ? error.message : "The facts step failed." }).catch(() => undefined);
    throw error;
  }
  return (await updateDraft2Session(session.id, {})) ?? session;
}

/**
 * The editor takes the facts as they stand after the reviewer's last
 * "revise" (three extractions without acceptance), so the next steps can
 * build on them: every fact listed is grounded (the program found nothing on
 * the last round); what the reviewer still wanted (a missing key fact, a
 * duplicate, a qualifier) stays in view on the Facts screen. A Saint-Jean
 * fraud story looped three times on an outcome its body never states.
 */
/**
 * The editor changes one fact's claim or attribution by hand (no provider
 * call): while the facts are the session's step and no run is on, so every
 * later step reads the fact as corrected. The reviewer's last verdict stays
 * in view; the edit is recorded on the fact.
 */
export async function editDraft2Fact({ topicId, sessionId, factId, claim, attribution }: { topicId: string; sessionId: string; factId: string; claim?: string; attribution?: string }): Promise<Draft2SessionRow> {
  const session = await getDraft2Session(topicId, sessionId);
  if (!session) throw new Draft2InputError("This Draft 2 session was not found. Reload the canvas.");
  // Until the Opening exists: the people and places, the focus and the spine cite facts by id and keep no copy of their words; the word steps do.
  if (session.status === "running" || session.opening) throw new Draft2InputError("A fact is edited before the Opening is written: the words cite the facts as they were. Start over from the facts to change one now.");
  if (!session.facts?.length) throw new Draft2InputError("There is no fact to edit: extract the facts first.");
  const facts = editedFacts(session.facts, factId, { claim, attribution }, new Date());
  const updated = await updateDraft2Session(session.id, { facts });
  if (!updated) throw new Draft2InputError("This Draft 2 session was not found. Reload the canvas.");
  return updated;
}

export async function acceptDraft2Facts({ topicId, sessionId }: { topicId: string; sessionId: string }): Promise<Draft2SessionRow> {
  const session = await getDraft2Session(topicId, sessionId);
  if (!session) throw new Draft2InputError("This Draft 2 session was not found. Reload the canvas.");
  if (session.step !== "facts" || session.status === "running") throw new Draft2InputError("The facts are not waiting for you: they are being verified, or a later step already runs on them.");
  if (session.status === "ready") return session;
  if (!session.facts?.length || !session.evaluation) throw new Draft2InputError("There is no list to take: extract the facts first.");
  const last = session.rounds[session.rounds.length - 1];
  if (last?.mechanical.length) throw new Draft2InputError(`The program still finds ${last.mechanical.map((issue) => `${issue.code}${issue.factId ? ` (${issue.factId})` : ""}`).join(", ")} on this list: run the facts again.`);
  const evaluation: Draft2FactsEvaluation = { ...session.evaluation, accepted: { by: "editor", at: new Date().toISOString() } };
  const updated = await updateDraft2Session(session.id, { status: "ready", evaluation, error: null });
  if (!updated) throw new Draft2InputError("This Draft 2 session was not found. Reload the canvas.");
  return updated;
}
