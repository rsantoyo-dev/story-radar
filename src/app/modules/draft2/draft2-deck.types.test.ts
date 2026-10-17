import assert from "node:assert/strict";
import test from "node:test";
import { Draft2ResponseError, type Draft2Fact } from "./draft2-facts.types";
import {
  DECK_ARC_PLAN, DECK_CRITERIA, DECK_ITEMS_PLAN, DECK_PARTS, closingForDeck, deckExploreRequest, deckJudgeRequest, deckPlan, deckRefineRequest, deckShape,
  mechanicalDeckIssues, parseDeckCandidates, parseDeckEvaluation, sameDeck, shapeForModels,
  type Draft2DeckCandidate, type Draft2DeckClosing, type Draft2DeckIssue, type Draft2DeckRound, type Draft2DeckScore, type Draft2DeckShape, type Draft2DeckSlide,
} from "./draft2-deck.types";
import { funnelVersions } from "./draft2-funnel";
import type { Draft2ClosingOpening } from "./draft2-closing.types";

const facts: Draft2Fact[] = [
  { id: "f1", claim: "The program reviews product videos no longer than five minutes.", evidence: "videos \"no longer than five minutes\"", kind: "event", status: "established", importance: 90 },
  { id: "f2", claim: "A DOD official says awards took less than a week.", evidence: "awards took less than a week", kind: "event", status: "attributed", attribution: "A DOD official", importance: 80 },
  { id: "f3", claim: "Startups can apply without a past contract.", evidence: "without a past contract", kind: "event", status: "established", importance: 70 },
  { id: "f4", claim: "Reviewers score the videos on usefulness and readiness.", evidence: "score the videos on usefulness and readiness", kind: "event", status: "established", importance: 60 },
  { id: "f5", claim: "The fair runs Saturday from 10 a.m. to 4 p.m., free admission.", evidence: "Saturday from 10 a.m. to 4 p.m., free admission", kind: "event", status: "established", importance: 60 },
];
const opening: Draft2ClosingOpening = {
  id: "c1",
  cover: { headline: "Your demo video is now the bid", subheadline: "Product demos replace months of paperwork in a new buying program.", factIds: ["f1"] },
  slide2: { headline: "Awards in under a week", body: "A DOD official says awards took less than a week in several instances.", factIds: ["f2"] },
};
const closing: Draft2DeckClosing = {
  id: "c4",
  penultimate: { headline: "The binder is optional now", body: "Startups can apply without a past contract, and a working product does the talking.", factIds: ["f3"] },
  last: { headline: "Build the demo first", body: "If you sell software to government, a short video can open the door.", cta: "Follow us for every buying change.", factIds: ["f1"] },
};
const arc: Draft2DeckShape = deckShape({ kind: "arc", itemFactIds: [] }, opening.slide2.factIds);

const slide = (headline: string, body: string, factIds: string[], practical = ""): Draft2DeckSlide => ({ headline, body, practical, factIds });
/** A three-slide arc deck every program rule accepts. */
const deck = (id: string, slides: Draft2DeckSlide[] = [
  slide("Five minutes is the whole pitch", "Reviewers watch a product video no longer than five minutes instead of reading a proposal.", ["f1"]),
  slide("Reviewers grade what works", "They score each video on how useful it is and how ready it is to field.", ["f4"]),
  slide("Speed is the selling point", "A DOD official says some awards came within a week of the review.", ["f2"]),
]): Draft2DeckCandidate => ({ id, slides, angle: "From the pitch to the award" });
const score = (candidateId: string, overall: number, overrides: Partial<Draft2DeckScore> = {}): Draft2DeckScore =>
  ({ candidateId, flow: overall, coverage: overall, pacing: overall, clarity: overall, grounding: overall, voice: overall, focus: overall, originality: overall, overall, note: "Why.", ...overrides });
const codes = (issues: Draft2DeckIssue[]) => issues.map((issue) => [issue.code, issue.candidateId, issue.part].filter(Boolean).join(" "));
const findings = (candidate: Draft2DeckCandidate, options: Partial<Parameters<typeof mechanicalDeckIssues>[2]> = {}) =>
  codes(mechanicalDeckIssues([candidate], facts, { opening, closing, shape: arc, emojis: 2, ...options }));

