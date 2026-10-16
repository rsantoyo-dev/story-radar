import { abbreviationBreaches, abbreviationFinding, explainedAbbreviations } from "./draft2-abbreviations.types";
import { addressBreaches, addressFinding, type Draft2Reader } from "./draft2-address.types";
import { comparableText, type Draft2Fact } from "./draft2-facts.types";
import type { Draft2FocusSnapshot, Draft2FocusStructureKind } from "./draft2-focus.types";
import {
  funnelEvaluationSchema, funnelExploreRequest, funnelFixRequest, funnelFactIds, funnelJudgeRequest, funnelParseCandidates, funnelParseEvaluation, funnelRecord,
  funnelRefineRequest, funnelText, funnelWordCount, headlineKey, longWords, numbersIn, statedNumbers, wordOverlap,
  type FunnelCandidate, type FunnelEvaluation, type FunnelGate, type FunnelIssue, type FunnelPlanRound, type FunnelRegression, type FunnelRole,
  type FunnelRound, type FunnelRun, type FunnelScore, type FunnelVersion, type FunnelWords,
} from "./draft2-funnel";
import type { Draft2ClosingCandidate, Draft2ClosingOpening } from "./draft2-closing.types";

/**
 * Deck, the Draft 2 step after the Closing: the slides between slide 2 and
 * the closing, so the carousel reads as one story from the cover to the
 * call to action. On the shared funnel (draft2-funnel.ts), a candidate is a
 * whole deck. For an arc, the development from slide 2's first payoff to the
 * penultimate's resolution, in 2 to 5 slides the writer chooses; for a list
 * or steps, one slide per item or step slide 2 did not cover, in order.
 * Claude writes, Sol judges and proposes a deck of its own:
 *   arc:          4 decks → Sol scores, proposes 1 → 2 revised + 1 original + 1 edit → Sol's pick
 *   list, steps:  2 decks → Sol scores, proposes 1 → 1 revised + 1 original + 1 edit → Sol's pick
 * (the items are set by the facts, and a long list's deck is long).
 * Everything here is pure: the deck's contracts, schemas, parsing, the
 * mechanical checks and the requests, on the funnel's bookkeeping.
 */
export const DECK_ARC_CANDIDATES = 4;
export const DECK_ITEMS_CANDIDATES = 2;
/** Round 1 is wide, so it thinks with medium effort; the round that refines thinks hard. */
export const DECK_ARC_PLAN: readonly FunnelPlanRound[] = [
  { revise: 0, fresh: DECK_ARC_CANDIDATES, proposals: 1, effort: "medium" },
  { revise: 2, fresh: 0, proposals: 0 },
];
export const DECK_ITEMS_PLAN: readonly FunnelPlanRound[] = [
  { revise: 0, fresh: DECK_ITEMS_CANDIDATES, proposals: 1, effort: "medium" },
  { revise: 1, fresh: 0, proposals: 0 },
];
export const DECK_MAX_ROUNDS = 2;
export const DECK_ARC_MIN_SLIDES = 2;
export const DECK_ARC_MAX_SLIDES = 5;
/** v1's ceiling: a carousel has at most 20 slides, so a list at most 18 items. */
export const DECK_MAX_SLIDES = 17;
export const DECK_ACCEPT_SCORE = 95;
export const DECK_CRITERION_FLOOR = 85;
export const DECK_HEADLINE_MAX_WORDS = 8;
export const DECK_BODY_MAX_WORDS = 30;
/** A list item is read in a few seconds: one sentence, then the practical line, counted apart as in v1. */
export const DECK_ITEM_SENTENCE_MAX_WORDS = 12;
export const DECK_PRACTICAL_MAX_WORDS = 14;
/** A deck slide repeats another slide of the carousel when this share of their longer words is the same. */
export const DECK_RESTATEMENT_OVERLAP = 0.5;

