import { comparableText, Draft2ResponseError, type Draft2Fact } from "./draft2-facts.types";
import type { Draft2Provider } from "./draft2-models";

/**
 * Opening, the second Draft 2 step: the cover (headline + subheadline) and
 * slide 2 (headline + body), judged as one unit. A writer (Claude since the
 * fifth run) proposes candidates from the verified facts; the program checks
 * what a program can (lengths, fact ids, numbers, attribution, repetition);
 * a judge (Sol since the fifth run)
 * scores them on the hooks skill and proposes openings of its own. In the
 * next round each proposal competes twice, as the judge wrote it and as the
 * writer edited it, without the judge being told which is which or that
 * either is its own. The rounds narrow like a funnel (OPENING_ROUND_PLAN):
 * fifteen openings; then the three best revised beside the judge's three
 * proposals, as written and edited; then the two best revised beside its
 * last proposal, for its final pick. The program keeps the better of each
 * version and its revision, and a material factual error keeps any version
 * from winning. Everything here is pure:
 * contracts, schemas, parsing, the mechanical checks, version bookkeeping
 * and the acceptance rule.
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
 *   round 1: 15 new → the judge scores 15, proposes 3
 *   round 2: 3 revised + 3 originals + 3 edits = 9 → scores 9, proposes 1
 *   round 3: 2 revised + 1 original + 1 edit = 4 → the judge's final pick
 */
export const OPENING_ROUND_PLAN: readonly { revise: number; fresh: number; proposals: number }[] = [
  { revise: 0, fresh: OPENING_CANDIDATES, proposals: 3 },
  { revise: 3, fresh: 0, proposals: 1 },
  { revise: 2, fresh: 0, proposals: 0 },
];
const MAX_PROPOSALS = Math.max(...OPENING_ROUND_PLAN.map((plan) => plan.proposals));
export const OPENING_MAX_ROUNDS = OPENING_ROUND_PLAN.length;
/**
 * A running opening sends a heartbeat every 30 s and checkpoints after every
 * provider call; one silent this long has stopped (its request or server
 * died) and can be continued from its last checkpoint.
 */
export const OPENING_STALL_MS = 2 * 60_000;
export const OPENING_ACCEPT_SCORE = 95;
export const OPENING_CRITERION_FLOOR = 85;
export const COVER_HEADLINE_MAX_WORDS = 8;
export const COVER_SUBHEADLINE_MAX_WORDS = 18;
export const SLIDE2_HEADLINE_MAX_WORDS = 8;
export const SLIDE2_BODY_MAX_WORDS = 30;
/** Slide 2 restates the cover when this share of their longer words is the same. */
export const SLIDE2_RESTATEMENT_OVERLAP = 0.5;

export const OPENING_CRITERIA = ["tension", "payoff", "clarity", "grounding", "voice"] as const;
export const OPENING_MECHANICAL_CODES = [
  "FACT_UNKNOWN", "NO_FACTS", "COVER_TOO_LONG", "SUBHEADLINE_TOO_LONG", "SLIDE2_HEADLINE_TOO_LONG", "SLIDE2_BODY_TOO_LONG",
  "ATTRIBUTION_ON_COVER", "SLIDE2_RESTATES_COVER", "SLIDE2_NO_NEW_FACT", "UNSUPPORTED_NUMBER", "DUPLICATE_CANDIDATE",
] as const;
export const OPENING_JUDGE_CODES = ["WEAK_TENSION", "PROMISE_NOT_PAID", "UNCLEAR", "OVERCLAIMS", "OFF_VOICE", "LABEL_NOT_HOOK", "OTHER"] as const;
export const OPENING_ISSUE_CODES = [...OPENING_MECHANICAL_CODES, ...OPENING_JUDGE_CODES] as const;

export type Draft2OpeningCriterion = (typeof OPENING_CRITERIA)[number];
export type Draft2OpeningIssueCode = (typeof OPENING_ISSUE_CODES)[number];

export type Draft2OpeningCandidate = {
  /** c1, c2… for new angles; a revision names its round ("c3.2" revises c3 in round 2). Unique within a run. */
  id: string;
  cover: { headline: string; subheadline: string; factIds: string[] };
  slide2: { headline: string; body: string; factIds: string[] };
  /** One line: the tension this opening uses. */
  angle: string;
  /** The version this candidate revises; set by the program. */
  revisionOf?: string;
  /** The judge's proposal this candidate comes from; set by the program and never shown to the judge. */
  proposalOf?: string;
  /** The proposal exactly as the judge wrote it, competing beside the writer's edit; set by the program and never shown to the judge. */
  asProposed?: boolean;
};

