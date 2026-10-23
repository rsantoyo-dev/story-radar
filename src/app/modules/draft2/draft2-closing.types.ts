import { abbreviationBreaches, abbreviationFinding, explainedAbbreviations } from "./draft2-abbreviations.types";
import { isChecklist } from "./draft2-caveats.types";
import { addressBreaches, addressFinding, type Draft2Reader } from "./draft2-address.types";
import { comparableText, type Draft2Fact } from "./draft2-facts.types";
import { leverForModels } from "./draft2-levers.types";
import { beatFactsFinding, beatFactsMissing, type Draft2FocusSnapshot, type Draft2FocusStructureKind } from "./draft2-focus.types";
import { type FunnelPlanRound,
  funnelEvaluationSchema, funnelExploreRequest, funnelFixRequest, funnelFactIds, funnelJudgeRequest, funnelParseCandidates, funnelParseEvaluation, funnelRecord,
  funnelRefineRequest, funnelText, funnelWordCount, headlineKey, longWords, numbersIn, statedNumbers, wordOverlap,
  type FunnelCandidate, type FunnelEvaluation, type FunnelGate, type FunnelIssue, type FunnelRegression, type FunnelRole, type FunnelRound,
  type FunnelRun, type FunnelScore, type FunnelVersion, type FunnelWords,
} from "./draft2-funnel";
import type { Draft2OpeningCandidate } from "./draft2-opening.types";

/**
 * Closing, the Draft 2 step after the Opening: how the story ends, written
 * against the opening it ends, on the shared funnel (draft2-funnel.ts). For
 * an arc, two slides judged as one unit: the penultimate pays the cover's
 * promise in full, and the last says what it means for the reader, with the
 * one call to action the focus's goal asks for, in the publication's
 * call-to-action style. For a list or steps, one slide: the plan for the
 * period or the result, and the call to action (the last item or step
 * belongs to the deck). Claude writes, Sol judges, as in the Opening:
 *   round 1: 8 closings → the judge scores 8, proposes 2
 *   round 2: 2 revised + 2 originals + 2 edits = 6 → the judge's pick
 * Everything here is pure: the closing's contracts, schemas, parsing, the
 * mechanical checks and the requests, on the funnel's bookkeeping.
 */
export const CLOSING_CANDIDATES = 8;
/** Round 1 explores eight closings at medium effort, as the other steps' first rounds do (real runs judged it at high: 131–207 s); the revision thinks hard. */
export const CLOSING_ROUND_PLAN: readonly FunnelPlanRound[] = [
  { revise: 0, fresh: CLOSING_CANDIDATES, proposals: 2, effort: "medium" },
  { revise: 2, fresh: 0, proposals: 0 },
];
/** v3 (2026-10-16): the same two rounds, the writer at medium on both and the judge at low. */
export const CLOSING_PLAN_V3: readonly FunnelPlanRound[] = [
  { revise: 0, fresh: CLOSING_CANDIDATES, proposals: 2, effort: "medium", judgeEffort: "low" },
  { revise: 2, fresh: 0, proposals: 0, effort: "medium", judgeEffort: "low" },
];
/** The plan a run follows, by its pipeline. */
export const closingPlan = (pipeline: "v2" | "v3"): readonly FunnelPlanRound[] => pipeline === "v3" ? CLOSING_PLAN_V3 : CLOSING_ROUND_PLAN;
const MAX_PROPOSALS = Math.max(...CLOSING_ROUND_PLAN.map((plan) => plan.proposals));
export const CLOSING_MAX_ROUNDS = CLOSING_ROUND_PLAN.length;
export const CLOSING_ACCEPT_SCORE = 95;
export const CLOSING_CRITERION_FLOOR = 85;
export const PENULTIMATE_HEADLINE_MAX_WORDS = 8;
export const PENULTIMATE_BODY_MAX_WORDS = 30;
export const LAST_HEADLINE_MAX_WORDS = 8;
export const LAST_BODY_MAX_WORDS = 25;
/** A one-slide closing carries the plan for the period or the result, so its body has more room. */
export const LAST_PLAN_BODY_MAX_WORDS = 40;
export const CTA_MAX_WORDS = 14;
/** A closing slide repeats the cover or slide 2 when this share of their longer words is the same. */
export const CLOSING_RESTATEMENT_OVERLAP = 0.5;

