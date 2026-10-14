import assert from "node:assert/strict";
import test from "node:test";
import * as types from "./draft2-facts.types";
import * as openingTypes from "./draft2-opening.types";
import * as focusTypes from "./draft2-focus.types";
import * as funnel from "./draft2-funnel";
import * as models from "./draft2-models";
import * as skills from "./skills/draft2-skills";
import * as hooks from "./skills/hooks";
import * as leversSkill from "./skills/levers";
import * as leverTypes from "./draft2-levers.types";
import { NARRATIVES_SKILL } from "./skills/narratives";
import { DISCOVERY_SKILL } from "./skills/discovery";
import { ARCS_SKILL } from "./skills/arcs";
import { loadInSandbox } from "./draft2-test-sandbox";
import type { Draft2Opening, Draft2OpeningCandidate, Draft2OpeningScore } from "./draft2-opening.types";
import type { Draft2Focus, Draft2FocusValues } from "./draft2-focus.types";

const topicId = "11111111-1111-4111-8111-111111111111";
const storyId = "22222222-2222-4222-8222-222222222222";
const sessionId = "33333333-3333-4333-8333-333333333333";

const facts: types.Draft2Fact[] = [
  { id: "f1", claim: "The program reviews product videos no longer than five minutes.", evidence: "reviews product videos \"no longer than five minutes\"", kind: "event", status: "established", importance: 90 },
  { id: "f2", claim: "A DOD official says awards took less than a week in several instances.", evidence: "A DOD official says awards took less than a week in several instances", kind: "event", status: "attributed", attribution: "A DOD official", importance: 80 },
];
const factsThreads = { openai: { model: "gpt-6.1-sol", responseId: "resp_facts" }, anthropic: { model: "claude-sonnet-5-5", history: [{ role: "user", text: "{\"article\":{}}" }, { role: "assistant", text: "{\"verdict\":\"valid\"}" }] } };
/** A focus Claude decided and the editor left as it was. */
const FOCUS_VALUES: Draft2FocusValues = {
  line: { id: "55555555-5555-4555-8555-555555555555", revision: 2, name: "Actualidad", objective: "Recent defence AI news for founders who sell to government." },
  audience: "Founders who sell software to the Pentagon",
  framing: "reader-consequence",
  readerConsequence: { text: "A short product video can now open a Pentagon contract.", factIds: ["f1", "f2"] },
  structure: { kind: "arc", itemFactIds: [] },
  goal: "followers",
  voice: { gravity: "ordinary", formality: 30, humor: 40, energy: 70, optimism: 60, provocation: 60 },
  direction: "Lead with the five-minute video; pay it with the award time.",
};
const FOCUS: Draft2Focus = {
  status: "ready", version: 2, values: FOCUS_VALUES, ai: FOCUS_VALUES, reasons: {}, edited: [], lineOptions: [FOCUS_VALUES.line!],
  decidedBy: { provider: "anthropic", model: "claude-sonnet-5-5" }, decidedAt: "2026-10-10T12:00:00.000Z",
};
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
    // An edit that keeps the proposal's cover and sharpens slide 2's headline (an unchanged one would be dropped).
    ...(contents.develop ?? []).map((proposal) => ({ id: proposal.id, cover: proposal.cover, slide2: { ...proposal.slide2, headline: "Awards came within a week" }, angle: `${proposal.angle}, edited` })),
    ...NEW_HEADLINES.concat(HEADLINES).slice(0, contents.newAngles ?? 0).map((headline, index) => opening(`n${index + 1}`, `${headline}`, "A new angle")),
  ] }
  : { candidates: candidates(overrides, contents.candidatesWanted) };

/** Claude's own openings when a round asks for them: the first three in round 1, the fourth in round 2. */
const proposalsFor = (contents: JudgeContents) => contents.proposalsWanted
  ? PROPOSAL_HEADLINES.slice(contents.round === 1 ? 0 : 3).slice(0, contents.proposalsWanted).map((headline, index) => opening(`p${index + 1}`, headline, "Claude's angle"))
  : [];

const score = (candidateId: string, overall: number, overrides: Partial<Draft2OpeningScore> = {}): Draft2OpeningScore =>
  ({ candidateId, tension: overall, payoff: overall, clarity: overall, grounding: overall, voice: overall, focus: overall, overall, note: "Why.", ...overrides });

/** Claude: scores every candidate it receives (`overall` per id, or a full score, 70 otherwise) and proposes when asked. */
const judge = (verdict: "accept" | "revise", winnerId: string, overall: Record<string, number | Draft2OpeningScore>, extra: Record<string, unknown> = {}) => (contents: JudgeContents) => ({
  verdict, winnerId, summary: `${verdict} ${winnerId}.`, issues: [], suggestions: [],
  scores: contents.candidates.map((candidate) => { const given = overall[candidate.id]; return typeof given === "object" ? given : score(candidate.id, given ?? 70); }),
  proposals: proposalsFor(contents),
  ...extra,
});

type Call = { provider: "openai" | "anthropic"; role: "writer" | "judge"; input: Record<string, unknown> };
type Row = Record<string, unknown> & { opening: Draft2Opening | null; focus: Draft2Focus | null; threads: types.Draft2Threads; trace: types.Draft2TraceEntry[] };