export type Draft2OpeningIssue = {
  code: Draft2OpeningIssueCode;
  candidateId?: string;
  part?: "cover" | "slide2";
  detail: string;
  /** The judge's call that the opening states something the facts do not; it keeps the version from winning. */
  material?: boolean;
};

export type Draft2OpeningScore = {
  candidateId: string;
  tension: number;
  payoff: number;
  clarity: number;
  grounding: number;
  voice: number;
  overall: number;
  /** One sentence: why this score. */
  note: string;
};

export type Draft2OpeningEvaluation = {
  verdict: "accept" | "revise";
  winnerId: string;
  /** One per candidate. */
  scores: Draft2OpeningScore[];
  issues: Draft2OpeningIssue[];
  /** For the writer's next round. */
  suggestions: string[];
  summary: string;
  /** The judge's own openings (ids p1, p2… across the run), which the writer develops in the next round. */
  proposals?: Draft2OpeningCandidate[];
};

export type Draft2OpeningRound = {
  round: number;
  /** explore: new angles only; refine: revisions only; mixed: both. Rounds stored before refinement have none (explore). */
  kind?: "explore" | "refine" | "mixed";
  candidates: Draft2OpeningCandidate[];
  mechanical: Draft2OpeningIssue[];
  evaluation?: Draft2OpeningEvaluation;
  /** Revisions that came out worse than the version they revised; that version stays the better one. */
  regressions?: Draft2OpeningRegression[];
  at: string;
};

export type Draft2OpeningRegression = {
  /** The revision. */
  candidateId: string;
  /** The version it revised. */
  previousId: string;
  /** Overall scores, previous then revision. */
  from: number;
  to: number;
  /** What got worse: criteria as "voice 85 → 72", and program findings the previous version did not have. */
  worse: string[];
};

/** A role of the run: which provider's model played it. */
export type Draft2OpeningRole = { provider: Draft2Provider; model: string };

export type Draft2Opening = {
  /** paused: the request's time ran out before resumeRound; a continue request runs on from it with every earlier round kept. */
  status: "running" | "paused" | "ready" | "needs-review" | "failed";
  rounds: Draft2OpeningRound[];
  /** The last round's candidates; openingVersions lists every version of the run. */
  candidates: Draft2OpeningCandidate[];
  /** The last round's verdict. */
  evaluation?: Draft2OpeningEvaluation;
  /** The accepted opening (status ready), or the best version so far: a version id from any round. */
  winnerId?: string;
  /** Set by the editor; wins over winnerId downstream. */
  editorChoiceId?: string;
  editorChoiceAt?: string;
  error?: string;
  /** The round a paused run continues from. */
  resumeRound?: number;
  /** Who wrote and who judged this run; a run stored before the swap has none (Sol wrote, Claude judged). */
  writer?: Draft2OpeningRole;
  judge?: Draft2OpeningRole;
  /** Earlier runs of the step on this session, oldest first, without their rounds. */
  previousRuns?: Draft2OpeningRun[];
};

/** One version of an opening with what the round it was written in found on it. */
export type Draft2OpeningVersion = {
  candidate: Draft2OpeningCandidate;
  round: number;
  score?: Draft2OpeningScore;
  /** The program's findings; any one keeps the version from winning. */
  findings: Draft2OpeningIssue[];
  /** The judge's issues. */
  issues: Draft2OpeningIssue[];
};

/** How an earlier run ended: its candidates, the verdict, the winner and the editor's choice. */
export type Draft2OpeningRun = Omit<Draft2Opening, "rounds" | "previousRuns">;

const nullableString = { type: ["string", "null"] };
const factIds = { type: "array", maxItems: 10, items: { type: "string" } };
const score = { type: "integer", minimum: 1, maximum: 100 };

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
  },
  required: ["id", "cover", "slide2", "angle"],
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
export const DRAFT2_OPENING_EVALUATION_SCHEMA: Record<string, unknown> = {
  type: "object",
  properties: {
    verdict: { type: "string", enum: ["accept", "revise"] },
    winnerId: { type: "string" },
    scores: {
      type: "array",
      minItems: 1,
      maxItems: OPENING_CANDIDATES,
      items: {
        type: "object",
        properties: {
          candidateId: { type: "string" },
          ...Object.fromEntries(OPENING_CRITERIA.map((criterion) => [criterion, score])),
          overall: score,
          note: { type: "string" },
        },
        required: ["candidateId", ...OPENING_CRITERIA, "overall", "note"],
        additionalProperties: false,
      },
    },
    issues: {
      type: "array",
      maxItems: 40,
      items: {
        type: "object",
        properties: {
          code: { type: "string", enum: [...OPENING_ISSUE_CODES] },
          candidateId: nullableString,
          part: nullableString,
          detail: { type: "string" },
          material: { type: "boolean" },
        },
        required: ["code", "candidateId", "part", "detail", "material"],
        additionalProperties: false,
      },
    },
    suggestions: { type: "array", maxItems: 20, items: { type: "string" } },
    summary: { type: "string" },
    proposals: { type: "array", maxItems: MAX_PROPOSALS, items: openingItem },
  },
  required: ["verdict", "winnerId", "scores", "issues", "suggestions", "summary", "proposals"],
  additionalProperties: false,
};