export const CLOSING_CRITERIA = ["resolution", "meaning", "action", "continuity", "grounding", "voice", "focus", "originality"] as const;
export const CLOSING_MECHANICAL_CODES = [
  "FACT_UNKNOWN", "NO_FACTS", "PENULTIMATE_HEADLINE_TOO_LONG", "PENULTIMATE_BODY_TOO_LONG", "LAST_HEADLINE_TOO_LONG", "LAST_BODY_TOO_LONG",
  "CTA_TOO_LONG", "CTA_MISSING", "RECAP_LABEL", "RESTATES_OPENING", "UNSUPPORTED_NUMBER", "TOO_MANY_EMOJIS", "DUPLICATE_CANDIDATE", "WRONG_ADDRESS", "ABBREVIATION", "BEAT_FACTS_MISSING",
  "CLOSING_IS_CHECKLIST",
] as const;
export const CLOSING_JUDGE_CODES = ["UNRESOLVED", "RECAP", "WEAK_MEANING", "OFF_GOAL", "BREAKS_CONTINUITY", "OVERCLAIMS", "OFF_VOICE", "OFF_FOCUS", "OTHER"] as const;
export const CLOSING_ISSUE_CODES = [...CLOSING_MECHANICAL_CODES, ...CLOSING_JUDGE_CODES] as const;
export const CLOSING_GATE: FunnelGate = { criteria: CLOSING_CRITERIA, accept: CLOSING_ACCEPT_SCORE, floor: CLOSING_CRITERION_FLOOR };

export type Draft2ClosingCriterion = (typeof CLOSING_CRITERIA)[number];
export type Draft2ClosingIssueCode = (typeof CLOSING_ISSUE_CODES)[number];
/** two-slides: an arc ends on the penultimate and the last slide; one-slide: a list or steps ends on the last. */
export type Draft2ClosingShape = "two-slides" | "one-slide";

/** The closing's word limits for its shape, as the writer reads them in each request (the program checks the same constants). */
export const closingWordLimits = (shape: Draft2ClosingShape): Readonly<Record<string, number>> => shape === "one-slide"
  ? { lastHeadline: LAST_HEADLINE_MAX_WORDS, lastBody: LAST_PLAN_BODY_MAX_WORDS, cta: CTA_MAX_WORDS }
  : { penultimateHeadline: PENULTIMATE_HEADLINE_MAX_WORDS, penultimateBody: PENULTIMATE_BODY_MAX_WORDS, lastHeadline: LAST_HEADLINE_MAX_WORDS, lastBody: LAST_BODY_MAX_WORDS, cta: CTA_MAX_WORDS };

export type Draft2ClosingCandidate = FunnelCandidate & {
  /** Two-slides only: the slide before the last, which pays the cover's promise in full. */
  penultimate?: { headline: string; body: string; factIds: string[] };
  /** What the story means for the reader, and the one call to action (empty only on a grave story). */
  last: { headline: string; body: string; cta: string; factIds: string[] };
};

export type Draft2ClosingIssue = FunnelIssue & { code: Draft2ClosingIssueCode; part?: "penultimate" | "last" };

export type Draft2ClosingScore = FunnelScore & {
  resolution: number;
  meaning: number;
  action: number;
  continuity: number;
  grounding: number;
  voice: number;
  focus: number;
  /** Against the predictable ending of this subject (the judges' originality standard); absent on scores stored before it was scored. */
  originality?: number;
};

export type Draft2ClosingEvaluation = FunnelEvaluation<Draft2ClosingCandidate, Draft2ClosingScore, Draft2ClosingIssue>;
export type Draft2ClosingRound = FunnelRound<Draft2ClosingCandidate, Draft2ClosingScore, Draft2ClosingIssue>;
export type Draft2ClosingVersion = FunnelVersion<Draft2ClosingCandidate, Draft2ClosingScore, Draft2ClosingIssue>;
export type Draft2ClosingRegression = FunnelRegression;

/** The opening a closing ends, as the run started: the version's id and its texts. */
export type Draft2ClosingOpening = Pick<Draft2OpeningCandidate, "id" | "cover" | "slide2" | "lever">;

/** What the closing's calls to action follow besides the focus's goal: the publication's style and emoji allowance. */
export type Draft2ClosingCtaRules = { style: string; emojis: number };

export type Draft2Closing = FunnelRun<Draft2ClosingCandidate, Draft2ClosingScore, Draft2ClosingIssue> & {
  writer?: FunnelRole;
  judge?: FunnelRole;
  /** The opening this run ends and the focus that opening followed, which this run follows too. */
  opening?: Draft2ClosingOpening;
  focus?: Draft2FocusSnapshot;
  shape?: Draft2ClosingShape;
  /** Earlier runs of the step on this session, oldest first, without their rounds. */
  previousRuns?: Draft2ClosingRun[];
};

