import { comparableText, Draft2ResponseError, type Draft2Fact } from "./draft2-facts.types";

/**
 * Opening, the second Draft 2 step: the cover (headline + subheadline) and
 * slide 2 (headline + body), judged as one unit. A writer (Sol) proposes
 * candidates from the verified facts; the program checks what a program can
 * (lengths, fact ids, numbers, attribution, repetition); a judge (Claude)
 * scores every candidate on the hooks skill. Everything here is pure:
 * contracts, schemas, parsing, the mechanical checks and the acceptance rule.
 */
export const OPENING_CANDIDATES = 7;
export const OPENING_MAX_ROUNDS = 3;
export const OPENING_ACCEPT_SCORE = 95;
export const OPENING_CRITERION_FLOOR = 85;
/** A clean candidate the judge scored this high is kept unchanged in the next round. */
export const OPENING_KEEP_SCORE = 90;
/** At most this many are kept, so every revision tries at least four new angles instead of resubmitting a list the judge already refused. */
export const OPENING_KEEP_MAX = 3;
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
  /** c1…c7, stable across rounds when kept. */
  id: string;
  cover: { headline: string; subheadline: string; factIds: string[] };
  slide2: { headline: string; body: string; factIds: string[] };
  /** One line: the tension this opening uses. */
  angle: string;
};

export type Draft2OpeningIssue = { code: Draft2OpeningIssueCode; candidateId?: string; part?: "cover" | "slide2"; detail: string };

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
};

export type Draft2OpeningRound = {
  round: number;
  candidates: Draft2OpeningCandidate[];
  mechanical: Draft2OpeningIssue[];
  /** Candidates the judge asked to keep that the writer dropped or changed; the program put the originals back. */
  restored?: string[];
  evaluation?: Draft2OpeningEvaluation;
  at: string;
};

export type Draft2Opening = {
  status: "running" | "ready" | "needs-review" | "failed";
  rounds: Draft2OpeningRound[];
  /** The last round's list. */
  candidates: Draft2OpeningCandidate[];
  evaluation?: Draft2OpeningEvaluation;
  /** The judge's pick, validated by the program. */
  winnerId?: string;
  /** Set by the editor; wins over winnerId downstream. */
  editorChoiceId?: string;
  editorChoiceAt?: string;
  error?: string;
  /** Earlier runs of the step on this session, oldest first, without their rounds (Claude's transcript keeps those exchanges). */
  previousRuns?: Draft2OpeningRun[];
};

/** How an earlier run ended: its candidates, the verdict, the winner and the editor's choice. */
export type Draft2OpeningRun = Omit<Draft2Opening, "rounds" | "previousRuns">;

const nullableString = { type: ["string", "null"] };
const factIds = { type: "array", maxItems: 10, items: { type: "string" } };
const score = { type: "integer", minimum: 1, maximum: 100 };

/** The writer's answer: the complete candidate list. */
export const DRAFT2_OPENING_SCHEMA: Record<string, unknown> = {
  type: "object",
  properties: {
    candidates: {
      type: "array",
      minItems: 1,
      maxItems: OPENING_CANDIDATES,
      items: {
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
      },
    },
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
        },
        required: ["code", "candidateId", "part", "detail"],
        additionalProperties: false,
      },
    },
    suggestions: { type: "array", maxItems: 20, items: { type: "string" } },
    summary: { type: "string" },
  },
  required: ["verdict", "winnerId", "scores", "issues", "suggestions", "summary"],
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