function parseObject(answer: string, what: string): Record<string, unknown> {
  let parsed: unknown;
  try { parsed = JSON.parse(answer); } catch { throw new Draft2ResponseError(`The ${what} answer is not valid JSON`); }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Draft2ResponseError(`The ${what} answer is not an object`);
  return parsed as Record<string, unknown>;
}

const record = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const text = (value: unknown, max: number): string | undefined =>
  typeof value === "string" && value.trim() && value.trim().length <= max ? value.trim() : undefined;

function factIdList(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const ids: string[] = [];
  for (const entry of value) {
    const id = text(entry, 24);
    if (id && !ids.includes(id)) ids.push(id);
  }
  return ids.slice(0, 10);
}

/** One opening from a model's answer, or undefined when a part is missing or malformed. Fact ids are checked by the program, not here. */
function openingFrom(raw: unknown, fallbackId: string): Draft2OpeningCandidate | undefined {
  const item = record(raw);
  const cover = record(item.cover);
  const slide2 = record(item.slide2);
  const coverHeadline = text(cover.headline, 300);
  const subheadline = text(cover.subheadline, 500);
  const slideHeadline = text(slide2.headline, 300);
  const slideBody = text(slide2.body, 1_000);
  const coverFacts = factIdList(cover.factIds);
  const slideFacts = factIdList(slide2.factIds);
  if (!coverHeadline || !subheadline || !slideHeadline || !slideBody || !coverFacts || !slideFacts) return undefined;
  return {
    id: text(item.id, 24) ?? fallbackId,
    cover: { headline: coverHeadline, subheadline, factIds: coverFacts },
    slide2: { headline: slideHeadline, body: slideBody, factIds: slideFacts },
    angle: text(item.angle, 400) ?? "",
  };
}

/** The writer's answer as candidates; anything malformed is a response error, never persisted. */
export function parseOpeningCandidates(answer: string): Draft2OpeningCandidate[] {
  const body = parseObject(answer, "writer");
  if (!Array.isArray(body.candidates) || body.candidates.length === 0) throw new Draft2ResponseError("The writer returned no candidates");
  const seen = new Set<string>();
  return body.candidates.slice(0, OPENING_CANDIDATES).map((raw, index) => {
    const candidate = openingFrom(raw, `c${index + 1}`);
    const id = candidate?.id ?? text(record(raw).id, 24) ?? `c${index + 1}`;
    if (!candidate) throw new Draft2ResponseError(`Candidate ${id} is incomplete or malformed`);
    if (seen.has(id)) throw new Draft2ResponseError(`Candidate id ${id} is repeated`);
    seen.add(id);
    return candidate;
  });
}

/**
 * The judge's answer as an evaluation of these candidates. Every candidate
 * must be scored once, with integer scores (clamped to 1–100: the adapter
 * strips the schema's bounds), and the winner must be one of them. Issue
 * codes outside the contract become OTHER; an issue naming no known
 * candidate keeps its detail without the id.
 */