export const DECK_CRITERIA = ["flow", "coverage", "pacing", "clarity", "grounding", "voice", "focus", "originality"] as const;
export const DECK_MECHANICAL_CODES = [
  "FACT_UNKNOWN", "NO_FACTS", "HEADLINE_TOO_LONG", "BODY_TOO_LONG", "PRACTICAL_TOO_LONG", "PRACTICAL_OUTSIDE_LIST", "SLIDE_COUNT", "ITEM_OUT_OF_PLACE",
  "RESTATES_SLIDE", "RECAP_LABEL", "UNSUPPORTED_NUMBER", "TOO_MANY_EMOJIS", "DUPLICATE_CANDIDATE", "WRONG_ADDRESS", "ABBREVIATION",
] as const;
export const DECK_JUDGE_CODES = ["BREAKS_FLOW", "GAP", "OVERLOADED", "REPEATS", "WRONG_LENGTH", "UNCLEAR", "OVERCLAIMS", "OFF_VOICE", "OFF_FOCUS", "OTHER"] as const;
export const DECK_ISSUE_CODES = [...DECK_MECHANICAL_CODES, ...DECK_JUDGE_CODES] as const;
/** A deck's originality may be lower than its other criteria: a procedure's steps or a list's items leave it less room (a real recipe deck scored 73–77 on it with 88 overall). It still counts in the overall. */
export const DECK_ORIGINALITY_FLOOR = 75;
export const DECK_GATE: FunnelGate = { criteria: DECK_CRITERIA, accept: DECK_ACCEPT_SCORE, floor: DECK_CRITERION_FLOOR, floors: { originality: DECK_ORIGINALITY_FLOOR } };
/** The parts an issue may name: the deck's slides, s1 being the slide after slide 2. */
export const DECK_PARTS = Array.from({ length: DECK_MAX_SLIDES }, (_, index) => `s${index + 1}`);

export type Draft2DeckCriterion = (typeof DECK_CRITERIA)[number];
export type Draft2DeckIssueCode = (typeof DECK_ISSUE_CODES)[number];

export type Draft2DeckSlide = {
  headline: string;
  body: string;
  /** A list item's practical line (day · time · ages · price), exactly as its facts state them; empty on any other slide. */
  practical: string;
  factIds: string[];
};
export type Draft2DeckCandidate = FunnelCandidate & { slides: Draft2DeckSlide[] };
export type Draft2DeckIssue = FunnelIssue & { code: Draft2DeckIssueCode };
export type Draft2DeckScore = FunnelScore & { flow: number; coverage: number; pacing: number; clarity: number; grounding: number; voice: number; focus: number; /** Against the expected sequence of statements (the judges' originality standard); absent on scores stored before it was scored. */ originality?: number };
export type Draft2DeckEvaluation = FunnelEvaluation<Draft2DeckCandidate, Draft2DeckScore, Draft2DeckIssue>;
export type Draft2DeckRound = FunnelRound<Draft2DeckCandidate, Draft2DeckScore, Draft2DeckIssue>;
export type Draft2DeckVersion = FunnelVersion<Draft2DeckCandidate, Draft2DeckScore, Draft2DeckIssue>;
export type Draft2DeckRegression = FunnelRegression;

/** The closing a deck leads to, as the run started. */
export type Draft2DeckClosing = Pick<Draft2ClosingCandidate, "id" | "penultimate" | "last">;

/**
 * What the deck must be, from the focus and the opening: an arc's length
 * range, or the items or steps it carries, in order (their first facts), the
 * ones slide 2 did not cover.
 */
export type Draft2DeckShape = { kind: Draft2FocusStructureKind; min: number; max: number; items: string[] };

/** The deck's word limits for its shape, per slide, as the writer reads them in each request (the program checks the same constants). */
export const deckWordLimits = (shape: Pick<Draft2DeckShape, "kind">): Readonly<Record<string, number>> => shape.kind === "list"
  ? { headline: DECK_HEADLINE_MAX_WORDS, body: DECK_ITEM_SENTENCE_MAX_WORDS, practical: DECK_PRACTICAL_MAX_WORDS }
  : { headline: DECK_HEADLINE_MAX_WORDS, body: DECK_BODY_MAX_WORDS, practical: DECK_PRACTICAL_MAX_WORDS };

