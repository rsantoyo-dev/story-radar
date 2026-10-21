import assert from "node:assert/strict";
import test from "node:test";
import * as types from "./draft2-facts.types";
import * as funnel from "./draft2-funnel";
import * as focusTypes from "./draft2-focus.types";
import * as openingTypes from "./draft2-opening.types";
import * as closingTypes from "./draft2-closing.types";
import * as models from "./draft2-models";
import * as skills from "./skills/draft2-skills";
import * as closings from "./skills/closings";
import { loadInSandbox } from "./draft2-test-sandbox";
import type { Draft2Focus, Draft2FocusValues } from "./draft2-focus.types";
import type { Draft2Opening, Draft2OpeningCandidate } from "./draft2-opening.types";
import type { Draft2Closing, Draft2ClosingCandidate, Draft2ClosingScore } from "./draft2-closing.types";

const topicId = "11111111-1111-4111-8111-111111111111";
const storyId = "22222222-2222-4222-8222-222222222222";
const sessionId = "33333333-3333-4333-8333-333333333333";

const facts: types.Draft2Fact[] = [
  { id: "f1", claim: "The program reviews product videos no longer than five minutes.", evidence: "videos \"no longer than five minutes\"", kind: "event", status: "established", importance: 90 },
  { id: "f2", claim: "A DOD official says awards took less than a week in several instances.", evidence: "awards took less than a week in several instances", kind: "event", status: "attributed", attribution: "A DOD official", importance: 80 },
  { id: "f3", claim: "Startups can apply without a past contract.", evidence: "without a past contract", kind: "event", status: "established", importance: 70 },
];
const VALUES: Draft2FocusValues = {
  line: { id: "55555555-5555-4555-8555-555555555555", revision: 2, name: "Actualidad", objective: "Defence AI news for founders." },
  audience: "Founders who sell software to the Pentagon",
  framing: "reader-consequence",
  readerConsequence: { text: "A short product video can now open a Pentagon contract.", factIds: ["f1", "f2"] },
  structure: { kind: "arc", itemFactIds: [] },
  goal: "followers",
  voice: { gravity: "ordinary", formality: 30, humor: 40, energy: 70, optimism: 60, provocation: 60 },
  direction: "Lead with the five-minute video; pay it with the award time.",
};
const FOCUS: Draft2Focus = { status: "ready", version: 3, values: VALUES, ai: VALUES, reasons: {}, edited: [], lineOptions: [VALUES.line!] };
const openingCandidate = (id: string, headline: string): Draft2OpeningCandidate => ({
  id, angle: "Speed over paperwork",
  cover: { headline, subheadline: "Product demos replace months of paperwork in a new buying program.", factIds: ["f1"] },
  slide2: { headline: "Awards in under a week", body: "A DOD official says awards took less than a week in several instances.", factIds: ["f2"] },
});
const OPENING: Draft2Opening = {
  status: "ready", winnerId: "c1", candidates: [openingCandidate("c1", "Your demo video is now the bid"), openingCandidate("c2", "Five minutes to pitch the Pentagon")],
  rounds: [{ round: 1, candidates: [openingCandidate("c1", "Your demo video is now the bid"), openingCandidate("c2", "Five minutes to pitch the Pentagon")], mechanical: [], at: "t" }],
  focus: { version: 2, values: VALUES },
};
const profile = {
  name: "Example Daily", language: "English", region: "Austin", platform: "Instagram", audience: "Founders who sell to government", brandPersonality: ["direct"],
  formality: 30, humor: 40, energy: 70, optimism: 60, provocation: 60, callToActionStyle: "Friendly and useful. Example: Follow Example Daily for every buying change.", allowEmojis: true, maxEmojis: 2,
};