export function parseOpeningEvaluation(answer: string, candidateIds: readonly string[]): Draft2OpeningEvaluation {
  const body = parseObject(answer, "judge");
  const verdict = body.verdict === "accept" || body.verdict === "revise" ? body.verdict : undefined;
  const winnerId = text(body.winnerId, 24);
  const summary = text(body.summary, 1_000);
  if (!verdict || !winnerId || !summary || !Array.isArray(body.scores)) throw new Draft2ResponseError("The judge's verdict is incomplete");
  const known = new Set(candidateIds);
  const scored = new Set<string>();
  const scores = body.scores.map((raw): Draft2OpeningScore => {
    const item = record(raw);
    const candidateId = text(item.candidateId, 24);
    if (!candidateId || !known.has(candidateId)) throw new Draft2ResponseError(`The judge scored an unknown candidate (${String(item.candidateId)})`);
    if (scored.has(candidateId)) throw new Draft2ResponseError(`The judge scored ${candidateId} twice`);
    scored.add(candidateId);
    const value = (key: Draft2OpeningCriterion | "overall") => {
      const number = item[key];
      if (typeof number !== "number" || !Number.isInteger(number)) throw new Draft2ResponseError(`The judge's ${key} score for ${candidateId} is not an integer`);
      return Math.min(100, Math.max(1, number));
    };
    return {
      candidateId,
      tension: value("tension"), payoff: value("payoff"), clarity: value("clarity"), grounding: value("grounding"), voice: value("voice"),
      overall: value("overall"),
      note: text(item.note, 600) ?? "",
    };
  });
  const unscored = candidateIds.filter((id) => !scored.has(id));
  if (unscored.length) throw new Draft2ResponseError(`The judge did not score ${unscored.join(", ")}`);
  if (!scored.has(winnerId)) throw new Draft2ResponseError(`The judge's winner ${winnerId} is not one of the candidates`);
  const issues = (Array.isArray(body.issues) ? body.issues : []).slice(0, 40).flatMap((raw): Draft2OpeningIssue[] => {
    const item = record(raw);
    const detail = text(item.detail, 600);
    if (!detail) return [];
    const code = OPENING_ISSUE_CODES.find((candidate) => candidate === item.code) ?? "OTHER";
    const candidateId = text(item.candidateId, 24);
    const part = item.part === "cover" || item.part === "slide2" ? item.part : undefined;
    return [{ code, detail, ...(candidateId && known.has(candidateId) ? { candidateId } : {}), ...(part ? { part } : {}), ...(item.material === true ? { material: true } : {}) }];
  });
  const suggestions = (Array.isArray(body.suggestions) ? body.suggestions : []).slice(0, 20).flatMap((item) => { const value = text(item, 600); return value ? [value] : []; });
  // The judge's own openings are inputs for the writer: a malformed one is dropped, never fatal.
  const proposals = (Array.isArray(body.proposals) ? body.proposals : [])
    .flatMap((raw, index) => { const proposal = openingFrom(raw, `p${index + 1}`); return proposal ? [proposal] : []; })
    .slice(0, MAX_PROPOSALS);
  return { verdict, winnerId, scores, issues, suggestions, summary, ...(proposals.length ? { proposals } : {}) };
}

/** Words a reader sees: whitespace-separated tokens with a letter or digit, so a dash or an emoji is not a word. */
export function openingWordCount(value: string): number {
  return value.trim().split(/\s+/).filter((token) => /[\p{L}\p{N}]/u.test(token)).length;
}

const ATTRIBUTION = /\b(according to|says?|said|reports?|reported|claims?|selon|dit|affirme|según|afirma|dice)\b/i;

/** The longer words of a text (4+ letters), comparable across case, quotes and accents' composed forms. */
function comparableWords(value: string): Set<string> {
  return new Set((comparableText(value).match(/[\p{L}\p{M}]+/gu) ?? []).filter((word) => [...word].length >= 4));
}

function overlap(a: Set<string>, b: Set<string>): number {
  let shared = 0;
  for (const word of a) if (b.has(word)) shared++;
  const union = a.size + b.size - shared;
  return union ? shared / union : 0;
}

/** The numbers a text states, as written and without separators ("$1.5 trillion" → 15), so "1,500" and "1500" compare equal. */
function numbersIn(value: string): { written: string; digits: string }[] {
  return (value.match(/\d[\d.,]*/g) ?? []).map((match) => {
    const written = match.replace(/[.,]+$/, "");
    return { written, digits: written.replace(/[.,]/g, "") };
  });
}

const headlineKey = (value: string) => comparableText(value).replace(/[^\p{L}\p{N}]+/gu, " ").trim();

