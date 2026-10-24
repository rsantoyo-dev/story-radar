import type { Draft2Pipeline } from "./draft2-models";
import { abbreviationBreaches, abbreviationFinding, explainedAbbreviations } from "./draft2-abbreviations.types";
import { choreIn, opensWithCaveat, withoutPlanningLabels } from "./draft2-caveats.types";
import { comparableText, type Draft2Fact } from "./draft2-facts.types";
import { addressBreaches, addressFinding, type Draft2Reader } from "./draft2-address.types";
import { beatFactsFinding, beatFactsMissing, type Draft2FocusGuard, type Draft2FocusSnapshot } from "./draft2-focus.types";
import { FREE_LEVER, leverName, leverSupported, stockPhraseIn } from "./draft2-levers.types";
import {
  criterionOf, factsSnapshot, funnelAcceptedWinner, funnelBestClean, funnelBestVersions, funnelEvaluationSchema, funnelExploreRequest, funnelFixRequest, funnelFactIds,
  funnelFreshWanted, funnelJudgeRequest, funnelParseCandidates, funnelParseEvaluation, funnelRecord, funnelRefineRequest, funnelRegressions,
  funnelRenumbered, funnelRenumberedProposals, funnelResumeRound, funnelReviewNote, funnelRunSummary, funnelScorePasses, funnelTargets, funnelText,
  funnelVersions, funnelWordCount, funnelWrittenCandidates, hasMaterialError as funnelHasMaterialError, headlineKey, longWords, numbersIn, statedNumbers, wordOverlap,
  type FunnelCandidate, type FunnelEvaluation, type FunnelGate, type FunnelIssue, type FunnelPlanRound, type FunnelRegression, type FunnelRole, type FunnelRound,
  type FunnelRun, type FunnelScore, type FunnelVersion, type FunnelWords,
} from "./draft2-funnel";

/**
 * Opening, a Draft 2 step after the Focus: the cover (headline + subheadline)
 * and slide 2 (headline + body), judged as one unit, on the shared funnel
 * (draft2-funnel.ts). A writer (Claude since the fifth run) proposes
 * candidates from the verified facts; the program checks what a program can
 * (lengths, fact ids, numbers, attribution, repetition); a judge (Sol since
 * the fifth run) scores them on the hooks skill and proposes openings of its
 * own. In the next round each proposal competes twice, as the judge wrote it
 * and as the writer edited it, without the judge being told which is which
 * or that either is its own. The rounds narrow like a funnel
 * (OPENING_ROUND_PLAN): fifteen openings; then the three best revised beside
 * the judge's three proposals, as written and edited; then the two best
 * revised beside its last proposal, for its final pick. The program keeps
 * the better of each version and its revision, and a material factual error
 * keeps any version from winning. Every run follows the story's focus
 * (draft2-focus.types.ts), which both models read and the judge scores.
 * Everything here is pure: the opening's contracts, schemas, parsing, the
 * mechanical checks and the requests, on the funnel's bookkeeping.
 */
/** The first round's new angles: the hook matters most, so the first round explores widely. */
export const OPENING_CANDIDATES = 15;
/**
 * What each round asks: how many of the best versions so far the writer
 * revises (each from a different line of revisions), how many new angles it
 * writes, and how many openings of its own the judge proposes. Each proposal
 * competes in the next round twice: as the judge wrote it and as the writer
 * edited it. A round with fewer clean versions than it wants to revise
 * writes new angles in their place. (New angles written after round 1 never
 * won in any real run, so the judge's originals took their place.)
 *   round 1: 15 new → the judge scores 15, proposes 3   (medium effort)
 *   round 2: 3 revised + 3 originals + 3 edits = 9 → scores 9, proposes 1
 *   round 3: 2 revised + 1 original + 1 edit = 4 → the judge's final pick
 * Round 1 explores with medium effort: with the focus, fifteen openings at
 * high effort took Claude past its 24,000 output tokens (thinking, not the
 * answer) and Sol past its 240 s. The rounds that refine think hard.
 */
export const OPENING_ROUND_PLAN: readonly FunnelPlanRound[] = [
  { revise: 0, fresh: OPENING_CANDIDATES, proposals: 3, effort: "medium" },
  { revise: 3, fresh: 0, proposals: 1 },
  { revise: 2, fresh: 0, proposals: 0 },
];
/**
 * v3 (2026-10-16): five openings, each on a different lever or angle (the
 * program refuses two variants of one phrase: SIMILAR_CANDIDATE), the judge
 * at low effort proposing two; then the best revised against every finding
 * at once beside the two proposals, as written and edited, for the final
 * pick. Of the 7 winners measured under v2, 4 were proposals and 3 round-1
 * openings; none came from a later round's new angle, and the third round
 * raised the best by a point or two at most.
 */