test("an arc's deck runs 2 to 5 slides; a list's or steps' carries the items slide 2 did not cite, in order", () => {
  assert.deepEqual(arc, { kind: "arc", min: 2, max: 5, items: [] });
  const list = deckShape({ kind: "list", itemFactIds: ["f2", "f3", "f5"] }, opening.slide2.factIds);
  assert.deepEqual(list, { kind: "list", min: 2, max: 2, items: ["f3", "f5"] }, "slide 2 already carried the item that starts with f2");
  assert.deepEqual(deckShape({ kind: "steps", itemFactIds: ["f3", "f4"] }, ["f9"]).items, ["f3", "f4"], "slide 2 gave what the reader needs first; every step remains");
  assert.equal(deckPlan(arc), DECK_ARC_PLAN);
  assert.equal(deckPlan(list), DECK_ITEMS_PLAN);
  assert.deepEqual(deckPlan(arc, "v3").map((round) => [round.fresh, round.revise, round.proposals, round.effort, round.judgeEffort]), [[4, 0, 1, "medium", "low"], [0, 2, 0, "medium", "low"]], "v3: the same rounds, the writer at medium and the judge at low");
  assert.deepEqual(deckPlan(list, "v3").map((round) => [round.fresh, round.revise, round.judgeEffort]), [[2, 0, "low"], [0, 1, "low"]]);
  assert.deepEqual(DECK_ARC_PLAN.map((round) => [round.fresh, round.revise, round.proposals, round.effort ?? "high"]), [[4, 0, 1, "medium"], [0, 2, 0, "high"]]);
  assert.deepEqual(DECK_ITEMS_PLAN.map((round) => [round.fresh, round.revise, round.proposals, round.effort ?? "high"]), [[2, 0, 1, "medium"], [0, 1, 0, "high"]]);
  assert.deepEqual(shapeForModels(arc), { kind: "arc", slides: "2 to 5" });
  assert.deepEqual(shapeForModels(list), { kind: "list", slides: 2, items: ["f3", "f5"] });
  assert.deepEqual(closingForDeck({ ...closing, penultimate: undefined }), { last: closing.last }, "a one-slide closing has no penultimate to show");
});

test("the writer's answer becomes decks; a slide missing a part is rejected, an empty practical line is not", () => {
  const [parsed] = parseDeckCandidates(JSON.stringify({ candidates: [deck("c1")] }));
  assert.equal(parsed.slides.length, 3);
  assert.equal(parsed.slides[0].practical, "");
  const broken = { ...deck("c1"), slides: [{ headline: "No body", practical: "", factIds: ["f1"] }] };
  assert.throws(() => parseDeckCandidates(JSON.stringify({ candidates: [broken] })), (error: Error) => error instanceof Draft2ResponseError && /c1 is incomplete/.test(error.message));
  assert.throws(() => parseDeckCandidates(JSON.stringify({ candidates: [{ ...deck("c1"), slides: [] }] })), /incomplete/);
});

test("the judge scores every deck criterion and names slides s1, s2…", () => {
  const answer = JSON.stringify({ verdict: "revise", winnerId: "c1", summary: "Close.", suggestions: [], proposals: [deck("p1"), deck("p2")], scores: [score("c1", 90)],
    issues: [{ code: "OVERLOADED", candidateId: "c1", part: "s2", detail: "Two ideas.", material: false }, { code: "GAP", candidateId: "c1", part: "cover", detail: "Skips a step." }] });
  const parsed = parseDeckEvaluation(answer, ["c1"]);
  assert.equal(parsed.scores[0].pacing, 90);
  assert.deepEqual(parsed.issues.map((issue) => [issue.code, issue.part ?? null]), [["OVERLOADED", "s2"], ["GAP", null]]);
  assert.deepEqual(parsed.proposals?.map((proposal) => proposal.id), ["p1"], "one deck of the judge's own");
  assert.equal(DECK_PARTS.length, 17);
  assert.deepEqual([...DECK_CRITERIA], ["flow", "coverage", "pacing", "clarity", "grounding", "voice", "focus", "originality"]);
});