export type Draft2ClosingRun = Omit<Draft2Closing, "rounds" | "previousRuns">;

/** The shape a focus's structure asks for: an arc ends on two slides, a list or steps on one. */
export const closingShape = (structure: Draft2FocusStructureKind): Draft2ClosingShape => structure === "arc" ? "two-slides" : "one-slide";

const factIds = { type: "array", maxItems: 10, items: { type: "string" } };
const penultimateSlide = {
  type: "object",
  properties: { headline: { type: "string" }, body: { type: "string" }, factIds },
  required: ["headline", "body", "factIds"],
  additionalProperties: false,
};
const lastSlide = {
  type: "object",
  properties: { headline: { type: "string" }, body: { type: "string" }, cta: { type: "string" }, factIds },
  required: ["headline", "body", "cta", "factIds"],
  additionalProperties: false,
};

/** One closing, as the writer writes it and the judge proposes it, in the run's shape. */
function closingItem(shape: Draft2ClosingShape) {
  const two = shape === "two-slides";
  return {
    type: "object",
    properties: { id: { type: "string" }, ...(two ? { penultimate: penultimateSlide } : {}), last: lastSlide, angle: { type: "string" } },
    required: ["id", ...(two ? ["penultimate"] : []), "last", "angle"],
    additionalProperties: false,
  };
}

/** The writer's answer: the complete candidate list, in the run's shape. */
export function closingSchema(shape: Draft2ClosingShape): Record<string, unknown> {
  return {
    type: "object",
    properties: { candidates: { type: "array", minItems: 1, maxItems: CLOSING_CANDIDATES, items: closingItem(shape) } },
    required: ["candidates"],
    additionalProperties: false,
  };
}

/** The judge's answer: scores, issues, the verdict and its own closings, in the run's shape. */
export function closingEvaluationSchema(shape: Draft2ClosingShape): Record<string, unknown> {
  return funnelEvaluationSchema({ criteria: CLOSING_CRITERIA, codes: CLOSING_ISSUE_CODES, maxScored: CLOSING_CANDIDATES, item: closingItem(shape), maxProposals: MAX_PROPOSALS });
}

/** One closing from a model's answer in the run's shape, or undefined when a part is missing or malformed; a penultimate a one-slide closing should not have is dropped. */
function closingFrom(shape: Draft2ClosingShape) {
  return (raw: unknown, fallbackId: string): Draft2ClosingCandidate | undefined => {
    const item = funnelRecord(raw);
    const last = funnelRecord(item.last);
    const lastHeadline = funnelText(last.headline, 300);
    const lastBody = funnelText(last.body, 1_000);
    const cta = typeof last.cta === "string" && last.cta.trim().length <= 300 ? last.cta.trim() : undefined;
    const lastFacts = funnelFactIds(last.factIds);
    if (!lastHeadline || !lastBody || cta === undefined || !lastFacts) return undefined;
    let penultimate: Draft2ClosingCandidate["penultimate"];
    if (shape === "two-slides") {
      const slide = funnelRecord(item.penultimate);
      const headline = funnelText(slide.headline, 300);
      const body = funnelText(slide.body, 1_000);
      const slideFacts = funnelFactIds(slide.factIds);
      if (!headline || !body || !slideFacts) return undefined;
      penultimate = { headline, body, factIds: slideFacts };
    }
    return {
      id: funnelText(item.id, 24) ?? fallbackId,
      ...(penultimate ? { penultimate } : {}),
      last: { headline: lastHeadline, body: lastBody, cta, factIds: lastFacts },
      angle: funnelText(item.angle, 400) ?? "",
    };
  };
}

/** The writer's answer as candidates; anything malformed is a response error, never persisted. */
export function parseClosingCandidates(answer: string, shape: Draft2ClosingShape): Draft2ClosingCandidate[] {
  return funnelParseCandidates(answer, closingFrom(shape), CLOSING_CANDIDATES);
}

/** The judge's answer as an evaluation of these candidates (see funnelParseEvaluation). */
export function parseClosingEvaluation(answer: string, candidateIds: readonly string[], shape: Draft2ClosingShape): Draft2ClosingEvaluation {
  return funnelParseEvaluation(answer, candidateIds, { criteria: CLOSING_CRITERIA, codes: CLOSING_ISSUE_CODES, parts: ["penultimate", "last"], parseProposal: closingFrom(shape), maxProposals: MAX_PROPOSALS });
}