export const OPENING_CANDIDATES_V3 = 5;
export const OPENING_PLAN_V3: readonly FunnelPlanRound[] = [
  { revise: 0, fresh: OPENING_CANDIDATES_V3, proposals: 2, effort: "medium", judgeEffort: "low" },
  { revise: 1, fresh: 0, proposals: 0, effort: "medium", judgeEffort: "low" },
];
/** The plan a run follows, by its pipeline. */
export const openingPlan = (pipeline: Draft2Pipeline): readonly FunnelPlanRound[] => pipeline !== "v2" ? OPENING_PLAN_V3 : OPENING_ROUND_PLAN;
/** What the v3 writer reads with its first round: five openings that differ in what they pull on, never in wording alone. */
export const OPENING_DISTINCT_INSTRUCTION = "Each of the five openings pulls on a different lever or angle of the story's tension, named in `angle`: five ways in, never five variants of one phrase. The program refuses a cover whose words are mostly another candidate's.";
/** Two covers sharing this share of their longer words are one angle in two wordings. */
export const OPENING_SIMILAR_OVERLAP = 0.5;
const MAX_PROPOSALS = Math.max(...OPENING_ROUND_PLAN.map((plan) => plan.proposals));
export const OPENING_MAX_ROUNDS = OPENING_ROUND_PLAN.length;
/**
 * A running opening sends a heartbeat every 30 s and checkpoints after every
 * provider call; one silent this long has stopped (its request or server
 * died) and can be continued from its last checkpoint. The other steps that
 * send a heartbeat (focus, closing) use the same window.
 */
export const OPENING_STALL_MS = 2 * 60_000;
export const OPENING_ACCEPT_SCORE = 95;
export const OPENING_CRITERION_FLOOR = 85;
/** What the writer aims for in its headlines and the cover's subheadline (each request's wordLimits, the hooks skill's aim). */
export const COVER_HEADLINE_TARGET_WORDS = 8;
export const COVER_SUBHEADLINE_TARGET_WORDS = 12;
export const SLIDE2_HEADLINE_TARGET_WORDS = 8;
/**
 * What the program accepts, and the judge reads as the limit. Since
 * 2026-10-18 the editor tolerates more than the aim ("hasta 10 en titular y
 * 16 en subtítulo"): in the eight runs before, 22% of the openings were
 * blocked for length, nearly always that alone and most by one word, which
 * cost a fix pass in 17 of 24 rounds and two points of the judge's score.
 */
export const COVER_HEADLINE_MAX_WORDS = 10;
export const COVER_SUBHEADLINE_MAX_WORDS = 16;
export const SLIDE2_HEADLINE_MAX_WORDS = 10;
export const SLIDE2_BODY_MAX_WORDS = 30;
/** The opening's word limits as the writer reads them in each request: the aims, with the body's limit; the program checks the maxima. */
export const OPENING_WORD_LIMITS = { coverHeadline: COVER_HEADLINE_TARGET_WORDS, coverSubheadline: COVER_SUBHEADLINE_TARGET_WORDS, slide2Headline: SLIDE2_HEADLINE_TARGET_WORDS, slide2Body: SLIDE2_BODY_MAX_WORDS } as const;
/** Slide 2 restates the cover when this share of their longer words is the same. */
export const SLIDE2_RESTATEMENT_OVERLAP = 0.5;

/** "focus" came with the Focus step: scores stored before it have none, and read as passing on it. */
export const OPENING_CRITERIA = ["tension", "payoff", "clarity", "grounding", "voice", "focus", "originality"] as const;
export const OPENING_MECHANICAL_CODES = [
  "FACT_UNKNOWN", "NO_FACTS", "COVER_TOO_LONG", "SUBHEADLINE_TOO_LONG", "SLIDE2_HEADLINE_TOO_LONG", "SLIDE2_BODY_TOO_LONG",
  "ATTRIBUTION_ON_COVER", "SLIDE2_RESTATES_COVER", "SLIDE2_NO_NEW_FACT", "UNSUPPORTED_NUMBER", "DUPLICATE_CANDIDATE",
  "LEVER_UNKNOWN", "LEVER_UNSUPPORTED", "STOCK_PHRASE", "GUARD_LATE", "WRONG_ADDRESS", "ABBREVIATION", "SIMILAR_CANDIDATE", "BEAT_FACTS_MISSING",
  "COVER_IS_CHORE", "BODY_IS_CAVEAT",
] as const;
export const OPENING_JUDGE_CODES = ["WEAK_TENSION", "PROMISE_NOT_PAID", "UNCLEAR", "OVERCLAIMS", "OFF_VOICE", "OFF_FOCUS", "LABEL_NOT_HOOK", "MISLEADS", "OTHER"] as const;
export const OPENING_ISSUE_CODES = [...OPENING_MECHANICAL_CODES, ...OPENING_JUDGE_CODES] as const;
/** The acceptance rule: overall ≥ 95 and no criterion below 85. */
export const OPENING_GATE: FunnelGate = { criteria: OPENING_CRITERIA, accept: OPENING_ACCEPT_SCORE, floor: OPENING_CRITERION_FLOOR };