export type Draft2Deck = FunnelRun<Draft2DeckCandidate, Draft2DeckScore, Draft2DeckIssue> & {
  writer?: FunnelRole;
  judge?: FunnelRole;
  /** The opening and closing this run connects, the focus they followed, and the shape the deck takes. */
  opening?: Draft2ClosingOpening;
  closing?: Draft2DeckClosing;
  focus?: Draft2FocusSnapshot;
  shape?: Draft2DeckShape;
  /** Earlier runs of the step on this session, oldest first, without their rounds. */
  previousRuns?: Draft2DeckRun[];
};
export type Draft2DeckRun = Omit<Draft2Deck, "rounds" | "previousRuns">;

/** The deck's shape for a story: an arc runs 2 to 5 slides, or exactly its spine's middle beats when the focus has a spine; a list or steps carries each item or step slide 2 did not cite, in order. */
export function deckShape(structure: { kind: Draft2FocusStructureKind; itemFactIds: readonly string[] }, slide2FactIds: readonly string[], spine?: { beats: readonly { slide: string }[] }): Draft2DeckShape {
  if (structure.kind === "arc") {
    const middle = spine ? spine.beats.filter((beat) => beat.slide === "middle").length : 0;
    const fixed = middle ? Math.min(DECK_ARC_MAX_SLIDES, Math.max(DECK_ARC_MIN_SLIDES, middle)) : undefined;
    return { kind: "arc", min: fixed ?? DECK_ARC_MIN_SLIDES, max: fixed ?? DECK_ARC_MAX_SLIDES, items: [] };
  }
  // With a spine that fits the list, its middle beats say how many items the deck carries: all of them when the spine gives each item a
  // middle beat (slide 2 may cite an item's fact in passing, "two free outings", without being its slide), else all but the one slide 2
  // covers (the first it cites, else the first item). A real list lost Jardin céleste this way: slide 2 cited it for the free/paid split.
  const middle = spine ? spine.beats.filter((beat) => beat.slide === "middle").length : 0;
  const all = structure.itemFactIds;
  const onSlide2 = middle === all.length ? [] : middle === all.length - 1 ? [all.find((id) => slide2FactIds.includes(id)) ?? all[0]] : all.filter((id) => slide2FactIds.includes(id));
  const items = all.filter((id) => !onSlide2.includes(id)).slice(0, DECK_MAX_SLIDES);
  return { kind: structure.kind, min: items.length, max: items.length, items };
}

/** The plan a shape asks for: four decks for an arc, two for a list or steps. */
export const deckPlan = (shape: Pick<Draft2DeckShape, "kind">): readonly FunnelPlanRound[] => shape.kind === "arc" ? DECK_ARC_PLAN : DECK_ITEMS_PLAN;

const factIds = { type: "array", maxItems: 10, items: { type: "string" } };
const slideSchema = {
  type: "object",
  properties: { headline: { type: "string" }, body: { type: "string" }, practical: { type: "string" }, factIds },
  required: ["headline", "body", "practical", "factIds"],
  additionalProperties: false,
};
const deckItem = {
  type: "object",
  properties: { id: { type: "string" }, slides: { type: "array", minItems: 1, maxItems: DECK_MAX_SLIDES, items: slideSchema }, angle: { type: "string" } },
  required: ["id", "slides", "angle"],
  additionalProperties: false,
};

/** The writer's answer: the complete candidate list. */
export const DRAFT2_DECK_SCHEMA: Record<string, unknown> = {
  type: "object",
  properties: { candidates: { type: "array", minItems: 1, maxItems: DECK_ARC_CANDIDATES, items: deckItem } },
  required: ["candidates"],
  additionalProperties: false,
};

/** The judge's answer: scores, issues, the verdict and its own deck. */
export const DRAFT2_DECK_EVALUATION_SCHEMA: Record<string, unknown> = funnelEvaluationSchema({
  criteria: DECK_CRITERIA, codes: DECK_ISSUE_CODES, maxScored: DECK_ARC_CANDIDATES, item: deckItem, maxProposals: 1,
});