const ENDINGS = ["The binder is optional now", "Proof beats paperwork", "The demo is the application", "Show it, then sign it", "A week, not a year", "Your product talks first", "The shortcut has a door", "Five minutes, one shot"];
/** A clean two-slide closing (one-slide when `shape` says so) under a headline. */
const closing = (id: string, headline: string, shape: "two-slides" | "one-slide" = "two-slides", cta = "Follow us for every buying change that opens a door."): Draft2ClosingCandidate => ({
  id, angle: "Show, don't file",
  ...(shape === "two-slides" ? { penultimate: { headline, body: "Startups can apply without a past contract, and a working product does the talking.", factIds: ["f3"] } } : {}),
  last: { headline: shape === "two-slides" ? "Build the demo first" : headline, body: "If you sell software to government, a short video can open the door.", cta, factIds: ["f1"] },
});

type WriterContents = { task: string; candidatesWanted?: number; closings?: { id: string }[]; develop?: { id: string }[] };
type JudgeContents = { round: number; candidates: { id: string; revises?: string }[]; proposalsWanted?: number };

const writer = (shape: "two-slides" | "one-slide" = "two-slides", cta?: string) => (contents: WriterContents) => contents.task === "revise"
  ? { candidates: [
    ...(contents.closings ?? []).map((target) => ({ ...closing(target.id, `${ENDINGS[0]}, sharper`, shape, cta), id: target.id })),
    // An edit that changes the proposal's penultimate headline (an unchanged one would be dropped).
    ...(contents.develop ?? []).map((proposal, index) => ({ ...closing(proposal.id, `An edited ending, take ${["one", "two"][index]}`, shape, cta), id: proposal.id })),
  ] }
  : { candidates: ENDINGS.slice(0, contents.candidatesWanted).map((headline, index) => closing(`c${index + 1}`, headline, shape, cta)) };

const score = (candidateId: string, overall: number, overrides: Partial<Draft2ClosingScore> = {}): Draft2ClosingScore =>
  ({ candidateId, resolution: overall, meaning: overall, action: overall, continuity: overall, grounding: overall, voice: overall, focus: overall, originality: overall, overall, note: "Why.", ...overrides });
const judge = (verdict: "accept" | "revise", winnerId: string, overall: Record<string, number>, shape: "two-slides" | "one-slide" = "two-slides") => (contents: JudgeContents) => ({
  verdict, winnerId, summary: `${verdict} ${winnerId}.`, issues: [], suggestions: [],
  scores: contents.candidates.map((candidate) => score(candidate.id, overall[candidate.id] ?? 70)),
  proposals: contents.proposalsWanted ? [closing("p1", "Sol's first ending", shape), closing("p2", "Sol's second ending", shape)].slice(0, contents.proposalsWanted) : [],
});

type Call = { provider: string; role: "writer" | "judge"; input: Record<string, unknown> };
type Row = Record<string, unknown> & { opening: Draft2Opening | null; closing: Draft2Closing | null; focus: Draft2Focus | null; trace: types.Draft2TraceEntry[] };