/** The orchestrator with both providers, the profile and the database replaced; `writes` and `judgments` decide each round. */
function harness({ writes, judgments, failAt, session, busy = false, claimRefused = false, secondsPerCall, env = {} }: {
  writes: ((contents: WriterContents) => unknown)[];
  judgments: ((contents: JudgeContents) => unknown)[];
  /** That call fails: overloaded, or with the error given (a cut-off carries its usage). */
  failAt?: { role: "writer" | "judge"; call: number; error?: Error };
  session?: Record<string, unknown>;
  busy?: boolean;
  claimRefused?: boolean;
  /** Every provider call takes this long on a fake clock, so a run meets the request's time limit. */
  secondsPerCall?: number;
  /** The knobs an experiment turns (draft2-models.ts), beside the keys the run needs. */
  env?: Record<string, string>;
}) {
  const calls: Call[] = [];
  let row: Row = {
    id: sessionId, topicId, storyId, step: "focus", status: "ready", facts, evaluation: null, rounds: [], focus: FOCUS, opening: null, error: null,
    threads: factsThreads as types.Draft2Threads,
    trace: [{ at: "2026-10-09T12:00:00.000Z", step: "facts", round: 1, provider: "openai", model: "gpt-6.1-sol", operation: "draft2_facts", durationMs: 10, outcome: "ok" }],
    ...session,
  };
  let write = 0;
  let judgment = 0;
  let anthropicCalls = 0;
  let clock = Date.now();
  class FakeDate extends Date { static now() { return clock; } }
  const tick = () => { clock += (secondsPerCall ?? 0) * 1_000; };
  const usage = { promptTokens: 100, outputTokens: 50, thoughtsTokens: 0, totalTokens: 150 };
  /** Whichever provider plays a role, the role's script answers: the writer writes, the judge judges. */
  const answer = (provider: Call["provider"], input: Record<string, unknown>) => {
    const role = input.schemaName === "draft2_opening" ? "writer" : "judge";
    calls.push({ provider, role, input });
    tick();
    const index = role === "writer" ? write++ : judgment++;
    if (failAt?.role === role && failAt.call === index + 1) throw failAt.error ?? Object.assign(new Error(`${provider} ${String(input.model)} failed (HTTP 529: overloaded)`), { status: 529 });
    const text = role === "writer" ? writes[index](input.contents as WriterContents) : judgments[index](input.contents as JudgeContents);
    return { text: JSON.stringify(text), provider, model: input.model, usage };
  };
  const mocks: Record<string, unknown> = {
    "server-only": {},
    "./draft2-facts.types": types,
    "./draft2-funnel": funnel,
    "./draft2-opening.types": openingTypes,
    "./draft2-focus.types": focusTypes,
    "./draft2-models": models,
    "./skills/draft2-skills": skills,
    "./skills/hooks": hooks,
    "./skills/levers": leversSkill,
    "./draft2-dev-trace": { draft2DevTrace: () => undefined },
    // A fixed cost per call: the trace's arithmetic is the meter's (creative-text-cost.test.ts); here only that it is recorded.
    "./draft2-trace-cost": { traceCostMicros: () => 1234 },
    "../stories/creative-text-meter": { withCreativeTextBudget: async (_context: unknown, work: () => Promise<unknown>) => work() },
    "../stories/anthropic.config": { getAnthropicRuntimeConfig: () => ({ apiKey: "k", model: "claude-sonnet-5-5" }), requireAnthropicApiKey: () => "k" },
    "../stories/creative-profile.repository": { getCreativeProfile: async () => profile },
    "../stories/openai-structured-response": { generateOpenAiStructuredResponse: async (input: Record<string, unknown>) => ({ ...answer("openai", input), cachedInputTokens: 900 }) },
    "../stories/anthropic-structured-response": { generateAnthropicStructuredResponse: async (input: Record<string, unknown>) => {
      // Claude's first call writes the facts to the cache; later calls read them.
      const first = anthropicCalls === 0;
      const answered = answer("anthropic", input);
      anthropicCalls++;
      return { ...answered, cachedInputTokens: first ? 0 : 1_200, cacheWriteTokens: first ? 1_200 : 0 };
    } },
    "./draft2-session.repository": {
      activeDraft2Session: async () => busy ? row : undefined,
      getDraft2Session: async (topic: string, id: string) => topic === topicId && id === row.id ? row : undefined,
      claimDraft2Session: async (_id: string, patch: Record<string, unknown>) => { if (claimRefused) return undefined; row = { ...row, ...patch, status: "running" }; return row; },
      updateDraft2Session: async (_id: string, patch: Record<string, unknown>) => { row = { ...row, ...patch }; return row; },
      touchDraft2Session: async () => undefined,
    },
  };
  const exports = loadInSandbox("./draft2-opening.ts", mocks, { Date: secondsPerCall ? FakeDate : Date, process: { env: { OPENAI_API_KEY: "sk-test", ...env } } }) as Record<string, (...args: unknown[]) => Promise<Row>>;
  return {
    run: (options: { resume?: boolean; more?: boolean } = {}) => exports.runDraft2Opening({ topicId, storyId, sessionId, ...options }),
    choose: (candidateId: string) => exports.recordOpeningChoice({ topicId, sessionId, candidateId }),
    calls,
    /** Changes the stored session between requests, as the editor would. */
    patch: (values: Partial<Row>) => { row = { ...row, ...values }; },
    writerCalls: () => calls.filter((call) => call.role === "writer").map((call) => call.input.contents as WriterContents),
    judgeCalls: () => calls.filter((call) => call.role === "judge").map((call) => call.input),
    row: () => row,
  };
}

const json = (value: unknown) => JSON.stringify(value);
/** The step's context and the facts, as Sol receives them: at the tail of its instructions, the same on every call (its prefix cache). */
const solContextOf = (input: Record<string, unknown>) => JSON.parse(String(input.instructions).split("\n# Context\n")[1].split("\n").slice(1).join("\n")) as Record<string, unknown>;
const ROUND_ONE = HEADLINES.map((_, index) => `c${index + 1}`);