export type Draft2OpeningCriterion = (typeof OPENING_CRITERIA)[number];
export type Draft2OpeningIssueCode = (typeof OPENING_ISSUE_CODES)[number];

export type Draft2OpeningCandidate = FunnelCandidate & {
  cover: { headline: string; subheadline: string; factIds: string[] };
  slide2: { headline: string; body: string; factIds: string[] };
  /** The hook's lever (draft2-levers.types.ts), or "free"; absent on an opening written before levers. */
  lever?: string;
};

export type Draft2OpeningIssue = FunnelIssue & { code: Draft2OpeningIssueCode; part?: "cover" | "slide2" };

export type Draft2OpeningScore = FunnelScore & {
  tension: number;
  payoff: number;
  clarity: number;
  grounding: number;
  voice: number;
  /** How well the opening follows the story's focus; absent on scores stored before the Focus step. */
  focus?: number;
  /** Against the predictable telling of this subject (the judges' originality standard); absent on scores stored before it was scored. */
  originality?: number;
};

export type Draft2OpeningEvaluation = FunnelEvaluation<Draft2OpeningCandidate, Draft2OpeningScore, Draft2OpeningIssue>;
export type Draft2OpeningRound = FunnelRound<Draft2OpeningCandidate, Draft2OpeningScore, Draft2OpeningIssue>;
export type Draft2OpeningRegression = FunnelRegression;
/** A role of the run: which provider's model played it. */
export type Draft2OpeningRole = FunnelRole;

/**
 * What a v4 draft wrote beside the carousel's words (docs/features/draft2-v4.md):
 * each slide's image intent, which the visual script realizes, and the caption
 * with its first comment, which the Caption step checks and fixes once.
 */
export type Draft2DraftExtras = {
  images: { slide: string; intent: string }[];
  caption: { text: string; hashtags: string[]; factIds: string[]; comment: string };
};

export type Draft2Opening = FunnelRun<Draft2OpeningCandidate, Draft2OpeningScore, Draft2OpeningIssue> & {
  /** Who wrote and who judged this run; a run stored before the swap has none (Sol wrote, Claude judged). */
  writer?: Draft2OpeningRole;
  judge?: Draft2OpeningRole;
  /** The focus this run followed; a run stored before the Focus step has none. */
  focus?: Draft2FocusSnapshot;
  /** v4: the image intents and the caption the draft wrote with these words. */
  draft?: Draft2DraftExtras;
  /** Earlier runs of the step on this session, oldest first, without their rounds. */
  previousRuns?: Draft2OpeningRun[];
};

/** One version of an opening with what the round it was written in found on it. */
export type Draft2OpeningVersion = FunnelVersion<Draft2OpeningCandidate, Draft2OpeningScore, Draft2OpeningIssue>;

/** How an earlier run ended: its candidates, the verdict, the winner and the editor's choice. */
export type Draft2OpeningRun = Omit<Draft2Opening, "rounds" | "previousRuns">;

const factIds = { type: "array", maxItems: 10, items: { type: "string" } };

/** One opening, as the writer writes it and the judge proposes it. */
const openingItem = {
  type: "object",
  properties: {
    id: { type: "string" },
    cover: {
      type: "object",
      properties: { headline: { type: "string" }, subheadline: { type: "string" }, factIds },
      required: ["headline", "subheadline", "factIds"],
      additionalProperties: false,
    },
    slide2: {
      type: "object",
      properties: { headline: { type: "string" }, body: { type: "string" }, factIds },
      required: ["headline", "body", "factIds"],
      additionalProperties: false,
    },
    angle: { type: "string" },
    lever: { type: "string" },
  },
  required: ["id", "cover", "slide2", "angle", "lever"],
  additionalProperties: false,
};

/** The writer's answer: the complete candidate list. */
export const DRAFT2_OPENING_SCHEMA: Record<string, unknown> = {
  type: "object",
  properties: {
    candidates: { type: "array", minItems: 1, maxItems: OPENING_CANDIDATES, items: openingItem },
  },
  required: ["candidates"],
  additionalProperties: false,
};