/** A summary label instead of an ending, in the publications' languages. */
const RECAP = /\b(in summary|to sum up|in short|to recap|the bottom line|en résumé|en bref|pour résumer|en somme|en resumen|en conclusión|en conclusion|para resumir|resumiendo|en síntesis)\b/iu;
const EMOJI = /\p{Extended_Pictographic}/gu;

/**
 * The program's findings on each closing, before the judge; any one keeps a
 * candidate from winning. Besides lengths, fact ids and numbers (the items a
 * list or steps focus names count as stated), a closing must carry a call to
 * action unless the story is grave, must not be a summary label, must not
 * repeat the opening, and keeps to the publication's emoji allowance.
 */
export function mechanicalClosingIssues(candidates: readonly Draft2ClosingCandidate[], facts: readonly Draft2Fact[], { opening, shape, grave, itemCount, emojis, reader, beats }: {
  opening: Draft2ClosingOpening; shape: Draft2ClosingShape; grave: boolean; itemCount?: number; emojis: number; reader?: Draft2Reader;
  /** The facts the spine's penultimate and last beats rest on: each slide cites enough of its own (BEAT_FACTS_MISSING). */
  beats?: { penultimate?: readonly string[]; last?: readonly string[] };
}): Draft2ClosingIssue[] {
  const byId = new Map(facts.map((fact) => [fact.id, fact]));
  const explained = explainedAbbreviations(facts);
  const openingSlides = [
    ["cover", longWords(`${opening.cover.headline} ${opening.cover.subheadline}`)],
    ["slide 2", longWords(`${opening.slide2.headline} ${opening.slide2.body}`)],
  ] as const;
  const headlines = new Map<string, Draft2ClosingCandidate>();
  const issues: Draft2ClosingIssue[] = [];
  for (const candidate of candidates) {
    const add = (code: Draft2ClosingIssueCode, part: "penultimate" | "last" | undefined, detail: string) =>
      issues.push({ code, candidateId: candidate.id, ...(part ? { part } : {}), detail });
    const { penultimate, last } = candidate;
    const parts = [...(penultimate ? [["penultimate", penultimate.factIds] as const] : []), ["last", last.factIds] as const];
    for (const [part, ids] of parts) {
      if (!ids.length) add("NO_FACTS", part, `The ${part === "last" ? "last slide" : "penultimate slide"} cites no fact; every sentence rests on verified facts.`);
      const unknown = ids.filter((id) => !byId.has(id));
      if (unknown.length) add("FACT_UNKNOWN", part, `Cites ${unknown.join(", ")}, which ${unknown.length === 1 ? "is not a verified fact" : "are not verified facts"}.`);
    }
    const lengths = [
      ...(penultimate ? [
        ["PENULTIMATE_HEADLINE_TOO_LONG", "penultimate", "penultimate headline", penultimate.headline, PENULTIMATE_HEADLINE_MAX_WORDS],
        ["PENULTIMATE_BODY_TOO_LONG", "penultimate", "penultimate body", penultimate.body, PENULTIMATE_BODY_MAX_WORDS],
      ] as const : []),
      ["LAST_HEADLINE_TOO_LONG", "last", "last headline", last.headline, LAST_HEADLINE_MAX_WORDS],
      ["LAST_BODY_TOO_LONG", "last", "last body", last.body, shape === "one-slide" ? LAST_PLAN_BODY_MAX_WORDS : LAST_BODY_MAX_WORDS],
      ["CTA_TOO_LONG", "last", "call to action", last.cta, CTA_MAX_WORDS],
    ] as const;
    for (const [code, part, label, value, limit] of lengths) {
      const words = funnelWordCount(value);
      if (words > limit) add(code, part, `The ${label} has ${words} words; the limit is ${limit}.`);
    }
    if (!last.cta && !grave) add("CTA_MISSING", "last", "The last slide has no call to action; only a grave story may end without one.");
    // Each slide carries the facts its spine beat rests on: a slide that spends its words elsewhere leaves them to no one.
    for (const [part, ids, label] of [...(penultimate ? [["penultimate", penultimate.factIds, "The penultimate slide"] as const] : []), ["last", last.factIds, "The last slide"] as const]) {
      const beat = beats?.[part];
      const missing = beatFactsMissing(ids, beat);
      if (missing.length && beat) add("BEAT_FACTS_MISSING", part, beatFactsFinding(label, missing, beat, facts));
    }
    // One form of address on the whole post: the call to action and the slide above it included ("Pour vos sorties…" over "Suis Salut Brossard").
    for (const [part, value] of [...(penultimate ? [["penultimate", `${penultimate.headline}\n${penultimate.body}`] as const] : []), ["last", `${last.headline}\n${last.body}\n${last.cta}`] as const]) {
      const words = addressBreaches(value, reader);
      if (words.length && reader) add("WRONG_ADDRESS", part, addressFinding(words, reader));
      // The reader has seen the opening (and the slide above the last): an abbreviation spelled out there may return.
      const seen = [opening.cover.headline, opening.cover.subheadline, opening.slide2.headline, opening.slide2.body, ...(part === "last" && penultimate ? [penultimate.headline, penultimate.body] : [])].join("\n");
      const abbreviations = abbreviationBreaches(value, explained, seen);
      if (abbreviations.length) add("ABBREVIATION", part, abbreviationFinding(abbreviations, explained));
    }
    for (const [part, value] of [...(penultimate ? [["penultimate", `${penultimate.headline} ${penultimate.body}`] as const] : []), ["last", `${last.headline} ${last.body}`] as const]) {
      const recap = RECAP.exec(value);
      if (recap) add("RECAP_LABEL", part, `"${recap[0]}" sums up instead of ending the story.`);
    }
    // Caveats are not content (2026-10-22): a closing that is a list of checks ends nothing; the checks go in the caption, once.
    for (const [part, slide] of [...(penultimate ? [["penultimate", penultimate] as const] : []), ["last", last] as const]) {
      const checklist = isChecklist(slide.headline, slide.body);
      if (checklist) add("CLOSING_IS_CHECKLIST", part, `The ${part === "last" ? "last slide" : "penultimate slide"} reads as a checklist ("${checklist}"): the closing ends the story, on what it means for the reader or the choice it leaves them; the checks go in the caption, once.`);
    }
    for (const [part, value] of [...(penultimate ? [["penultimate", `${penultimate.headline} ${penultimate.body}`] as const] : []), ["last", `${last.headline} ${last.body}`] as const]) {
      const words = longWords(value);
      const repeated = openingSlides.find(([, slide]) => wordOverlap(words, slide) >= CLOSING_RESTATEMENT_OVERLAP);
      if (repeated) add("RESTATES_OPENING", part, `The ${part === "last" ? "last slide" : "penultimate slide"} repeats the ${repeated[0]} instead of ending the story.`);
    }
    const closingText = [penultimate?.headline, penultimate?.body, last.headline, last.body].filter(Boolean).join(" ");
    const cited = [...(penultimate?.factIds ?? []), ...last.factIds].flatMap((id) => { const fact = byId.get(id); return fact ? [fact] : []; });
    const stated = statedNumbers(cited, itemCount);
    for (const [part, value] of [...(penultimate ? [["penultimate", `${penultimate.headline} ${penultimate.body}`] as const] : []), ["last", `${last.headline} ${last.body} ${last.cta}`] as const]) {
      const unsupported = [...new Set(numbersIn(value).filter((number) => !stated.has(number.digits)).map((number) => number.written))];
      if (unsupported.length) add("UNSUPPORTED_NUMBER", part, `${unsupported.join(", ")} ${unsupported.length === 1 ? "is" : "are"} not stated by the facts this candidate cites.`);
    }
    const used = `${closingText} ${last.cta}`.match(EMOJI)?.length ?? 0;
    if (used > emojis) add("TOO_MANY_EMOJIS", undefined, emojis ? `The closing uses ${used} emojis; the publication allows ${emojis}.` : "The publication allows no emoji.");
    // A proposal's original and the writer's edit may share a headline on purpose: the edit kept what worked.
    const key = headlineKey(`${penultimate?.headline ?? ""} ${last.headline}`);
    const earlier = headlines.get(key);
    if (earlier && !(candidate.proposalOf && earlier.proposalOf === candidate.proposalOf)) add("DUPLICATE_CANDIDATE", undefined, `The closing's headlines repeat ${earlier.id}'s.`);
    else if (!earlier) headlines.set(key, candidate);
  }
  return issues;
}

