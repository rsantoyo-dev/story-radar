import assert from "node:assert/strict";
import test from "node:test";
import * as types from "./draft2-facts.types";
import * as funnel from "./draft2-funnel";
import * as focusTypes from "./draft2-focus.types";
import * as inventoryTypes from "./draft2-inventory.types";
import * as visualTypes from "./draft2-visual.types";
import * as models from "./draft2-models";
import * as skills from "./skills/draft2-skills";
import * as visuals from "./skills/visuals";
import { loadInSandbox } from "./draft2-test-sandbox";
import type { Draft2FocusValues } from "./draft2-focus.types";
import type { Draft2Opening, Draft2OpeningCandidate } from "./draft2-opening.types";
import type { Draft2Closing, Draft2ClosingCandidate } from "./draft2-closing.types";
import type { Draft2Deck, Draft2DeckCandidate } from "./draft2-deck.types";
import type { Draft2Inventory } from "./draft2-inventory.types";
import type { Draft2CarouselSlide, Draft2Visual, Draft2VisualCandidate, Draft2VisualScore } from "./draft2-visual.types";

const topicId = "11111111-1111-4111-8111-111111111111";
const storyId = "22222222-2222-4222-8222-222222222222";
const sessionId = "33333333-3333-4333-8333-333333333333";

const facts: types.Draft2Fact[] = [
  { id: "f1", claim: "The new library opens Saturday.", evidence: "The new library opens Saturday", kind: "event", status: "established", importance: 90 },
  { id: "f2", claim: "The reading room has tall windows and long tables.", evidence: "tall windows and long tables", kind: "event", status: "established", importance: 70 },
  { id: "f3", claim: "The children's corner has low shelves.", evidence: "low shelves", kind: "event", status: "established", importance: 60 },
];
const VALUES: Draft2FocusValues = {
  line: null, audience: "Families in the neighbourhood", framing: "explainer", readerConsequence: null, structure: { kind: "arc", itemFactIds: [] }, goal: "followers",
  voice: { gravity: "light", formality: 30, humor: 50, energy: 60, optimism: 70, provocation: 20 }, direction: "Lead with the Saturday opening.",
};
const opening: Draft2OpeningCandidate = { id: "c1", angle: "Saturday",
  cover: { headline: "Your library opens Saturday", subheadline: "A new reading room for the whole family.", factIds: ["f1"] },
  slide2: { headline: "Built for reading", body: "Tall windows and long tables fill the hall.", factIds: ["f2"] } };
const OPENING: Draft2Opening = { status: "ready", winnerId: "c1", candidates: [opening], rounds: [{ round: 1, candidates: [opening], mechanical: [], at: "t" }], focus: { version: 2, values: VALUES } };
const closingCandidate: Draft2ClosingCandidate = { id: "c2", angle: "See you there",
  penultimate: { headline: "Room for the youngest", body: "Low shelves wait in the children's corner.", factIds: ["f3"] },
  last: { headline: "See you Saturday", body: "Bring the kids to the new reading room.", cta: "Follow us for what opens near you.", factIds: ["f1"] } };
const CLOSING: Draft2Closing = { status: "ready", winnerId: "c2", candidates: [closingCandidate], rounds: [{ round: 1, candidates: [closingCandidate], mechanical: [], at: "t" }], opening: { id: "c1", cover: opening.cover, slide2: opening.slide2 }, focus: { version: 2, values: VALUES }, shape: "two-slides" };
const deckSlides = (count: number) => Array.from({ length: count }, (_, index) => ({ headline: `Deck slide ${["one", "two", "three", "four", "five", "six", "seven", "eight", "nine"][index]}`, body: "Tall windows and long tables fill the hall.", practical: "", factIds: ["f2"] }));
const deckCandidate = (count = 2): Draft2DeckCandidate => ({ id: "c3", angle: "Room by room", slides: deckSlides(count) });
const deckRun = (count = 2): Draft2Deck => ({
  status: "ready", winnerId: "c3", candidates: [deckCandidate(count)], rounds: [{ round: 1, candidates: [deckCandidate(count)], mechanical: [], at: "t" }],
  opening: CLOSING.opening, closing: { id: "c2", penultimate: closingCandidate.penultimate, last: closingCandidate.last }, focus: { version: 2, values: VALUES },
  shape: { kind: "arc", min: 2, max: 5, items: [] },
});
const INVENTORY: Draft2Inventory = {
  status: "ready", version: 4, characters: "auto", storyPhotos: [], roster: [{ id: "char-mia", name: "Mia", description: "An illustrated presenter in a mustard coat" }],
  entities: [{ id: "e1", name: "Pomerleau", kind: "organization", role: "mentioned", description: "The builder", factIds: ["f2"] }],
};
const profile = {
  name: "Salut Longueuil", language: "French", region: "Longueuil", platform: "Instagram", audience: "Residents", brandPersonality: ["warm"], formality: 30, humor: 40, energy: 60, optimism: 60, provocation: 30,
  visualFidelityMode: "illustration-editorial", creativeIdentity: { avoid: [{ category: "Marks", items: ["Polaroid"] }] }, visualGuidance: "",
};