/** The judge's answer: scores, issues and the verdict on a candidate list. */
export const DRAFT2_OPENING_EVALUATION_SCHEMA: Record<string, unknown> = funnelEvaluationSchema({
  criteria: OPENING_CRITERIA, codes: OPENING_ISSUE_CODES, maxScored: OPENING_CANDIDATES, item: openingItem, maxProposals: MAX_PROPOSALS,
});

/** One opening from a model's answer, or undefined when a part is missing or malformed. Fact ids are checked by the program, not here. */
function openingFrom(raw: unknown, fallbackId: string): Draft2OpeningCandidate | undefined {
  const item = funnelRecord(raw);
  const cover = funnelRecord(item.cover);
  const slide2 = funnelRecord(item.slide2);
  const coverHeadline = funnelText(cover.headline, 300);
  const subheadline = funnelText(cover.subheadline, 500);
  const slideHeadline = funnelText(slide2.headline, 300);
  // The spine's "Ligne pratique :" is a planning label, never the reader's words.
  const slideBody = funnelText(typeof slide2.body === "string" ? withoutPlanningLabels(slide2.body) : slide2.body, 1_000);
  const coverFacts = funnelFactIds(cover.factIds);
  const slideFacts = funnelFactIds(slide2.factIds);
  if (!coverHeadline || !subheadline || !slideHeadline || !slideBody || !coverFacts || !slideFacts) return undefined;
  return {
    id: funnelText(item.id, 24) ?? fallbackId,
    cover: { headline: coverHeadline, subheadline, factIds: coverFacts },
    slide2: { headline: slideHeadline, body: slideBody, factIds: slideFacts },
    angle: funnelText(item.angle, 400) ?? "",
    ...(typeof item.lever === "string" && item.lever.trim() ? { lever: item.lever.trim().toLowerCase().slice(0, 40) } : {}),
  };
}

/** The writer's answer as candidates; anything malformed is a response error, never persisted. */
export function parseOpeningCandidates(answer: string): Draft2OpeningCandidate[] {
  return funnelParseCandidates(answer, openingFrom, OPENING_CANDIDATES);
}

/**
 * The judge's answer as an evaluation of these candidates. Every candidate
 * must be scored once, with integer scores (clamped to 1–100: the adapter
 * strips the schema's bounds), and the winner must be one of them. Issue
 * codes outside the contract become OTHER; an issue naming no known
 * candidate keeps its detail without the id.
 */
export function parseOpeningEvaluation(answer: string, candidateIds: readonly string[]): Draft2OpeningEvaluation {
  return funnelParseEvaluation(answer, candidateIds, { criteria: OPENING_CRITERIA, codes: OPENING_ISSUE_CODES, parts: ["cover", "slide2"], parseProposal: openingFrom, maxProposals: MAX_PROPOSALS });
}

/** Words a reader sees: whitespace-separated tokens with a letter or digit, so a dash or an emoji is not a word. */
export const openingWordCount = funnelWordCount;

const ATTRIBUTION = /\b(according to|says?|said|reports?|reported|claims?|selon|dit|affirme|según|afirma|dice)\b/i;

/**
 * The program's findings on each candidate, before the judge. They never
 * depend on a model and they block a candidate from winning. `itemCount`, the
 * number of items or steps the focus names, counts as a stated number: a
 * list's cover promises it ("5 things to do") though no fact states it.
 * `eligibleLevers`, this story's levers: a candidate's lever must be one of
 * them or free, and the facts its cover cites must carry what the program
 * can check of it (a figure). No cover uses a stock formula.
 */