/** The program's findings on each candidate, before the judge. They never depend on a model and they block a candidate from winning. */
export function mechanicalOpeningIssues(candidates: readonly Draft2OpeningCandidate[], facts: readonly Draft2Fact[]): Draft2OpeningIssue[] {
  const byId = new Map(facts.map((fact) => [fact.id, fact]));
  const headlines = new Map<string, Draft2OpeningCandidate>();
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
    if (overlap(comparableWords(`${cover.headline} ${cover.subheadline}`), comparableWords(`${slide2.headline} ${slide2.body}`)) >= SLIDE2_RESTATEMENT_OVERLAP) {
      add("SLIDE2_RESTATES_COVER", "slide2", "Slide 2 repeats the cover's words instead of advancing to something new.");
    }
    if (slide2.factIds.length && slide2.factIds.every((id) => cover.factIds.includes(id))) {
      add("SLIDE2_NO_NEW_FACT", "slide2", "Slide 2 cites only facts the cover already used; its payoff needs one the cover did not spend.");
    }
    const cited = [...cover.factIds, ...slide2.factIds].flatMap((id) => { const fact = byId.get(id); return fact ? [fact] : []; });
    const stated = new Set(cited.flatMap((fact) => [...numbersIn(fact.claim), ...numbersIn(fact.evidence)].map((number) => number.digits)));
    for (const [part, value] of [["cover", `${cover.headline} ${cover.subheadline}`], ["slide2", `${slide2.headline} ${slide2.body}`]] as const) {
      const unsupported = [...new Set(numbersIn(value).filter((number) => !stated.has(number.digits)).map((number) => number.written))];
      if (unsupported.length) add("UNSUPPORTED_NUMBER", part, `${unsupported.join(", ")} ${unsupported.length === 1 ? "is" : "are"} not stated by the facts this candidate cites.`);
    }
    // A proposal's original and the writer's edit may share a headline on purpose: the edit kept what worked.
    const key = headlineKey(cover.headline);
    const earlier = headlines.get(key);
    if (earlier && !(candidate.proposalOf && earlier.proposalOf === candidate.proposalOf)) add("DUPLICATE_CANDIDATE", "cover", `The cover headline repeats ${earlier.id}'s.`);
    else if (!earlier) headlines.set(key, candidate);
  }
  return issues;
}

/** Whether a score meets the skill's thresholds: overall ≥ 95 and no criterion below 85. */
export function openingScorePasses(score: Draft2OpeningScore): boolean {
  return score.overall >= OPENING_ACCEPT_SCORE && OPENING_CRITERIA.every((criterion) => score[criterion] >= OPENING_CRITERION_FLOOR);
}

/** Candidates that may not win: any program finding, or a material factual error the judge named. */
const flaggedCandidates = (mechanical: readonly Draft2OpeningIssue[], evaluation?: Draft2OpeningEvaluation) => new Set(
  [...mechanical, ...(evaluation?.issues.filter((issue) => issue.material) ?? [])].flatMap((issue) => issue.candidateId ? [issue.candidateId] : []));

/** The highest-scored candidate with no program finding and no material factual error (the judge's order breaks ties), optionally among those that pass. */
export function bestCleanCandidate(mechanical: readonly Draft2OpeningIssue[], evaluation: Draft2OpeningEvaluation, { passing = false } = {}): Draft2OpeningScore | undefined {
  const flagged = flaggedCandidates(mechanical, evaluation);
  let best: Draft2OpeningScore | undefined;
  for (const score of evaluation.scores) {
    if (flagged.has(score.candidateId) || (passing && !openingScorePasses(score))) continue;
    if (!best || score.overall > best.overall) best = score;
  }
  return best;
}

/**
 * The winner of an accepted round, or undefined when the round is a revise.
 * The judge must accept, and its winner must meet the thresholds with no
 * mechanical finding and no material factual error; when either blocks the
 * judge's pick, the best clean candidate that meets the thresholds wins
 * instead.
 */
export function openingAcceptedWinner(mechanical: readonly Draft2OpeningIssue[], evaluation: Draft2OpeningEvaluation): string | undefined {
  if (evaluation.verdict !== "accept") return undefined;
  const pick = evaluation.scores.find((score) => score.candidateId === evaluation.winnerId);
  if (!pick) return undefined;
  if (!flaggedCandidates(mechanical, evaluation).has(pick.candidateId)) return openingScorePasses(pick) ? pick.candidateId : undefined;
  return bestCleanCandidate(mechanical, evaluation, { passing: true })?.candidateId;
}

export function openingIsAccepted(mechanical: readonly Draft2OpeningIssue[], evaluation: Draft2OpeningEvaluation): boolean {
  return openingAcceptedWinner(mechanical, evaluation) !== undefined;
}

/** The facts both models receive on every call, the same in every round so it is read from the prompt cache. */
export function openingFactsSnapshot(facts: readonly Draft2Fact[]) {
  return facts.map((fact) => ({
    id: fact.id, claim: fact.claim, status: fact.status,
    ...(fact.qualifier ? { qualifier: fact.qualifier } : {}), ...(fact.attribution ? { attribution: fact.attribution } : {}),
    evidence: fact.evidence, importance: fact.importance,
  }));
}

