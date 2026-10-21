import assert from "node:assert/strict";
import test from "node:test";
import * as types from "./draft2-facts.types";
import * as funnel from "./draft2-funnel";
import * as focusTypes from "./draft2-focus.types";
import * as closingTypes from "./draft2-closing.types";
import * as deckTypes from "./draft2-deck.types";
import * as models from "./draft2-models";
import * as skills from "./skills/draft2-skills";
import * as decks from "./skills/decks";
import { loadInSandbox } from "./draft2-test-sandbox";
import type { Draft2FocusValues } from "./draft2-focus.types";
import type { Draft2Opening, Draft2OpeningCandidate } from "./draft2-opening.types";
import type { Draft2Closing, Draft2ClosingCandidate } from "./draft2-closing.types";
import type { Draft2Deck, Draft2DeckCandidate, Draft2DeckScore } from "./draft2-deck.types";

const topicId = "11111111-1111-4111-8111-111111111111";
const storyId = "22222222-2222-4222-8222-222222222222";
const sessionId = "33333333-3333-4333-8333-333333333333";

const facts: types.Draft2Fact[] = [
  { id: "f1", claim: "The program reviews product videos no longer than five minutes.", evidence: "videos \"no longer than five minutes\"", kind: "event", status: "established", importance: 90 },
  { id: "f2", claim: "A DOD official says awards took less than a week.", evidence: "awards took less than a week", kind: "event", status: "attributed", attribution: "A DOD official", importance: 80 },
  { id: "f3", claim: "Startups can apply without a past contract.", evidence: "without a past contract", kind: "event", status: "established", importance: 70 },
  { id: "f4", claim: "Reviewers score the videos on usefulness and readiness.", evidence: "score the videos on usefulness and readiness", kind: "event", status: "established", importance: 60 },
];
const VALUES: Draft2FocusValues = {
  line: null, audience: "Founders who sell software to the Pentagon", framing: "explainer", readerConsequence: null,
  structure: { kind: "arc", itemFactIds: [] }, goal: "followers",
  voice: { gravity: "ordinary", formality: 30, humor: 40, energy: 70, optimism: 60, provocation: 60 },
  direction: "Lead with the video; pay it with the award time.",
};
const openingCandidate = (id: string, headline: string): Draft2OpeningCandidate => ({
  id, angle: "Speed over paperwork",
  cover: { headline, subheadline: "Product demos replace months of paperwork in a new buying program.", factIds: ["f1"] },
  slide2: { headline: "Awards in under a week", body: "A DOD official says awards took less than a week in several instances.", factIds: ["f2"] },
});
const OPENING: Draft2Opening = {
  status: "ready", winnerId: "c1", candidates: [openingCandidate("c1", "Your demo video is now the bid")],
  rounds: [{ round: 1, candidates: [openingCandidate("c1", "Your demo video is now the bid")], mechanical: [], at: "t" }], focus: { version: 2, values: VALUES },
};
const closingCandidate = (id: string): Draft2ClosingCandidate => ({
  id, angle: "Show, don't file",
  penultimate: { headline: "The binder is optional now", body: "Startups can apply without a past contract, and a working product does the talking.", factIds: ["f3"] },
  last: { headline: "Build the demo first", body: "If you sell software to government, a short video can open the door.", cta: "Follow us for every buying change.", factIds: ["f1"] },
});
const CLOSING: Draft2Closing = {
  status: "ready", winnerId: "c2", candidates: [closingCandidate("c1"), closingCandidate("c2")],
  rounds: [{ round: 1, candidates: [closingCandidate("c1"), closingCandidate("c2")], mechanical: [], at: "t" }],
  opening: { id: "c1", cover: OPENING.candidates[0].cover, slide2: OPENING.candidates[0].slide2 }, focus: { version: 2, values: VALUES }, shape: "two-slides",
};
const profile = { name: "Example Daily", language: "English", region: "Austin", platform: "Instagram", audience: "Founders", brandPersonality: ["direct"], formality: 30, humor: 40, energy: 70, optimism: 60, provocation: 60, allowEmojis: true, maxEmojis: 2 };

const PATHS = ["Five minutes is the whole pitch", "Reviewers grade what works", "Readiness beats paperwork", "The clock starts at the video"];
/** A clean arc deck under a first headline: two slides that move from the pitch to how it is graded. */
const deck = (id: string, headline: string): Draft2DeckCandidate => ({
  id, angle: "From the pitch to the grade",
  slides: [
    { headline, body: "Reviewers watch a product video no longer than five minutes instead of reading a proposal.", practical: "", factIds: ["f1"] },
    { headline: "Graded on what it does", body: "They score each video on how useful it is and how ready it is to field.", practical: "", factIds: ["f4"] },
  ],
});
type WriterContents = { task: string; candidatesWanted?: number; decks?: { id: string }[]; develop?: { id: string }[] };
type JudgeContents = { round: number; candidates: { id: string }[]; proposalsWanted?: number };
const writer = () => (contents: WriterContents) => contents.task === "revise"
  ? { candidates: [
    ...(contents.decks ?? []).map((target, index) => deck(target.id, `${PATHS[index]}, sharper`)),
    ...(contents.develop ?? []).map((proposal) => deck(proposal.id, "An edited path through the review")),
  ] }
  : { candidates: PATHS.slice(0, contents.candidatesWanted).map((headline, index) => deck(`c${index + 1}`, headline)) };