test("Claude writes and Sol judges; both read the focus and the facts snapshot where their provider caches it, never a conversation", async () => {
  const h = harness({ writes: [writer()], judgments: [judge("accept", "c1", { c1: 96 })] });
  const session = await h.run();
  assert.equal(h.calls.map((call) => `${call.role}:${call.provider}`).join(","), "writer:anthropic,judge:openai");
  const [claude, sol] = h.calls;
  assert.equal(claude.input.history, undefined, "the writer gets no transcript");
  assert.equal(json(claude.input.context), json({ focus: focusTypes.focusForModels(FOCUS_VALUES), eligibleLevers: leverTypes.eligibleLevers(facts, FOCUS_VALUES), verifiedFacts: openingTypes.openingFactsSnapshot(facts) }), "the focus, this story's levers and the facts travel as Claude's cached context");
  assert.deepEqual(Object.keys(claude.input.contents as object), ["task", "candidatesWanted", "levers"]);
  assert.equal(json((claude.input.contents as { levers: unknown }).levers), json({ spread: [{ lever: "free", count: 15 }] }), "a focus decided before levers: every opening is free");
  assert.equal((claude.input.contents as WriterContents).candidatesWanted, 15, "the first round explores fifteen hooks");
  assert.equal(claude.input.effort, "medium", "round 1's fifteen openings are written with medium effort");
  assert.match(String(claude.input.instructions), /# Openings for social carousels[\s\S]*# The publication\n- Name: Example Daily\./, "the hooks skill, then the brand brief");
  assert.equal(sol.input.previousResponseId, undefined, "Sol keeps no conversation");
  assert.equal(sol.input.store, undefined);
  assert.equal(sol.input.context, undefined);
  assert.equal(json(solContextOf(sol.input)), json({ focus: focusTypes.focusForModels(FOCUS_VALUES), eligibleLevers: leverTypes.eligibleLevers(facts, FOCUS_VALUES), verifiedFacts: openingTypes.openingFactsSnapshot(facts) }), "the focus, the levers and the facts close Sol's instructions, the same on every call, so OpenAI reads them from its prefix cache");
  assert.deepEqual(Object.keys(sol.input.contents as object).slice(0, 1), ["task"], "the round's request alone travels in Sol's input");
  assert.equal((sol.input.contents as JudgeContents).proposalsWanted, 3, "round 1 asks Sol for three openings of its own");
  assert.equal(sol.input.reasoningEffort, "medium", "and judged with medium reasoning");
  assert.ok(String(sol.input.instructions).includes(hooks.HOOKS_SKILL.text), "the judge reads the same skill");
  assert.equal(json([claude.input.timeoutMs, sol.input.timeoutMs]), json([240_000, 240_000]), "fifteen openings take longer than the adapters' default 120 s");
  assert.equal(json([session.opening?.writer, session.opening?.judge]), json([{ provider: "anthropic", model: "claude-sonnet-5-5" }, { provider: "openai", model: "gpt-6.1-sol" }]), "the run records who wrote and who judged");
  assert.equal(session.step, "opening");
  assert.equal(session.status, "ready");
  assert.equal(session.error, null);
  assert.equal(session.opening?.status, "ready");
  assert.equal(session.opening?.winnerId, "c1");
  assert.equal(session.opening?.rounds[0].kind, "explore");
  assert.equal(session.opening?.candidates.length, 15);
  assert.equal(json(session.threads), json(factsThreads), "the facts conversations are left as they were");
  assert.equal(session.trace.length, 3, "the facts trace is kept and the opening's calls are added");
  assert.equal(json(session.trace.slice(1).map((entry) => [entry.step, entry.provider, entry.operation, entry.skillVersions])), json([["opening", "anthropic", "draft2_opening", { hooks: "6", levers: "1" }], ["opening", "openai", "draft2_opening_review", { hooks: "6", levers: "1" }]]));
  assert.equal(json(session.opening?.focus), json({ version: 2, values: FOCUS_VALUES }), "the run records the focus it followed");
});

test("the opening follows a decided focus: none, one still being decided or one with a finding stops it before any call", async () => {
  await assert.rejects(harness({ writes: [], judgments: [], session: { focus: null } }).run(), (error: Error) => error instanceof types.Draft2InputError && /Decide the focus first/.test(error.message));
  await assert.rejects(harness({ writes: [], judgments: [], session: { focus: { ...FOCUS, status: "running" } } }).run(), /still being decided/);
  const noConsequence = { ...FOCUS, values: { ...FOCUS_VALUES, readerConsequence: null } };
  await assert.rejects(harness({ writes: [], judgments: [], session: { focus: noConsequence } }).run(), /Fix the focus first: The framing leads with the reader consequence/);
  const failedLater = harness({ writes: [writer()], judgments: [judge("accept", "c1", { c1: 96 })], session: { step: "focus", status: "failed", focus: { ...FOCUS, status: "failed", error: "HTTP 529" } } });
  assert.equal((await failedLater.run()).opening?.focus?.version, 2, "a failed later decision leaves the values from before, which the opening may follow");
});

test("a paused run continues with the focus it started with, even after the editor changed the focus", async () => {
  const h = harness({
    writes: [writer(), writer(), writer()],
    judgments: [judge("revise", "c3", { c3: 84, c5: 80, c1: 79 }), judge("revise", "c16", { c16: 90, "c3.2": 88 }), judge("accept", "c16.3", { "c16.3": 96 })],
    secondsPerCall: 60,
  });
  await h.run();
  h.patch({ focus: { ...FOCUS, version: 3, values: { ...FOCUS_VALUES, goal: "saves" }, edited: ["goal"] } });
  const finished = await h.run({ resume: true });
  const read = h.calls.map((call) => json(call.role === "writer" ? (call.input.context as { focus: unknown }).focus : solContextOf(call.input).focus));
  assert.equal(new Set(read).size, 1, "every call of the run read the focus it started with");
  assert.equal(finished.opening?.focus?.version, 2);
});

test("with the plan's levers, the first round spreads its fifteen openings 5, 3, 3 and 4 free; an opening on a lever the facts cannot carry never wins", async () => {
  const levers = { primary: "counterintuitive", alternatives: ["direct-benefit", "myth"], factIds: ["f1"], paidBy: "slide2" as const };
  const values = { ...FOCUS_VALUES, levers };
  const h = harness({ writes: [writer()], judgments: [judge("accept", "c1", { c1: 96 })], session: { focus: { ...FOCUS, values } } });
  await h.run();
  const claude = h.calls.find((call) => call.provider === "anthropic")!;
  assert.equal(json((claude.input.contents as { levers: unknown }).levers), json({ spread: [{ lever: "counterintuitive", count: 5 }, { lever: "direct-benefit", count: 3 }, { lever: "myth", count: 3 }, { lever: "free", count: 4 }] }));
  assert.equal(json((claude.input.context as { focus: { levers?: unknown } }).focus.levers), json(leverTypes.leversForModels(levers)), "the plan's levers, each with its promise, travel in the focus");
  const issues = openingTypes.mechanicalOpeningIssues([
    { ...opening("c1", "A five-minute video opens the door", "Speed"), lever: "stat" },
    { ...opening("c2", "x", "y"), lever: "myth", cover: { ...opening("c2", "x", "y").cover, headline: "What nobody tells you about Pentagon videos" } },
    { ...opening("c3", "Awards in under a week now", "Speed"), lever: "free" },
  ], facts, { eligibleLevers: leverTypes.eligibleLevers(facts, values) });
  assert.equal(json(issues.filter((issue) => issue.code.startsWith("LEVER") || issue.code === "STOCK_PHRASE").map((issue) => [issue.candidateId, issue.code])), json([["c1", "LEVER_UNKNOWN"], ["c2", "STOCK_PHRASE"]]));
});

test("a run stored before the Focus step cannot continue; it is written again", async () => {
  const earlier = { status: "paused", resumeRound: 2, rounds: [], candidates: [] };
  await assert.rejects(harness({ writes: [], judgments: [], session: { step: "opening", status: "needs-review", opening: earlier } }).run({ resume: true }), /started before the Focus step/);
});

test("a steps or list focus lets the cover promise its count", async () => {
  const steps = { ...FOCUS, values: { ...FOCUS_VALUES, structure: { kind: "steps" as const, itemFactIds: ["f1", "f2"] } } };
  const h = harness({ writes: [writer({ c1: "2 steps to a Pentagon award" })], judgments: [judge("accept", "c1", { c1: 96 })], session: { focus: steps } });
  const session = await h.run();
  assert.deepEqual(session.opening?.rounds[0].mechanical, [], "2 is the number of steps the focus names");
  assert.equal(session.opening?.winnerId, "c1");
});

test("loop: fifteen openings; then three revised beside the judge's three proposals, as written and edited; then two revised beside its last proposal, for the final pick", async () => {
  const h = harness({
    writes: [writer(), writer(), writer()],
    judgments: [
      judge("revise", "c3", { c3: 84, c5: 80, c1: 79 }, { suggestions: ["Pay the promise with the award time."], issues: [{ code: "WEAK_TENSION", candidateId: "c3", part: "cover", detail: "Flat." }] }),
      judge("revise", "c16", { "c3.2": 88, c16: 90, "c5.2": 82, "c1.2": 75, c17: 74, c18: 73, c19: 72, c20: 71, c21: 69 }),
      judge("revise", "c16.3", { "c16.3": 93, "c3.3": 89, c22: 91, c23: 92 }),
    ],
  });
  const session = await h.run();
  assert.equal(h.calls.length, 6);
  const [first, second, third] = h.writerCalls();
  assert.equal(json([first.task, first.candidatesWanted]), json(["openings", 15]));
  assert.equal(json([second.task, second.openings?.map((target) => target.id), second.develop?.map((proposal) => proposal.id), second.newAngles ?? 0]), json(["revise", ["c3", "c5", "c1"], ["p1", "p2", "p3"], 0]), "round 2: three revised and the judge's three proposals to edit, no new angles");
  assert.equal(second.develop?.[0].cover.headline, PROPOSAL_HEADLINES[0]);
  assert.match(String(second.instruction), /Preserve its narrative promise[\s\S]*Edit each proposal in develop[\s\S]*Keep its creative device/);
  assert.equal(json(second.suggestions), json(["Pay the promise with the award time."]));
  assert.equal(json((second.openings?.[0] as unknown as { issues: { code: string }[] }).issues.map((issue) => issue.code)), json(["WEAK_TENSION"]), "each target carries its own issues");
  assert.equal(json([third.task, third.openings?.map((target) => target.id), third.develop?.map((proposal) => proposal.id), third.newAngles ?? 0]), json(["revise", ["c16", "c3.2"], ["p4"], 0]), "round 3: the two best lines and the judge's last proposal");
  const judged = h.judgeCalls().map((call) => call.contents as JudgeContents);
  assert.equal(json(judged.map((contents) => contents.candidates.map((candidate) => [candidate.id, candidate.revises ?? null]))), json([
    ROUND_ONE.map((id) => [id, null]),
    [["c3.2", "c3"], ["c5.2", "c5"], ["c1.2", "c1"], ["c16", null], ["c17", null], ["c18", null], ["c19", null], ["c20", null], ["c21", null]],
    [["c16.3", "c16"], ["c3.3", "c3.2"], ["c22", null], ["c23", null]],
  ]), "the judge scores 15, then 9, then 4");
  assert.ok(judged.every((contents) => contents.candidates.every((candidate) => !("proposalOf" in candidate) && !("asProposed" in candidate))), "the judge is never told which candidates are its own proposals");
  assert.equal(json(judged[1].candidates.slice(6).map((candidate) => (candidate as unknown as Opening).cover.headline)), json(PROPOSAL_HEADLINES.slice(0, 3)), "the judge's originals compete exactly as written");
  assert.equal(json(judged.map((contents) => contents.proposalsWanted ?? 0)), json([3, 1, 0]));
  assert.equal(json(judged[1].previousVersions?.map((version) => [version.id, version.scores?.overall])), json([["c3", 84], ["c5", 80], ["c1", 79]]));
  const rounds = session.opening?.rounds ?? [];
  assert.equal(json(rounds.map((round) => round.evaluation?.proposals?.map((proposal) => proposal.id) ?? [])), json([["p1", "p2", "p3"], ["p4"], []]), "proposals are numbered across the run");
  assert.equal(json(rounds[1].candidates.filter((candidate) => candidate.proposalOf).map((candidate) => [candidate.id, candidate.proposalOf, candidate.asProposed ?? false])), json([
    ["c16", "p1", false], ["c17", "p2", false], ["c18", "p3", false], ["c19", "p1", true], ["c20", "p2", true], ["c21", "p3", true],
  ]), "the canvas can set each original against its edit");
  assert.equal(json(rounds.map((round) => round.kind)), json(["explore", "mixed", "mixed"]));
  assert.equal(json(h.calls.map((call) => call.input.effort ?? call.input.reasoningEffort)), json(["medium", "medium", "high", "medium", "high", "medium"]), "the rounds that refine think hard");
  assert.equal(session.status, "needs-review");
  assert.equal(session.opening?.winnerId, "c16.3", "the best version of the run stands in");
  assert.match(String(session.error), /after 3 rounds\. The best version, c16\.3, scored 93\/100/);
});

test("regression: a revision that scores lower, or loses grounding the overall does not repay, never replaces its version", async () => {
  const h = harness({
    writes: [writer(), writer(), writer()],
    judgments: [
      // Scores at or above the floor the funnel works to, so no extra round joins: this test is about regressions.
      judge("revise", "c3", { c3: 92, c5: 88, c1: 87 }),
      judge("revise", "c5.2", { "c3.2": score("c3.2", 86, { voice: 72, grounding: 94 }), "c5.2": 89, "c1.2": score("c1.2", 87, { grounding: 70, tension: 88 }) }),
      judge("revise", "c5.3", { "c3.3": 91, "c5.3": 90 }),
    ],
  });
  const session = await h.run();
  assert.equal(json(session.opening?.rounds[1].regressions?.map((regression) => [regression.candidateId, regression.previousId, regression.worse])), json([
    ["c3.2", "c3", ["tension 92 → 86", "payoff 92 → 86", "clarity 92 → 86", "voice 92 → 72", "focus 92 → 86"]],
    ["c1.2", "c1", ["grounding 87 → 70"]],
  ]));
  const third = h.writerCalls()[2];
  assert.equal(json(third.openings?.map((target) => target.id)), json(["c3", "c5.2"]), "round 3 refines c3 again, not the weaker c3.2");
  assert.equal(json((third.openings?.[0] as unknown as { earlierAttempts: { id: string; overall: number }[] }).earlierAttempts.map((attempt) => [attempt.id, attempt.overall])), json([["c3.2", 86]]), "the writer sees the attempt that came out worse");
  assert.equal(json(session.opening?.rounds[2].regressions?.map((regression) => regression.candidateId)), json(["c3.3"]));
  assert.equal(session.opening?.winnerId, "c3", "the best version so far is still the first round's");
});

test("caching: the writer's cached facts are identical every round, the judge's input starts with the same facts, and no history accumulates", async () => {
  const h = harness({ writes: [writer(), writer(), writer()], judgments: [judge("revise", "c1", { c1: 90, c2: 88 }), judge("revise", "c1.2", { "c1.2": 91 }), judge("revise", "c1.3", { "c1.3": 92 })] });
  const session = await h.run();
  const writerInputs = h.calls.filter((call) => call.role === "writer").map((call) => call.input);
  assert.equal(new Set(writerInputs.map((input) => json(input.context))).size, 1, "Claude reads the same facts block from its cache in rounds 2 and 3");
  assert.ok(h.calls.every((call) => call.input.history === undefined && call.input.previousResponseId === undefined));
  const judgeInputs = h.judgeCalls();
  assert.equal(new Set(judgeInputs.map((input) => input.instructions)).size, 1, "Sol's instructions, with the context and the facts at their tail, are identical every round: its prefix cache reads them");
  assert.match(String(judgeInputs[0].instructions), /# Context\nThe same on every call of this run[^]*"verifiedFacts":\[\{"id":"f1"/);
  assert.ok(judgeInputs.every((input) => !("verifiedFacts" in (input.contents as object))), "the round's request alone travels in Sol's input");
  assert.equal(json(judgeInputs.map((input) => (input.contents as JudgeContents).candidates.length)), json([15, 9, 4]), "the funnel narrows");
  const writerTrace = session.trace.filter((entry) => entry.provider === "anthropic");
  assert.equal(json(writerTrace.map((entry) => [entry.cachedInputTokens, entry.cacheWriteTokens ?? 0])), json([[0, 1_200], [1_200, 0], [1_200, 0]]), "every call records its cache reads and writes");
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
  assert.equal(json([third.task, third.openings?.map((target) => target.id), third.develop?.map((proposal) => proposal.id)]), json(["revise", ["c16", "c3.2"], ["p4"]]), "round 3 picks up from the saved rounds, the judge's last proposal included");
  assert.equal(json([finished.status, finished.opening?.status, finished.opening?.winnerId, finished.opening?.rounds.length]), json(["ready", "ready", "c16.3", 3]));
  assert.equal(finished.opening?.resumeRound, undefined);
  assert.equal(finished.opening?.previousRuns, undefined, "a continued run is the same run, not an earlier one");
  assert.equal(finished.trace.filter((entry) => entry.step === "opening").length, 6, "the trace keeps every call of both requests");
});

test("when the writing uses up the request's time, the run pauses before the judgment, and a continue request judges the saved round", async () => {
  const h = harness({ writes: [writer()], judgments: [judge("revise", "c3", { c3: 84 })], secondsPerCall: 240 });
  const paused = await h.run();
  assert.equal(h.calls.map((call) => call.role).join(","), "writer");
  assert.equal(json([paused.opening?.status, paused.opening?.resumeRound, paused.opening?.rounds.length, Boolean(paused.opening?.rounds[0].evaluation)]), json(["paused", 1, 1, false]));
  assert.match(String(paused.error), /Paused before Sol judges round 1/);
  const judged = await h.run({ resume: true });
  assert.equal(h.calls.map((call) => call.role).join(","), "writer,judge", "the saved round is judged, not written again");
  assert.equal((h.calls[1].input.contents as JudgeContents).candidates.length, 15);
  assert.equal(json([judged.opening?.status, judged.opening?.resumeRound, judged.opening?.rounds[0].evaluation?.verdict]), json(["paused", 2, "revise"]), "the next round waits for another request");
});

test("a run whose server died after the writer wrote a round continues by judging that round, with nothing written again", async () => {
  // A run whose round-2 judgment never came back leaves round 2 written but unjudged, as a server that died would.
  const died = harness({ writes: [writer(), writer()], judgments: [judge("revise", "c3", { c3: 84, c5: 80, c1: 79 })], failAt: { role: "judge", call: 2 } });
  await assert.rejects(died.run());
  const before = died.row();
  assert.equal(json([before.opening?.rounds.length, Boolean(before.opening?.rounds[1].evaluation)]), json([2, false]));
  const h = harness({
    writes: [writer()],
    judgments: [judge("revise", "c16", { c16: 90, "c3.2": 88 }), judge("accept", "c16.3", { "c16.3": 96 })],
    session: { ...before, status: "running", error: null, opening: { ...before.opening, status: "running", error: undefined } },
  });
  const session = await h.run({ resume: true });
  assert.equal(h.calls.map((call) => call.role).join(","), "judge,writer,judge", "round 2 is judged as written; round 3 runs whole");
  const [first] = h.judgeCalls();
  assert.equal((first.contents as JudgeContents).round, 2);
  assert.equal((first.contents as JudgeContents).candidates.length, 9);
  assert.equal(json((first.contents as JudgeContents).previousVersions?.map((version) => version.id)), json(["c3", "c5", "c1"]), "the judge still sees what each revision revises");
  assert.equal(json([session.status, session.opening?.winnerId, session.opening?.rounds.length]), json(["ready", "c16.3", 3]));
  assert.equal(session.opening?.previousRuns, undefined, "it is the same run");
});

test("the run's notes name the model that judges it: with Luna judging, Luna pauses and Luna does not accept, and a continued run keeps Luna once the environment moves on", async () => {
  const luna = { DRAFT2_MODEL_JUDGE: "gpt-6-luna" };
  const ended = await harness({
    writes: [writer(), writer(), writer()],
    judgments: [judge("revise", "c1", { c1: 90, c2: 82 }), judge("revise", "c1.2", { "c1.2": 91 }), judge("revise", "c1.3", { "c1.3": 92 })],
    env: luna,
  }).run();
  assert.match(String(ended.error), /^Luna did not accept an opening after 3 rounds\. The best version, c1\.3, scored 92\/100/);
  const h = harness({ writes: [writer()], judgments: [], secondsPerCall: 240, env: luna });
  const paused = await h.run();
  assert.match(String(paused.error), /^Paused before Luna judges round 1/);
  const later = harness({ writes: [], judgments: [judge("revise", "c1", { c1: 90, c2: 82 })], session: h.row() });
  const continued = await later.run({ resume: true });
  assert.equal(json([later.judgeCalls().map((call) => call.model), continued.opening?.judge]), json([["gpt-6-luna"], { provider: "openai", model: "gpt-6-luna" }]), "the environment names no judge now; the run keeps the one it started with");
});

test("a run stored before the swap continues with the roles it started with: Sol writes, Claude judges", async () => {
  const died = harness({ writes: [writer(), writer()], judgments: [judge("revise", "c3", { c3: 84, c5: 80, c1: 79 })], failAt: { role: "judge", call: 2 } });
  await assert.rejects(died.run());
  const { writer: _writer, judge: _judge, ...earlier } = died.row().opening!;
  void _writer; void _judge;
  const h = harness({
    writes: [writer()],
    judgments: [judge("revise", "c16", { c16: 90 }), judge("accept", "c16.3", { "c16.3": 96 })],
    session: { ...died.row(), status: "running", error: null, opening: { ...earlier, status: "running", error: undefined } },
  });
  const session = await h.run({ resume: true });
  assert.equal(h.calls.map((call) => `${call.role}:${call.provider}`).join(","), "judge:anthropic,writer:openai,judge:anthropic");
  assert.equal(json([session.opening?.writer?.provider, session.opening?.judge?.provider]), json(["openai", "anthropic"]), "the roles it ran with are now on record");
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

test("with nothing clean to revise, the next round sets the judge's proposals, as written and edited, beside new angles in place of the revisions", async () => {
  const tooLong = Object.fromEntries(HEADLINES.map((headline, index) => [`c${index + 1}`, `${headline} and so much more`]));
  const h = harness({ writes: [writer(tooLong), writer()], judgments: [judge("revise", "c1", { c1: 90 }), judge("accept", "c17", { c17: 96 })] });
  const session = await h.run();
  const second = h.writerCalls()[1];
  assert.equal(json([second.task, second.openings?.length, second.develop?.length, second.newAngles]), json(["revise", 0, 3, 3]), "three new angles in place of the revisions");
  assert.ok(second.feedback, "the writer hears why the first fifteen cannot win");
  assert.equal(second.anglesSoFar?.length, 15);
  assert.equal(json(session.opening?.rounds[1].candidates.map((candidate) => [candidate.id, candidate.proposalOf ?? null, candidate.asProposed ?? false])), json([
    ["c16", "p1", false], ["c17", "p2", false], ["c18", "p3", false], ["c19", "p1", true], ["c20", "p2", true], ["c21", "p3", true], ["c22", null, false], ["c23", null, false], ["c24", null, false],
  ]));
  assert.equal(session.opening?.winnerId, "c17");
});

test("a material factual error blocks the judge's own pick: the clean runner-up wins", async () => {
  const material = { code: "OVERCLAIMS", candidateId: "c1", part: "cover", detail: "The headline drops the $500 million limit.", material: true };
  const h = harness({ writes: [writer()], judgments: [judge("accept", "c1", { c1: 97, c2: 96 }, { issues: [material] })] });
  const session = await h.run();
  assert.equal(json([session.status, session.opening?.winnerId]), json(["ready", "c2"]));
  assert.equal(session.opening?.rounds[0].evaluation?.issues[0].material, true, "the error stays on record");
});

test("a provider failure marks the opening failed, keeps the trace and the best version so far, and surfaces the error", async () => {
  const h = harness({ writes: [writer()], judgments: [judge("revise", "c4", { c4: 86 })], failAt: { role: "writer", call: 2 } });
  await assert.rejects(h.run(), /HTTP 529/);
  const row = h.row();
  assert.equal(row.status, "failed");
  assert.equal(row.opening?.status, "failed");
  assert.match(String(row.opening?.error), /HTTP 529/);
  assert.equal(row.opening?.rounds.length, 1, "the first round is not lost");
  assert.equal(row.opening?.winnerId, "c4");
  const last = row.trace[row.trace.length - 1];
  assert.equal(`${last.step} ${last.provider} ${last.operation} ${last.outcome}`, "opening anthropic draft2_opening error", "Claude's writing call failed");
});

test("a malformed judgment fails the step", async () => {
  const h = harness({ writes: [writer()], judgments: [() => ({ verdict: "accept", winnerId: "c99", summary: "x", scores: [], issues: [], suggestions: [], proposals: [] })] });
  await assert.rejects(h.run(), (error: Error) => error instanceof types.Draft2ResponseError);
  assert.equal(h.row().status, "failed");
});

test("the opening starts only on verified facts, one run at a time", async () => {
  await assert.rejects(harness({ writes: [], judgments: [], session: { step: "facts", status: "needs-review" } }).run(), (error: Error) => error instanceof types.Draft2InputError && /verified facts/.test(error.message));
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
  assert.equal((await h.choose("c16")).opening?.editorChoiceId, "c16", "a version grown from the judge's proposal too");
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

test("a call cut off at the output ceiling keeps its usage and how far its answer got on the trace", async () => {
  const cutOff = Object.assign(new Error("Claude claude-sonnet-5-5 ran out of output tokens before finishing (24000)"), {
    usage: { promptTokens: 9_541, outputTokens: 24_000, thoughtsTokens: 0, totalTokens: 33_541 },
    details: { stopReason: "max_tokens", answerCharacters: 0 },
  });
  const h = harness({ writes: [writer()], judgments: [], failAt: { role: "writer", call: 1, error: cutOff } });
  await assert.rejects(h.run(), /ran out of output tokens/);
  const last = h.row().trace[h.row().trace.length - 1];
  assert.equal(json([last.outcome, last.usage?.outputTokens, last.answerCharacters, last.stopReason]), json(["error", 24_000, 0, "max_tokens"]), "all of it went to thinking");
});

test("an extra round: a run that ended unaccepted after its plan's rounds revises its best version once more, at most twice", async () => {
  const h = harness({
    writes: [writer(), writer(), writer(), writer(), writer()],
    judgments: [judge("revise", "c1", { c1: 90, c2: 82 }), judge("revise", "c1.2", { "c1.2": 91 }), judge("revise", "c1.3", { "c1.3": 92 }), judge("revise", "c1.4", { "c1.4": 93 }), judge("revise", "c1.5", { "c1.5": 94 })],
  });
  const ended = await h.run();
  assert.equal(json([ended.opening?.status, ended.opening?.rounds.length, ended.opening?.extraRounds ?? 0]), json(["needs-review", 3, 0]), "at or above the floor, the plan's rounds are enough");
  assert.match(String(ended.error), /^Sol did not accept an opening after 3 rounds\. The best version, c1\.3, scored 92\/100/);
  await assert.rejects(h.run({ resume: true }), /no paused or stopped opening to continue/, "the plan's rounds are spent");
  const fourth = await h.run({ resume: true, more: true });
  assert.equal(json([fourth.opening?.status, fourth.opening?.rounds.length, fourth.opening?.extraRounds, fourth.opening?.winnerId]), json(["needs-review", 4, 1, "c1.4"]));
  assert.equal(json((h.judgeCalls()[3].contents as JudgeContents).candidates.map((candidate) => candidate.id)), json(["c1.4"]), "the best version, revised once more, alone");
  assert.match(String(fourth.error), /after 4 rounds/);
  const fifth = await h.run({ resume: true, more: true });
  assert.equal(json([fifth.opening?.status, fifth.opening?.rounds.length, fifth.opening?.extraRounds, fifth.opening?.winnerId]), json(["needs-review", 5, 2, "c1.5"]));
  await assert.rejects(h.run({ resume: true, more: true }), /already had its 2 extra rounds/);
});

test("a shadow judgment at another effort runs beside the real one, is recorded on the round with whether it agrees, and decides nothing", async () => {
  const h = harness({ writes: [writer()], judgments: [judge("accept", "c1", { c1: 96 }), judge("revise", "c2", { c1: 80, c2: 85 })], env: { DRAFT2_SHADOW_JUDGE_EFFORT: "high" } });
  const session = await h.run();
  assert.equal(json([session.opening?.status, session.opening?.winnerId]), json(["ready", "c1"]), "the real judgment decides");
  const judges = h.judgeCalls();
  assert.equal(json(judges.map((input) => [input.schemaName, input.reasoningEffort])), json([["draft2_opening_review", "medium"], ["draft2_opening_review_shadow", "high"]]));
  assert.equal(judges[0].instructions, judges[1].instructions, "the same request, at another effort");
  const shadow = session.opening?.rounds[0].shadow;
  assert.equal(json([shadow?.effort, shadow?.model, shadow?.verdict, shadow?.winnerId, shadow?.agrees, shadow?.scores?.map((score) => [score.candidateId, score.overall]).slice(0, 2)]), json(["high", "gpt-6.1-sol", "revise", "c2", false, [["c1", 80], ["c2", 85]]]));
  assert.equal(json(session.trace.filter((entry) => entry.provider === "openai" && entry.step === "opening").map((entry) => [entry.operation, entry.effort, entry.costMicros])), json([["draft2_opening_review", "medium", 1234], ["draft2_opening_review_shadow", "high", 1234]]), "both judgments are traced, with their effort and cost");
});

test("the environment names a step's writer model and the revision rounds' efforts; the run records what it ran on", async () => {
  const h = harness({
    writes: [writer(), writer()], judgments: [judge("revise", "c1", { c1: 84, c2: 82 }), judge("accept", "c1.2", { "c1.2": 96 })],
    env: { DRAFT2_MODEL_OPENING_WRITER: "claude-opus-5-5", DRAFT2_MODEL_OPENING_JUDGE: "claude-opus-5-5", DRAFT2_REVISION_EFFORT_WRITER: "low", DRAFT2_REVISION_EFFORT_JUDGE: "medium" },
  });
  const session = await h.run();
  assert.equal(json(h.calls.map((call) => [call.input.model, call.input.effort ?? call.input.reasoningEffort])), json([["claude-opus-5-5", "medium"], ["gpt-6.1-sol", "medium"], ["claude-opus-5-5", "low"], ["gpt-6.1-sol", "medium"]]),
    "Opus writes this step; a Claude model cannot play Sol's role; round 1 keeps the plan's medium, the revision takes the environment's efforts");
  assert.equal(json([session.opening?.writer, session.opening?.judge]), json([{ provider: "anthropic", model: "claude-opus-5-5" }, { provider: "openai", model: "gpt-6.1-sol" }]));
  assert.equal(json(session.trace.filter((entry) => entry.step === "opening").map((entry) => [entry.model, entry.effort, entry.costMicros])), json([["claude-opus-5-5", "medium", 1234], ["gpt-6.1-sol", "medium", 1234], ["claude-opus-5-5", "low", 1234], ["gpt-6.1-sol", "medium", 1234]]));
});

test("a shadow judgment by another model of the judge's provider runs at the round's effort, records what it found, and decides nothing", async () => {
  const h = harness({
    writes: [writer()],
    judgments: [judge("accept", "c1", { c1: 96 }), (contents: JudgeContents) => ({ ...judge("revise", "c2", { c1: 90, c2: 93 })(contents), issues: [{ code: "UNCLEAR", candidateId: "c1", part: "cover", detail: "The cover promises what slide 2 does not pay. " + "x".repeat(200) }], proposals: [] })],
    env: { DRAFT2_SHADOW_JUDGE_MODEL: "gpt-6-luna" },
  });
  const session = await h.run();
  assert.equal(json([session.opening?.status, session.opening?.winnerId, session.opening?.judge]), json(["ready", "c1", { provider: "openai", model: "gpt-6.1-sol" }]), "the real judge and its model decide");
  const judges = h.judgeCalls();
  assert.equal(json(judges.map((input) => [input.schemaName, input.model, input.reasoningEffort])), json([["draft2_opening_review", "gpt-6.1-sol", "medium"], ["draft2_opening_review_shadow", "gpt-6-luna", "medium"]]), "the same effort, another model");
  assert.equal(judges[0].instructions, judges[1].instructions);
  const shadow = session.opening?.rounds[0].shadow;
  assert.equal(json([shadow?.model, shadow?.effort, shadow?.verdict, shadow?.winnerId, shadow?.agrees, shadow?.proposals]), json(["gpt-6-luna", "medium", "revise", "c2", false, 0]));
  assert.equal(json(shadow?.issues), json([{ code: "UNCLEAR", candidateId: "c1", detail: ("The cover promises what slide 2 does not pay. " + "x".repeat(200)).slice(0, 160) }]), "its issues, cut short");
  assert.equal(json(session.trace.filter((entry) => entry.operation === "draft2_opening_review_shadow").map((entry) => [entry.model, entry.effort, entry.costMicros])), json([["gpt-6-luna", "medium", 1234]]));
});

test("a provider that does not answer in time pauses the run at its round instead of failing it; a continue request writes that round again", async () => {
  const h = harness({
    writes: [writer(), writer(), writer()], judgments: [judge("revise", "c1", { c1: 84, c2: 82 }), judge("accept", "c1.2", { "c1.2": 96 })],
    failAt: { role: "writer", call: 2, error: new Error("Claude claude-sonnet-5-5 did not respond within 169 seconds") },
  });
  const paused = await h.run();
  assert.equal(json([paused.status, paused.opening?.status, paused.opening?.resumeRound, paused.opening?.rounds.length, paused.opening?.winnerId]), json(["needs-review", "paused", 2, 1, "c1"]), "round 1 is kept, with its best version standing in");
  assert.match(String(paused.error), /^Paused at round 2: Claude claude-sonnet-5-5 did not respond within 169 seconds\. The run continues/);
  assert.equal(json(h.row().trace.filter((entry) => entry.step === "opening").map((entry) => [entry.round, entry.operation, entry.outcome])), json([[1, "draft2_opening", "ok"], [1, "draft2_opening_review", "ok"], [2, "draft2_opening", "error"]]), "the lost call stays on the trace");
  const finished = await h.run({ resume: true });
  assert.equal(json([finished.opening?.status, finished.opening?.winnerId, finished.opening?.rounds.length, h.calls.length]), json(["ready", "c1.2", 2, 5]), "round 2 written again in the new request, round 1 never rewritten");
});

test("under the floor, the run takes an extra round on its own, at most twice; at or above it, the plan's rounds are enough", async () => {
  const low = harness({
    writes: [writer(), writer(), writer(), writer(), writer()],
    judgments: [judge("revise", "c1", { c1: 80, c2: 78 }), judge("revise", "c1.2", { "c1.2": 84 }), judge("revise", "c1.3", { "c1.3": 87 }), judge("revise", "c1.4", { "c1.4": 88 }), judge("revise", "c1.5", { "c1.5": 89 })],
  });
  const session = await low.run();
  assert.equal(json([session.opening?.status, session.opening?.rounds.length, session.opening?.extraRounds, session.opening?.winnerId]), json(["needs-review", 5, 2, "c1.5"]), "two extra rounds, then the cap");
  assert.match(String(session.error), /^Sol did not accept an opening after 5 rounds \(2 extra\), and the best stays under 90\/100\. The best version, c1\.5, scored 89\/100/);
  assert.equal(json(low.judgeCalls().slice(3).map((input) => (input.contents as JudgeContents).candidates.map((candidate) => candidate.id))), json([["c1.4"], ["c1.5"]]), "each extra round revises the best version alone");
  await assert.rejects(low.run({ resume: true, more: true }), /already had its 2 extra rounds/, "the cap holds for the editor too");

  const rescued = harness({
    writes: [writer(), writer(), writer(), writer()],
    judgments: [judge("revise", "c1", { c1: 80, c2: 78 }), judge("revise", "c1.2", { "c1.2": 84 }), judge("revise", "c1.3", { "c1.3": 87 }), judge("accept", "c1.4", { "c1.4": 96 })],
  });
  const ready = await rescued.run();
  assert.equal(json([ready.opening?.status, ready.opening?.rounds.length, ready.opening?.extraRounds, ready.opening?.winnerId]), json(["ready", 4, 1, "c1.4"]), "the extra round can still reach the gate");
});

test("a narrative form: the writer and the judge read the narratives skill with their own part and the form in the focus; a classic story's instructions stay as they were", async () => {
  const guide = { form: "character-guide" as const, anchorKind: "figure" as const, characterId: null, anchor: "A curious toad", anchorFactIds: ["f1"], progression: "From the kiosk to each animal of the trail", ending: "returns" as const };
  const guided = { ...FOCUS, values: { ...FOCUS_VALUES, narrative: guide } };
  const h = harness({ writes: [writer()], judgments: [judge("accept", "c1", { c1: 96 })], session: { focus: guided } });
  const session = await h.run();
  const [writerCall] = h.calls.filter((call) => call.role === "writer");
  const [judgeCall] = h.calls.filter((call) => call.role === "judge");
  for (const [call, role] of [[writerCall, "opening-writer"], [judgeCall, "opening-judge"]] as const) {
    const instructions = String(call.input.instructions);
    assert.ok(instructions.includes(NARRATIVES_SKILL.text), `${role} reads the narratives skill`);
    assert.ok(instructions.includes(NARRATIVES_SKILL.roleText![role]!), `${role} reads its own part`);
  }
  assert.ok(!String(writerCall.input.instructions).includes(NARRATIVES_SKILL.roleText!["opening-judge"]!), "never the judge's part");
  assert.equal(json(session.trace.filter((entry) => entry.step === "opening").map((entry) => entry.skillVersions)), json([{ hooks: "6", levers: "1", narratives: "4" }, { hooks: "6", levers: "1", narratives: "4" }]));
  const context = (writerCall.input.context ?? solContextOf(writerCall.input)) as { focus: { narrative?: unknown } };
  assert.equal(json(context.focus.narrative), json(focusTypes.narrativeForModels(guide)));
  const classic = harness({ writes: [writer()], judgments: [judge("accept", "c1", { c1: 96 })] });
  await classic.run();
  assert.ok(!String(classic.calls[0].input.instructions).includes(NARRATIVES_SKILL.text), "a classic story reads no narratives skill");
});

test("a discovery premise: the writer and the judge read the discovery skill with their own part, and the premise in the focus", async () => {
  const concept = { arc: "discovery" as const, premise: "The park's animals sent an SOS.", premiseFactIds: ["f1"], reveals: ["What is this message?", "When and where?"] };
  const h = harness({ writes: [writer()], judgments: [judge("accept", "c1", { c1: 96 })], session: { focus: { ...FOCUS, values: { ...FOCUS_VALUES, concept } } } });
  const session = await h.run();
  const [writerCall] = h.calls.filter((call) => call.role === "writer");
  const [judgeCall] = h.calls.filter((call) => call.role === "judge");
  assert.ok(String(writerCall.input.instructions).includes(DISCOVERY_SKILL.roleText!["opening-writer"]!));
  assert.ok(String(judgeCall.input.instructions).includes(DISCOVERY_SKILL.roleText!["opening-judge"]!));
  assert.equal(json(session.trace.filter((entry) => entry.step === "opening").map((entry) => entry.skillVersions)), json([{ hooks: "6", levers: "1", discovery: "1" }, { hooks: "6", levers: "1", discovery: "1" }]));
  assert.equal(json((writerCall.input.context as { focus: { concept?: unknown } }).focus.concept), json(focusTypes.conceptForModels(concept)));
});

test("a paused run whose next round is past the rounds it may have ends as its last round would have, with no call; a new run never inherits the earlier run's extra rounds", async () => {
  const h = harness({
    writes: [writer(), writer(), writer(), writer(), writer()],
    judgments: [judge("revise", "c1", { c1: 80, c2: 78 }), judge("revise", "c1.2", { "c1.2": 84 }), judge("revise", "c1.3", { "c1.3": 87 }), judge("revise", "c1.4", { "c1.4": 88 }), judge("revise", "c1.5", { "c1.5": 89 })],
  });
  const ended = await h.run();
  assert.equal(json([ended.opening?.rounds.length, ended.opening?.extraRounds]), json([5, 2]));
  // As a run that inherited an earlier run's extra round was left: paused before a round past its own plan and extra rounds.
  h.patch({ status: "needs-review", opening: { ...ended.opening!, status: "paused", resumeRound: 6, error: "Paused before round 6: this request's time is spent." } });
  const calls = h.calls.length;
  const closed = await h.run({ resume: true });
  assert.equal(h.calls.length, calls, "no provider call");
  assert.equal(json([closed.opening?.status, closed.opening?.resumeRound, closed.opening?.winnerId]), json(["needs-review", undefined, "c1.5"]));
  assert.match(String(closed.error), /^Sol did not accept an opening after 5 rounds \(2 extra\), and the best stays under 90\/100\. The best version, c1\.5, scored 89\/100/);

  const fresh = harness({
    writes: [writer(), writer(), writer()],
    judgments: [judge("revise", "c1", { c1: 91, c2: 82 }), judge("revise", "c1.2", { "c1.2": 92 }), judge("revise", "c1.3", { "c1.3": 93 })],
    session: { opening: closed.opening },
  });
  const next = await fresh.run();
  assert.equal(json([next.opening?.rounds.length, next.opening?.extraRounds ?? 0, next.opening?.status]), json([3, 0, "needs-review"]), "its own plan's three rounds, not the earlier run's two extra");
});

test("a story arc: the writer and the judge read the arcs skill with their own part, and the arc in the focus", async () => {
  const concept = { arc: "cause-effect" as const, premise: "", premiseFactIds: ["f1"], reveals: ["Videos replace binders", "Awards come in a week"] };
  const h = harness({ writes: [writer()], judgments: [judge("accept", "c1", { c1: 96 })], session: { focus: { ...FOCUS, values: { ...FOCUS_VALUES, concept } } } });
  const session = await h.run();
  const [writerCall] = h.calls.filter((call) => call.role === "writer");
  assert.ok(String(writerCall.input.instructions).includes(ARCS_SKILL.roleText!["opening-writer"]!));
  assert.ok(!String(writerCall.input.instructions).includes(DISCOVERY_SKILL.text), "no discovery skill for an arc");
  assert.equal(json(session.trace.filter((entry) => entry.step === "opening").map((entry) => entry.skillVersions)), json([{ hooks: "6", levers: "1", arcs: "1" }, { hooks: "6", levers: "1", arcs: "1" }]));
  assert.equal(json((writerCall.input.context as { focus: { concept?: unknown } }).focus.concept), json({ arc: "cause-effect", factIds: ["f1"], beats: concept.reveals }));
});
