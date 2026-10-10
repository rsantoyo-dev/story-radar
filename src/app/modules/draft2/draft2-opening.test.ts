import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import ts from "typescript";
import * as types from "./draft2-facts.types";
import * as openingTypes from "./draft2-opening.types";
import * as models from "./draft2-models";
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
const factsThreads = { openai: { model: "gpt-6.1-sol", responseId: "resp_facts" }, anthropic: { model: "claude-sonnet-5-5", history: [{ role: "user", text: "{\"article\":{}}" }, { role: "assistant", text: "{\"verdict\":\"valid\"}" }] } };
const profile = { name: "Example Daily", language: "English", region: "Austin", platform: "Instagram", audience: "Founders who sell to government", brandPersonality: ["direct"], formality: 30, humor: 70, energy: 70, optimism: 60, provocation: 60 };

const HEADLINES = [
  "Pentagon buyers now judge five-minute videos", "Your demo video is now the bid", "Five minutes of video replaces the paperwork",
  "The Pentagon shops like a startup now", "A short video can win the contract", "Paperwork is out, product demos are in", "Weeks, not years, to a Pentagon award",
  "Defense buyers now want a demo first", "Five minutes to pitch the Pentagon", "The Pentagon's new shortcut is a video",
  "Pentagon contracts now start with a video", "The fastest route into defence AI", "A product video now opens Pentagon doors",
  "Short pitches are reshaping Pentagon buying", "Defence AI buying runs on demos",
];
const NEW_HEADLINES = ["Speed is the new Pentagon pitch", "A demo now beats a binder", "The binder era is ending at the Pentagon"];
/** What Claude proposes: three in round 1, one in round 2. */
const PROPOSAL_HEADLINES = ["Kill chain help is on the wish list", "A video can reach the kill chain", "Guardrails then, kill chains this year", "One video, one shot at the Pentagon"];

/** Mechanically clean candidates (fifteen by default); `overrides` replaces the cover headline of some ids. */
const candidates = (overrides: Record<string, string> = {}, count = HEADLINES.length): Draft2OpeningCandidate[] => HEADLINES.slice(0, count).map((headline, index) => ({
  id: `c${index + 1}`,
  cover: { headline: overrides[`c${index + 1}`] ?? headline, subheadline: "Product demos replace months of paperwork in a new buying program.", factIds: ["f1"] },
  slide2: { headline: "Awards in under a week", body: "A DOD official says awards took less than a week in several instances.", factIds: ["f2"] },
  angle: "Speed over paperwork",
}));

type Opening = { id: string; cover: Draft2OpeningCandidate["cover"]; slide2: Draft2OpeningCandidate["slide2"]; angle: string };
type WriterContents = { task: string; verifiedFacts: unknown[]; openings?: Opening[]; develop?: Opening[]; candidatesWanted?: number; newAngles?: number; anglesSoFar?: { id: string }[]; feedback?: unknown; instruction?: string; suggestions?: string[] };
type JudgeContents = { round: number; candidates: ({ id: string; revises?: string } & Record<string, unknown>)[]; previousVersions?: { id: string; scores?: Draft2OpeningScore }[]; proposalsWanted?: number };

/** An opening with the fixtures' clean cover and slide 2, under another headline. */
const opening = (id: string, headline: string, angle: string) => ({ ...candidates({}, 1)[0], id, cover: { ...candidates({}, 1)[0].cover, headline }, angle });

/** Sol: the new candidates asked for "openings"; for "revise", each opening and proposal back with its id, then the new angles asked (n1, n2…). */
const writer = (overrides: Record<string, string> = {}) => (contents: WriterContents) => contents.task === "revise"
  ? { candidates: [
    ...(contents.openings ?? []).map((target) => ({ id: target.id, cover: target.cover, slide2: target.slide2, angle: `${target.angle}, sharper` })),
    ...(contents.develop ?? []).map((proposal) => ({ id: proposal.id, cover: proposal.cover, slide2: proposal.slide2, angle: `${proposal.angle}, developed` })),
    ...NEW_HEADLINES.concat(HEADLINES).slice(0, contents.newAngles ?? 0).map((headline, index) => opening(`n${index + 1}`, `${headline}`, "A new angle")),
  ] }
  : { candidates: candidates(overrides, contents.candidatesWanted) };