test("a clean deck has no finding; the slide count and every slide's limits and facts are checked", () => {
  assert.deepEqual(findings(deck("c1")), []);
  assert.deepEqual(findings(deck("c1", deck("c1").slides.slice(0, 1))), ["SLIDE_COUNT c1"], "an arc's middle takes at least two slides");
  const long = (words: number) => Array.from({ length: words }, () => "word").join(" ");
  const [first, ...rest] = deck("c1").slides;
  assert.deepEqual(findings(deck("c1", [{ ...first, headline: long(9) }, ...rest])), ["HEADLINE_TOO_LONG c1 s1"]);
  assert.deepEqual(findings(deck("c1", [{ ...first, body: long(31) }, ...rest])), ["BODY_TOO_LONG c1 s1"]);
  assert.deepEqual(findings(deck("c1", [{ ...first, factIds: [] }, ...rest])), ["NO_FACTS c1 s1"]);
  assert.deepEqual(findings(deck("c1", [{ ...first, factIds: ["f9"] }, ...rest])), ["FACT_UNKNOWN c1 s1"]);
  assert.deepEqual(findings(deck("c1", [{ ...first, practical: "Sat. · free" }, ...rest])), ["PRACTICAL_OUTSIDE_LIST c1 s1"]);
  assert.deepEqual(findings(deck("c1", [{ ...first, body: "Reviewers watch 3 videos a day." }, ...rest])), ["UNSUPPORTED_NUMBER c1 s1"]);
  assert.deepEqual(findings(deck("c1", [{ ...first, headline: "In summary, film it" }, ...rest])), ["RECAP_LABEL c1 s1"]);
  assert.deepEqual(findings(deck("c1", [{ ...first, body: `${first.body} 🎬🎥🚀` }, ...rest])), ["TOO_MANY_EMOJIS c1"]);
});

test("a deck slide that repeats the cover, slide 2, the closing or another deck slide is a finding", () => {
  const [first, second, third] = deck("c1").slides;
  const coverAgain = slide("Your demo video is now the bid", "Product demos replace months of paperwork in a new buying program.", ["f1"]);
  assert.deepEqual(findings(deck("c1", [coverAgain, second, third])), ["RESTATES_SLIDE c1 s1"]);
  assert.match(mechanicalDeckIssues([deck("c1", [coverAgain, second, third])], facts, { opening, closing, shape: arc, emojis: 2 })[0].detail, /repeats the cover/);
  const closingAgain = slide("The binder is optional now", "Startups can apply without a past contract, and a working product does the talking.", ["f3"]);
  assert.deepEqual(findings(deck("c1", [first, second, closingAgain])), ["RESTATES_SLIDE c1 s3"]);
  assert.match(mechanicalDeckIssues([deck("c1", [first, second, { ...first }])], facts, { opening, closing, shape: arc, emojis: 2 })[0].detail, /repeats deck slide 1/);
});

test("a list's deck carries its items in order, one per slide, with a short sentence and the practical line apart", () => {
  const list = deckShape({ kind: "list", itemFactIds: ["f2", "f3", "f5"] }, opening.slide2.factIds);
  const items = [
    slide("Pitch without a past contract", "Startups apply on the product alone.", ["f3"]),
    slide("Browse the fair", "Meet the teams behind the demos.", ["f5"], "Sat. · 10 a.m.–4 p.m. · free"),
  ];
  assert.deepEqual(findings(deck("c1", items), { shape: list }), []);
  assert.deepEqual(findings(deck("c1", [items[1], items[0]]), { shape: list }), ["ITEM_OUT_OF_PLACE c1 s1", "ITEM_OUT_OF_PLACE c1 s2"]);
  assert.deepEqual(findings(deck("c1", items.slice(0, 1)), { shape: list }), ["SLIDE_COUNT c1"]);
  assert.deepEqual(findings(deck("c1", [{ ...items[0], body: "Startups apply on the product alone, without any record of past government work at all." }, items[1]]), { shape: list }), ["BODY_TOO_LONG c1 s1"], "twelve words for a list item's sentence");
  assert.deepEqual(findings(deck("c1", [items[0], { ...items[1], practical: "Saturday · from ten in the morning until four in the afternoon · free admission for all" }]), { shape: list }), ["PRACTICAL_TOO_LONG c1 s2"]);
});

test("two decks with the same headlines are duplicates, except a proposal and its edit; an unchanged edit is the same deck", () => {
  const issues = mechanicalDeckIssues([deck("c1"), deck("c2"), { ...deck("c3"), proposalOf: "p1", asProposed: true }], facts, { opening, closing, shape: arc, emojis: 2 });
  assert.deepEqual(codes(issues), ["DUPLICATE_CANDIDATE c2", "DUPLICATE_CANDIDATE c3"]);
  assert.equal(sameDeck(deck("c1"), deck("c9")), true);
  const [first, ...rest] = deck("c1").slides;
  assert.equal(sameDeck(deck("c1"), deck("c9", [{ ...first, body: `${first.body} Now.` }, ...rest])), false);
});

