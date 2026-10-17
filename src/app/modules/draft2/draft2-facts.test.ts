import assert from "node:assert/strict";
import test from "node:test";
const json = (value: unknown) => JSON.stringify(value);
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import ts from "typescript";
import * as types from "./draft2-facts.types";

const localRequire = createRequire(import.meta.url);
const topicId = "11111111-1111-4111-8111-111111111111";
const storyId = "22222222-2222-4222-8222-222222222222";
const article = "The program reviews product videos no longer than five minutes. A DOD official says awards took less than a week.";

type Call = { provider: "openai" | "anthropic"; input: Record<string, unknown> };

/** The orchestrator with both providers and the database replaced; `answers` decide each round. */
function harness({ reviews, extractions, failExtractionAt, title = "Story" }: {
  reviews: ("valid" | "revise")[];
  extractions?: string[];
  failExtractionAt?: number;
  /** The story's headline, part of the article the program and the models read. */
  title?: string;
}) {
  const calls: Call[] = [];
  const sessions: Record<string, unknown>[] = [];
  let extraction = 0;
  let review = 0;
  const facts = (evidence: string) => JSON.stringify({ facts: [
    { id: "f1", claim: "Videos are reviewed within five minutes.", evidence, kind: "event", status: "established", attribution: null, qualifier: null, importance: 90 },
    // The extractor drops this valid fact on every revision, as the first real run did; the program restores it.
    ...(extraction === 1 ? [{ id: "f2", claim: "Awards took less than a week.", evidence: "awards took less than a week", kind: "event", status: "attributed", attribution: "A DOD official", qualifier: null, importance: 70 }] : []),
  ] });
  const evidenceByRound = extractions ?? ["reviews product videos no longer than five minutes", "reviews product videos no longer than five minutes", "reviews product videos no longer than five minutes"];
  const exports: Record<string, (...args: unknown[]) => Promise<Record<string, unknown>>> = {};
  const code = ts.transpileModule(readFileSync(new URL("./draft2-facts.ts", import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const mocks: Record<string, unknown> = {
    "server-only": {},
    "./draft2-facts.types": types,
    "./draft2-dev-trace": { draft2DevTrace: () => undefined },
    "../stories/story-content.repository": { getStoryContent: async () => ({ title, url: "https://example.com/a", text: article, contentStatus: "full", source: "article" }) },
    "../stories/creative-text-meter": { withCreativeTextBudget: async (_context: unknown, work: () => Promise<unknown>) => work() },
    "../stories/anthropic.config": { getAnthropicRuntimeConfig: () => ({ apiKey: "k", model: "claude-sonnet-5-5" }), requireAnthropicApiKey: () => "k" },
    "../stories/openai-structured-response": { generateOpenAiStructuredResponse: async (input: Record<string, unknown>) => {
      calls.push({ provider: "openai", input });
      const index = extraction++;
      if (failExtractionAt === index + 1) throw Object.assign(new Error("Claude? no: OpenAI gpt-6.1-sol failed (HTTP 529: overloaded)"), { status: 529 });
      return { text: facts(evidenceByRound[index]), provider: "openai", model: input.model, usage: { promptTokens: 100, outputTokens: 50, thoughtsTokens: 0, totalTokens: 150 }, responseId: `resp_${index + 1}` };
    } },
    "../stories/anthropic-structured-response": { generateAnthropicStructuredResponse: async (input: Record<string, unknown>) => {
      calls.push({ provider: "anthropic", input });
      const verdict = reviews[review++] ?? "revise";
      return { text: JSON.stringify({ verdict, score: verdict === "valid" ? 95 : 60, issues: verdict === "valid" ? [] : [{ code: "VAGUE", factId: "f1", detail: "Say which program." }], suggestions: verdict === "valid" ? [] : ["Name the program."], summary: "Reviewed." }), provider: "anthropic", model: input.model, usage: { promptTokens: 200, outputTokens: 40, thoughtsTokens: 0, totalTokens: 240 }, cachedInputTokens: review > 1 ? 150 : 0 };
    } },
    "./draft2-session.repository": {
      activeDraft2Session: async () => undefined,
      createDraft2Session: async (input: Record<string, unknown>) => { const row = { id: "session-1", ...input, status: "running", rounds: [], threads: {}, trace: [] }; sessions.push(row); return row; },
      getDraft2Session: async (topic: string, id: string) => topic === topicId && sessions.length && sessions[sessions.length - 1].id === id ? sessions[sessions.length - 1] : undefined,
      updateDraft2Session: async (_id: string, patch: Record<string, unknown>) => { const row = { ...sessions[sessions.length - 1], ...patch }; sessions.push(row); return row; },
    },
  };
  vm.runInNewContext(code, { exports, Date, JSON, Error, Object, Array, Math, Number, String, Set, Map, Promise, console, process: { env: { OPENAI_API_KEY: "sk-test" } },
    require: (name: string) => name in mocks ? mocks[name] : localRequire(name) });
  return {
    run: () => exports.runDraft2Facts({ topicId, storyId }), calls, sessions, last: () => sessions[sessions.length - 1],
    accept: (sessionId = "session-1") => exports.acceptDraft2Facts({ topicId, sessionId }),
  };
}

test("facts the reviewer accepts on the first round are ready after one extraction and one review", async () => {
  const h = harness({ reviews: ["valid"] });
  const session = await h.run();
  assert.equal(session.status, "ready");
  assert.equal(h.calls.map((call) => call.provider).join(","), "openai,anthropic");
  assert.equal(h.calls[0].input.store, true, "the extractor's conversation is kept for the next steps");
  assert.equal(h.calls[0].input.previousResponseId, undefined);
  assert.deepEqual((h.calls[0].input.contents as { article: { title: string } }).article.title, "Story");
  assert.equal((h.calls[1].input.context as { article: { title: string } }).article.title, "Story", "the reviewer reads the article as cached context");
  assert.equal(h.calls[1].input.history, undefined, "no conversation");
  const threads = session.threads as types.Draft2Threads;
  assert.equal(threads.openai?.responseId, "resp_1");
  assert.equal(threads.anthropic, undefined, "no transcript is kept: the article is cached context on every round");
  assert.equal((session.facts as types.Draft2Fact[])[0].id, "f1");
  assert.equal((session.trace as types.Draft2TraceEntry[]).length, 2);
});

test("a revise verdict sends the suggestions back to the extractor in the same conversations, until the reviewer accepts", async () => {
  const h = harness({ reviews: ["revise", "valid"] });
  const session = await h.run();
  assert.equal(session.status, "ready");
  assert.equal(h.calls.map((call) => call.provider).join(","), "openai,anthropic,openai,anthropic");
  assert.equal(h.calls[2].input.previousResponseId, "resp_1", "the second extraction continues the stored response");
  const revision = h.calls[2].input.contents as { suggestions: string[]; issues: { code: string }[] };
  assert.deepEqual(revision.suggestions, ["Name the program."]);
  assert.equal(revision.issues[0].code, "VAGUE");
  assert.deepEqual((revision as unknown as { previousFacts: { id: string }[] }).previousFacts.map((fact) => fact.id), ["f1", "f2"], "the extractor sees what it must keep");
  const second = h.calls[3].input as { context: { article: { text: string } }; contents: { revisedFacts: { id: string }[]; earlierReview: { round: number; verdict: string; suggestions: string[] } }; history?: unknown };
  assert.ok(second.context.article.text.includes(article), "the article travels as cached context, the same block every round");
  assert.equal(second.history, undefined, "no conversation grows");
  assert.equal(json([second.contents.earlierReview.round, second.contents.earlierReview.verdict, second.contents.earlierReview.suggestions]), json([1, "revise", ["Name the program."]]), "the reviewer sees its earlier verdict beside the revised list");
  const rounds = session.rounds as types.Draft2FactsRound[];
  assert.equal(rounds.length, 2);
  assert.deepEqual(rounds[1].restored, ["f2"], "the fact the extractor dropped without a reason is back");
  assert.deepEqual(rounds[1].facts.map((fact) => fact.id), ["f1", "f2"]);
  assert.deepEqual((h.calls[3].input.contents as { restoredByProgram: string[] }).restoredByProgram, ["f2"], "the reviewer is told what the program restored");
  assert.equal((session.threads as types.Draft2Threads).openai?.responseId, "resp_2");
});

test("evidence the program cannot find in the article forces a revision even when the reviewer says valid", async () => {
  const h = harness({ reviews: ["valid", "valid"], extractions: ["reviews product videos no longer than six minutes", "reviews product videos no longer than five minutes"] });
  const session = await h.run();
  assert.equal(session.status, "ready");
  assert.equal(h.calls.length, 4);
  const findings = (h.calls[1].input.contents as { mechanicalFindings: { code: string }[] }).mechanicalFindings;
  assert.equal(findings[0].code, "EVIDENCE_NOT_FOUND", "the reviewer sees the program's findings");
  assert.equal((session.rounds as types.Draft2FactsRound[])[0].mechanical.length, 1);
});

test("after three extractions without acceptance the facts stay for a human, with the last verdict", async () => {
  const h = harness({ reviews: ["revise", "revise", "revise"] });
  const session = await h.run();
  assert.equal(session.status, "needs-review");
  assert.equal(h.calls.length, 6);
  assert.match(String(session.error), /3 extractions/);
  assert.equal((session.evaluation as types.Draft2FactsEvaluation).verdict, "revise");
  assert.equal((session.facts as types.Draft2Fact[]).length, 2, "the latest list is kept, with the restored fact");
});

test("a provider failure marks the session failed with its trace and surfaces the error", async () => {
  const h = harness({ reviews: ["revise"], failExtractionAt: 2 });
  await assert.rejects(h.run(), /HTTP 529/);
  assert.equal(h.last().status, "failed");
  const trace = h.last().trace as types.Draft2TraceEntry[];
  assert.equal(trace.length, 3);
  assert.equal(trace[2].outcome, "error");
  assert.equal((h.last().facts as types.Draft2Fact[]).length, 2, "the first round's facts are not lost");
});

test("the headline is part of the article: a fact whose only evidence is the headline is grounded, so the extractor and the reviewer no longer loop on it", async () => {
  const h = harness({ reviews: ["valid"], extractions: ["Pentagon buyers now judge five-minute videos"], title: "Pentagon buyers now judge five-minute videos" });
  const session = await h.run();
  assert.equal(session.status, "ready");
  assert.deepEqual((session.rounds as types.Draft2FactsRound[])[0].mechanical, [], "no EVIDENCE_NOT_FOUND on the headline's words");
});

test("the editor takes a list the reviewer did not accept: the session is ready, the verdict records who took it and keeps the issues; a running, ready or program-flagged list is refused", async () => {
  const h = harness({ reviews: ["revise", "revise", "revise"] });
  await h.run();
  const taken = await h.accept();
  assert.equal(taken.status, "ready");
  assert.equal(taken.error, null);
  const evaluation = taken.evaluation as types.Draft2FactsEvaluation;
  assert.equal(json([evaluation.verdict, evaluation.accepted?.by, evaluation.issues.length]), json(["revise", "editor", 1]), "the reviewer's verdict and issues stay in view");
  assert.equal((await h.accept()).status, "ready", "taking it again changes nothing");
  const flagged = harness({ reviews: ["revise", "revise", "revise"], extractions: ["reviews product videos no longer than five minutes", "reviews product videos no longer than five minutes", "not in the article"] });
  await flagged.run();
  await assert.rejects(flagged.accept(), /The program still finds EVIDENCE_NOT_FOUND \(f1\) on this list: run the facts again/);
  const running = harness({ reviews: [] });
  running.sessions.push({ id: "session-1", topicId, storyId, step: "facts", status: "running", facts: [], evaluation: null, rounds: [], trace: [] });
  await assert.rejects(running.accept(), /not waiting for you/);
  await assert.rejects(running.accept("session-9"), /was not found/);
});