export function mechanicalOpeningIssues(candidates: readonly Draft2OpeningCandidate[], facts: readonly Draft2Fact[], { itemCount, eligibleLevers, guards = [], reader, distinct = false, beats }: { itemCount?: number; eligibleLevers?: readonly string[]; guards?: readonly Draft2FocusGuard[]; reader?: Draft2Reader; /** v3: new openings of one round must differ in angle, not only in wording (SIMILAR_CANDIDATE). */ distinct?: boolean; /** The facts the spine's cover and slide 2 beats rest on: each slide cites enough of its own (BEAT_FACTS_MISSING). */ beats?: { cover?: readonly string[]; slide2?: readonly string[] } } = {}): Draft2OpeningIssue[] {
  const byId = new Map(facts.map((fact) => [fact.id, fact]));
  const explained = explainedAbbreviations(facts);
  const headlines = new Map<string, Draft2OpeningCandidate>();
  /** The new openings seen so far with their covers' longer words, for the similarity check. */
  const covers: { candidate: Draft2OpeningCandidate; words: Set<string> }[] = [];
  const issues: Draft2OpeningIssue[] = [];
  for (const candidate of candidates) {
    const add = (code: Draft2OpeningIssueCode, part: "cover" | "slide2" | undefined, detail: string) =>
      issues.push({ code, candidateId: candidate.id, ...(part ? { part } : {}), detail });
    const { cover, slide2 } = candidate;
    for (const [part, ids] of [["cover", cover.factIds], ["slide2", slide2.factIds]] as const) {
      if (!ids.length) add("NO_FACTS", part, `The ${part === "cover" ? "cover" : "slide 2"} cites no fact; every sentence rests on verified facts.`);
      const unknown = ids.filter((id) => !byId.has(id));
      if (unknown.length) add("FACT_UNKNOWN", part, `Cites ${unknown.join(", ")}, which ${unknown.length === 1 ? "is not a verified fact" : "are not verified facts"}.`);
    }
    const lengths = [
      ["COVER_TOO_LONG", "cover", "cover headline", cover.headline, COVER_HEADLINE_MAX_WORDS],
      ["SUBHEADLINE_TOO_LONG", "cover", "cover subheadline", cover.subheadline, COVER_SUBHEADLINE_MAX_WORDS],
      ["SLIDE2_HEADLINE_TOO_LONG", "slide2", "slide 2 headline", slide2.headline, SLIDE2_HEADLINE_MAX_WORDS],
      ["SLIDE2_BODY_TOO_LONG", "slide2", "slide 2 body", slide2.body, SLIDE2_BODY_MAX_WORDS],
    ] as const;
    for (const [code, part, label, value, limit] of lengths) {
      const words = openingWordCount(value);
      if (words > limit) add(code, part, `The ${label} has ${words} words; the limit is ${limit}.`);
    }
    const attribution = ATTRIBUTION.exec(cover.headline);
    if (attribution) add("ATTRIBUTION_ON_COVER", "cover", `The cover headline attributes ("${attribution[0]}"); attribution belongs on slide 2.`);
    if (wordOverlap(longWords(`${cover.headline} ${cover.subheadline}`), longWords(`${slide2.headline} ${slide2.body}`)) >= SLIDE2_RESTATEMENT_OVERLAP) {
      add("SLIDE2_RESTATES_COVER", "slide2", "Slide 2 repeats the cover's words instead of advancing to something new.");
    }
    if (slide2.factIds.length && slide2.factIds.every((id) => cover.factIds.includes(id))) {
      add("SLIDE2_NO_NEW_FACT", "slide2", "Slide 2 cites only facts the cover already used; its payoff needs one the cover did not spend.");
    }
    const cited = [...cover.factIds, ...slide2.factIds].flatMap((id) => { const fact = byId.get(id); return fact ? [fact] : []; });
    const stated = statedNumbers(cited, itemCount);
    for (const [part, value] of [["cover", `${cover.headline} ${cover.subheadline}`], ["slide2", `${slide2.headline} ${slide2.body}`]] as const) {
      const unsupported = [...new Set(numbersIn(value).filter((number) => !stated.has(number.digits)).map((number) => number.written))];
      if (unsupported.length) add("UNSUPPORTED_NUMBER", part, `${unsupported.join(", ")} ${unsupported.length === 1 ? "is" : "are"} not stated by the facts this candidate cites.`);
    }
    const lever = candidate.lever;
    if (eligibleLevers && lever && lever !== FREE_LEVER) {
      if (!eligibleLevers.includes(lever)) add("LEVER_UNKNOWN", "cover", `"${lever}" is not one of this story's levers (${eligibleLevers.join(", ") || "none"}), nor free.`);
      else if (!leverSupported(lever, cover.factIds.flatMap((id) => byId.get(id) ?? []))) add("LEVER_UNSUPPORTED", "cover", `${leverName(lever)} needs a number or a date in the facts the cover cites.`);
    }
    const stock = stockPhraseIn(`${cover.headline} ${cover.subheadline}`);
    if (stock) add("STOCK_PHRASE", "cover", `The cover uses the stock formula "${stock}": write the lever's mechanism in the story's own words.`);
    // Caveats are not content (2026-10-22): the cover sells the experience; a check goes in a practical line or the caption.
    const chore = choreIn(`${cover.headline} ${cover.subheadline}`);
    if (chore) add("COVER_IS_CHORE", "cover", `The cover gives the reader a chore ("${chore}"): the cover sells the experience; a check or a condition goes in its item's practical line or in the caption.`);
    if (itemCount !== undefined) {
      const caveat = opensWithCaveat(slide2.body);
      if (caveat) add("BODY_IS_CAVEAT", "slide2", `Slide 2 opens with a condition ("${caveat}") instead of what the reader does or sees; the condition goes at the end, in the practical details, or in the caption.`);
    }
    for (const [part, value] of [["cover", `${cover.headline}\n${cover.subheadline}`], ["slide2", `${slide2.headline}\n${slide2.body}`]] as const) {
      const words = addressBreaches(value, reader);
      if (words.length && reader) add("WRONG_ADDRESS", part, addressFinding(words, reader));
      // Slide 2's reader has seen the cover: an abbreviation the cover spelled out may return there. The cover is read with
      // slide 2's text, as a headline with its first paragraph: an abbreviation that text spells out may stand on the cover
      // (2026-10-20, the editor on "L'AREQ": spelled out in a text, never in a title).
      const abbreviations = abbreviationBreaches(value, explained, part === "slide2" ? `${cover.headline}\n${cover.subheadline}` : slide2.body);
      if (abbreviations.length) add("ABBREVIATION", part, abbreviationFinding(abbreviations, explained));
    }
    // Each slide carries the facts its spine beat rests on: a slide that spends its words elsewhere leaves the story's mechanism to no one.
    for (const [part, ids, label] of [["cover", cover.factIds, "The cover"], ["slide2", slide2.factIds, "Slide 2"]] as const) {
      const beat = beats?.[part];
      const missing = beatFactsMissing(ids, beat);
      if (missing.length && beat) add("BEAT_FACTS_MISSING", part, beatFactsFinding(label, missing, beat, facts));
    }
    // What the cover alone could make a reader wrongly believe is prevented before the reader can stop: on the cover or slide 2, by one of the guard's facts.
    // A list's or a procedure's guards are discharged by each item's own details on its slide (the Deck's GUARD_UNCARRIED), never by a general
    // sentence on slide 2 ("Les autres sorties n'ont pas toutes les mêmes jours", 2026-10-22).
    const carried = new Set([...cover.factIds, ...slide2.factIds]);
    for (const guard of itemCount === undefined ? guards : []) {
      if (!guard.factIds.some((id) => carried.has(id))) add("GUARD_LATE", "slide2", `A reader who stops here could believe "${guard.misreading}": the cover or slide 2 must state what prevents it, citing ${guard.factIds.join(" or ")}.`);
    }
    // A proposal's original and the writer's edit may share a headline on purpose: the edit kept what worked.
    const key = headlineKey(cover.headline);
    const earlier = headlines.get(key);
    if (earlier && !(candidate.proposalOf && earlier.proposalOf === candidate.proposalOf)) add("DUPLICATE_CANDIDATE", "cover", `The cover headline repeats ${earlier.id}'s.`);
    else if (!earlier) headlines.set(key, candidate);
    // v3: a new opening whose cover shares most of its longer words with an earlier new one is the same angle in other words (a revision or a proposal's edit is left alone).
    if (distinct && !candidate.revisionOf && !candidate.proposalOf && !earlier) {
      const words = longWords(`${cover.headline} ${cover.subheadline}`);
      const alike = covers.find((seen) => wordOverlap(seen.words, words) >= OPENING_SIMILAR_OVERLAP);
      if (alike) add("SIMILAR_CANDIDATE", "cover", `The cover says what ${alike.candidate.id}'s says in other words (${Math.round(wordOverlap(alike.words, words) * 100)}% of their longer words shared): pull on another lever or angle of the story.`);
      else covers.push({ candidate, words });
    }
  }
  return issues;
}