/** One deck from a model's answer, or undefined when a slide is missing a part. */
function deckFrom(raw: unknown, fallbackId: string): Draft2DeckCandidate | undefined {
  const item = funnelRecord(raw);
  if (!Array.isArray(item.slides) || !item.slides.length) return undefined;
  const slides: Draft2DeckSlide[] = [];
  for (const entry of item.slides.slice(0, DECK_MAX_SLIDES)) {
    const slide = funnelRecord(entry);
    const headline = funnelText(slide.headline, 300);
    const body = funnelText(slide.body, 1_000);
    const practical = typeof slide.practical === "string" && slide.practical.trim().length <= 300 ? slide.practical.trim() : undefined;
    const ids = funnelFactIds(slide.factIds);
    if (!headline || !body || practical === undefined || !ids) return undefined;
    slides.push({ headline, body, practical, factIds: ids });
  }
  return { id: funnelText(item.id, 24) ?? fallbackId, slides, angle: funnelText(item.angle, 400) ?? "" };
}

/** The writer's answer as decks; anything malformed is a response error, never persisted. */
export function parseDeckCandidates(answer: string): Draft2DeckCandidate[] {
  return funnelParseCandidates(answer, deckFrom, DECK_ARC_CANDIDATES);
}

/** The judge's answer as an evaluation of these decks (see funnelParseEvaluation). */
export function parseDeckEvaluation(answer: string, candidateIds: readonly string[]): Draft2DeckEvaluation {
  return funnelParseEvaluation(answer, candidateIds, { criteria: DECK_CRITERIA, codes: DECK_ISSUE_CODES, parts: DECK_PARTS, parseProposal: deckFrom, maxProposals: 1 });
}

const RECAP = /\b(in summary|to sum up|in short|to recap|the bottom line|en résumé|en bref|pour résumer|en somme|en resumen|en conclusión|en conclusion|para resumir|resumiendo|en síntesis)\b/iu;
const EMOJI = /\p{Extended_Pictographic}/gu;

/**
 * The program's findings on each deck, before the judge; any one keeps the
 * deck from winning. Each slide keeps its limits and cites known facts with
 * no unstated number; the deck keeps its shape (an arc's length, a list's or
 * steps' items in order, one per slide); no slide repeats another slide of
 * the carousel or sums up; emojis stay within the publication's allowance.
 */
