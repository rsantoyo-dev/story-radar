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
import { NARRATIVES_SKILL } from "./skills/narratives";
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
const SHOTS = ["wide", "medium", "close"] as const;
/** A different place for every slide, as a sequence moves on. */
const SUBJECTS = ["lantern", "bicycle", "garden", "kitchen", "harbour", "market", "classroom", "orchard", "workshop", "station", "library", "bridge", "meadow", "rooftop", "bakery", "ferry", "museum"];
const script = (id: string, concept: string, carousel: Draft2CarouselSlide[]): Draft2VisualCandidate => ({
  id, angle: concept, concept, protagonist: "A reader seen from behind", motif: "A library card that gains a stamp on every slide.", cast: "Anonymous readers seen from behind.",
  characterPlan: { use: false, characterIds: [], role: "" },
  slides: carousel.map((slide, index) => ({ slide: slide.slide, beat: `The ${slide.slide} beat.`, subject: `the ${SUBJECTS[index]}`, discovery: `What ${slide.slide} shows first.`, recurring: "none", shot: SHOTS[index % SHOTS.length], headlineLink: "", direction: `Paper-cut collage in cream and night blue: a library card for ${slide.slide}, one focal subject, room at the top for the headline.`, need: "generic-illustration", characterIds: [], references: [] })),
});
const CONCEPTS = ["A door that opens slide by slide", "A card that fills with stamps", "A lamp that brightens the hall"];
const writer = () => (contents: Contents, carousel: Draft2CarouselSlide[]) => contents.task === "revise"
  ? { candidates: [
    ...(contents.scripts ?? []).map((target, index) => script(target.id, `${CONCEPTS[index]}, sharper`, carousel)),
    ...(contents.develop ?? []).map((proposal) => script(proposal.id, "An edited walk through the library", carousel)),
  ] }
  : { candidates: CONCEPTS.slice(0, contents.candidatesWanted).map((concept, index) => script(`c${index + 1}`, concept, carousel)) };
const score = (candidateId: string, overall: number): Draft2VisualScore => ({ candidateId, fidelity: overall, continuity: overall, brand: overall, truth: overall, craft: overall, originality: overall, overall, note: "Why." });
const judge = (verdict: "accept" | "revise", winnerId: string, overall: Record<string, number>) => (contents: Contents, carousel: Draft2CarouselSlide[]) => ({
  verdict, winnerId, summary: `${verdict} ${winnerId}.`, issues: [], suggestions: [],
  scores: (contents.candidates ?? []).map((candidate) => score(candidate.id, overall[candidate.id] ?? 70)),
  proposals: contents.proposalsWanted ? [script("p1", "Sol's walk from the street to the shelves", carousel)] : [],
});

type Call = { provider: string; role: "writer" | "judge"; input: Record<string, unknown> };
type Row = Record<string, unknown> & { visual: Draft2Visual | null; trace: types.Draft2TraceEntry[] };

function harness({ writes, judgments, session, coverRows = [] }: { coverRows?: unknown[]; writes: ((contents: Contents, carousel: Draft2CarouselSlide[]) => unknown)[]; judgments: ((contents: Contents, carousel: Draft2CarouselSlide[]) => unknown)[]; session?: Record<string, unknown> }) {
  const calls: Call[] = [];
  let row: Row = { id: sessionId, topicId, storyId, step: "inventory", status: "ready", facts, focus: null, opening: OPENING, closing: CLOSING, deck: deckRun(), inventory: INVENTORY, visual: null, error: null, threads: {}, trace: [], ...session };
  let write = 0;
  let judgment = 0;
  const usage = { promptTokens: 100, outputTokens: 50, thoughtsTokens: 0, totalTokens: 150 };
  const answer = (provider: string, input: Record<string, unknown>) => {
    // The fix pass: the flagged candidates come back as they are (this harness fixes nothing), and the call stays out of the scripted ones.
    if (String(input.schemaName).endsWith("_fix")) return { text: JSON.stringify({ candidates: (input.contents as Record<string, unknown[]>).scripts ?? [] }), provider, model: input.model, usage };
    const role = input.schemaName === "draft2_visual" ? "writer" : "judge";
    calls.push({ provider, role, input });
    // Claude's cached context block, or the context at the tail of Sol's instructions (its prefix cache).
    const context = (input.context ?? JSON.parse(String(input.instructions).split("\n# Context\n")[1].split("\n").slice(1).join("\n"))) as { carousel: Draft2CarouselSlide[] };
    const carousel = context.carousel;
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
      recentDraft2CoverRows: async () => coverRows,
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
    cast: (slide: string, characterIds: unknown) => exports.editVisualCharacters({ topicId, sessionId, slide, characterIds }),
    calls,
    judgeCalls: () => calls.filter((call) => call.role === "judge").map((call) => call.input.contents as Contents),
    row: () => row,
  };
}