function harness({ writes, judgments, session, secondsPerCall }: { writes: ((contents: WriterContents) => unknown)[]; judgments: ((contents: JudgeContents) => unknown)[]; session?: Record<string, unknown>; secondsPerCall?: number }) {
  const calls: Call[] = [];
  let row: Row = {
    id: sessionId, topicId, storyId, step: "opening", status: "ready", facts, evaluation: null, rounds: [], focus: FOCUS, opening: OPENING, closing: null, error: null, threads: {},
    trace: [], ...session,
  };
  let write = 0;
  let judgment = 0;
  let clock = Date.now();
  class FakeDate extends Date { static now() { return clock; } }
  const usage = { promptTokens: 100, outputTokens: 50, thoughtsTokens: 0, totalTokens: 150 };
  const answer = (provider: string, input: Record<string, unknown>) => {
    // The fix pass: the flagged candidates come back as they are (this harness fixes nothing), and the call stays out of the scripted ones.
    if (String(input.schemaName).endsWith("_fix")) return { text: JSON.stringify({ candidates: (input.contents as Record<string, unknown[]>).closings ?? [] }), provider, model: input.model, usage };
    const role = input.schemaName === "draft2_closing" ? "writer" : "judge";
    calls.push({ provider, role, input });
    clock += (secondsPerCall ?? 0) * 1_000;
    const text = role === "writer" ? writes[write++](input.contents as WriterContents) : judgments[judgment++](input.contents as JudgeContents);
    return { text: JSON.stringify(text), provider, model: input.model, usage };
  };
  const mocks: Record<string, unknown> = {
    "server-only": {},
    "./draft2-facts.types": types,
    "./draft2-funnel": funnel,
    "./draft2-focus.types": focusTypes,
    "./draft2-opening.types": openingTypes,
    "./draft2-closing.types": closingTypes,
    "./draft2-models": models,
    "./skills/draft2-skills": skills,
    "./skills/closings": closings,
    "./draft2-dev-trace": { draft2DevTrace: () => undefined },
    "../stories/creative-text-meter": { withCreativeTextBudget: async (_context: unknown, work: () => Promise<unknown>) => work() },
    "../stories/anthropic.config": { getAnthropicRuntimeConfig: () => ({ apiKey: "k", model: "claude-sonnet-5-5" }), requireAnthropicApiKey: () => "k" },
    "../stories/creative-profile.repository": { getCreativeProfile: async () => profile },
    "../stories/openai-structured-response": { generateOpenAiStructuredResponse: async (input: Record<string, unknown>) => ({ ...answer("openai", input), cachedInputTokens: 900 }) },
    "../stories/anthropic-structured-response": { generateAnthropicStructuredResponse: async (input: Record<string, unknown>) => ({ ...answer("anthropic", input), cachedInputTokens: 0 }) },
    "./draft2-session.repository": {
      activeDraft2Session: async () => undefined,
      getDraft2Session: async (topic: string, id: string) => topic === topicId && id === row.id ? row : undefined,
      claimDraft2Session: async (_id: string, patch: Record<string, unknown>) => { row = { ...row, ...patch, status: "running" }; return row; },
      updateDraft2Session: async (_id: string, patch: Record<string, unknown>) => { row = { ...row, ...patch }; return row; },
      touchDraft2Session: async () => undefined,
    },
  };
  const exports = loadInSandbox("./draft2-closing.ts", mocks, { Date: secondsPerCall ? FakeDate : Date, process: { env: { OPENAI_API_KEY: "sk-test" } } }) as Record<string, (...args: unknown[]) => Promise<Row>>;
  return {
    run: (options: { resume?: boolean } = {}) => exports.runDraft2Closing({ topicId, storyId, sessionId, ...options }),
    choose: (candidateId: string) => exports.recordClosingChoice({ topicId, sessionId, candidateId }),
    calls,
    writerCalls: () => calls.filter((call) => call.role === "writer").map((call) => call.input.contents as WriterContents),
    judgeCalls: () => calls.filter((call) => call.role === "judge").map((call) => call.input.contents as JudgeContents),
    row: () => row,
  };
}

const json = (value: unknown) => JSON.stringify(value);