export function mechanicalDeckIssues(candidates: readonly Draft2DeckCandidate[], facts: readonly Draft2Fact[], { opening, closing, shape, itemCount, emojis, reader }: {
  opening: Draft2ClosingOpening; closing: Draft2DeckClosing; shape: Draft2DeckShape; itemCount?: number; emojis: number; reader?: Draft2Reader;
}): Draft2DeckIssue[] {
  const byId = new Map(facts.map((fact) => [fact.id, fact]));
  const explained = explainedAbbreviations(facts);
  const fixed = [
    ["the cover", `${opening.cover.headline} ${opening.cover.subheadline}`],
    ["slide 2", `${opening.slide2.headline} ${opening.slide2.body}`],
    ...(closing.penultimate ? [["the penultimate slide", `${closing.penultimate.headline} ${closing.penultimate.body}`] as const] : []),
    ["the last slide", `${closing.last.headline} ${closing.last.body}`],
  ].map(([name, value]) => [name, longWords(value)] as const);
  const isList = shape.kind === "list";
  const keys = new Map<string, Draft2DeckCandidate>();
  const issues: Draft2DeckIssue[] = [];
  for (const candidate of candidates) {
    const add = (code: Draft2DeckIssueCode, part: string | undefined, detail: string) =>
      issues.push({ code, candidateId: candidate.id, ...(part ? { part } : {}), detail });
    const { slides } = candidate;
    if (slides.length < shape.min || slides.length > shape.max) {
      add("SLIDE_COUNT", undefined, shape.kind === "arc"
        ? `The deck has ${slides.length} slides; an arc's middle takes ${shape.min} to ${shape.max}.`
        : `The deck has ${slides.length} slides; it carries ${shape.items.length} ${shape.kind === "list" ? "items" : "steps"}, one per slide.`);
    }
    const words = slides.map((slide) => longWords(`${slide.headline} ${slide.body}`));
    slides.forEach((slide, index) => {
      const part = `s${index + 1}`;
      const label = `Deck slide ${index + 1}`;
      if (!slide.factIds.length) add("NO_FACTS", part, `${label} cites no fact; every sentence rests on verified facts.`);
      const unknown = slide.factIds.filter((id) => !byId.has(id));
      if (unknown.length) add("FACT_UNKNOWN", part, `${label} cites ${unknown.join(", ")}, which ${unknown.length === 1 ? "is not a verified fact" : "are not verified facts"}.`);
      if (funnelWordCount(slide.headline) > DECK_HEADLINE_MAX_WORDS) add("HEADLINE_TOO_LONG", part, `${label}'s headline has ${funnelWordCount(slide.headline)} words; the limit is ${DECK_HEADLINE_MAX_WORDS}.`);
      const bodyLimit = isList ? DECK_ITEM_SENTENCE_MAX_WORDS : DECK_BODY_MAX_WORDS;
      if (funnelWordCount(slide.body) > bodyLimit) add("BODY_TOO_LONG", part, `${label}'s body has ${funnelWordCount(slide.body)} words; the limit is ${bodyLimit}${isList ? ", the practical line apart" : ""}.`);
      if (slide.practical && !isList) add("PRACTICAL_OUTSIDE_LIST", part, `${label} has a practical line; only a list's items do.`);
      if (funnelWordCount(slide.practical) > DECK_PRACTICAL_MAX_WORDS) add("PRACTICAL_TOO_LONG", part, `${label}'s practical line has ${funnelWordCount(slide.practical)} words; the limit is ${DECK_PRACTICAL_MAX_WORDS}.`);
      const address = addressBreaches(`${slide.headline}\n${slide.body}\n${slide.practical}`, reader);
      if (address.length && reader) add("WRONG_ADDRESS", part, `${label}: ${addressFinding(address, reader)}`);
      // The reader has seen the opening and the deck's slides before this one: an abbreviation spelled out there may return.
      const seen = [opening.cover.headline, opening.cover.subheadline, opening.slide2.headline, opening.slide2.body, ...slides.slice(0, index).flatMap((earlier) => [earlier.headline, earlier.body, earlier.practical])].join("\n");
      const abbreviations = abbreviationBreaches(`${slide.headline}\n${slide.body}\n${slide.practical}`, explained, seen);
      if (abbreviations.length) add("ABBREVIATION", part, `${label}: ${abbreviationFinding(abbreviations, explained)}`);
      const item = shape.items[index];
      if (item && !slide.factIds.includes(item)) add("ITEM_OUT_OF_PLACE", part, `${label} should carry the ${shape.kind === "list" ? "item" : "step"} that starts with ${item}, in order.`);
      const recap = RECAP.exec(`${slide.headline} ${slide.body}`);
      if (recap) add("RECAP_LABEL", part, `"${recap[0]}" sums up instead of moving the story on.`);
      const repeated = fixed.find(([, other]) => wordOverlap(words[index], other) >= DECK_RESTATEMENT_OVERLAP)?.[0]
        ?? words.slice(0, index).findIndex((other) => wordOverlap(words[index], other) >= DECK_RESTATEMENT_OVERLAP);
      if (typeof repeated === "string") add("RESTATES_SLIDE", part, `${label} repeats ${repeated} instead of moving the story on.`);
      else if (repeated >= 0) add("RESTATES_SLIDE", part, `${label} repeats deck slide ${repeated + 1}.`);
      const cited = slide.factIds.flatMap((id) => { const fact = byId.get(id); return fact ? [fact] : []; });
      const stated = statedNumbers(cited, itemCount);
      const unsupported = [...new Set(numbersIn(`${slide.headline} ${slide.body} ${slide.practical}`).filter((number) => !stated.has(number.digits)).map((number) => number.written))];
      if (unsupported.length) add("UNSUPPORTED_NUMBER", part, `${unsupported.join(", ")} ${unsupported.length === 1 ? "is" : "are"} not stated by the facts ${label.toLowerCase()} cites.`);
    });
    const used = slides.map((slide) => `${slide.headline} ${slide.body} ${slide.practical}`).join(" ").match(EMOJI)?.length ?? 0;
    if (used > emojis) add("TOO_MANY_EMOJIS", undefined, emojis ? `The deck uses ${used} emojis; the publication allows ${emojis}.` : "The publication allows no emoji.");
    // A proposal's original and the writer's edit may share their headlines on purpose: the edit kept what worked.
    const key = headlineKey(slides.map((slide) => slide.headline).join(" "));
    const earlier = keys.get(key);
    if (earlier && !(candidate.proposalOf && earlier.proposalOf === candidate.proposalOf)) add("DUPLICATE_CANDIDATE", undefined, `The deck's headlines repeat ${earlier.id}'s.`);
    else if (!earlier) keys.set(key, candidate);
  }
  return issues;
}