const json = (value: unknown) => JSON.stringify(value);

test("Claude scripts the chosen carousel and Sol judges it; both read the focus, the carousel, the people and places, the characters and the identity", async () => {
  const h = harness({ writes: [writer()], judgments: [judge("accept", "c1", { c1: 96 })] });
  const session = await h.run();
  const [claude, sol] = h.calls;
  const carousel = visualTypes.carouselSlides(CLOSING.opening!, deckCandidate(), deckRun().closing!);
  assert.equal(json(claude.input.context), json({
    focus: focusTypes.focusForModels(VALUES), carousel, layout: visualTypes.visualLayout(profile as unknown as Parameters<typeof visualTypes.visualLayout>[0], carousel), peopleAndPlaces: inventoryTypes.inventoryForModels(INVENTORY), characters: INVENTORY.roster, characterChoice: "auto", verifiedFacts: funnel.factsSnapshot(facts),
  }));
  assert.match(String(claude.input.instructions), /# The publication[^]*# Visual identity\nSALUT LONGUEUIL — CREATIVE IDENTITY[^]*- Visual mode: illustration-editorial\./);
  assert.ok(String(claude.input.instructions).includes(visuals.VISUALS_SKILL.text));
  assert.equal(json([(claude.input.contents as Contents).candidatesWanted, claude.input.effort, (sol.input.contents as Contents).proposalsWanted, sol.input.reasoningEffort]), json([1, "medium", 1, "medium"]), "one script, and the judge's proposal");
  assert.equal(json(session.trace.map((entry) => [entry.step, entry.operation, entry.skillVersions])), json([["visual", "draft2_visual", { visuals: "16" }], ["visual", "draft2_visual_review", { visuals: "16" }]]));
  const visual = session.visual!;
  assert.equal(json([session.status, visual.status, visual.winnerId, visual.deckId, visual.inventoryVersion, visual.characterChoice, visual.mode, visual.carousel?.length]), json(["ready", "ready", "c1", "c3", 4, "auto", "illustration-editorial", 6]));
});

const UNACCEPTED = () => [judge("revise", "c1", { c1: 88 }), judge("revise", "c3", { "c1.2": 89, c2: 90, c3: 91 })];

test("one script, then it revised beside Sol's script as written and as edited, for Sol's pick: two rounds at medium, and no extra round on the funnel's own", async () => {
  const h = harness({ writes: [writer(), writer()], judgments: UNACCEPTED() });
  const session = await h.run();
  assert.equal(json(h.judgeCalls().map((contents) => contents.candidates?.map((candidate) => candidate.id))), json([["c1"], ["c1.2", "c2", "c3"]]), "Sol's script as edited (c2) and as written (c3) take the ids after c1");
  assert.equal(json(h.calls.map((call) => call.input.effort ?? call.input.reasoningEffort)), json(["medium", "medium", "medium", "medium"]), "both rounds think at medium");
  assert.match(String(session.error), /^Sol did not accept a visual script after 2 rounds\. The best version, c3, scored 91\/100/);
  assert.equal(json([session.visual?.rounds.length, session.visual?.extraRounds ?? 0]), json([2, 0]));

  const low = harness({ writes: [writer(), writer()], judgments: [judge("revise", "c1", { c1: 80 }), judge("revise", "c1.2", { "c1.2": 86, c2: 84, c3: 83 })] });
  const under = await low.run();
  assert.equal(json([under.visual?.status, under.visual?.rounds.length, under.visual?.extraRounds ?? 0]), json(["needs-review", 2, 0]), "under the floor and improving, still no extra round: the step takes none on its own");
  assert.match(String(under.error), /under 90\/100\. This step takes no extra round on its own; ask for one if a revision would help\./);
});

test("v3: one script, then the judge's revision when the first is not accepted (2026-10-19), the judge at medium (at low it scored 3 to 13 points under and accepted nothing) and no proposal; the run records its plan", async () => {
  const h = harness({ writes: [writer(), writer()], judgments: [judge("revise", "c1", { c1: 88 }), judge("accept", "c1.2", { "c1.2": 92 })], session: { pipeline: "v3" } });
  const session = await h.run();
  assert.equal(json(h.calls.map((call) => [call.role, call.input.effort ?? call.input.reasoningEffort])), json([["writer", "medium"], ["judge", "medium"], ["writer", "medium"], ["judge", "medium"]]));
  assert.equal(h.judgeCalls().every((contents) => !("proposalsWanted" in contents)), true, "no proposal in either round");
  assert.equal(json([session.visual?.status, session.visual?.pipeline, session.visual?.plannedRounds, session.visual?.rounds.length, session.visual?.winnerId]), json(["ready", "v3", 2, 2, "c1.2"]));
  const first = await harness({ writes: [writer()], judgments: [judge("accept", "c1", { c1: 93 })], session: { pipeline: "v3" } }).run();
  assert.equal(json([first.visual?.status, first.visual?.rounds.length]), json(["ready", 1]), "a first script the judge accepts ends the step");
});

test("a run that ended unaccepted after one round, before the step had a second, continues with round 2 only", async () => {
  const ended = await harness({ writes: [writer(), writer()], judgments: UNACCEPTED() }).run();
  // The run as a one-round plan left it: the round judged, the best version standing in.
  const oneRound = () => JSON.parse(JSON.stringify({ ...ended.visual!, rounds: ended.visual!.rounds.slice(0, 1), status: "needs-review", winnerId: "c1" })) as Draft2Visual;
  const h = harness({ writes: [writer()], judgments: [judge("accept", "c1.2", { "c1.2": 96, c2: 90, c3: 90 })], session: { step: "visual", status: "needs-review", visual: oneRound() } });
  const continued = await h.run({ resume: true });
  assert.equal(json(h.judgeCalls().map((contents) => contents.candidates?.map((candidate) => candidate.id))), json([["c1.2", "c2", "c3"]]), "the best revised beside the proposal as edited and as written");
  assert.equal(json(h.calls.map((call) => [call.role, call.input.effort ?? call.input.reasoningEffort])), json([["writer", "medium"], ["judge", "medium"]]), "one write and one judgment");
  assert.equal(json([continued.visual?.status, continued.visual?.winnerId, continued.visual?.rounds.length, continued.visual?.previousRuns]), json(["ready", "c1.2", 2, undefined]), "the same run, not a new one");
  const done = JSON.parse(JSON.stringify(ended.visual)) as Draft2Visual;
  await assert.rejects(harness({ writes: [], judgments: [], session: { step: "visual", status: "needs-review", visual: done } }).run({ resume: true }), /There is no paused or stopped visual script to continue/);
  const changed = harness({ writes: [], judgments: [], session: { step: "visual", status: "needs-review", visual: oneRound(), inventory: { ...INVENTORY, version: 5 } } });
  await assert.rejects(changed.run({ resume: true }), /The people and places changed since this run started/);
});

test("a new script follows the visual direction as the focus has it now; the rest of the focus is the words'", async () => {
  const now = { status: "ready", version: 3, edited: ["visualDirection"], values: { ...VALUES, audience: "Someone else", visualDirection: "Each reader by their portrait, one per slide." } };
  const h = harness({ writes: [writer()], judgments: [judge("accept", "c1", { c1: 96 })], session: { focus: now } });
  const session = await h.run();
  const followed = { ...VALUES, visualDirection: "Each reader by their portrait, one per slide." };
  assert.equal(json((h.calls[0].input.context as { focus: unknown }).focus), json(focusTypes.focusForModels(followed)));
  assert.equal(json(session.visual?.focus), json({ version: 2, values: followed }), "the words' version and fields, with the direction as it stands");
});

test("a long carousel explores one script too", async () => {
  const h = harness({ writes: [writer()], judgments: [judge("accept", "c1", { c1: 96 })], session: { deck: deckRun(9) } });
  await h.run();
  assert.equal((h.calls[0].input.contents as Contents).candidatesWanted, 1, "13 slides: one script, the spine decides the story");
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
  const h = harness({ writes: [writer(), writer()], judgments: UNACCEPTED() });
  await h.run();
  assert.equal((await h.choose("c2")).visual?.editorChoiceId, "c2", "the judge's proposal as the writer edited it");
});

test("the editor casts the brand's characters on a slide of the chosen script, in place where the run keeps it; a verified slide keeps them off", async () => {
  const h = harness({ writes: [writer()], judgments: [judge("accept", "c1", { c1: 96 })] });
  const session = await h.run();
  const chosenId = session.visual!.editorChoiceId ?? session.visual!.winnerId!;
  const chosen = funnel.funnelVersions(session.visual!.rounds).find((version) => version.candidate.id === chosenId)!.candidate as visualTypes.Draft2VisualCandidate;
  const target = chosen.slides.find((slide) => slide.need !== "real-photo" && slide.need !== "verified-map")!;
  const cast = await h.cast(target.slide, ["char-mia"]);
  const edited = funnel.funnelVersions(cast.visual!.rounds).find((version) => version.candidate.id === chosenId)!.candidate as visualTypes.Draft2VisualCandidate;
  assert.equal(json(edited.slides.find((slide) => slide.slide === target.slide)!.characterIds), json(["char-mia"]));
  assert.equal(json((cast.visual!.candidates.find((candidate) => candidate.id === chosenId) as visualTypes.Draft2VisualCandidate | undefined)?.slides.find((slide) => slide.slide === target.slide)?.characterIds ?? ["char-mia"]), json(["char-mia"]), "the run's last candidates follow");
  const off = await h.cast(target.slide, []);
  assert.equal(json((funnel.funnelVersions(off.visual!.rounds).find((version) => version.candidate.id === chosenId)!.candidate as visualTypes.Draft2VisualCandidate).slides.find((slide) => slide.slide === target.slide)!.characterIds), json([]));
  await assert.rejects(h.cast(target.slide, ["char-zed"]), /char-zed is not one of the brand's characters/);
  await assert.rejects(h.cast("s9", ["char-mia"]), /s9 is not one of this script's slides/);
});

/** A six-beat spine with a panorama, one beat per slide of the harness's carousel (cover, slide 2, two deck slides, the penultimate, the last). */
const PANORAMA_SPINE = {
  beats: [
    { slide: "cover", role: "hook", scene: "s", words: "w", image: "A young tree alone at the left end.", withholds: "x", factIds: ["f1"] },
    { slide: "slide2", role: "setup", scene: "s", words: "w", image: "The tree gains a name.", withholds: "x", factIds: ["f1"] },
    { slide: "middle", role: "rising", scene: "s", words: "w", image: "Plants of unequal heights.", withholds: "x", factIds: ["f2"] },
    { slide: "middle", role: "climax", scene: "s", words: "w", image: "The turned soil.", withholds: "x", factIds: ["f2"] },
    { slide: "penultimate", role: "rising", scene: "s", words: "w", image: "The planted tree.", withholds: "x", factIds: ["f3"] },
    { slide: "last", role: "payoff", scene: "s", words: "w", image: "The gloves at the right end.", withholds: "", factIds: ["f1"] },
  ],
  panorama: {
    world: "A long cream plane with a band of soil.", device: "journey", axis: "From the tree in its pot to the planted tree.", field: "cream", carrier: "the soil band", ending: "resolves",
    stations: ["medium", "small", "medium", "large", "medium", "medium"].map((size, index) => ({ size, character: false, crossing: index === 5 ? "" : "the band" })),
  },
};

test("a panorama: each slide's station travels beside its beat, the program sets every section's shot to wide, and the layout says the program sets the words", async () => {
  const values = { ...VALUES, imageMode: "panorama", spine: PANORAMA_SPINE } as unknown as Draft2FocusValues;
  const focus = { status: "ready", version: 2, edited: [], values };
  const h = harness({ writes: [writer()], judgments: [judge("accept", "c1", { c1: 93 })], session: { pipeline: "v3", focus, deck: { ...deckRun(), focus: { version: 2, values } } } });
  const session = await h.run();
  const context = h.calls[0].input.context as { stations?: Record<string, { size: string }>; spineBeats?: Record<string, string>; layout: { lettering: string } };
  assert.deepEqual(Object.fromEntries(Object.entries(context.stations ?? {}).map(([slide, station]) => [slide, station.size])), { cover: "medium", slide2: "small", s1: "medium", s2: "large", penultimate: "medium", last: "medium" });
  assert.equal(context.spineBeats?.s2, "The turned soil.");
  assert.match(context.layout.lettering, /^The program sets each slide's words/);
  assert.ok(String(h.calls[0].input.instructions).includes(NARRATIVES_SKILL.text), "the editor's panorama is the panorama form: both models read the narratives skill the visuals skill points to");
  const chosen = funnel.funnelVersions(session.visual!.rounds).find((version) => version.candidate.id === "c1")!.candidate as visualTypes.Draft2VisualCandidate;
  assert.deepEqual(chosen.slides.map((slide) => slide.shot), ["wide", "wide", "wide", "wide", "wide", "wide"], "the writer's shots gave way to the scene's one view");
  assert.equal(json([session.visual?.status, session.visual?.rounds[0].mechanical.length]), json(["ready", 0]), "no shot finding on one wide scene");
});

test("the script reads the publication's last covers, and the run keeps them", async () => {
  const cover = { slide: "cover", beat: "b", subject: "an onion", discovery: "d", recurring: "none", shot: "wide", headlineLink: "", direction: "Fondo terracota, una cebolla.", need: "generic-illustration", characterIds: [], references: [] };
  const coverRows = [{ storyId: "99999999-9999-4999-8999-999999999999", createdAt: "2026-10-15T10:00:00Z", visual: { winnerId: "c1", rounds: [{ round: 1, candidates: [{ id: "c1", angle: "a", concept: "c", protagonist: "", motif: "", cast: "c", characterPlan: { use: false, characterIds: [], role: "" }, slides: [cover] }], mechanical: [], at: "t" }] } }];
  const h = harness({ writes: [writer()], judgments: [judge("accept", "c1", { c1: 96 })], coverRows });
  const session = await h.run();
  assert.equal(json((h.calls[0].input.context as { recentCovers?: unknown }).recentCovers), json([{ background: "unknown", character: "none", subject: "an onion" }]), "the writer reads them; this profile's palette names no background");
  assert.equal(session.visual?.recentCovers?.length, 1);
});

test("v4: the draft's image intents, written with the words, are the script's beats; the spine's image lines stand where the draft wrote none (2026-10-23)", async () => {
  const drafted = { images: [{ slide: "cover", intent: "A carved pumpkin, large, lit from inside." }, { slide: "s1", intent: "A closed book of tales on a plain plane." }], caption: { text: "x", hashtags: [], factIds: [], comment: "" } };
  const h = harness({ writes: [writer()], judgments: [judge("accept", "c1", { c1: 93 })], session: { pipeline: "v4", opening: { ...OPENING, draft: drafted } } });
  const session = await h.run();
  const context = h.calls[0].input.context as { spineBeats?: Record<string, string> };
  assert.equal(context.spineBeats?.cover, "A carved pumpkin, large, lit from inside.", "the draft's intent for the cover");
  assert.equal(context.spineBeats?.s1, "A closed book of tales on a plain plane.");
  const chosen = funnel.funnelVersions(session.visual!.rounds).find((version) => version.candidate.id === "c1")!.candidate as visualTypes.Draft2VisualCandidate;
  assert.equal(chosen.slides.find((slide) => slide.slide === "cover")?.beat, "A carved pumpkin, large, lit from inside.", "bound on the script, whatever the writer wrote");
  assert.deepEqual(session.visual?.imageIntents, { cover: "A carved pumpkin, large, lit from inside.", s1: "A closed book of tales on a plain plane." }, "the run keeps them for a continued run");
  const v3 = harness({ writes: [writer()], judgments: [judge("accept", "c1", { c1: 93 })], session: { pipeline: "v3", opening: { ...OPENING, draft: drafted } } });
  await v3.run();
  assert.equal((v3.calls[0].input.context as { spineBeats?: Record<string, string> }).spineBeats?.cover, undefined, "v3 reads no draft");
});

test("the story's thing the words name and no verified photo shows is flagged for the writer, the judge and the editor, never blocking (2026-10-24, the ART[O] faces)", async () => {
  const inventory = { ...INVENTORY, entities: [...INVENTORY.entities, { id: "e2", name: "Tall windows", kind: "thing", role: "subject", description: "The hall's windows", factIds: ["f2"] }] } as unknown as Draft2Inventory;
  const h = harness({ writes: [writer()], judgments: [judge("accept", "c1", { c1: 93 })], session: { inventory } });
  const session = await h.run();
  assert.deepEqual((h.calls[0].input.context as { subjectsUnseen?: { names: string[] } }).subjectsUnseen?.names, ["Tall windows"]);
  assert.deepEqual(session.visual?.subjectsUnseen, ["Tall windows"]);
  assert.equal(session.visual?.status, "ready", "a flag, not a finding");
  const seen = { ...inventory, entities: inventory.entities.map((entity) => entity.id === "e2" ? { ...entity, storyPhoto: { id: "p1", name: "windows.jpg" } } : entity) } as unknown as Draft2Inventory;
  const withPhoto = await harness({ writes: [writer()], judgments: [judge("accept", "c1", { c1: 93 })], session: { inventory: seen } }).run();
  assert.equal(withPhoto.visual?.subjectsUnseen, undefined, "a photo exists: nothing to flag");
});