/** The writer's answer as candidates; anything malformed is a response error, never persisted. Fact ids are checked by the program, not here. */
export function parseOpeningCandidates(answer: string): Draft2OpeningCandidate[] {
  const body = parseObject(answer, "writer");
  if (!Array.isArray(body.candidates) || body.candidates.length === 0) throw new Draft2ResponseError("The writer returned no candidates");
  const seen = new Set<string>();
  return body.candidates.slice(0, OPENING_CANDIDATES).map((raw, index) => {
    const item = record(raw);
    const id = text(item.id, 24) ?? `c${index + 1}`;
    const cover = record(item.cover);
    const slide2 = record(item.slide2);
    const coverHeadline = text(cover.headline, 300);
    const subheadline = text(cover.subheadline, 500);
    const slideHeadline = text(slide2.headline, 300);
    const slideBody = text(slide2.body, 1_000);
    const coverFacts = factIdList(cover.factIds);
    const slideFacts = factIdList(slide2.factIds);
    if (!coverHeadline || !subheadline || !slideHeadline || !slideBody || !coverFacts || !slideFacts) throw new Draft2ResponseError(`Candidate ${id} is incomplete or malformed`);
    if (seen.has(id)) throw new Draft2ResponseError(`Candidate id ${id} is repeated`);
    seen.add(id);
    return {
      id,
      cover: { headline: coverHeadline, subheadline, factIds: coverFacts },
      slide2: { headline: slideHeadline, body: slideBody, factIds: slideFacts },
      angle: text(item.angle, 400) ?? "",
    };
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
    return [{ code, detail, ...(candidateId && known.has(candidateId) ? { candidateId } : {}), ...(part ? { part } : {}) }];
  });
  const suggestions = (Array.isArray(body.suggestions) ? body.suggestions : []).slice(0, 20).flatMap((item) => { const value = text(item, 600); return value ? [value] : []; });
  return { verdict, winnerId, scores, issues, suggestions, summary };
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
  const headlines = new Map<string, string>();
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
    const key = headlineKey(cover.headline);
    const earlier = headlines.get(key);
    if (earlier) add("DUPLICATE_CANDIDATE", "cover", `The cover headline repeats ${earlier}'s.`);
    else headlines.set(key, candidate.id);
  }
  return issues;
}

/** Whether a score meets the skill's thresholds: overall ≥ 95 and no criterion below 85. */
export function openingScorePasses(score: Draft2OpeningScore): boolean {
  return score.overall >= OPENING_ACCEPT_SCORE && OPENING_CRITERIA.every((criterion) => score[criterion] >= OPENING_CRITERION_FLOOR);
}

const flaggedCandidates = (mechanical: readonly Draft2OpeningIssue[]) => new Set(mechanical.flatMap((issue) => issue.candidateId ? [issue.candidateId] : []));