/** Whether two decks say the same thing: the same slides, texts and cited facts. */
export const sameDeck = (a: Draft2DeckCandidate, b: Draft2DeckCandidate) => {
  const key = (candidate: Draft2DeckCandidate) => candidate.slides.map((slide) => [slide.headline, slide.body, slide.practical].map(comparableText).join("\n") + `|${slide.factIds.join()}`).join("\n\n");
  return key(a) === key(b);
};

export const DECK_REVISION_INSTRUCTION = "Revise each deck in decks and return exactly one deck per deck, with the same id. Change only the slides its issues name, in as few words as possible, and keep every other slide exactly as it is; keep the number of slides unless an issue asks for another. Keep the path the deck takes from slide 2 to the closing and every fact claim already approved. Never make a slide denser, flatter or more like fine print to gain precision. When earlierAttempts lists a revision that scored lower, do not repeat what made it worse.";

export const DECK_DEVELOP_INSTRUCTION = "Edit the deck in develop and return it with its id. Keep its path and its slides; change only what a fact, a program rule or the flow into the closing requires, in as few words as possible. A deck that is already right comes back unchanged. It also competes as written, so an edit only helps when it is better.";

const newDecksInstruction = (count: number) => `Then write ${count} new ${count === 1 ? "deck" : "decks"}, with ids ${Array.from({ length: count }, (_, index) => `n${index + 1}`).join(", ")}: each a different path from slide 2 to the closing, built to answer the issues and suggestions.`;

/** How the deck's requests name things. */
export const DECK_WORDS: FunnelWords<Draft2DeckCandidate, "decks"> = {
  task: "decks",
  listKey: "decks",
  label: (candidate) => ({ headlines: candidate.slides.map((slide) => slide.headline).join(" / ") }),
  noCleanNote: "No deck so far is clean enough to revise. Write new decks, each a different path from every deck in anglesSoFar, that avoid these issues.",
  revise: DECK_REVISION_INSTRUCTION,
  develop: DECK_DEVELOP_INSTRUCTION,
  newCandidates: newDecksInstruction,
};

/** The fix pass's request: the flagged decks with the program's findings on each, to fix in place before the judge reads the round. */
export const deckFixRequest = (flagged: readonly Draft2DeckCandidate[], findings: readonly FunnelIssue[]) => funnelFixRequest(DECK_WORDS, flagged, findings);

export function deckExploreRequest(candidatesWanted: number, last?: Draft2DeckRound, versions: readonly Draft2DeckVersion[] = []) {
  return funnelExploreRequest(DECK_WORDS, candidatesWanted, last, versions);
}

export function deckRefineRequest(targets: readonly Draft2DeckVersion[], versions: readonly Draft2DeckVersion[], regressions: readonly Draft2DeckRegression[], last: Draft2DeckRound | undefined, newDecks = 0, proposals: readonly Draft2DeckCandidate[] = []) {
  return funnelRefineRequest(DECK_WORDS, targets, versions, regressions, last, newDecks, proposals);
}

export function deckJudgeRequest(plan: readonly FunnelPlanRound[], round: number, candidates: readonly Draft2DeckCandidate[], mechanical: readonly Draft2DeckIssue[], revised: readonly Draft2DeckVersion[]) {
  return funnelJudgeRequest(DECK_WORDS.task, plan, round, candidates, mechanical, revised);
}

/** The closing as the deck's models read it: its slides and the facts they cite. */
export const closingForDeck = (closing: Draft2DeckClosing) => ({
  ...(closing.penultimate ? { penultimate: closing.penultimate } : {}),
  last: closing.last,
});

/** The deck's shape as the models read it. */
export const shapeForModels = (shape: Draft2DeckShape) => shape.kind === "arc"
  ? { kind: "arc", slides: `${shape.min} to ${shape.max}` }
  : { kind: shape.kind, slides: shape.items.length, items: shape.items };
