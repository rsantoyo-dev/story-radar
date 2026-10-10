import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import ts from "typescript";
import * as types from "./draft2-facts.types";
import * as openingTypes from "./draft2-opening.types";
import * as skills from "./skills/draft2-skills";
import * as hooks from "./skills/hooks";
import type { Draft2Opening, Draft2OpeningCandidate, Draft2OpeningScore } from "./draft2-opening.types";

const localRequire = createRequire(import.meta.url);
const topicId = "11111111-1111-4111-8111-111111111111";
const storyId = "22222222-2222-4222-8222-222222222222";
const sessionId = "33333333-3333-4333-8333-333333333333";

const facts: types.Draft2Fact[] = [
  { id: "f1", claim: "The program reviews product videos no longer than five minutes.", evidence: "reviews product videos \"no longer than five minutes\"", kind: "event", status: "established", importance: 90 },
  { id: "f2", claim: "A DOD official says awards took less than a week in several instances.", evidence: "A DOD official says awards took less than a week in several instances", kind: "event", status: "attributed", attribution: "A DOD official", importance: 80 },
];
const factsHistory = [{ role: "user", text: JSON.stringify({ article: { title: "Story" }, facts }) }, { role: "assistant", text: JSON.stringify({ verdict: "valid" }) }];
const profile = { name: "Example Daily", language: "English", region: "Austin", platform: "Instagram", audience: "Founders who sell to government", brandPersonality: ["direct"], formality: 30, humor: 20, energy: 70, optimism: 60, provocation: 60 };

const HEADLINES = [
  "Pentagon buyers now judge five-minute videos", "Your demo video is now the bid", "Five minutes of video replaces the paperwork",
  "The Pentagon shops like a startup now", "A short video can win the contract", "Paperwork is out, product demos are in", "Weeks, not years, to a Pentagon award",
];

/** Seven mechanically clean candidates; `overrides` replaces the cover headline of some ids. */
const candidates = (prefix = "", overrides: Record<string, string> = {}): Draft2OpeningCandidate[] => HEADLINES.map((headline, index) => ({
  id: `c${index + 1}`,
  cover: { headline: overrides[`c${index + 1}`] ?? `${prefix}${headline}`, subheadline: "Product demos replace months of paperwork in a new buying program.", factIds: ["f1"] },
  slide2: { headline: "Awards in under a week", body: "A DOD official says awards took less than a week in several instances.", factIds: ["f2"] },
  angle: "Speed over paperwork",
}));

const score = (candidateId: string, overall: number, overrides: Partial<Draft2OpeningScore> = {}): Draft2OpeningScore =>
  ({ candidateId, tension: overall, payoff: overall, clarity: overall, grounding: overall, voice: overall, overall, note: "Why.", ...overrides });

type Judged = { candidates: { id: string }[] };
/** A judge that scores every candidate it receives: `overall` per id, 70 for the rest. */
const judge = (verdict: "accept" | "revise", winnerId: string, overall: Record<string, number>, extra: Record<string, unknown> = {}) => (contents: Judged) => ({
  verdict, winnerId, summary: `${verdict} ${winnerId}.`, issues: [], suggestions: [],
  scores: contents.candidates.map((candidate) => score(candidate.id, overall[candidate.id] ?? 70)),
  ...extra,
});

type Call = { provider: "openai" | "anthropic"; input: Record<string, unknown> };
type Row = Record<string, unknown> & { opening: Draft2Opening | null; threads: types.Draft2Threads; trace: types.Draft2TraceEntry[] };