/** A criterion's score, or undefined on a score stored before the criterion existed (the focus). */
export const criterionScore = (score: Draft2OpeningScore, criterion: Draft2OpeningCriterion): number | undefined => criterionOf(score, criterion);

/** Whether a score meets the skill's thresholds: overall ≥ 95 and no criterion below 85 (a criterion it predates does not count). */
export function openingScorePasses(score: Draft2OpeningScore): boolean {
  return funnelScorePasses(score, OPENING_GATE);
}

/** The highest-scored candidate with no program finding and no material factual error (the judge's order breaks ties), optionally among those that pass. */
export function bestCleanCandidate(mechanical: readonly Draft2OpeningIssue[], evaluation: Draft2OpeningEvaluation, { passing = false } = {}): Draft2OpeningScore | undefined {
  return funnelBestClean(mechanical, evaluation, OPENING_GATE, { passing });
}

/**
 * The winner of an accepted round, or undefined when the round is a revise.
 * The judge must accept, and its winner must meet the thresholds with no
 * mechanical finding and no material factual error; when either blocks the
 * judge's pick, the best clean candidate that meets the thresholds wins
 * instead.
 */
export function openingAcceptedWinner(mechanical: readonly Draft2OpeningIssue[], evaluation: Draft2OpeningEvaluation): string | undefined {
  return funnelAcceptedWinner(mechanical, evaluation, OPENING_GATE);
}