/** Every version the run wrote, with its score and findings; a later round's candidate replaces an earlier one with the same id (the first loop reused ids). */
export function openingVersions(rounds: readonly Draft2OpeningRound[]): Draft2OpeningVersion[] {
  const byId = new Map<string, Draft2OpeningVersion>();
  for (const round of rounds) {
    for (const candidate of round.candidates) {
      byId.delete(candidate.id);
      byId.set(candidate.id, {
        candidate,
        round: round.round,
        score: round.evaluation?.scores.find((score) => score.candidateId === candidate.id),
        findings: round.mechanical.filter((issue) => issue.candidateId === candidate.id),
        issues: (round.evaluation?.issues ?? []).filter((issue) => issue.candidateId === candidate.id),
      });
    }
  }
  return [...byId.values()];
}

/** Whether the judge named a material factual error on a version: it states something the facts do not. */
export const hasMaterialError = (version: Draft2OpeningVersion) => version.issues.some((issue) => issue.material);

const byScore = (a: Draft2OpeningVersion, b: Draft2OpeningVersion) =>
  b.score!.overall - a.score!.overall || b.score!.grounding - a.score!.grounding || b.round - a.round;

/**
 * The versions that may win, best first: scored, no program finding, no
 * material factual error, highest overall. A tie goes to the better
 * grounded version (conservative facts), then to the later round.
 */
export function bestOpeningVersions(versions: readonly Draft2OpeningVersion[]): Draft2OpeningVersion[] {
  return versions.filter((version) => version.score && version.findings.length === 0 && !hasMaterialError(version)).sort(byScore);
}

const rootId = (id: string) => id.split(".")[0];

/**
 * What a round revises: the best version of each line of revisions with no
 * program finding, as many lines as the round's plan wants. A version with a
 * material factual error may be revised (the revision is how it gets fixed)
 * but never wins as it stands.
 */
export function openingTargets(versions: readonly Draft2OpeningVersion[], round: number): Draft2OpeningVersion[] {
  const lines = new Set<string>();
  const best: Draft2OpeningVersion[] = [];
  for (const version of versions.filter((entry) => entry.score && entry.findings.length === 0).sort(byScore)) {
    const line = rootId(version.candidate.id);
    if (lines.has(line)) continue;
    lines.add(line);
    best.push(version);
  }
  return best.slice(0, OPENING_ROUND_PLAN[round - 1]?.revise ?? 0);
}

/** How many new angles a round writes: its plan's, plus one for every version it wanted to revise and could not. */
export function openingFreshWanted(round: number, targets: readonly Draft2OpeningVersion[]): number {
  const plan = OPENING_ROUND_PLAN[round - 1] ?? { revise: 0, fresh: 0 };
  return plan.fresh + Math.max(0, plan.revise - targets.length);
}

/**
 * Revisions that came out worse than the version they revised: a lower
 * overall, a grounding loss the overall did not repay, or a program finding
 * or material factual error the previous version did not have.
 */
export function openingRegressions(revisions: readonly Draft2OpeningVersion[], previous: readonly Draft2OpeningVersion[]): Draft2OpeningRegression[] {
  return revisions.flatMap((revision) => {
    const before = previous.find((version) => version.candidate.id === revision.candidate.revisionOf);
    if (!before?.score || !revision.score) return [];
    const worse = [
      ...OPENING_CRITERIA.filter((criterion) => revision.score![criterion] < before.score![criterion]).map((criterion) => `${criterion} ${before.score![criterion]} → ${revision.score![criterion]}`),
      ...(before.findings.length ? [] : revision.findings.map((finding) => finding.code)),
      ...(hasMaterialError(before) ? [] : revision.issues.filter((issue) => issue.material).map((issue) => `material ${issue.code}`)),
    ];
    const regressed = revision.score.overall < before.score.overall
      || (revision.score.overall === before.score.overall && revision.score.grounding < before.score.grounding)
      || (revision.findings.length > 0 && before.findings.length === 0)
      || (hasMaterialError(revision) && !hasMaterialError(before));
    return regressed ? [{ candidateId: revision.candidate.id, previousId: before.candidate.id, from: before.score.overall, to: revision.score.overall, worse }] : [];
  });
}

/** Whether two openings say the same thing: the same four texts and the same cited facts. */
const sameOpening = (a: Draft2OpeningCandidate, b: Draft2OpeningCandidate) =>
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
  const asked = [...targets, ...proposals].map((entry) => entry.id);
  const others = answer.filter((candidate) => !asked.includes(candidate.id));
  const matched = (id: string) => answer.find((candidate) => candidate.id === id) ?? (freshWanted === 0 ? others.shift() : undefined);
  const revisions = targets.flatMap((target) => {
    const revision = matched(target.id);
    return revision ? [{ ...revision, id: `${rootId(target.id)}.${round}`, revisionOf: target.id }] : [];
  });
  const edits = proposals.flatMap((proposal) => {
    const edit = matched(proposal.id);
    return edit && !sameOpening(edit, proposal) ? [{ ...edit, proposalOf: proposal.id }] : [];
  });
  const originals = proposals.map((proposal) => ({ ...proposal, proposalOf: proposal.id, asProposed: true }));
  const fresh = renumberedCandidates([...edits, ...originals, ...others.slice(0, freshWanted)], versions);
  const written = [...revisions, ...fresh];
  if (!written.length) throw new Draft2ResponseError("The writer returned none of the openings it was asked for");
  return written;
}