/** The highest-scored candidate the program found nothing on (the judge's order breaks ties), optionally among those that pass. */
export function bestCleanCandidate(mechanical: readonly Draft2OpeningIssue[], evaluation: Draft2OpeningEvaluation, { passing = false } = {}): Draft2OpeningScore | undefined {
  const flagged = flaggedCandidates(mechanical);
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
 * mechanical finding; when the program found something on the judge's pick,
 * the best clean candidate that meets the thresholds wins instead.
 */
export function openingAcceptedWinner(mechanical: readonly Draft2OpeningIssue[], evaluation: Draft2OpeningEvaluation): string | undefined {
  if (evaluation.verdict !== "accept") return undefined;
  const pick = evaluation.scores.find((score) => score.candidateId === evaluation.winnerId);
  if (!pick) return undefined;
  if (!flaggedCandidates(mechanical).has(pick.candidateId)) return openingScorePasses(pick) ? pick.candidateId : undefined;
  return bestCleanCandidate(mechanical, evaluation, { passing: true })?.candidateId;
}

export function openingIsAccepted(mechanical: readonly Draft2OpeningIssue[], evaluation: Draft2OpeningEvaluation): boolean {
  return openingAcceptedWinner(mechanical, evaluation) !== undefined;
}

/** The candidates the next round keeps unchanged: clean, scored at least OPENING_KEEP_SCORE, the best OPENING_KEEP_MAX. */
export function keptOpeningIds(mechanical: readonly Draft2OpeningIssue[], evaluation: Draft2OpeningEvaluation): string[] {
  const flagged = flaggedCandidates(mechanical);
  return evaluation.scores
    .filter((score) => score.overall >= OPENING_KEEP_SCORE && !flagged.has(score.candidateId))
    .sort((a, b) => b.overall - a.overall)
    .slice(0, OPENING_KEEP_MAX)
    .map((score) => score.candidateId);
}

/** What the writer receives for its next round: the judge's verdict, the program's findings first, and what to keep. */
export function openingRevisionRequest(mechanical: readonly Draft2OpeningIssue[], evaluation: Draft2OpeningEvaluation, keep: readonly string[]) {
  return {
    judgeVerdict: evaluation.verdict,
    judgeSummary: evaluation.summary,
    scores: evaluation.scores,
    issues: [...mechanical, ...evaluation.issues],
    suggestions: evaluation.suggestions,
    keep: [...keep],
    instruction: `Return ${OPENING_CANDIDATES} candidates: keep the listed ones unchanged with their ids, replace the others with new angles that answer the issues.`,
  };
}

const sameOpening = (a: Draft2OpeningCandidate, b: Draft2OpeningCandidate) =>
  [a.cover.headline, a.cover.subheadline, a.slide2.headline, a.slide2.body].map(comparableText).join("\n") === [b.cover.headline, b.cover.subheadline, b.slide2.headline, b.slide2.body].map(comparableText).join("\n")
  && a.cover.factIds.join() === b.cover.factIds.join() && a.slide2.factIds.join() === b.slide2.factIds.join();

/**
 * The revised list with every kept candidate exactly as the judge scored it:
 * one the writer dropped or rewrote is put back, in place of the last new
 * candidates when the list would grow past OPENING_CANDIDATES.
 */
export function mergeKeptCandidates(previous: readonly Draft2OpeningCandidate[], revised: readonly Draft2OpeningCandidate[], keep: readonly string[]): { candidates: Draft2OpeningCandidate[]; restored: string[] } {
  const kept = new Map(previous.filter((candidate) => keep.includes(candidate.id)).map((candidate) => [candidate.id, candidate]));
  const restored: string[] = [];
  const candidates = revised.map((candidate) => {
    const original = kept.get(candidate.id);
    if (!original) return candidate;
    kept.delete(candidate.id);
    if (!sameOpening(original, candidate)) restored.push(candidate.id);
    return original;
  });
  for (const original of kept.values()) {
    candidates.push(original);
    restored.push(original.id);
  }
  for (let index = candidates.length - 1; candidates.length > OPENING_CANDIDATES && index >= 0; index--) {
    if (!keep.includes(candidates[index].id)) candidates.splice(index, 1);
  }
  return { candidates, restored };
}

/** Why a run ends without an accepted opening: the best clean candidate's weak criteria, then the remaining issues. */
export function openingReviewNote(mechanical: readonly Draft2OpeningIssue[], evaluation: Draft2OpeningEvaluation, lead: string): string {
  const best = bestCleanCandidate(mechanical, evaluation);
  const weak = best ? OPENING_CRITERIA.filter((criterion) => best[criterion] < OPENING_CRITERION_FLOOR).map((criterion) => `${criterion} ${best[criterion]}`) : [];
  const standing = best
    ? `The best clean candidate, ${best.candidateId}, scored ${best.overall}/100${weak.length ? ` (${weak.join(", ")})` : ""}.`
    : "Every candidate has a program finding.";
  const issues = [...mechanical, ...evaluation.issues].slice(0, 6)
    .map((issue) => `${issue.code}${issue.candidateId ? ` (${issue.candidateId}${issue.part ? ` · ${issue.part}` : ""})` : ""}`);
  return `${lead} ${standing}${issues.length ? ` Remaining issues: ${issues.join(", ")}.` : ""} Choose an opening below or write it again.`;
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
  };
}