export function openingIsAccepted(mechanical: readonly Draft2OpeningIssue[], evaluation: Draft2OpeningEvaluation): boolean {
  return openingAcceptedWinner(mechanical, evaluation) !== undefined;
}

/** The facts both models receive on every call, the same in every round so it is read from the prompt cache. */
export const openingFactsSnapshot = factsSnapshot;

/** Every version the run wrote, with its score and findings; a later round's candidate replaces an earlier one with the same id (the first loop reused ids). */
export function openingVersions(rounds: readonly Draft2OpeningRound[]): Draft2OpeningVersion[] {
  return funnelVersions(rounds);
}

/** Whether the judge named a material factual error on a version: it states something the facts do not. */
export const hasMaterialError = (version: Draft2OpeningVersion) => funnelHasMaterialError(version);

/**
 * The versions that may win, best first: scored, no program finding, no
 * material factual error, highest overall. A tie goes to the better
 * grounded version (conservative facts), then to the later round.
 */
export function bestOpeningVersions(versions: readonly Draft2OpeningVersion[]): Draft2OpeningVersion[] {
  return funnelBestVersions(versions);
}

/**
 * What a round revises: the best version of each line of revisions with no
 * program finding, as many lines as the round's plan wants. A version with a
 * material factual error may be revised (the revision is how it gets fixed)
 * but never wins as it stands.
 */
export function openingTargets(versions: readonly Draft2OpeningVersion[], round: number): Draft2OpeningVersion[] {
  return funnelTargets(versions, round, OPENING_ROUND_PLAN);
}

/** How many new angles a round writes: its plan's, plus one for every version it wanted to revise and could not. */
export function openingFreshWanted(round: number, targets: readonly Draft2OpeningVersion[]): number {
  return funnelFreshWanted(round, targets, OPENING_ROUND_PLAN);
}

/**
 * Revisions that came out worse than the version they revised: a lower
 * overall, a grounding loss the overall did not repay, or a program finding
 * or material factual error the previous version did not have.
 */
export function openingRegressions(revisions: readonly Draft2OpeningVersion[], previous: readonly Draft2OpeningVersion[]): Draft2OpeningRegression[] {
  return funnelRegressions(revisions, previous, OPENING_CRITERIA);
}

/** The lever of the opening the next steps build on (the editor's choice, else the winner), when it names one. */
export function chosenOpeningLever(opening: Pick<Draft2Opening, "editorChoiceId" | "winnerId" | "rounds"> | null | undefined): string | undefined {
  const chosenId = opening?.editorChoiceId ?? opening?.winnerId;
  return chosenId ? openingVersions(opening!.rounds).find((version) => version.candidate.id === chosenId)?.candidate.lever : undefined;
}

/** Whether two openings say the same thing: the same four texts and the same cited facts. */
export const sameOpening = (a: Draft2OpeningCandidate, b: Draft2OpeningCandidate) =>
  [a.cover.headline, a.cover.subheadline, a.slide2.headline, a.slide2.body].map(comparableText).join("\n") === [b.cover.headline, b.cover.subheadline, b.slide2.headline, b.slide2.body].map(comparableText).join("\n")
  && a.cover.factIds.join() === b.cover.factIds.join() && a.slide2.factIds.join() === b.slide2.factIds.join();

/**
 * This round's versions from the writer's answer. A revision keeps its
 * target's id and becomes a new version named for its round ("c3" revised in
 * round 2 becomes "c3.2"). Each of the judge's proposals competes twice,
 * under fresh ids: the writer's edit (answered under the proposal's id;
 * dropped when it changed nothing) and the proposal exactly as the judge
 * wrote it. Every other candidate is a new angle, up to the number asked.
 * When the round writes no new angle, renamed answers are matched in order.
 */
export function writtenCandidates(targets: readonly Draft2OpeningCandidate[], answer: readonly Draft2OpeningCandidate[], round: number, freshWanted: number, versions: readonly Draft2OpeningVersion[], proposals: readonly Draft2OpeningCandidate[] = []): Draft2OpeningCandidate[] {
  return funnelWrittenCandidates(targets, answer, round, freshWanted, versions, proposals, sameOpening, "openings");
}

/** The judge's proposals with ids after every proposal of the run (p1, p2…), so a development names one proposal. */
export function renumberedProposals(proposals: readonly Draft2OpeningCandidate[], rounds: readonly Draft2OpeningRound[]): Draft2OpeningCandidate[] {
  return funnelRenumberedProposals(proposals, rounds);
}

/** New angles get ids after every id the run used, so each version keeps one id for the whole run. */
export function renumberedCandidates(answer: readonly Draft2OpeningCandidate[], versions: readonly Draft2OpeningVersion[]): Draft2OpeningCandidate[] {
  return funnelRenumbered(answer, versions);
}