/** The judge's proposals with ids after every proposal of the run (p1, p2…), so a development names one proposal. */
export function renumberedProposals(proposals: readonly Draft2OpeningCandidate[], rounds: readonly Draft2OpeningRound[]): Draft2OpeningCandidate[] {
  let next = rounds.reduce((count, round) => count + (round.evaluation?.proposals?.length ?? 0), 0) + 1;
  return proposals.map((proposal) => ({ ...proposal, id: `p${next++}` }));
}

/** New angles get ids after every id the run used, so each version keeps one id for the whole run. */
export function renumberedCandidates(answer: readonly Draft2OpeningCandidate[], versions: readonly Draft2OpeningVersion[]): Draft2OpeningCandidate[] {
  let next = Math.max(0, ...versions.map((version) => Number(/^c(\d+)/.exec(version.candidate.id)?.[1] ?? 0))) + 1;
  return answer.map((candidate) => ({ ...candidate, id: `c${next++}` }));
}

/**
 * A candidate as the models read it: the version it revises, never the
 * program's bookkeeping. Which candidates develop the judge's proposals is
 * never shown, so the judge scores its own ideas blind.
 */
const shown = ({ revisionOf, proposalOf, asProposed, ...candidate }: Draft2OpeningCandidate) => {
  void proposalOf; void asProposed;
  return { ...candidate, ...(revisionOf ? { revises: revisionOf } : {}) };
};

/** Every opening tried so far, so new angles do not repeat one. */
const anglesSoFar = (versions: readonly Draft2OpeningVersion[]) =>
  versions.map((version) => ({ id: version.candidate.id, coverHeadline: version.candidate.cover.headline, ...(version.score ? { overall: version.score.overall } : {}) }));

/** What the last round's judge found, for new angles that must avoid it. */
const feedback = (last: Draft2OpeningRound) => ({
  judgeSummary: last.evaluation?.summary,
  issues: [...last.mechanical, ...(last.evaluation?.issues ?? [])],
});

/** What the writer receives for new angles only (the facts travel apart, where its provider caches them); after a round, what was tried and what went wrong. */
export function openingExploreRequest(candidatesWanted: number, last?: Draft2OpeningRound, versions: readonly Draft2OpeningVersion[] = []) {
  return {
    task: "openings",
    candidatesWanted,
    ...(last?.evaluation ? {
      note: "No opening so far is clean enough to revise. Write new angles, each different from every opening in anglesSoFar, that avoid these issues.",
      anglesSoFar: anglesSoFar(versions),
      feedback: feedback(last),
      suggestions: last.evaluation.suggestions,
    } : {}),
  };
}

export const OPENING_REVISION_INSTRUCTION = "Revise each opening in openings and return exactly one candidate per opening, with the same id. Preserve its narrative promise, the payoff slide 2 delivers (with its attribution), every fact claim already approved and its creative device: the irony, surprise, tension or contrast that makes it a hook. Fix what its issues name in as few words as possible; if a fix would cost the device, find another way to keep it rather than going literal. Never make the writing flatter or more bureaucratic to gain precision. When earlierAttempts lists a revision that scored lower, do not repeat what made it worse.";

/** The instruction for the new angles a round writes beside its revisions. */
export const openingNewAnglesInstruction = (count: number) => `Then write ${count} new ${count === 1 ? "opening" : "openings"}, with ids ${Array.from({ length: count }, (_, index) => `n${index + 1}`).join(", ")}: each a different angle from every opening in anglesSoFar and from the ones you revise or develop, built to answer the issues and suggestions, in case the first angles have a ceiling.`;

/** The instruction for the proposals a round develops. */
export const OPENING_DEVELOP_INSTRUCTION = "Edit each proposal in develop and return it with the proposal's id. Keep its creative device (the irony, surprise, tension or contrast that makes it a hook) and keep its headline unless a fact or a program rule requires a change; change only what must change, in as few words as possible, and never make it more literal. A proposal that is already right comes back unchanged. The proposal also competes as written, so an edit only helps when it is better.";

/**
 * What the writer receives after the first round: each target to revise with
 * its scores, the program's findings and the judge's issues, and any earlier
 * attempt that came out worse; the proposals to develop; and, when the round
 * asks for new angles, every opening tried so far and what the last
 * judgment found.
 */