/** Claude's own openings when a round asks for them: the first three in round 1, the fourth in round 2. */
const proposalsFor = (contents: JudgeContents) => contents.proposalsWanted
  ? PROPOSAL_HEADLINES.slice(contents.round === 1 ? 0 : 3).slice(0, contents.proposalsWanted).map((headline, index) => opening(`p${index + 1}`, headline, "Claude's angle"))
  : [];

const score = (candidateId: string, overall: number, overrides: Partial<Draft2OpeningScore> = {}): Draft2OpeningScore =>
  ({ candidateId, tension: overall, payoff: overall, clarity: overall, grounding: overall, voice: overall, overall, note: "Why.", ...overrides });

/** Claude: scores every candidate it receives (`overall` per id, or a full score, 70 otherwise) and proposes when asked. */
const judge = (verdict: "accept" | "revise", winnerId: string, overall: Record<string, number | Draft2OpeningScore>, extra: Record<string, unknown> = {}) => (contents: JudgeContents) => ({
  verdict, winnerId, summary: `${verdict} ${winnerId}.`, issues: [], suggestions: [],
  scores: contents.candidates.map((candidate) => { const given = overall[candidate.id]; return typeof given === "object" ? given : score(candidate.id, given ?? 70); }),
  proposals: proposalsFor(contents),
  ...extra,
});

type Call = { provider: "openai" | "anthropic"; input: Record<string, unknown> };
type Row = Record<string, unknown> & { opening: Draft2Opening | null; threads: types.Draft2Threads; trace: types.Draft2TraceEntry[] };