/** The orchestrator with both providers, the profile and the database replaced; `writes` and `judgments` decide each round. */
function harness({ writes, judgments, failAt, session, busy = false, claimRefused = false }: {
  writes: (() => unknown)[];
  judgments: ((contents: Judged) => unknown)[];
  failAt?: { provider: "openai" | "anthropic"; call: number };
  session?: Record<string, unknown>;
  busy?: boolean;
  claimRefused?: boolean;
}) {
  const calls: Call[] = [];
  let row: Row = {
    id: sessionId, topicId, storyId, step: "facts", status: "ready", facts, evaluation: null, rounds: [], opening: null, error: null,
    threads: { openai: { model: "gpt-6.1-sol", responseId: "resp_facts" }, anthropic: { model: "claude-sonnet-5-5", history: factsHistory as types.Draft2HistoryTurn[] } },
    trace: [{ at: "2026-10-09T12:00:00.000Z", step: "facts", round: 1, provider: "openai", model: "gpt-6.1-sol", operation: "draft2_facts", durationMs: 10, outcome: "ok" }],
    ...session,
  };
  let write = 0;
  let judgment = 0;
  const usage = { promptTokens: 100, outputTokens: 50, thoughtsTokens: 0, totalTokens: 150 };
  const exports: Record<string, (...args: unknown[]) => Promise<Row>> = {};
  const code = ts.transpileModule(readFileSync(new URL("./draft2-opening.ts", import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const mocks: Record<string, unknown> = {
    "server-only": {},
    "./draft2-facts.types": types,
    "./draft2-opening.types": openingTypes,
    "./skills/draft2-skills": skills,
    "./skills/hooks": hooks,
    "./draft2-dev-trace": { draft2DevTrace: () => undefined },
    "../stories/creative-text-meter": { withCreativeTextBudget: async (_context: unknown, work: () => Promise<unknown>) => work() },
    "../stories/anthropic.config": { getAnthropicRuntimeConfig: () => ({ apiKey: "k", model: "claude-sonnet-5-5" }), requireAnthropicApiKey: () => "k" },
    "../stories/creative-profile.repository": { getCreativeProfile: async () => profile },
    "../stories/openai-structured-response": { generateOpenAiStructuredResponse: async (input: Record<string, unknown>) => {
      calls.push({ provider: "openai", input });
      const index = write++;
      if (failAt?.provider === "openai" && failAt.call === index + 1) throw Object.assign(new Error("OpenAI gpt-6.1-sol failed (HTTP 529: overloaded)"), { status: 529 });
      return { text: JSON.stringify(writes[index]()), provider: "openai", model: input.model, usage, responseId: `resp_opening_${index + 1}` };
    } },
    "../stories/anthropic-structured-response": { generateAnthropicStructuredResponse: async (input: Record<string, unknown>) => {
      calls.push({ provider: "anthropic", input });
      const index = judgment++;
      if (failAt?.provider === "anthropic" && failAt.call === index + 1) throw new Error("Claude claude-sonnet-5-5 failed (HTTP 529: overloaded)");
      return { text: JSON.stringify(judgments[index](input.contents as Judged)), provider: "anthropic", model: input.model, usage, cachedInputTokens: 80 };
    } },
    "./draft2-session.repository": {
      activeDraft2Session: async () => busy ? row : undefined,
      getDraft2Session: async (topic: string, id: string) => topic === topicId && id === row.id ? row : undefined,
      claimDraft2Session: async (_id: string, patch: Record<string, unknown>) => { if (claimRefused) return undefined; row = { ...row, ...patch, status: "running" }; return row; },
      updateDraft2Session: async (_id: string, patch: Record<string, unknown>) => { row = { ...row, ...patch }; return row; },
    },
  };
  vm.runInNewContext(code, { exports, Date, JSON, Error, Object, Array, Math, Number, String, Boolean, Set, Map, Promise, console, process: { env: { OPENAI_API_KEY: "sk-test" } },
    require: (name: string) => name in mocks ? mocks[name] : localRequire(name) });
  return {
    run: () => exports.runDraft2Opening({ topicId, storyId, sessionId }),
    choose: (candidateId: string) => exports.recordOpeningChoice({ topicId, sessionId, candidateId }),
    calls,
    row: () => row,
  };
}

const contentsOf = (call: Call) => call.input.contents as Record<string, unknown>;

test("an opening the judge accepts on the first round continues both facts conversations and is ready", async () => {
  const h = harness({ writes: [() => ({ candidates: candidates() })], judgments: [judge("accept", "c1", { c1: 96 })] });
  const session = await h.run();
  assert.equal(h.calls.map((call) => call.provider).join(","), "openai,anthropic");
  const [writer, judgeCall] = h.calls;
  assert.equal(writer.input.previousResponseId, "resp_facts", "Sol continues the conversation where it extracted the facts");
  assert.equal(writer.input.store, true);
  assert.equal(writer.input.model, "gpt-6.1-sol");
  assert.equal(contentsOf(writer).task, "openings");
  assert.equal(contentsOf(writer).candidatesWanted, 7);
  assert.equal((contentsOf(writer).facts as unknown[]).length, 2, "the writer receives the verified facts");
  assert.match(String(writer.input.instructions), /# Openings for social carousels[\s\S]*# The publication\n- Name: Example Daily\./, "the hooks skill, then the brand brief");
  assert.equal((judgeCall.input.history as unknown[]).length, 2, "Claude continues its facts transcript");
  assert.equal("facts" in contentsOf(judgeCall), false, "the facts are already in Claude's transcript");
  assert.equal((contentsOf(judgeCall).candidates as unknown[]).length, 7);
  assert.equal(JSON.stringify(contentsOf(judgeCall).mechanicalFindings), "[]");
  assert.equal(judgeCall.input.instructions !== writer.input.instructions && String(judgeCall.input.instructions).includes(hooks.HOOKS_SKILL.text), true, "the judge reads the same skill");
  assert.equal(session.threads.openai?.responseId, "resp_opening_1");
  assert.equal(session.threads.anthropic?.history.length, 4, "the opening turn and the verdict are kept for the next step");
  assert.equal(session.step, "opening");
  assert.equal(session.status, "ready");
  assert.equal(session.error, null);
  assert.equal(session.opening?.status, "ready");
  assert.equal(session.opening?.winnerId, "c1");
  assert.equal(session.opening?.candidates.length, 7);
  assert.equal(session.opening?.rounds.length, 1);
  assert.equal(session.trace.length, 3, "the facts trace is kept and the opening's calls are added");
  assert.equal(JSON.stringify(session.trace.slice(1).map((entry) => [entry.step, entry.provider, entry.skillVersions])), JSON.stringify([["opening", "openai", { hooks: "1" }], ["opening", "anthropic", { hooks: "1" }]]));
});

test("a revise verdict sends the scores, the suggestions and the candidates to keep back to Sol, until Claude accepts", async () => {
  const round2 = candidates("Now: ");
  const h = harness({
    writes: [() => ({ candidates: candidates() }), () => ({ candidates: round2.map((entry, index) => [1, 2, 4].includes(index) ? candidates()[index] : entry) })],
    judgments: [
      judge("revise", "c3", { c3: 93, c2: 92, c5: 91, c1: 90 }, { suggestions: ["Pay the cover's promise with the award time."], issues: [{ code: "WEAK_TENSION", candidateId: "c4", part: "cover", detail: "Labels the news." }] }),
      judge("accept", "c4", { c4: 97 }),
    ],
  });
  const session = await h.run();
  assert.equal(h.calls.map((call) => call.provider).join(","), "openai,anthropic,openai,anthropic");
  const revision = contentsOf(h.calls[2]);
  assert.equal(h.calls[2].input.previousResponseId, "resp_opening_1", "the second round continues the stored response");
  assert.deepEqual(revision.keep, ["c3", "c2", "c5"], "the best three clean candidates scored 90 or more");
  assert.deepEqual(revision.suggestions, ["Pay the cover's promise with the award time."]);
  assert.equal(revision.judgeVerdict, "revise");
  assert.equal((revision.issues as { code: string }[])[0].code, "WEAK_TENSION");
  assert.match(String(revision.instruction), /keep the listed ones unchanged/);
  assert.equal((h.calls[3].input.history as unknown[]).length, 4);
  assert.equal(session.opening?.status, "ready");
  assert.equal(session.opening?.winnerId, "c4");
  assert.equal(session.opening?.rounds.length, 2);
  assert.equal(session.opening?.rounds[1].restored, undefined, "the kept candidates came back unchanged");
  assert.equal(session.threads.openai?.responseId, "resp_opening_2");
  assert.equal(session.threads.anthropic?.history.length, 6);
});

test("when the judge's winner has a program finding, the clean runner-up wins if it passes", async () => {
  const flagged = candidates("", { c1: "Pentagon says videos now win contracts" });
  const h = harness({ writes: [() => ({ candidates: flagged })], judgments: [judge("accept", "c1", { c1: 98, c2: 96 })] });
  const session = await h.run();
  assert.equal(h.calls.length, 2);
  assert.equal((contentsOf(h.calls[1]).mechanicalFindings as { code: string }[])[0].code, "ATTRIBUTION_ON_COVER", "Claude sees the program's findings");
  assert.equal(session.opening?.status, "ready");
  assert.equal(session.opening?.winnerId, "c2");
});

test("when the judge's winner has a program finding and no clean candidate passes, the round is a revise", async () => {
  const flagged = candidates("", { c1: "Pentagon says videos now win contracts" });
  const h = harness({
    writes: [() => ({ candidates: flagged }), () => ({ candidates: candidates("Now: ") })],
    judgments: [judge("accept", "c1", { c1: 98, c2: 94 }), judge("accept", "c5", { c5: 95 })],
  });
  const session = await h.run();
  assert.equal(h.calls.length, 4, "a second round ran");
  const revision = contentsOf(h.calls[2]);
  assert.equal((revision.issues as { code: string }[])[0].code, "ATTRIBUTION_ON_COVER", "the program's findings come first");
  assert.deepEqual(revision.keep, ["c2"], "a flagged candidate is never kept, however high its score");
  assert.equal(session.opening?.winnerId, "c5");
});

test("after three rounds without acceptance the candidates wait for the editor, with the best clean one in front", async () => {
  const h = harness({
    writes: [() => ({ candidates: candidates() }), () => ({ candidates: candidates("Now: ") }), () => ({ candidates: candidates("Then: ") })],
    judgments: [judge("revise", "c1", { c1: 88 }), judge("revise", "c2", { c2: 89 }), judge("revise", "c3", { c3: 92, c4: 91 }, { issues: [{ code: "PROMISE_NOT_PAID", candidateId: "c3", part: "slide2", detail: "No payoff." }] })],
  });
  const session = await h.run();
  assert.equal(h.calls.length, 6);
  assert.equal(session.status, "needs-review");
  assert.equal(session.opening?.status, "needs-review");
  assert.equal(session.opening?.winnerId, "c3");
  assert.equal(session.opening?.candidates.length, 7, "the last round's candidates are kept");
  assert.equal(session.opening?.candidates[0].cover.headline, "Then: Pentagon buyers now judge five-minute videos");
  assert.match(String(session.error), /after 3 rounds\. The best clean candidate, c3, scored 92\/100\. Remaining issues: PROMISE_NOT_PAID \(c3 · slide2\)/);
  assert.equal(session.opening?.error, session.error);
});

test("a provider failure marks the opening failed with its trace and surfaces the error", async () => {
  const h = harness({ writes: [() => ({ candidates: candidates() })], judgments: [judge("revise", "c1", { c1: 80 })], failAt: { provider: "openai", call: 2 } });
  await assert.rejects(h.run(), /HTTP 529/);
  const row = h.row();
  assert.equal(row.status, "failed");
  assert.equal(row.opening?.status, "failed");
  assert.match(String(row.opening?.error), /HTTP 529/);
  assert.equal(row.opening?.rounds.length, 1, "the first round is not lost");
  const last = row.trace[row.trace.length - 1];
  assert.equal(`${last.step} ${last.provider} ${last.outcome}`, "opening openai error");
  assert.equal(row.threads.openai?.responseId, "resp_opening_1");
});

test("a malformed judgment fails the step without advancing Claude's transcript", async () => {
  const h = harness({ writes: [() => ({ candidates: candidates() })], judgments: [() => ({ verdict: "accept", winnerId: "c9", summary: "x", scores: [], issues: [], suggestions: [] })] });
  await assert.rejects(h.run(), (error: Error) => error instanceof types.Draft2ResponseError);
  assert.equal(h.row().status, "failed");
  assert.equal(h.row().threads.anthropic?.history.length, 2);
});

test("the opening starts only on verified facts, one run at a time", async () => {
  const unverified = harness({ writes: [], judgments: [], session: { status: "needs-review" } });
  await assert.rejects(unverified.run(), (error: Error) => error instanceof types.Draft2InputError && /verified facts/.test(error.message));
  await assert.rejects(harness({ writes: [], judgments: [], session: { threads: {} } }).run(), /conversations are missing/);
  await assert.rejects(harness({ writes: [], judgments: [], busy: true }).run(), (error: Error) => error instanceof types.Draft2BusyError);
  await assert.rejects(harness({ writes: [], judgments: [], claimRefused: true }).run(), (error: Error) => error instanceof types.Draft2BusyError, "a concurrent request claimed the session first");
  await assert.rejects(harness({ writes: [], judgments: [], session: { storyId: "44444444-4444-4444-8444-444444444444" } }).run(), /not found for the story/);
  const rerun = harness({ writes: [() => ({ candidates: candidates() })], judgments: [judge("accept", "c2", { c2: 99 })], session: { step: "opening", status: "failed" } });
  assert.equal((await rerun.run()).status, "ready", "a failed opening can run again");
});

test("the editor's choice is recorded on the opening, an unknown candidate is refused, and a rerun keeps it", async () => {
  const h = harness({
    writes: [() => ({ candidates: candidates() }), () => ({ candidates: candidates("Again: ") })],
    judgments: [judge("accept", "c1", { c1: 96 }), judge("accept", "c2", { c2: 97 })],
  });
  await h.run();
  const chosen = await h.choose("c3");
  assert.equal(chosen.opening?.editorChoiceId, "c3");
  assert.equal(chosen.opening?.winnerId, "c1", "the judge's pick stays beside the choice");
  assert.ok(chosen.opening?.editorChoiceAt);
  await assert.rejects(h.choose("c9"), (error: Error) => error instanceof types.Draft2InputError && /c9 is not one of/.test(error.message));
  const rerun = await h.run();
  assert.equal(rerun.opening?.winnerId, "c2");
  assert.equal(rerun.opening?.editorChoiceId, undefined, "a new opening starts without a choice");
  assert.equal(JSON.stringify(rerun.opening?.previousRuns?.map((run) => [run.winnerId, run.editorChoiceId, run.candidates.length])), JSON.stringify([["c1", "c3", 7]]), "the earlier run and its choice stay on the session");
});

test("a choice waits while the opening is being written", async () => {
  const h = harness({ writes: [], judgments: [], session: { step: "opening", status: "running", opening: { status: "running", rounds: [], candidates: candidates() } } });
  await assert.rejects(h.choose("c1"), (error: Error) => error instanceof types.Draft2BusyError);
});