export function openingRefineRequest(targets: readonly Draft2OpeningVersion[], versions: readonly Draft2OpeningVersion[], regressions: readonly Draft2OpeningRegression[], last: Draft2OpeningRound | undefined, newAngles = 0, proposals: readonly Draft2OpeningCandidate[] = []) {
  const instruction = [
    targets.length ? OPENING_REVISION_INSTRUCTION : "",
    proposals.length ? OPENING_DEVELOP_INSTRUCTION : "",
    newAngles > 0 ? openingNewAnglesInstruction(newAngles) : "",
  ].filter(Boolean).join(" ");
  return {
    task: "revise",
    openings: targets.map((target) => ({
      ...shown(target.candidate),
      scores: target.score,
      issues: [...target.findings, ...target.issues],
      earlierAttempts: regressions.filter((regression) => regression.previousId === target.candidate.id).map((regression) => ({
        id: regression.candidateId,
        coverHeadline: versions.find((version) => version.candidate.id === regression.candidateId)?.candidate.cover.headline,
        overall: regression.to,
        worse: regression.worse,
      })),
    })),
    ...(proposals.length ? { develop: proposals.map(shown) } : {}),
    ...(newAngles > 0 ? { newAngles, anglesSoFar: anglesSoFar(versions), ...(last ? { feedback: feedback(last) } : {}) } : {}),
    suggestions: [...(last?.evaluation?.suggestions ?? [])],
    instruction,
  };
}

/** What the judge receives each round, beside the facts: the candidates, the versions they revise with their scores, the program's findings. */
export function openingJudgeRequest(round: number, candidates: readonly Draft2OpeningCandidate[], mechanical: readonly Draft2OpeningIssue[], revised: readonly Draft2OpeningVersion[]) {
  const proposalsWanted = OPENING_ROUND_PLAN[round - 1]?.proposals ?? 0;
  return {
    task: "openings",
    round,
    candidates: candidates.map(shown),
    ...(revised.length ? { previousVersions: revised.map((version) => ({ ...shown(version.candidate), scores: version.score, issues: [...version.findings, ...version.issues] })) } : {}),
    mechanicalFindings: mechanical,
    ...(proposalsWanted ? { proposalsWanted } : {}),
  };
}

/** Why a run ends without an accepted opening: the best version's weak criteria and what is left to fix on it. */
export function openingReviewNote(best: Draft2OpeningVersion | undefined, last: Draft2OpeningRound | undefined, lead: string): string {
  const score = best?.score;
  const weak = score ? OPENING_CRITERIA.filter((criterion) => score[criterion] < OPENING_CRITERION_FLOOR).map((criterion) => `${criterion} ${score[criterion]}`) : [];
  const standing = best && score
    ? `The best version, ${best.candidate.id}, scored ${score.overall}/100${weak.length ? ` (${weak.join(", ")})` : ""}.`
    : "Every version has a program finding.";
  const left = best ? best.issues : [...(last?.mechanical ?? []), ...(last?.evaluation?.issues ?? [])];
  const issues = left.slice(0, 6).map((issue) => `${issue.code}${issue.candidateId ? ` (${issue.candidateId}${issue.part ? ` · ${issue.part}` : ""})` : ""}`);
  return `${lead} ${standing}${issues.length ? ` Remaining issues: ${issues.join(", ")}.` : ""} Choose an opening below or write it again.`;
}

/** The round a paused or stopped run continues from: the one it paused before, else a round written but not judged, else the next. */
export function openingResumeRound(opening: Pick<Draft2Opening, "resumeRound" | "rounds">): number {
  if (opening.resumeRound) return opening.resumeRound;
  const unjudged = opening.rounds.find((round) => !round.evaluation);
  return unjudged ? unjudged.round : opening.rounds.length + 1;
}

/** An opening as it ended, for the session's record of earlier runs. */
export function openingRunSummary(opening: Draft2Opening): Draft2OpeningRun {
  return {
    status: opening.status,
    candidates: opening.candidates,
    ...(opening.evaluation ? { evaluation: opening.evaluation } : {}),
    ...(opening.winnerId ? { winnerId: opening.winnerId } : {}),
    ...(opening.editorChoiceId ? { editorChoiceId: opening.editorChoiceId, editorChoiceAt: opening.editorChoiceAt } : {}),
    ...(opening.error ? { error: opening.error } : {}),
    ...(opening.writer ? { writer: opening.writer } : {}),
    ...(opening.judge ? { judge: opening.judge } : {}),
  };
}