/** Whether two closings say the same thing: the same texts and the same cited facts. */
export const sameClosing = (a: Draft2ClosingCandidate, b: Draft2ClosingCandidate) => {
  const texts = (candidate: Draft2ClosingCandidate) => [candidate.penultimate?.headline ?? "", candidate.penultimate?.body ?? "", candidate.last.headline, candidate.last.body, candidate.last.cta].map(comparableText).join("\n");
  const cites = (candidate: Draft2ClosingCandidate) => `${candidate.penultimate?.factIds.join() ?? ""}|${candidate.last.factIds.join()}`;
  return texts(a) === texts(b) && cites(a) === cites(b);
};

export const CLOSING_REVISION_INSTRUCTION = "Revise each closing in closings and return exactly one candidate per closing, with the same id. Keep how it resolves the cover's promise, what it tells the reader, its call to action and every fact claim already approved, and keep what makes it land: the turn, the image or the line the reader carries away. Fix what its issues name in as few words as possible; never make it flatter, more bureaucratic or more like a summary to gain precision. When earlierAttempts lists a revision that scored lower, do not repeat what made it worse.";

export const CLOSING_DEVELOP_INSTRUCTION = "Edit each proposal in develop and return it with the proposal's id. Keep what makes it land and keep its headlines unless a fact or a program rule requires a change; change only what must change, in as few words as possible, and never make it more literal. A proposal that is already right comes back unchanged. The proposal also competes as written, so an edit only helps when it is better.";