type Contents = { task: string; candidatesWanted?: number; scripts?: { id: string }[]; develop?: { id: string }[]; round?: number; candidates?: { id: string }[]; proposalsWanted?: number };
/** A clean script for the carousel the context carries, under a concept. */
const script = (id: string, concept: string, carousel: Draft2CarouselSlide[]): Draft2VisualCandidate => ({
  id, angle: concept, concept, motif: "A library card that gains a stamp on every slide.", cast: "Anonymous readers seen from behind.",
  characterPlan: { use: false, characterIds: [], role: "" },
  slides: carousel.map((slide) => ({ slide: slide.slide, beat: `The ${slide.slide} beat.`, direction: `Paper-cut collage in cream and night blue: a library card for ${slide.slide}, one focal subject, room at the top for the headline.`, need: "generic-illustration", characterIds: [], references: [] })),
});
const CONCEPTS = ["A door that opens slide by slide", "A card that fills with stamps", "A lamp that brightens the hall"];
const writer = () => (contents: Contents, carousel: Draft2CarouselSlide[]) => contents.task === "revise"
  ? { candidates: [
    ...(contents.scripts ?? []).map((target, index) => script(target.id, `${CONCEPTS[index]}, sharper`, carousel)),
    ...(contents.develop ?? []).map((proposal) => script(proposal.id, "An edited walk through the library", carousel)),
  ] }
  : { candidates: CONCEPTS.slice(0, contents.candidatesWanted).map((concept, index) => script(`c${index + 1}`, concept, carousel)) };
const score = (candidateId: string, overall: number): Draft2VisualScore => ({ candidateId, narrative: overall, continuity: overall, brand: overall, truth: overall, fit: overall, craft: overall, focus: overall, overall, note: "Why." });
const judge = (verdict: "accept" | "revise", winnerId: string, overall: Record<string, number>) => (contents: Contents, carousel: Draft2CarouselSlide[]) => ({
  verdict, winnerId, summary: `${verdict} ${winnerId}.`, issues: [], suggestions: [],
  scores: (contents.candidates ?? []).map((candidate) => score(candidate.id, overall[candidate.id] ?? 70)),
  proposals: contents.proposalsWanted ? [script("p1", "Sol's walk from the street to the shelves", carousel)] : [],
});

type Call = { provider: string; role: "writer" | "judge"; input: Record<string, unknown> };
type Row = Record<string, unknown> & { visual: Draft2Visual | null; trace: types.Draft2TraceEntry[] };