test("Claude writes the ending of the chosen opening and Sol judges it; both read the opening's focus, the opening and the shape where their provider caches them", async () => {
  const h = harness({ writes: [writer()], judgments: [judge("accept", "c3", { c3: 96 })] });
  const session = await h.run();
  assert.equal(h.calls.map((call) => `${call.role}:${call.provider}`).join(","), "writer:anthropic,judge:openai");
  const [claude, sol] = h.calls;
  const context = { focus: focusTypes.focusForModels(VALUES), opening: closingTypes.openingForClosing(openingCandidate("c1", "Your demo video is now the bid")), shape: "two-slides" };
  assert.equal(json(claude.input.context), json({ ...context, verifiedFacts: openingTypes.openingFactsSnapshot(facts) }), "the focus the opening followed, the opening and the shape, cached before the facts");
  // Sol's stable prefix: the step's context and the facts at the tail of its instructions, the same on every call; the round's request alone in its input.
  assert.match(String(sol.input.instructions), /# Context\nThe same on every call of this run[^]*\{"focus":[^]*"opening":[^]*"shape":[^]*"verifiedFacts":/);
  assert.deepEqual(Object.keys(sol.input.contents as object).slice(0, 2), ["task", "round"]);
  assert.equal((claude.input.contents as WriterContents).candidatesWanted, 8);
  assert.equal((sol.input.contents as JudgeContents).proposalsWanted, 2);
  assert.ok(String(claude.input.instructions).includes(closings.CLOSINGS_SKILL.text));
  assert.match(String(claude.input.instructions), /# The publication\n[^]*# Calls to action\n- The publication's style[^]*Follow Example Daily for every buying change\.\n- Emojis: at most 2 in the whole closing\./, "the call-to-action style follows the brand brief");
  assert.equal(json(session.trace.map((entry) => [entry.step, entry.operation, entry.skillVersions])), json([["closing", "draft2_closing", { closings: "4", fairness: "2", reader: "3" }], ["closing", "draft2_closing_review", { closings: "4", fairness: "2", reader: "3" }]]));
  assert.equal(json([session.step, session.status, session.closing?.status, session.closing?.winnerId]), json(["closing", "ready", "ready", "c3"]));
  assert.equal(json([session.closing?.opening?.id, session.closing?.focus?.version, session.closing?.shape]), json(["c1", 2, "two-slides"]), "the run records what it ends and follows: the opening's focus (v2), not the session's (v3)");
  assert.equal(json(session.opening), json(OPENING), "the opening is left as it was");
});

test("two rounds: eight closings, then the two best revised beside the judge's two proposals as written and edited, for the judge's pick", async () => {
  const h = harness({
    writes: [writer(), writer()],
    judgments: [judge("revise", "c2", { c2: 88, c5: 84 }), judge("revise", "c9", { "c2.2": 86, "c5.2": 85, c9: 91, c10: 90, c11: 89, c12: 87 })],
  });
  const session = await h.run();
  const [, second] = h.writerCalls();
  assert.equal(json([second.task, second.closings?.map((target) => target.id), second.develop?.map((proposal) => proposal.id)]), json(["revise", ["c2", "c5"], ["p1", "p2"]]));
  const judged = h.judgeCalls();
  assert.equal(json(judged.map((contents) => contents.candidates.length)), json([8, 6]), "8, then 2 revised + 2 edits + 2 originals");
  assert.equal(json(judged.map((contents) => contents.proposalsWanted ?? 0)), json([2, 0]));
  assert.equal(json(session.closing?.rounds[1].candidates.map((candidate) => [candidate.id, candidate.revisionOf ?? null, candidate.proposalOf ?? null, candidate.asProposed ?? false])), json([
    ["c2.2", "c2", null, false], ["c5.2", "c5", null, false], ["c9", null, "p1", false], ["c10", null, "p2", false], ["c11", null, "p1", true], ["c12", null, "p2", true],
  ]));
  assert.equal(json([session.status, session.closing?.winnerId]), json(["needs-review", "c9"]));
  assert.match(String(session.error), /^Sol did not accept a closing after 2 rounds\. The best version, c9, scored 91\/100[^]*Choose a closing below or write it again\./);
});

test("the closing ends the editor's choice over the judge's winner", async () => {
  const h = harness({ writes: [writer()], judgments: [judge("accept", "c1", { c1: 96 })], session: { opening: { ...OPENING, editorChoiceId: "c2" } } });
  const session = await h.run();
  assert.equal((h.calls[0].input.context as { opening: { cover: { headline: string } } }).opening.cover.headline, "Five minutes to pitch the Pentagon");
  assert.equal(session.closing?.opening?.id, "c2");
});

test("a list or steps focus ends on one slide: no penultimate, room for the plan, the count as a stated number", async () => {
  const list: Draft2FocusValues = { ...VALUES, structure: { kind: "list", itemFactIds: ["f1", "f2", "f3"] } };
  const h = harness({ writes: [writer("one-slide")], judgments: [judge("accept", "c1", { c1: 96 }, "one-slide")], session: { opening: { ...OPENING, focus: { version: 2, values: list } } } });
  const session = await h.run();
  const schema = h.calls[0].input.schema as { properties: { candidates: { items: { required: string[] } } } };
  assert.deepEqual(schema.properties.candidates.items.required, ["id", "last", "angle"]);
  assert.equal((h.calls[0].input.context as { shape: string }).shape, "one-slide");
  assert.equal(session.closing?.shape, "one-slide");
  assert.equal("penultimate" in (session.closing?.candidates[0] ?? {}), false);
});

test("a grave story may end without a call to action; any other story may not", async () => {
  const grave: Draft2FocusValues = { ...VALUES, voice: { ...VALUES.voice, gravity: "grave", humor: 1 } };
  const quiet = harness({ writes: [writer("two-slides", "")], judgments: [judge("accept", "c1", { c1: 96 })], session: { opening: { ...OPENING, focus: { version: 2, values: grave } } } });
  assert.equal((await quiet.run()).closing?.winnerId, "c1");
  assert.deepEqual(quiet.row().closing?.rounds[0].mechanical, []);
  // An ordinary story's closings without one cannot win: the next round sets the judge's proposals, as written and edited, in their place.
  const ordinary = harness({ writes: [writer("two-slides", ""), writer()], judgments: [judge("accept", "c1", { c1: 96 }), judge("accept", "c9", { c9: 96 })] });
  const session = await ordinary.run();
  assert.ok(session.closing?.rounds[0].mechanical.every((issue) => issue.code === "CTA_MISSING"), "every first-round closing lacks its call to action");
  assert.equal(session.closing?.rounds[0].mechanical.length, 8);
  assert.equal(json([session.closing?.status, session.closing?.winnerId]), json(["ready", "c9"]), "the edit of the judge's first proposal, with its call to action, wins");
});

test("the closing waits for a finished opening the editor can end, written with a focus", async () => {
  const refused = (session: Record<string, unknown>, pattern: RegExp) => assert.rejects(harness({ writes: [], judgments: [], session }).run(), (error: Error) => error instanceof types.Draft2InputError && pattern.test(error.message));
  await refused({ opening: null }, /Finish the opening first/);
  await refused({ opening: { ...OPENING, status: "running" } }, /Finish the opening first/);
  await refused({ opening: { ...OPENING, status: "paused", resumeRound: 2 } }, /Finish the opening first/);
  await refused({ opening: { ...OPENING, winnerId: undefined } }, /Choose an opening first/);
  await refused({ opening: { ...OPENING, focus: undefined } }, /written before the Focus step/);
  await refused({ step: "facts", status: "needs-review" }, /verified facts/);
});

test("a round the request has no time for pauses the run; a continue request runs it on", async () => {
  // 80 s a call: round 1 takes 160 s, so round 2 (another 160 s) waits; the continued request writes (80 s) and expects a high judgment of 1.5x the medium one (120 s), which fits.
  const h = harness({ writes: [writer(), writer()], judgments: [judge("revise", "c2", { c2: 88, c5: 84 }), judge("accept", "c9", { c9: 96 })], secondsPerCall: 80 });
  const paused = await h.run();
  assert.equal(json([paused.closing?.status, paused.closing?.resumeRound, h.calls.length]), json(["paused", 2, 2]));
  const finished = await h.run({ resume: true });
  assert.equal(json([finished.closing?.status, finished.closing?.winnerId, h.calls.length]), json(["ready", "c9", 4]));
  assert.equal(finished.closing?.opening?.id, "c1", "the continued run ends the opening it started with");
});

test("the editor can choose any closing of the run; a rerun keeps the earlier run and its choice", async () => {
  const h = harness({ writes: [writer(), writer()], judgments: [judge("accept", "c1", { c1: 96 }), judge("accept", "c4", { c4: 97 })] });
  await h.run();
  assert.equal((await h.choose("c3")).closing?.editorChoiceId, "c3");
  await assert.rejects(h.choose("c99"), /c99 is not one of this closing's versions/);
  const rerun = await h.run();
  assert.equal(rerun.closing?.winnerId, "c4");
  assert.equal(json(rerun.closing?.previousRuns?.map((run) => [run.winnerId, run.editorChoiceId, run.opening?.id])), json([["c1", "c3", "c1"]]));
});