export const OPENING_REVISION_INSTRUCTION = "Revise each opening in openings and return exactly one candidate per opening, with the same id. Preserve its narrative promise, the payoff slide 2 delivers (with its attribution), every fact claim already approved and its creative device: the irony, surprise, tension or contrast that makes it a hook. Fix what its issues name in as few words as possible; if a fix would cost the device, find another way to keep it rather than going literal. Never make the writing flatter or more bureaucratic to gain precision. When earlierAttempts lists a revision that scored lower, do not repeat what made it worse.";

/** The instruction for the new angles a round writes beside its revisions. */
export const openingNewAnglesInstruction = (count: number) => `Then write ${count} new ${count === 1 ? "opening" : "openings"}, with ids ${Array.from({ length: count }, (_, index) => `n${index + 1}`).join(", ")}: each a different angle from every opening in anglesSoFar and from the ones you revise or develop, built to answer the issues and suggestions, in case the first angles have a ceiling.`;

/** The instruction for the proposals a round develops. */
export const OPENING_DEVELOP_INSTRUCTION = "Edit each proposal in develop and return it with the proposal's id. Keep its creative device (the irony, surprise, tension or contrast that makes it a hook) and keep its headline unless a fact or a program rule requires a change; change only what must change, in as few words as possible, and never make it more literal. A proposal that is already right comes back unchanged. The proposal also competes as written, so an edit only helps when it is better.";

/** How the opening's requests name things. */
export const OPENING_WORDS: FunnelWords<Draft2OpeningCandidate, "openings"> = {
  task: "openings",
  listKey: "openings",
  label: (candidate) => ({ coverHeadline: candidate.cover.headline }),
  noCleanNote: "No opening so far is clean enough to revise. Write new angles, each different from every opening in anglesSoFar, that avoid these issues.",
  revise: OPENING_REVISION_INSTRUCTION,
  develop: OPENING_DEVELOP_INSTRUCTION,
  newCandidates: openingNewAnglesInstruction,
};

/** What the writer receives for new angles only (the facts travel apart, where its provider caches them); after a round, what was tried and what went wrong. */
/** The fix pass's request: the flagged openings with the program's findings on each, to fix in place before the judge reads the round. */
export const openingFixRequest = (flagged: readonly Draft2OpeningCandidate[], findings: readonly FunnelIssue[]) => funnelFixRequest(OPENING_WORDS, flagged, findings);

export function openingExploreRequest(candidatesWanted: number, last?: Draft2OpeningRound, versions: readonly Draft2OpeningVersion[] = []) {
  return funnelExploreRequest(OPENING_WORDS, candidatesWanted, last, versions);
}

/**
 * What the writer receives after the first round: each target to revise with
 * its scores, the program's findings and the judge's issues, and any earlier
 * attempt that came out worse; the proposals to develop; and, when the round
 * asks for new angles, every opening tried so far and what the last
 * judgment found.
 */
export function openingRefineRequest(targets: readonly Draft2OpeningVersion[], versions: readonly Draft2OpeningVersion[], regressions: readonly Draft2OpeningRegression[], last: Draft2OpeningRound | undefined, newAngles = 0, proposals: readonly Draft2OpeningCandidate[] = []) {
  return funnelRefineRequest(OPENING_WORDS, targets, versions, regressions, last, newAngles, proposals);
}

/** What the judge receives each round, beside the facts: the candidates, the versions they revise with their scores, the program's findings; the run's plan says how many proposals the round asks. */
export function openingJudgeRequest(plan: readonly FunnelPlanRound[], round: number, candidates: readonly Draft2OpeningCandidate[], mechanical: readonly Draft2OpeningIssue[], revised: readonly Draft2OpeningVersion[]) {
  return funnelJudgeRequest(OPENING_WORDS.task, plan, round, candidates, mechanical, revised);
}

/** Why a run ends without an accepted opening: the best version's weak criteria and what is left to fix on it. */
export function openingReviewNote(best: Draft2OpeningVersion | undefined, last: Draft2OpeningRound | undefined, lead: string): string {
  return funnelReviewNote(best, last, lead, OPENING_GATE, "an opening");
}

/** The round a paused or stopped run continues from: the one it paused before, else a round written but not judged, else the next. */
export function openingResumeRound(opening: Pick<Draft2Opening, "resumeRound" | "rounds">): number {
  return funnelResumeRound(opening);
}

/** An opening as it ended, for the session's record of earlier runs. */
export function openingRunSummary(opening: Draft2Opening): Draft2OpeningRun {
  return funnelRunSummary(opening);
}