function harness({ writes, judgments, session }: { writes: ((contents: Contents, carousel: Draft2CarouselSlide[]) => unknown)[]; judgments: ((contents: Contents, carousel: Draft2CarouselSlide[]) => unknown)[]; session?: Record<string, unknown> }) {
  const calls: Call[] = [];
  let row: Row = { id: sessionId, topicId, storyId, step: "inventory", status: "ready", facts, focus: null, opening: OPENING, closing: CLOSING, deck: deckRun(), inventory: INVENTORY, visual: null, error: null, threads: {}, trace: [], ...session };
  let write = 0;
  let judgment = 0;
  const usage = { promptTokens: 100, outputTokens: 50, thoughtsTokens: 0, totalTokens: 150 };
  const answer = (provider: string, input: Record<string, unknown>) => {
    const role = input.schemaName === "draft2_visual" ? "writer" : "judge";
    calls.push({ provider, role, input });
    const carousel = ((input.context ?? input.contents) as { carousel: Draft2CarouselSlide[] }).carousel;
    const text = role === "writer" ? writes[write++](input.contents as Contents, carousel) : judgments[judgment++](input.contents as Contents, carousel);
    return { text: JSON.stringify(text), provider, model: input.model, usage };
  };
  const mocks: Record<string, unknown> = {
    "server-only": {},
    "./draft2-facts.types": types,
    "./draft2-funnel": funnel,
    "./draft2-focus.types": focusTypes,
    "./draft2-inventory.types": inventoryTypes,
    "./draft2-visual.types": visualTypes,
    "./draft2-models": models,
    "./skills/draft2-skills": skills,
    "./skills/visuals": visuals,
    "../stories/creative-visual-guidance": { resolveCreativeVisualGuidance: (value: { name: string }) => `${value.name.toUpperCase()} — CREATIVE IDENTITY\n\nAVOID (never include these):\nMarks: Polaroid.` },
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
  const exports = loadInSandbox("./draft2-visual.ts", mocks, { Date, process: { env: { OPENAI_API_KEY: "sk-test" } } }) as Record<string, (...args: unknown[]) => Promise<Row>>;
  return {
    run: (options: { resume?: boolean } = {}) => exports.runDraft2Visual({ topicId, storyId, sessionId, ...options }),
    choose: (candidateId: string) => exports.recordVisualChoice({ topicId, sessionId, candidateId }),
    calls,
    judgeCalls: () => calls.filter((call) => call.role === "judge").map((call) => call.input.contents as Contents),
    row: () => row,
  };
}

const json = (value: unknown) => JSON.stringify(value);

test("Claude scripts the chosen carousel and Sol judges it; both read the focus, the carousel, the people and places, the characters and the identity", async () => {
  const h = harness({ writes: [writer()], judgments: [judge("accept", "c2", { c2: 96 })] });
  const session = await h.run();
  const [claude, sol] = h.calls;
  const carousel = visualTypes.carouselSlides(CLOSING.opening!, deckCandidate(), deckRun().closing!);
  assert.equal(json(claude.input.context), json({
    focus: focusTypes.focusForModels(VALUES), carousel, peopleAndPlaces: inventoryTypes.inventoryForModels(INVENTORY), characters: INVENTORY.roster, characterChoice: "auto", verifiedFacts: funnel.factsSnapshot(facts),
  }));
  assert.match(String(claude.input.instructions), /# The publication[^]*# Visual identity\nSALUT LONGUEUIL — CREATIVE IDENTITY[^]*- Visual mode: illustration-editorial\./);
  assert.ok(String(claude.input.instructions).includes(visuals.VISUALS_SKILL.text));
  assert.equal(json([(claude.input.contents as Contents).candidatesWanted, claude.input.effort, (sol.input.contents as Contents).proposalsWanted, sol.input.reasoningEffort]), json([3, "medium", 1, "medium"]));
  assert.equal(json(session.trace.map((entry) => [entry.step, entry.operation, entry.skillVersions])), json([["visual", "draft2_visual", { visuals: "1" }], ["visual", "draft2_visual_review", { visuals: "1" }]]));
  const visual = session.visual!;
  assert.equal(json([session.status, visual.status, visual.winnerId, visual.deckId, visual.inventoryVersion, visual.characterChoice, visual.mode, visual.carousel?.length]), json(["ready", "ready", "c2", "c3", 4, "auto", "illustration-editorial", 6]));
});

test("three scripts, then the two best revised beside Sol's script as written and edited, for Sol's pick", async () => {
  const h = harness({ writes: [writer(), writer()], judgments: [judge("revise", "c2", { c2: 88, c3: 85 }), judge("revise", "c4", { "c2.2": 89, "c3.2": 86, c4: 91, c5: 90 })] });
  const session = await h.run();
  assert.equal(json(h.judgeCalls().map((contents) => contents.candidates?.map((candidate) => candidate.id))), json([["c1", "c2", "c3"], ["c2.2", "c3.2", "c4", "c5"]]), "Sol's script as edited (c4) and as written (c5) take the ids after c3");
  assert.equal(json(h.calls.map((call) => call.input.effort ?? call.input.reasoningEffort)), json(["medium", "medium", "high", "high"]));
  assert.match(String(session.error), /^Sol did not accept a visual script after 2 rounds\. The best version, c4, scored 91\/100/);
});

test("a long carousel explores two scripts", async () => {
  const h = harness({ writes: [writer()], judgments: [judge("accept", "c1", { c1: 96 })], session: { deck: deckRun(9) } });
  await h.run();
  assert.equal((h.calls[0].input.contents as Contents).candidatesWanted, 2, "13 slides: two scripts");
});

test("the visual script waits for a finished deck between the chosen opening and closing, and for the people and places", async () => {
  const refused = (session: Record<string, unknown>, pattern: RegExp) => assert.rejects(harness({ writes: [], judgments: [], session }).run(), (error: Error) => error instanceof types.Draft2InputError && pattern.test(error.message));
  await refused({ deck: null }, /Finish the deck first/);
  await refused({ deck: { ...deckRun(), status: "paused", resumeRound: 2 } }, /Finish the deck first/);
  await refused({ deck: { ...deckRun(), winnerId: undefined } }, /Choose a deck first/);
  await refused({ deck: { ...deckRun(), opening: undefined } }, /does not record the opening and closing/);
  await refused({ opening: { ...OPENING, editorChoiceId: "c9" } }, /The deck connects c1 and c2; the opening and closing chosen now are c9 and c2\. Write the deck again first\./);
  await refused({ inventory: null }, /Find the people and places first/);
  await refused({ inventory: { ...INVENTORY, status: "running" } }, /Find the people and places first/);
});

test("a stopped run continues only while the people and places are the version it read", async () => {
  const stopped: Draft2Visual = { status: "running", rounds: [], candidates: [], carousel: visualTypes.carouselSlides(CLOSING.opening!, deckCandidate(), deckRun().closing!), deckId: "c3", openingId: "c1", closingId: "c2", focus: { version: 2, values: VALUES }, inventoryVersion: 3, characters: [], characterChoice: "auto" };
  await assert.rejects(harness({ writes: [], judgments: [], session: { step: "visual", status: "running", visual: stopped } }).run({ resume: true }), /The people and places changed since this run started/);
});

test("the editor can choose any script of the run", async () => {
  const h = harness({ writes: [writer()], judgments: [judge("accept", "c1", { c1: 96 })] });
  await h.run();
  assert.equal((await h.choose("c3")).visual?.editorChoiceId, "c3");
});