const score = (candidateId: string, overall: number): Draft2DeckScore =>
  ({ candidateId, flow: overall, coverage: overall, pacing: overall, clarity: overall, grounding: overall, voice: overall, focus: overall, originality: overall, overall, note: "Why." });
const judge = (verdict: "accept" | "revise", winnerId: string, overall: Record<string, number>) => (contents: JudgeContents) => ({
  verdict, winnerId, summary: `${verdict} ${winnerId}.`, issues: [], suggestions: [],
  scores: contents.candidates.map((candidate) => score(candidate.id, overall[candidate.id] ?? 70)),
  proposals: contents.proposalsWanted ? [deck("p1", "Sol's path through the review")] : [],
});

type Call = { provider: string; role: "writer" | "judge"; input: Record<string, unknown> };
type Row = Record<string, unknown> & { deck: Draft2Deck | null; trace: types.Draft2TraceEntry[] };

function harness({ writes, judgments, session }: { writes: ((contents: WriterContents) => unknown)[]; judgments: ((contents: JudgeContents) => unknown)[]; session?: Record<string, unknown> }) {
  const calls: Call[] = [];
  let row: Row = { id: sessionId, topicId, storyId, step: "closing", status: "ready", facts, evaluation: null, rounds: [], focus: null, opening: OPENING, closing: CLOSING, deck: null, error: null, threads: {}, trace: [], ...session };
  let write = 0;
  let judgment = 0;
  const usage = { promptTokens: 100, outputTokens: 50, thoughtsTokens: 0, totalTokens: 150 };
  const answer = (provider: string, input: Record<string, unknown>) => {
    // The fix pass: the flagged candidates come back as they are (this harness fixes nothing), and the call stays out of the scripted ones.
    if (String(input.schemaName).endsWith("_fix")) return { text: JSON.stringify({ candidates: (input.contents as Record<string, unknown[]>).decks ?? [] }), provider, model: input.model, usage };
    const role = input.schemaName === "draft2_deck" ? "writer" : "judge";
    calls.push({ provider, role, input });
    const text = role === "writer" ? writes[write++](input.contents as WriterContents) : judgments[judgment++](input.contents as JudgeContents);
    return { text: JSON.stringify(text), provider, model: input.model, usage };
  };
  const mocks: Record<string, unknown> = {
    "server-only": {},
    "./draft2-facts.types": types,
    "./draft2-funnel": funnel,
    "./draft2-focus.types": focusTypes,
    "./draft2-closing.types": closingTypes,
    "./draft2-deck.types": deckTypes,
    "./draft2-models": models,
    "./skills/draft2-skills": skills,
    "./skills/decks": decks,
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
  const exports = loadInSandbox("./draft2-deck.ts", mocks, { Date, process: { env: { OPENAI_API_KEY: "sk-test" } } }) as Record<string, (...args: unknown[]) => Promise<Row>>;
  return {
    run: () => exports.runDraft2Deck({ topicId, storyId, sessionId }),
    choose: (candidateId: string) => exports.recordDeckChoice({ topicId, sessionId, candidateId }),
    calls,
    judgeCalls: () => calls.filter((call) => call.role === "judge").map((call) => call.input.contents as JudgeContents),
    row: () => row,
  };
}

const json = (value: unknown) => JSON.stringify(value);

test("Claude writes the deck between the chosen opening and closing, and Sol judges it; both read the focus, both ends and the shape where their provider caches them", async () => {
  const h = harness({ writes: [writer()], judgments: [judge("accept", "c2", { c2: 96 })] });
  const session = await h.run();
  const [claude, sol] = h.calls;
  assert.equal(json(claude.input.context), json({
    focus: focusTypes.focusForModels(VALUES), opening: closingTypes.openingForClosing(CLOSING.opening!), closing: deckTypes.closingForDeck(closingCandidate("c2")),
    deck: { kind: "arc", slides: "1 to 5" }, emojis: 2, verifiedFacts: funnel.factsSnapshot(facts),
  }), "the closing the editor would see (the judge's winner, c2), and the opening it ends");
  assert.equal(json([(claude.input.contents as WriterContents).candidatesWanted, claude.input.effort, (sol.input.contents as JudgeContents).proposalsWanted, sol.input.reasoningEffort]), json([4, "medium", 1, "medium"]));
  assert.ok(String(claude.input.instructions).includes(decks.DECKS_SKILL.text));
  assert.equal(json(session.trace.map((entry) => [entry.step, entry.operation, entry.skillVersions])), json([["deck", "draft2_deck", { decks: "5", fairness: "2", reader: "3" }], ["deck", "draft2_deck_review", { decks: "5", fairness: "2", reader: "3" }]]));
  assert.equal(json([session.step, session.status, session.deck?.winnerId, session.deck?.opening?.id, session.deck?.closing?.id, session.deck?.shape?.kind]), json(["deck", "ready", "c2", "c1", "c2", "arc"]));
});

test("an arc: four decks, then the two best revised beside Sol's deck as written and edited, for Sol's pick", async () => {
  const h = harness({ writes: [writer(), writer()], judgments: [judge("revise", "c2", { c2: 88, c3: 85 }), judge("revise", "c5", { "c2.2": 89, "c3.2": 86, c5: 91, c6: 90 })] });
  const session = await h.run();
  assert.equal(json(h.judgeCalls().map((contents) => contents.candidates.map((candidate) => candidate.id))), json([["c1", "c2", "c3", "c4"], ["c2.2", "c3.2", "c5", "c6"]]));
  assert.equal(json(session.deck?.rounds[1].candidates.map((candidate) => [candidate.id, candidate.proposalOf ?? null, candidate.asProposed ?? false])), json([["c2.2", null, false], ["c3.2", null, false], ["c5", "p1", false], ["c6", "p1", true]]));
  assert.equal(json(h.calls.map((call) => call.input.effort ?? call.input.reasoningEffort)), json(["medium", "medium", "high", "medium"]));
  assert.match(String(session.error), /^Sol did not accept a deck after 2 rounds\. The best version, c5, scored 91\/100[^]*Choose a deck below or write it again\./);
});

test("a list: two decks carrying the items slide 2 did not cover, then the best revised beside Sol's deck", async () => {
  const list: Draft2FocusValues = { ...VALUES, structure: { kind: "list", itemFactIds: ["f2", "f1", "f4"] } };
  const closingFor = { ...CLOSING, focus: { version: 2, values: list } };
  const items = (id: string) => ({ id, angle: "Item by item", slides: [
    { headline: "Pitch in five minutes", body: "A short product video replaces the proposal.", practical: "", factIds: ["f1"] },
    { headline: "Get graded on readiness", body: "Reviewers score usefulness and readiness.", practical: "", factIds: ["f4"] },
  ] });
  const listWriter = (contents: WriterContents) => contents.task === "revise"
    // The best deck revised, and Sol's deck edited back to the plain first item.
    ? { candidates: [...(contents.decks ?? []).map((target) => ({ ...items(target.id), angle: "Sharper" })), ...(contents.develop ?? []).map((proposal) => ({ ...items(proposal.id), angle: "Edited" }))] }
    : { candidates: [items("c1"), { ...items("c2"), slides: [{ ...items("c2").slides[0], headline: "Five minutes, one video" }, items("c2").slides[1]] }] };
  // Scores at the floor the funnel works to: this test is about the list's shape, not about extra rounds.
  const listJudge = (contents: JudgeContents) => ({ verdict: "revise", winnerId: contents.candidates[0].id, summary: "x", issues: [], suggestions: [], scores: contents.candidates.map((candidate) => score(candidate.id, 90)), proposals: contents.proposalsWanted ? [{ ...items("p1"), slides: [{ ...items("p1").slides[0], headline: "Sol's first item" }, items("p1").slides[1]] }] : [] });
  const h = harness({ writes: [listWriter, listWriter], judgments: [listJudge, listJudge], session: { closing: closingFor } });
  const session = await h.run();
  assert.equal(json(session.deck?.shape), json({ kind: "list", min: 2, max: 2, items: ["f1", "f4"] }), "slide 2 carried f2's item");
  assert.equal(json(h.judgeCalls().map((contents) => contents.candidates.length)), json([2, 3]), "two decks; then the best revised beside Sol's deck as written and as edited");
  assert.deepEqual(session.deck?.rounds[0].mechanical, [], "each item on its own slide, in order");
});

test("the deck waits for a finished closing the editor can lead to, ending the opening chosen now", async () => {
  const refused = (session: Record<string, unknown>, pattern: RegExp) => assert.rejects(harness({ writes: [], judgments: [], session }).run(), (error: Error) => error instanceof types.Draft2InputError && pattern.test(error.message));
  await refused({ closing: null }, /Finish the closing first/);
  await refused({ closing: { ...CLOSING, status: "running" } }, /Finish the closing first/);
  await refused({ closing: { ...CLOSING, winnerId: undefined } }, /Choose a closing first/);
  await refused({ closing: { ...CLOSING, opening: undefined } }, /does not record the opening it ends/);
  await refused({ opening: { ...OPENING, editorChoiceId: "c9" } }, /The closing ends c1, and the opening chosen now is c9\. Write the closing again first\./);
});

test("the editor can choose any deck of the run", async () => {
  const h = harness({ writes: [writer()], judgments: [judge("accept", "c1", { c1: 96 })] });
  await h.run();
  assert.equal((await h.choose("c3")).deck?.editorChoiceId, "c3");
  await assert.rejects(h.choose("c99"), /c99 is not one of this deck's versions/);
});