/** The orchestrator with both providers, the profile and the database replaced; `writes` and `judgments` decide each round. */
function harness({ writes, judgments, failAt, session, busy = false, claimRefused = false, secondsPerCall }: {
  writes: ((contents: WriterContents) => unknown)[];
  judgments: ((contents: JudgeContents) => unknown)[];
  failAt?: { provider: "openai" | "anthropic"; call: number };
  session?: Record<string, unknown>;
  busy?: boolean;
  claimRefused?: boolean;
  /** Every provider call takes this long on a fake clock, so a run meets the request's time limit. */
  secondsPerCall?: number;
}) {
  const calls: Call[] = [];
  let row: Row = {
    id: sessionId, topicId, storyId, step: "facts", status: "ready", facts, evaluation: null, rounds: [], opening: null, error: null,
    threads: factsThreads as types.Draft2Threads,
    trace: [{ at: "2026-10-09T12:00:00.000Z", step: "facts", round: 1, provider: "openai", model: "gpt-6.1-sol", operation: "draft2_facts", durationMs: 10, outcome: "ok" }],
    ...session,
  };
  let write = 0;
  let judgment = 0;
  let clock = Date.now();
  class FakeDate extends Date { static now() { return clock; } }
  const tick = () => { clock += (secondsPerCall ?? 0) * 1_000; };
  const usage = { promptTokens: 100, outputTokens: 50, thoughtsTokens: 0, totalTokens: 150 };
  const exports: Record<string, (...args: unknown[]) => Promise<Row>> = {};
  const code = ts.transpileModule(readFileSync(new URL("./draft2-opening.ts", import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const mocks: Record<string, unknown> = {
    "server-only": {},
    "./draft2-facts.types": types,
    "./draft2-opening.types": openingTypes,
    "./draft2-models": models,
    "./skills/draft2-skills": skills,
    "./skills/hooks": hooks,
    "./draft2-dev-trace": { draft2DevTrace: () => undefined },
    "../stories/creative-text-meter": { withCreativeTextBudget: async (_context: unknown, work: () => Promise<unknown>) => work() },
    "../stories/anthropic.config": { getAnthropicRuntimeConfig: () => ({ apiKey: "k", model: "claude-sonnet-5-5" }), requireAnthropicApiKey: () => "k" },
    "../stories/creative-profile.repository": { getCreativeProfile: async () => profile },
    "../stories/openai-structured-response": { generateOpenAiStructuredResponse: async (input: Record<string, unknown>) => {
      calls.push({ provider: "openai", input });
      tick();
      const index = write++;
      if (failAt?.provider === "openai" && failAt.call === index + 1) throw Object.assign(new Error("OpenAI gpt-6.1-sol failed (HTTP 529: overloaded)"), { status: 529 });
      return { text: JSON.stringify(writes[index](input.contents as WriterContents)), provider: "openai", model: input.model, usage, cachedInputTokens: index ? 900 : 0 };
    } },
    "../stories/anthropic-structured-response": { generateAnthropicStructuredResponse: async (input: Record<string, unknown>) => {
      calls.push({ provider: "anthropic", input });
      tick();
      const index = judgment++;
      if (failAt?.provider === "anthropic" && failAt.call === index + 1) throw new Error("Claude claude-sonnet-5-5 failed (HTTP 529: overloaded)");
      // The first call writes the facts to the cache; later calls read them.
      return { text: JSON.stringify(judgments[index](input.contents as JudgeContents)), provider: "anthropic", model: input.model, usage, cachedInputTokens: index ? 1_200 : 0, cacheWriteTokens: index ? 0 : 1_200 };
    } },
    "./draft2-session.repository": {
      activeDraft2Session: async () => busy ? row : undefined,
      getDraft2Session: async (topic: string, id: string) => topic === topicId && id === row.id ? row : undefined,
      claimDraft2Session: async (_id: string, patch: Record<string, unknown>) => { if (claimRefused) return undefined; row = { ...row, ...patch, status: "running" }; return row; },
      updateDraft2Session: async (_id: string, patch: Record<string, unknown>) => { row = { ...row, ...patch }; return row; },
      touchDraft2Session: async () => undefined,
    },
  };
  vm.runInNewContext(code, { exports, Date: secondsPerCall ? FakeDate : Date, JSON, Error, Object, Array, Math, Number, String, Boolean, Set, Map, Promise, console, setInterval, clearInterval, process: { env: { OPENAI_API_KEY: "sk-test" } },
    require: (name: string) => name in mocks ? mocks[name] : localRequire(name) });
  return {
    run: (options: { resume?: boolean } = {}) => exports.runDraft2Opening({ topicId, storyId, sessionId, ...options }),
    choose: (candidateId: string) => exports.recordOpeningChoice({ topicId, sessionId, candidateId }),
    calls,
    writerCalls: () => calls.filter((call) => call.provider === "openai").map((call) => call.input.contents as WriterContents),
    judgeCalls: () => calls.filter((call) => call.provider === "anthropic").map((call) => call.input),
    row: () => row,
  };
}

const json = (value: unknown) => JSON.stringify(value);
const ROUND_ONE = HEADLINES.map((_, index) => `c${index + 1}`);

test("an opening Claude accepts in round 1 is ready; both models read the facts snapshot, not a conversation", async () => {
  const h = harness({ writes: [writer()], judgments: [judge("accept", "c1", { c1: 96 })] });
  const session = await h.run();
  assert.equal(h.calls.map((call) => call.provider).join(","), "openai,anthropic");
  const [sol, claude] = h.calls;
  assert.equal(sol.input.previousResponseId, undefined, "Sol no longer continues its facts conversation");
  assert.equal(sol.input.store, undefined);
  assert.deepEqual(Object.keys(sol.input.contents as object), ["verifiedFacts", "task", "candidatesWanted"], "the facts lead the request, so they are read from the cache");
  assert.equal((sol.input.contents as WriterContents).candidatesWanted, 15, "the first round explores fifteen hooks");
  assert.equal((sol.input.contents as WriterContents).verifiedFacts.length, 2);
  assert.match(String(sol.input.instructions), /# Openings for social carousels[\s\S]*# The publication\n- Name: Example Daily\./, "the hooks skill, then the brand brief");
  assert.equal(claude.input.history, undefined, "Claude gets no transcript");
  assert.equal(json(claude.input.context), json({ verifiedFacts: openingTypes.openingFactsSnapshot(facts) }), "the facts travel as Claude's cached context");
  assert.equal("verifiedFacts" in (claude.input.contents as object), false);
  assert.equal((claude.input.contents as JudgeContents).proposalsWanted, 3, "round 1 asks Claude for three openings of its own");
  assert.equal(json([sol.input.timeoutMs, claude.input.timeoutMs]), json([180_000, 240_000]), "fifteen openings take longer than the adapters' default 120 s");
  assert.ok(String(claude.input.instructions).includes(hooks.HOOKS_SKILL.text), "the judge reads the same skill");
  assert.equal(session.step, "opening");
  assert.equal(session.status, "ready");
  assert.equal(session.error, null);
  assert.equal(session.opening?.status, "ready");
  assert.equal(session.opening?.winnerId, "c1");
  assert.equal(session.opening?.rounds[0].kind, "explore");
  assert.equal(session.opening?.candidates.length, 15);
  assert.equal(json(session.threads), json(factsThreads), "the facts conversations are left as they were");
  assert.equal(session.trace.length, 3, "the facts trace is kept and the opening's calls are added");
  assert.equal(json(session.trace.slice(1).map((entry) => [entry.step, entry.provider, entry.skillVersions])), json([["opening", "openai", { hooks: "4" }], ["opening", "anthropic", { hooks: "4" }]]));
});

test("loop: fifteen openings; then three revised, Claude's three proposals developed and three new; then two revised and its last proposal, for the final pick", async () => {
  const h = harness({
    writes: [writer(), writer(), writer()],
    judgments: [
      judge("revise", "c3", { c3: 84, c5: 80, c1: 79 }, { suggestions: ["Pay the promise with the award time."], issues: [{ code: "WEAK_TENSION", candidateId: "c3", part: "cover", detail: "Flat." }] }),
      judge("revise", "c16", { "c3.2": 88, c16: 90, "c5.2": 82, "c1.2": 75, c17: 74, c18: 73, c19: 72, c20: 71, c21: 69 }),
      judge("revise", "c16.3", { "c16.3": 93, "c3.3": 89, c22: 91 }),
    ],
  });
  const session = await h.run();
  assert.equal(h.calls.length, 6);
  const [first, second, third] = h.writerCalls();
  assert.equal(json([first.task, first.candidatesWanted]), json(["openings", 15]));
  assert.equal(json([second.task, second.openings?.map((target) => target.id), second.develop?.map((proposal) => proposal.id), second.newAngles]), json(["revise", ["c3", "c5", "c1"], ["p1", "p2", "p3"], 3]), "round 2: three revised, Claude's three proposals developed, three new angles");
  assert.equal(second.develop?.[0].cover.headline, PROPOSAL_HEADLINES[0]);
  assert.equal(second.anglesSoFar?.length, 15, "the new angles know the fifteen already tried");
  assert.match(String(second.instruction), /Preserve its narrative promise[\s\S]*Develop each proposal in develop[\s\S]*Then write 3 new openings, with ids n1, n2, n3/);
  assert.equal(json(second.suggestions), json(["Pay the promise with the award time."]));
  assert.equal(json((second.openings?.[0] as unknown as { issues: { code: string }[] }).issues.map((issue) => issue.code)), json(["WEAK_TENSION"]), "each target carries its own issues");
  assert.equal(json([third.task, third.openings?.map((target) => target.id), third.develop?.map((proposal) => proposal.id), third.newAngles ?? 0]), json(["revise", ["c16", "c3.2"], ["p4"], 0]), "round 3: the two best lines and Claude's last proposal");
  const judged = h.judgeCalls().map((call) => call.contents as JudgeContents);
  assert.equal(json(judged.map((contents) => contents.candidates.map((candidate) => [candidate.id, candidate.revises ?? null]))), json([
    ROUND_ONE.map((id) => [id, null]),
    [["c3.2", "c3"], ["c5.2", "c5"], ["c1.2", "c1"], ["c16", null], ["c17", null], ["c18", null], ["c19", null], ["c20", null], ["c21", null]],
    [["c16.3", "c16"], ["c3.3", "c3.2"], ["c22", null]],
  ]), "Claude judges 15, then 9, then 3");
  assert.ok(judged.every((contents) => contents.candidates.every((candidate) => !("proposalOf" in candidate))), "Claude is never told which candidates grew from its proposals");
  assert.equal(json(judged.map((contents) => contents.proposalsWanted ?? 0)), json([3, 1, 0]));
  assert.equal(json(judged[1].previousVersions?.map((version) => [version.id, version.scores?.overall])), json([["c3", 84], ["c5", 80], ["c1", 79]]));
  const rounds = session.opening?.rounds ?? [];
  assert.equal(json(rounds.map((round) => round.evaluation?.proposals?.map((proposal) => proposal.id) ?? [])), json([["p1", "p2", "p3"], ["p4"], []]), "proposals are numbered across the run");
  assert.equal(json(rounds[1].candidates.filter((candidate) => candidate.proposalOf).map((candidate) => [candidate.id, candidate.proposalOf])), json([["c16", "p1"], ["c17", "p2"], ["c18", "p3"]]), "the canvas can tell which versions grew from Claude's proposals");
  assert.equal(json(rounds.map((round) => round.kind)), json(["explore", "mixed", "mixed"]));
  assert.equal(session.status, "needs-review");
  assert.equal(session.opening?.winnerId, "c16.3", "the best version of the run stands in");
  assert.match(String(session.error), /after 3 rounds\. The best version, c16\.3, scored 93\/100/);
});

test("regression: a revision that scores lower, or loses grounding the overall does not repay, never replaces its version", async () => {
  const h = harness({
    writes: [writer(), writer(), writer()],
    judgments: [
      judge("revise", "c3", { c3: 84, c5: 80, c1: 79 }),
      judge("revise", "c5.2", { "c3.2": score("c3.2", 78, { voice: 72, grounding: 86 }), "c5.2": 81, "c1.2": score("c1.2", 79, { grounding: 70, tension: 88 }) }),
      judge("revise", "c5.3", { "c3.3": 83, "c5.3": 82 }),
    ],
  });
  const session = await h.run();
  assert.equal(json(session.opening?.rounds[1].regressions?.map((regression) => [regression.candidateId, regression.previousId, regression.worse])), json([
    ["c3.2", "c3", ["tension 84 → 78", "payoff 84 → 78", "clarity 84 → 78", "voice 84 → 72"]],
    ["c1.2", "c1", ["grounding 79 → 70"]],
  ]));
  const third = h.writerCalls()[2];
  assert.equal(json(third.openings?.map((target) => target.id)), json(["c3", "c5.2"]), "round 3 refines c3 again, not the weaker c3.2");
  assert.equal(json((third.openings?.[0] as unknown as { earlierAttempts: { id: string; overall: number }[] }).earlierAttempts.map((attempt) => [attempt.id, attempt.overall])), json([["c3.2", 78]]), "Sol sees the attempt that came out worse");
  assert.equal(json(session.opening?.rounds[2].regressions?.map((regression) => regression.candidateId)), json(["c3.3"]));
  assert.equal(session.opening?.winnerId, "c3", "the best version so far is still the first round's");
});

test("caching: Claude's cached context is identical every round, no history accumulates, and every call records its cache reads and writes", async () => {
  const h = harness({ writes: [writer(), writer(), writer()], judgments: [judge("revise", "c1", { c1: 84, c2: 82 }), judge("revise", "c1.2", { "c1.2": 86 }), judge("revise", "c1.3", { "c1.3": 87 })] });
  const session = await h.run();
  const calls = h.judgeCalls();
  assert.equal(calls.length, 3);
  assert.equal(new Set(calls.map((call) => json(call.context))).size, 1, "the facts block never changes, so rounds 2 and 3 read it from the cache");
  assert.ok(calls.every((call) => call.history === undefined));
  assert.equal(json(calls.map((call) => (call.contents as JudgeContents).candidates.length)), json([15, 9, 3]), "the funnel narrows");
  const sizes = calls.map((call) => json(call.contents).length);
  assert.ok(sizes[2] < sizes[0], `the last judgment carries less than the first (${sizes.join(", ")})`);
  const writerPrefixes = h.writerCalls().map((contents) => json(contents.verifiedFacts));
  assert.equal(new Set(writerPrefixes).size, 1, "Sol's request starts with the same facts every round");
  const judgeTrace = session.trace.filter((entry) => entry.provider === "anthropic");
  assert.equal(json(judgeTrace.map((entry) => [entry.cachedInputTokens, entry.cacheWriteTokens ?? 0])), json([[0, 1_200], [1_200, 0], [1_200, 0]]));
});

test("a round the request has no time for pauses the run with everything saved; a continue request runs on from it", async () => {
  const h = harness({
    writes: [writer(), writer(), writer()],
    judgments: [judge("revise", "c3", { c3: 84, c5: 80, c1: 79 }), judge("revise", "c16", { c16: 90, "c3.2": 88 }), judge("accept", "c16.3", { "c16.3": 96 })],
    secondsPerCall: 60,
  });
  const paused = await h.run();
  assert.equal(h.calls.length, 4, "two rounds fit; the third would end past the request's limit");
  assert.equal(paused.status, "needs-review");
  assert.equal(json([paused.opening?.status, paused.opening?.resumeRound, paused.opening?.rounds.length]), json(["paused", 3, 2]));
  assert.equal(paused.opening?.winnerId, "c16", "the best version so far stands in while paused");
  assert.match(String(paused.error), /Paused before round 3/);
  const finished = await h.run({ resume: true });
  assert.equal(h.calls.length, 6);
  const third = h.writerCalls()[2];
  assert.equal(json([third.task, third.openings?.map((target) => target.id), third.develop?.map((proposal) => proposal.id)]), json(["revise", ["c16", "c3.2"], ["p4"]]), "round 3 picks up from the saved rounds, Claude's last proposal included");
  assert.equal(json([finished.status, finished.opening?.status, finished.opening?.winnerId, finished.opening?.rounds.length]), json(["ready", "ready", "c16.3", 3]));
  assert.equal(finished.opening?.resumeRound, undefined);
  assert.equal(finished.opening?.previousRuns, undefined, "a continued run is the same run, not an earlier one");
  assert.equal(finished.trace.filter((entry) => entry.step === "opening").length, 6, "the trace keeps every call of both requests");
});

test("when Sol's writing uses up the request's time, the run pauses before Claude judges, and a continue request judges the saved round", async () => {
  const h = harness({ writes: [writer()], judgments: [judge("revise", "c3", { c3: 84 })], secondsPerCall: 240 });
  const paused = await h.run();
  assert.equal(h.calls.map((call) => call.provider).join(","), "openai");
  assert.equal(json([paused.opening?.status, paused.opening?.resumeRound, paused.opening?.rounds.length, Boolean(paused.opening?.rounds[0].evaluation)]), json(["paused", 1, 1, false]));
  assert.match(String(paused.error), /Paused before Claude judges round 1/);
  const judged = await h.run({ resume: true });
  assert.equal(h.calls.map((call) => call.provider).join(","), "openai,anthropic", "the saved round is judged, not written again");
  assert.equal((h.calls[1].input.contents as JudgeContents).candidates.length, 15);
  assert.equal(json([judged.opening?.status, judged.opening?.resumeRound, judged.opening?.rounds[0].evaluation?.verdict]), json(["paused", 2, "revise"]), "the next round waits for another request");
});

test("a run whose server died after Sol wrote a round continues by judging that round, with nothing written again", async () => {
  // A run whose round-2 judgment never came back leaves round 2 written but unjudged, as a server that died would.
  const died = harness({ writes: [writer(), writer()], judgments: [judge("revise", "c3", { c3: 84, c5: 80, c1: 79 })], failAt: { provider: "anthropic", call: 2 } });
  await assert.rejects(died.run());
  const before = died.row();
  assert.equal(json([before.opening?.rounds.length, Boolean(before.opening?.rounds[1].evaluation)]), json([2, false]));
  const h = harness({
    writes: [writer()],
    judgments: [judge("revise", "c16", { c16: 90, "c3.2": 88 }), judge("accept", "c16.3", { "c16.3": 96 })],
    session: { ...before, status: "running", error: null, opening: { ...before.opening, status: "running", error: undefined } },
  });
  const session = await h.run({ resume: true });
  assert.equal(h.calls.map((call) => call.provider).join(","), "anthropic,openai,anthropic", "round 2 is judged as written; round 3 runs whole");
  const [first] = h.judgeCalls();
  assert.equal((first.contents as JudgeContents).round, 2);
  assert.equal((first.contents as JudgeContents).candidates.length, 9);
  assert.equal(json((first.contents as JudgeContents).previousVersions?.map((version) => version.id)), json(["c3", "c5", "c1"]), "Claude still sees what each revision revises");
  assert.equal(json([session.status, session.opening?.winnerId, session.opening?.rounds.length]), json(["ready", "c16.3", 3]));
  assert.equal(session.opening?.previousRuns, undefined, "it is the same run");
});

test("continuing needs a paused or stopped run", async () => {
  const h = harness({ writes: [], judgments: [], session: { step: "opening", status: "needs-review", opening: { status: "needs-review", rounds: [], candidates: candidates() } } });
  await assert.rejects(h.run({ resume: true }), (error: Error) => error instanceof types.Draft2InputError && /no paused or stopped opening/.test(error.message));
});

test("when the judge's winner has a program finding, the clean runner-up wins if it passes", async () => {
  const h = harness({ writes: [writer({ c1: "Pentagon says videos now win contracts" })], judgments: [judge("accept", "c1", { c1: 98, c2: 96 })] });
  const session = await h.run();
  assert.equal(h.calls.length, 2);
  assert.equal((h.judgeCalls()[0].contents as { mechanicalFindings: { code: string }[] }).mechanicalFindings[0].code, "ATTRIBUTION_ON_COVER");
  assert.equal(session.opening?.winnerId, "c2");
});

test("with nothing clean to revise, the next round develops Claude's proposals and writes new angles in place of the revisions", async () => {
  const tooLong = Object.fromEntries(HEADLINES.map((headline, index) => [`c${index + 1}`, `${headline} and so much more`]));
  const h = harness({ writes: [writer(tooLong), writer()], judgments: [judge("revise", "c1", { c1: 90 }), judge("accept", "c17", { c17: 96 })] });
  const session = await h.run();
  const second = h.writerCalls()[1];
  assert.equal(json([second.task, second.openings?.length, second.develop?.length, second.newAngles]), json(["revise", 0, 3, 6]), "three new angles plus three in place of the revisions");
  assert.ok(second.feedback, "Sol hears why the first fifteen cannot win");
  assert.equal(second.anglesSoFar?.length, 15);
  assert.equal(json(session.opening?.rounds[1].candidates.map((candidate) => candidate.id)), json(["c16", "c17", "c18", "c19", "c20", "c21", "c22", "c23", "c24"]));
  assert.equal(session.opening?.winnerId, "c17");
});

test("a provider failure marks the opening failed, keeps the trace and the best version so far, and surfaces the error", async () => {
  const h = harness({ writes: [writer()], judgments: [judge("revise", "c4", { c4: 86 })], failAt: { provider: "openai", call: 2 } });
  await assert.rejects(h.run(), /HTTP 529/);
  const row = h.row();
  assert.equal(row.status, "failed");
  assert.equal(row.opening?.status, "failed");
  assert.match(String(row.opening?.error), /HTTP 529/);
  assert.equal(row.opening?.rounds.length, 1, "the first round is not lost");
  assert.equal(row.opening?.winnerId, "c4");
  const last = row.trace[row.trace.length - 1];
  assert.equal(`${last.step} ${last.provider} ${last.outcome}`, "opening openai error");
});

test("a malformed judgment fails the step", async () => {
  const h = harness({ writes: [writer()], judgments: [() => ({ verdict: "accept", winnerId: "c99", summary: "x", scores: [], issues: [], suggestions: [], proposals: [] })] });
  await assert.rejects(h.run(), (error: Error) => error instanceof types.Draft2ResponseError);
  assert.equal(h.row().status, "failed");
});

test("the opening starts only on verified facts, one run at a time", async () => {
  await assert.rejects(harness({ writes: [], judgments: [], session: { status: "needs-review" } }).run(), (error: Error) => error instanceof types.Draft2InputError && /verified facts/.test(error.message));
  await assert.rejects(harness({ writes: [], judgments: [], busy: true }).run(), (error: Error) => error instanceof types.Draft2BusyError);
  await assert.rejects(harness({ writes: [], judgments: [], claimRefused: true }).run(), (error: Error) => error instanceof types.Draft2BusyError, "a concurrent request claimed the session first");
  await assert.rejects(harness({ writes: [], judgments: [], session: { storyId: "44444444-4444-4444-8444-444444444444" } }).run(), /not found for the story/);
  const rerun = harness({ writes: [writer()], judgments: [judge("accept", "c2", { c2: 99 })], session: { step: "opening", status: "failed", threads: {} } });
  assert.equal((await rerun.run()).status, "ready", "a failed opening can run again, without the facts conversations");
});

test("the editor can choose any version of the run; an unknown one is refused; a rerun keeps the choice", async () => {
  const h = harness({
    writes: [writer(), writer(), writer()],
    judgments: [judge("revise", "c1", { c1: 84, c2: 82 }), judge("accept", "c1.2", { "c1.2": 96 }), judge("accept", "c3", { c3: 97 })],
  });
  await h.run();
  const chosen = await h.choose("c2");
  assert.equal(chosen.opening?.editorChoiceId, "c2", "a first-round version stays choosable after the refinement");
  assert.equal(chosen.opening?.winnerId, "c1.2", "the judge's pick stays beside the choice");
  assert.ok(chosen.opening?.editorChoiceAt);
  assert.equal((await h.choose("c1.2")).opening?.editorChoiceId, "c1.2");
  assert.equal((await h.choose("c16")).opening?.editorChoiceId, "c16", "a version grown from Claude's proposal too");
  await assert.rejects(h.choose("c99"), (error: Error) => error instanceof types.Draft2InputError && /c99 is not one of/.test(error.message));
  const rerun = await h.run();
  assert.equal(rerun.opening?.winnerId, "c3");
  assert.equal(rerun.opening?.editorChoiceId, undefined, "a new opening starts without a choice");
  assert.equal(json(rerun.opening?.previousRuns?.map((run) => [run.winnerId, run.editorChoiceId])), json([["c1.2", "c16"]]), "the earlier run and its last choice stay on the session");
});

test("a choice waits while the opening is being written", async () => {
  const h = harness({ writes: [], judgments: [], session: { step: "opening", status: "running", opening: { status: "running", rounds: [], candidates: candidates() } } });
  await assert.rejects(h.choose("c1"), (error: Error) => error instanceof types.Draft2BusyError);
});