const newClosingsInstruction = (count: number) => `Then write ${count} new ${count === 1 ? "closing" : "closings"}, with ids ${Array.from({ length: count }, (_, index) => `n${index + 1}`).join(", ")}: each a different way to end from every closing in anglesSoFar and from the ones you revise or edit, built to answer the issues and suggestions.`;

/** How the closing's requests name things. */
export const CLOSING_WORDS: FunnelWords<Draft2ClosingCandidate, "closings"> = {
  task: "closings",
  listKey: "closings",
  label: (candidate) => ({ lastHeadline: candidate.last.headline }),
  noCleanNote: "No closing so far is clean enough to revise. Write new closings, each different from every closing in anglesSoFar, that avoid these issues.",
  revise: CLOSING_REVISION_INSTRUCTION,
  develop: CLOSING_DEVELOP_INSTRUCTION,
  newCandidates: newClosingsInstruction,
};

/** The fix pass's request: the flagged closings with the program's findings on each, to fix in place before the judge reads the round. */
export const closingFixRequest = (flagged: readonly Draft2ClosingCandidate[], findings: readonly FunnelIssue[]) => funnelFixRequest(CLOSING_WORDS, flagged, findings);

export function closingExploreRequest(candidatesWanted: number, last?: Draft2ClosingRound, versions: readonly Draft2ClosingVersion[] = []) {
  return funnelExploreRequest(CLOSING_WORDS, candidatesWanted, last, versions);
}

export function closingRefineRequest(targets: readonly Draft2ClosingVersion[], versions: readonly Draft2ClosingVersion[], regressions: readonly Draft2ClosingRegression[], last: Draft2ClosingRound | undefined, newClosings = 0, proposals: readonly Draft2ClosingCandidate[] = []) {
  return funnelRefineRequest(CLOSING_WORDS, targets, versions, regressions, last, newClosings, proposals);
}

export function closingJudgeRequest(plan: readonly FunnelPlanRound[], round: number, candidates: readonly Draft2ClosingCandidate[], mechanical: readonly Draft2ClosingIssue[], revised: readonly Draft2ClosingVersion[]) {
  return funnelJudgeRequest(CLOSING_WORDS.task, plan, round, candidates, mechanical, revised);
}

/** The opening as the closing's models read it: its four texts, with the facts each part cites. */
export const openingForClosing = (opening: Draft2ClosingOpening) => ({
  cover: { headline: opening.cover.headline, subheadline: opening.cover.subheadline, factIds: opening.cover.factIds },
  slide2: { headline: opening.slide2.headline, body: opening.slide2.body, factIds: opening.slide2.factIds },
  // The promise the cover made: the carousel keeps it.
  ...(opening.lever ? { lever: leverForModels(opening.lever) } : {}),
});

/** The publication's call-to-action rules, added to the brand brief for both models. */
export function callToActionBrief(rules: Draft2ClosingCtaRules): string {
  const style = rules.style.replace(/\s+/g, " ").trim();
  return [
    "# Calls to action",
    style ? `- The publication's style (its voice and wording; the focus's goal decides the action): ${style}` : "- The publication sets no style: one natural action in its voice.",
    rules.emojis > 0 ? `- Emojis: at most ${rules.emojis} in the whole closing.` : "- Emojis: none.",
  ].join("\n");
}