test("the requests name decks: new ones, revisions with their headlines, and the judge's list with its proposal", () => {
  assert.deepEqual(deckExploreRequest(4), { task: "decks", candidatesWanted: 4 });
  const first: Draft2DeckRound = { round: 1, candidates: [deck("c1"), deck("c2")], mechanical: [], at: "t", evaluation: { verdict: "revise", winnerId: "c1", scores: [score("c1", 88), score("c2", 80)], issues: [], suggestions: ["Cut s2 to one idea."], summary: "x" } };
  const versions = funnelVersions([first]);
  const refine = deckRefineRequest(versions.slice(0, 1), versions, [], first, 0, [deck("p1")]);
  assert.deepEqual(Object.keys(refine), ["task", "decks", "develop", "suggestions", "instruction"]);
  assert.match(refine.instruction, /^Revise each deck in decks[^]*Change only the slides its issues name[^]*Edit the deck in develop/);
  assert.equal(deckJudgeRequest(DECK_ARC_PLAN, 1, [deck("c1")], [], []).proposalsWanted, 1);
  assert.equal("proposalsWanted" in deckJudgeRequest(DECK_ARC_PLAN, 2, [deck("c1")], [], []), false);
});

test("an arc's deck takes its number of middle slides from the focus's spine when it has one, within the deck's own range", () => {
  const beats = (middle: number) => ({ beats: [{ slide: "cover" }, { slide: "slide2" }, ...Array.from({ length: middle }, () => ({ slide: "middle" })), { slide: "penultimate" }, { slide: "last" }] });
  assert.deepEqual([deckShape({ kind: "arc", itemFactIds: [] }, [], beats(3)).min, deckShape({ kind: "arc", itemFactIds: [] }, [], beats(3)).max], [3, 3], "three middle beats, three slides");
  assert.deepEqual([deckShape({ kind: "arc", itemFactIds: [] }, [], beats(7)).min, deckShape({ kind: "arc", itemFactIds: [] }, [], beats(7)).max], [5, 5], "clamped to the deck's range");
  assert.deepEqual([deckShape({ kind: "arc", itemFactIds: [] }, []).min, deckShape({ kind: "arc", itemFactIds: [] }, []).max], [2, 5], "no spine: the range as before");
  assert.deepEqual(deckShape({ kind: "list", itemFactIds: ["f2", "f3", "f5"] }, ["f2"], beats(1)).items, ["f3", "f5"], "a list keeps its items whatever the spine says");
});

test("a deck slide never uses an abbreviation the facts had to spell out", () => {
  const explaining: Draft2Fact[] = [...facts, { id: "f6", claim: "The Department of Defense (DOD) buys software.", evidence: "the Department of Defense (DOD)", kind: "event", status: "established", importance: 50 }];
  const issues = mechanicalDeckIssues([deck("d1")], explaining, { opening, closing, shape: arc, emojis: 2 });
  assert.deepEqual(codes(issues), ["ABBREVIATION d1 s3"]);
  assert.match(issues[0].detail, /^Deck slide 3: "DOD" \(Department of Defense\)/u);
  const spelled = { ...opening, slide2: { ...opening.slide2, body: "An official of the Department of Defense (DOD) says awards took less than a week." } };
  assert.deepEqual(codes(mechanicalDeckIssues([deck("d1")], explaining, { opening: spelled, closing, shape: arc, emojis: 2 })), [], "slide 2 spelled it out before");
});

test("a list's items follow the spine: one deck slide per middle beat, whatever slide 2 cites in passing", () => {
  const middle = (count: number) => ({ beats: [{ slide: "cover" }, { slide: "slide2" }, ...Array.from({ length: count }, () => ({ slide: "middle" })), { slide: "last" }] });
  const list = { kind: "list" as const, itemFactIds: ["f1", "f10", "f17", "f14", "f20"] };
  assert.deepEqual(deckShape(list, ["f25", "f2", "f10", "f15"], middle(5)).items, ["f1", "f10", "f17", "f14", "f20"], "five middle beats: five slides, though slide 2 cited f10 for the free/paid split");
  assert.deepEqual(deckShape(list, ["f25", "f10"], middle(4)).items, ["f1", "f17", "f14", "f20"], "four middle beats: slide 2 covers the item it cites");
  assert.deepEqual(deckShape(list, ["f25"], middle(4)).items, ["f10", "f17", "f14", "f20"], "four middle beats and no item cited: the first item is slide 2's");
  assert.deepEqual(deckShape(list, ["f10", "f17"]).items, ["f1", "f14", "f20"], "no spine: the items slide 2 does not cite, as before");
});
