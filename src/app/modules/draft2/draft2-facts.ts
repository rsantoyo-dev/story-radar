import "server-only";
import { getStoryContent } from "../stories/story-content.repository";
import { withCreativeTextBudget } from "../stories/creative-text-meter";
import { generateOpenAiStructuredResponse } from "../stories/openai-structured-response";
import { generateAnthropicStructuredResponse } from "../stories/anthropic-structured-response";
import { getAnthropicRuntimeConfig, requireAnthropicApiKey } from "../stories/anthropic.config";
import { activeDraft2Session, createDraft2Session, updateDraft2Session } from "./draft2-session.repository";
import { draft2DevTrace } from "./draft2-dev-trace";
import {
  DRAFT2_FACTS_MAX_ROUNDS, DRAFT2_FACTS_REVIEW_SCHEMA, DRAFT2_FACTS_SCHEMA, Draft2BusyError, Draft2InputError, draft2FactsAreValid, mechanicalFactIssues, mergeRevisedFacts,
  parseDraft2Facts, parseDraft2FactsEvaluation, revisionRequest,
  type Draft2Fact, type Draft2FactsEvaluation, type Draft2FactsRound, type Draft2Threads, type Draft2TraceEntry,
} from "./draft2-facts.types";
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

export type Draft2FactsInput = { topicId: string; storyId: string };

/**
 * Runs the Facts step for a story: extract, check, revise, at most three
 * extractions. Every provider call is checkpointed on the session so the
 * conversations survive for the next step and a failure keeps its trace.
 */
export async function runDraft2Facts({ topicId, storyId }: Draft2FactsInput): Promise<Draft2SessionRow> {
  const content = await getStoryContent(topicId, storyId);
  const articleText = content.text?.trim() ?? "";
  if (!articleText) throw new Draft2InputError("The story has no article text yet. Prepare the content in the studio first.");
  if (await activeDraft2Session(topicId, storyId)) throw new Draft2BusyError("A Draft 2 run is already in progress for this story.");

  const openAiApiKey = process.env.OPENAI_API_KEY?.trim();
  if (!openAiApiKey) throw new Draft2InputError("OPENAI_API_KEY is not configured; the extractor needs it.");
  const extractorModel = draft2SolModel(process.env);
  const anthropicApiKey = requireAnthropicApiKey();
  const reviewerModel = getAnthropicRuntimeConfig().model;

  const session = await createDraft2Session({ topicId, storyId, step: "facts" });
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
        if (round > 1 && Date.now() - startedAt > TIME_BUDGET_MS) {
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
        mechanical = mechanicalFactIssues(facts, articleText);
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
          await checkpoint({ status: "needs-review", facts, evaluation, error: `The reviewer did not accept the facts after ${DRAFT2_FACTS_MAX_ROUNDS} extractions. Review the remaining issues.` });
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
