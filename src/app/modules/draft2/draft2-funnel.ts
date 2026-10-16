import { comparableText, Draft2ResponseError, type Draft2Fact, type Draft2TraceEntry } from "./draft2-facts.types";
import type { Draft2Provider } from "./draft2-models";

/**
 * The funnel the writing steps run (the Opening, the Closing). A writer
 * proposes candidates from the verified facts; the program checks what a
 * program can; a judge scores them on the step's criteria and proposes
 * candidates of its own, which compete in the next round twice, as the judge
 * wrote them and as the writer edited them, without the judge being told
 * which is which. Each later round revises the best versions so far against
 * their own issues; the program keeps the better of a version and its
 * revision, and a material factual error keeps any version from winning.
 * Everything here is pure and shared; a step defines its candidates,
 * criteria, checks and requests (draft2-opening.types.ts,
 * draft2-closing.types.ts).
 */

/** What every candidate carries besides its own parts. The program sets the last three; the models never see them. */
export type FunnelCandidate = {
  /** c1, c2… for new candidates; a revision names its round ("c3.2" revises c3 in round 2). Unique within a run. */
  id: string;
  /** One line: the idea this candidate uses. */
  angle: string;
  /** The version this candidate revises. */
  revisionOf?: string;
  /** The judge's proposal this candidate comes from. */
  proposalOf?: string;
  /** The proposal exactly as the judge wrote it, competing beside the writer's edit. */
  asProposed?: boolean;
  /** Written by the editor: their own version, or their idea set beside the judge's proposals for the writer to develop. */
  byEditor?: true;
};

/**
 * One text of a run's chosen version the editor changed by hand, kept so it
 * can be undone: where (the slide and the field, as the carousel names
 * them), what it said and says now, and what the program found on it then
 * (shown to the editor, never blocking: the editor has the last word).
 */
export type FunnelEditorEdit = { id: string; candidateId: string; slide: string; field: string; before: string; after: string; at: string; findings: string[]; undoneAt?: string };

export type FunnelIssue = {
  code: string;
  candidateId?: string;
  part?: string;
  detail: string;
  /** The judge's call that the candidate states something the facts do not; it keeps the version from winning. */
  material?: boolean;
};

/** A judge's score for one candidate; each step adds its criteria as numeric fields. */
export type FunnelScore = { candidateId: string; overall: number; note: string; /** What in the candidate must survive revision, in the judge's words; absent on older judgments. */ keep?: string };

export type FunnelEvaluation<C extends FunnelCandidate = FunnelCandidate, S extends FunnelScore = FunnelScore, I extends FunnelIssue = FunnelIssue> = {
  verdict: "accept" | "revise";
  /** The judge's best candidate, even on a revise. */
  winnerId: string;
  /** One per candidate. */
  scores: S[];
  issues: I[];
  /** For the writer's next round. */
  suggestions: string[];
  summary: string;
  /** The judge's own candidates (ids p1, p2… across the run), which compete in the next round. */
  proposals?: C[];
};

export type FunnelRegression = {
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

export type FunnelRound<C extends FunnelCandidate = FunnelCandidate, S extends FunnelScore = FunnelScore, I extends FunnelIssue = FunnelIssue> = {
  round: number;
  /** explore: new candidates only; refine: revisions only; mixed: both. Rounds stored before refinement have none (explore). */
  kind?: "explore" | "refine" | "mixed";
  candidates: C[];
  mechanical: I[];
  evaluation?: FunnelEvaluation<C, S, I>;
  /** Revisions that came out worse than the version they revised; that version stays the better one. */
  regressions?: FunnelRegression[];
  /** The writer's fix pass before the judge: what the program flagged, sent back once with its findings, and what stood after. Absent when nothing was flagged. */
  fix?: FunnelFixPass;
  shadow?: FunnelShadowJudgment;
  at: string;
};

/** The fix pass of a round: the candidates the program flagged, how many findings they had and how many stood after the writer's fix, or why the pass did not run. */
export type FunnelFixPass = { candidateIds: string[]; findingsBefore: number; findingsAfter: number; durationMs?: number; skipped?: string };

/** One version of a candidate with what the round it was written in found on it. */
export type FunnelVersion<C extends FunnelCandidate = FunnelCandidate, S extends FunnelScore = FunnelScore, I extends FunnelIssue = FunnelIssue> = {
  candidate: C;
  round: number;
  score?: S;
  /** The program's findings; any one keeps the version from winning. */
  findings: I[];
  /** The judge's issues. */
  issues: I[];
};

/** A role of a run: which provider's model played it. */
export type FunnelRole = { provider: Draft2Provider; model: string };

/**
 * What a round asks: versions to revise (each from a different line), new
 * candidates, the judge's own proposals, and how hard both models think
 * (high unless the round says otherwise: a wide round thinks less per
 * candidate so it fits a call's time and output).
 */
export type FunnelPlanRound = { revise: number; fresh: number; proposals: number; effort?: "low" | "medium" | "high" };
/** An extra round the editor asks for once the plan's rounds are spent: the best version revised once more against its remaining issues. */
export const FUNNEL_EXTRA_ROUND: FunnelPlanRound = { revise: 1, fresh: 0, proposals: 0 };
/** How many extra rounds one run may take, on its own (under the floor) and at the editor's request together: the cap that keeps a run from looping. */
export const FUNNEL_MAX_EXTRA_ROUNDS = 2;
/**
 * The floor the funnel works to: the gate (95) stays the goal, and an
 * unaccepted result at or above this is acceptable for the editor to
 * review; under it, the run takes an extra round on its own, up to the cap.
 */
export const FUNNEL_ACCEPTABLE_SCORE = 90;

/** A second judgment of a round at another effort or by another model, recorded beside the real one and deciding nothing (draft2ShadowJudgeEffort, draft2ShadowJudgeModel). */
export type FunnelShadowJudgment = {
  effort: "low" | "medium" | "high";
  model: string;
  durationMs: number;
  /** What it would have decided: absent when it failed or could not be parsed. */
  verdict?: string;
  winnerId?: string;
  scores?: { candidateId: string; overall: number }[];
  /** The issues it found (at most a dozen, each detail cut short), to read its usefulness beside its scores. */
  issues?: { code: string; candidateId?: string; detail: string }[];
  /** How many candidates of its own it proposed. */
  proposals?: number;
  /** Whether it named the same winner as the real judgment. */
  agrees?: boolean;
  error?: string;
};

/** A step's acceptance rule: overall at least `accept` and every criterion at least `floor`, or at least its own floor in `floors`. */
export type FunnelGate = { criteria: readonly string[]; accept: number; floor: number; floors?: Readonly<Partial<Record<string, number>>> };

/** The floor one criterion must reach: its own, else the gate's. */
export const criterionFloor = (gate: FunnelGate, criterion: string): number => gate.floors?.[criterion] ?? gate.floor;

/** A run of a funnel step, as the session keeps it. */
export type FunnelRun<C extends FunnelCandidate = FunnelCandidate, S extends FunnelScore = FunnelScore, I extends FunnelIssue = FunnelIssue> = {
  /** paused: the request's time ran out before resumeRound; a continue request runs on from it with every earlier round kept. */
  status: "running" | "paused" | "ready" | "needs-review" | "failed";
  rounds: FunnelRound<C, S, I>[];
  /** The last round's candidates; funnelVersions lists every version of the run. */
  candidates: C[];
  /** The last round's verdict. */
  evaluation?: FunnelEvaluation<C, S, I>;
  /** The accepted candidate (status ready), or the best version so far: a version id from any round. */
  winnerId?: string;
  /** Set by the editor; wins over winnerId downstream. */
  editorChoiceId?: string;
  editorChoiceAt?: string;
  /** The editor's changes by hand to the chosen version, oldest first. */
  edits?: FunnelEditorEdit[];
  error?: string;
  /** The round a paused run continues from. */
  resumeRound?: number;
  /** Rounds the editor added past the plan's (FUNNEL_EXTRA_ROUND), at most FUNNEL_MAX_EXTRA_ROUNDS. */
  extraRounds?: number;
  writer?: FunnelRole;
  judge?: FunnelRole;
};

/** The facts both models receive on every call, the same in every round so it is read from the prompt cache. */
export function factsSnapshot(facts: readonly Draft2Fact[]) {
  return facts.map((fact) => ({
    id: fact.id, claim: fact.claim, status: fact.status,
    ...(fact.qualifier ? { qualifier: fact.qualifier } : {}), ...(fact.attribution ? { attribution: fact.attribution } : {}),
    evidence: fact.evidence, importance: fact.importance,
  }));
}

/** A criterion's score, or undefined on a score stored before the criterion existed. */
export const criterionOf = (score: FunnelScore, criterion: string): number | undefined => {
  const value = (score as unknown as Record<string, unknown>)[criterion];
  return typeof value === "number" ? value : undefined;
};

/** Whether a score meets the gate (a criterion the score predates does not count). */
export function funnelScorePasses(score: FunnelScore, gate: FunnelGate): boolean {
  return score.overall >= gate.accept && gate.criteria.every((criterion) => (criterionOf(score, criterion) ?? criterionFloor(gate, criterion)) >= criterionFloor(gate, criterion));
}

/** Candidates that may not win: any program finding, or a material factual error the judge named. */
const flaggedCandidates = (mechanical: readonly FunnelIssue[], evaluation?: { issues: readonly FunnelIssue[] }) => new Set(
  [...mechanical, ...(evaluation?.issues.filter((issue) => issue.material) ?? [])].flatMap((issue) => issue.candidateId ? [issue.candidateId] : []));

/** The highest-scored candidate with no program finding and no material factual error (the judge's order breaks ties), optionally among those that pass. */
export function funnelBestClean<S extends FunnelScore>(mechanical: readonly FunnelIssue[], evaluation: { scores: readonly S[]; issues: readonly FunnelIssue[] }, gate: FunnelGate, { passing = false } = {}): S | undefined {
  const flagged = flaggedCandidates(mechanical, evaluation);
  let best: S | undefined;
  for (const score of evaluation.scores) {
    if (flagged.has(score.candidateId) || (passing && !funnelScorePasses(score, gate))) continue;
    if (!best || score.overall > best.overall) best = score;
  }
  return best;
}

/**
 * The winner of an accepted round, or undefined when the round is a revise.
 * The judge must accept, and its winner must meet the gate with no program
 * finding and no material factual error; when either blocks the judge's
 * pick, the best clean candidate that meets the gate wins instead.
 */
export function funnelAcceptedWinner(mechanical: readonly FunnelIssue[], evaluation: Pick<FunnelEvaluation, "verdict" | "winnerId" | "scores" | "issues">, gate: FunnelGate): string | undefined {
  if (evaluation.verdict !== "accept") return undefined;
  const pick = evaluation.scores.find((score) => score.candidateId === evaluation.winnerId);
  if (!pick) return undefined;
  if (!flaggedCandidates(mechanical, evaluation).has(pick.candidateId)) return funnelScorePasses(pick, gate) ? pick.candidateId : undefined;
  return funnelBestClean(mechanical, evaluation, gate, { passing: true })?.candidateId;
}

/** Every version the run wrote, with its score and findings; a later round's candidate replaces an earlier one with the same id (the first loop reused ids). */
export function funnelVersions<C extends FunnelCandidate, S extends FunnelScore, I extends FunnelIssue>(rounds: readonly FunnelRound<C, S, I>[]): FunnelVersion<C, S, I>[] {
  const byId = new Map<string, FunnelVersion<C, S, I>>();
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

/** A run with one version's text replaced wherever the run keeps that version: its rounds and its last candidates. */
export function funnelWithCandidate<C extends FunnelCandidate, R extends { rounds: readonly FunnelRound<C, never, never>[] | readonly FunnelRound<C>[]; candidates: readonly C[] }>(run: R, candidate: C): R {
  return {
    ...run,
    rounds: run.rounds.map((round) => ({ ...round, candidates: round.candidates.map((entry) => entry.id === candidate.id ? candidate : entry) })),
    candidates: run.candidates.map((entry) => entry.id === candidate.id ? candidate : entry),
  };
}

/** Whether the judge named a material factual error on a version: it states something the facts do not. */
export const hasMaterialError = (version: { issues: readonly FunnelIssue[] }) => version.issues.some((issue) => issue.material);

type AnyVersion = FunnelVersion<FunnelCandidate, FunnelScore, FunnelIssue>;

const byScore = (a: AnyVersion, b: AnyVersion) =>
  b.score!.overall - a.score!.overall || (criterionOf(b.score!, "grounding") ?? 0) - (criterionOf(a.score!, "grounding") ?? 0) || b.round - a.round;

/**
 * The versions that may win, best first: scored, no program finding, no
 * material factual error, highest overall. A tie goes to the better
 * grounded version (conservative facts), then to the later round.
 */
export function funnelBestVersions<V extends AnyVersion>(versions: readonly V[]): V[] {
  return versions.filter((version) => version.score && version.findings.length === 0 && !hasMaterialError(version)).sort(byScore);
}

export const rootId = (id: string) => id.split(".")[0];

/**
 * What a round revises: the best version of each line of revisions with no
 * program finding, as many lines as the round's plan wants. A version with a
 * material factual error may be revised (the revision is how it gets fixed)
 * but never wins as it stands.
 */
export function funnelTargets<V extends AnyVersion>(versions: readonly V[], round: number, plan: readonly FunnelPlanRound[]): V[] {
  const lines = new Set<string>();
  const best: V[] = [];
  for (const version of versions.filter((entry) => entry.score && entry.findings.length === 0).sort(byScore)) {
    const line = rootId(version.candidate.id);
    if (lines.has(line)) continue;
    lines.add(line);
    best.push(version);
  }
  return best.slice(0, plan[round - 1]?.revise ?? 0);
}

/** How many new candidates a round writes: its plan's, plus one for every version it wanted to revise and could not. */
export function funnelFreshWanted(round: number, targets: readonly unknown[], plan: readonly FunnelPlanRound[]): number {
  const entry = plan[round - 1] ?? { revise: 0, fresh: 0 };
  return entry.fresh + Math.max(0, entry.revise - targets.length);
}

/**
 * Revisions that came out worse than the version they revised: a lower
 * overall, a grounding loss the overall did not repay, or a program finding
 * or material factual error the previous version did not have.
 */
export function funnelRegressions(revisions: readonly AnyVersion[], previous: readonly AnyVersion[], criteria: readonly string[]): FunnelRegression[] {
  return revisions.flatMap((revision) => {
    const before = previous.find((version) => version.candidate.id === revision.candidate.revisionOf);
    if (!before?.score || !revision.score) return [];
    const lost = (criterion: string) => {
      const [from, to] = [criterionOf(before.score!, criterion), criterionOf(revision.score!, criterion)];
      return from !== undefined && to !== undefined && to < from ? [`${criterion} ${from} → ${to}`] : [];
    };
    const worse = [
      ...criteria.flatMap(lost),
      ...(before.findings.length ? [] : revision.findings.map((finding) => finding.code)),
      ...(hasMaterialError(before) ? [] : revision.issues.filter((issue) => issue.material).map((issue) => `material ${issue.code}`)),
    ];
    const grounding = (version: AnyVersion) => criterionOf(version.score!, "grounding") ?? 0;
    const regressed = revision.score.overall < before.score.overall
      || (revision.score.overall === before.score.overall && grounding(revision) < grounding(before))
      || (revision.findings.length > 0 && before.findings.length === 0)
      || (hasMaterialError(revision) && !hasMaterialError(before));
    return regressed ? [{ candidateId: revision.candidate.id, previousId: before.candidate.id, from: before.score.overall, to: revision.score.overall, worse }] : [];
  });
}

/**
 * This round's versions from the writer's answer. A revision keeps its
 * target's id and becomes a new version named for its round ("c3" revised in
 * round 2 becomes "c3.2"). Each of the judge's proposals competes twice,
 * under fresh ids: the writer's edit (answered under the proposal's id;
 * dropped when `same` finds it unchanged) and the proposal exactly as the
 * judge wrote it. Every other candidate is a new one, up to the number asked.
 * When the round writes no new candidate, renamed answers are matched in order.
 */
export function funnelWrittenCandidates<C extends FunnelCandidate>(targets: readonly C[], answer: readonly C[], round: number, freshWanted: number, versions: readonly { candidate: FunnelCandidate }[], proposals: readonly C[], same: (a: C, b: C) => boolean, plural = "candidates"): C[] {
  const asked = [...targets, ...proposals].map((entry) => entry.id);
  const others = answer.filter((candidate) => !asked.includes(candidate.id));
  const matched = (id: string) => answer.find((candidate) => candidate.id === id) ?? (freshWanted === 0 ? others.shift() : undefined);
  const revisions = targets.flatMap((target) => {
    const revision = matched(target.id);
    return revision ? [{ ...revision, id: `${rootId(target.id)}.${round}`, revisionOf: target.id }] : [];
  });
  const edits = proposals.flatMap((proposal) => {
    const edit = matched(proposal.id);
    return edit && !same(edit, proposal) ? [{ ...edit, proposalOf: proposal.id }] : [];
  });
  const originals = proposals.map((proposal) => ({ ...proposal, proposalOf: proposal.id, asProposed: true }));
  const fresh = funnelRenumbered([...edits, ...originals, ...others.slice(0, freshWanted)], versions);
  const written = [...revisions, ...fresh];
  if (!written.length) throw new Draft2ResponseError(`The writer returned none of the ${plural} it was asked for`);
  return written;
}

/** The judge's proposals with ids after every proposal of the run (p1, p2…), so an edit names one proposal. */
export function funnelRenumberedProposals<C extends FunnelCandidate>(proposals: readonly C[], rounds: readonly { evaluation?: { proposals?: readonly unknown[] } }[]): C[] {
  let next = rounds.reduce((count, round) => count + (round.evaluation?.proposals?.length ?? 0), 0) + 1;
  return proposals.map((proposal) => ({ ...proposal, id: `p${next++}` }));
}

/** New candidates get ids after every id the run used, so each version keeps one id for the whole run. */
export function funnelRenumbered<C extends FunnelCandidate>(answer: readonly C[], versions: readonly { candidate: FunnelCandidate }[]): C[] {
  let next = Math.max(0, ...versions.map((version) => Number(/^c(\d+)/.exec(version.candidate.id)?.[1] ?? 0))) + 1;
  return answer.map((candidate) => ({ ...candidate, id: `c${next++}` }));
}

/**
 * A candidate as the models read it: the version it revises, never the
 * program's bookkeeping. Which candidates come from the judge's proposals is
 * never shown, so the judge scores its own ideas blind.
 */
export type ShownCandidate<C extends FunnelCandidate> = Omit<C, "revisionOf" | "proposalOf" | "asProposed"> & { revises?: string };
export const shownCandidate = <C extends FunnelCandidate>({ revisionOf, proposalOf, asProposed, ...candidate }: C): ShownCandidate<C> => {
  void proposalOf; void asProposed;
  return { ...candidate, ...(revisionOf ? { revises: revisionOf } : {}) } as ShownCandidate<C>;
};

/** How a step's requests name things: the task, the list the writer revises, a candidate's short label, and the instructions. */
export type FunnelWords<C extends FunnelCandidate, K extends string = string> = {
  /** The task of a round of new candidates, and of the judge's request ("openings"). */
  task: string;
  /** The key the writer finds its targets under ("openings"). */
  listKey: K;
  /** What identifies a candidate in a list of what was tried ({ coverHeadline }). */
  label: (candidate: C) => Record<string, string>;
  /** The note a round of new candidates gets when nothing so far is clean enough to revise. */
  noCleanNote: string;
  revise: string;
  develop: string;
  newCandidates: (count: number) => string;
  /** The fix pass's instruction, when the step says it its own way (FUNNEL_FIX_INSTRUCTION otherwise). */
  fix?: string;
};

/** The writer's instruction for the fix pass: the program's findings, and nothing else, fixed in place. */
export const FUNNEL_FIX_INSTRUCTION = "Fix only what each finding names, in as few words as possible; a length finding says how many words to remove at least: remove them, so the text ends under its limit, and count again: keep the candidate's idea, its device, its angle, its headline where no finding concerns it, and everything else exactly as it is. Count the words of what you change against the limits. Return each listed candidate under its own id, every part complete, and nothing else.";

/**
 * What the writer receives for the fix pass, before the judge reads a round:
 * the candidates the program flagged, each with the findings on it. A flagged
 * candidate can never win, so fixing it costs one short call and saves the
 * round its findings would have cost.
 */
/**
 * A length finding ("has 31 words; the limit is 30") with the words to remove
 * at least, one more than the excess, so the fixed text ends under its limit:
 * the first fix passes asked only to fix the length and Claude, miscounting,
 * returned the same count.
 */
export function lengthHint(detail: string): string {
  const length = /has (\d+) words?; the limit is (\d+)/.exec(detail);
  return length ? `${detail} Remove at least ${Number(length[1]) - Number(length[2]) + 1} words.` : detail;
}

export function funnelFixRequest<C extends FunnelCandidate, K extends string>(words: FunnelWords<C, K>, flagged: readonly C[], findings: readonly FunnelIssue[]) {
  return {
    task: "fix",
    [words.listKey]: flagged.map((candidate) => ({
      ...shownCandidate(candidate),
      findings: findings.filter((issue) => issue.candidateId === candidate.id).map(({ code, part, detail }) => ({ code, ...(part ? { part } : {}), detail: lengthHint(detail) })),
    })),
    instruction: words.fix ?? FUNNEL_FIX_INSTRUCTION,
  };
}

/**
 * The round's candidates with the writer's fixes in place: a flagged
 * candidate the answer brings back under its id takes the fixed parts and
 * keeps its id and its bookkeeping (what it revises, which proposal it comes
 * from); one the answer misses stays as it was, never fatal.
 */
export function funnelFixedCandidates<C extends FunnelCandidate>(candidates: readonly C[], flagged: ReadonlySet<string>, answer: readonly C[]): C[] {
  return candidates.map((candidate) => {
    if (!flagged.has(candidate.id)) return candidate;
    const fixed = answer.find((entry) => entry.id === candidate.id);
    if (!fixed) return candidate;
    const { revisionOf, proposalOf, asProposed, byEditor } = candidate;
    return { ...fixed, id: candidate.id, ...(revisionOf ? { revisionOf } : {}), ...(proposalOf ? { proposalOf } : {}), ...(asProposed ? { asProposed } : {}), ...(byEditor ? { byEditor } : {}) };
  });
}

/**
 * Whether a round raised the run's best clean score: the best among its own
 * versions beats the best of every round before it. The floor's extra rounds
 * are earned only this way: a round that did not improve the best would not
 * be improved on by one more revision of the same version (22 visual runs
 * took their extra rounds and ended, most often, on an earlier version).
 */
export function funnelRoundImproved(versions: readonly AnyVersion[], round: number): boolean {
  const best = (entries: readonly AnyVersion[]) => funnelBestVersions(entries)[0]?.score?.overall ?? 0;
  return best(versions.filter((version) => version.round === round)) > best(versions.filter((version) => version.round < round));
}

/** A candidate tried so far, as a request lists it: its id, its label and its score. */
export type FunnelTried = { id: string; overall?: number } & Record<string, unknown>;

/** Every candidate tried so far, so new ones do not repeat one. */
const triedSoFar = <C extends FunnelCandidate>(versions: readonly FunnelVersion<C>[], words: FunnelWords<C>): FunnelTried[] =>
  versions.map((version) => ({ id: version.candidate.id, ...words.label(version.candidate), ...(version.score ? { overall: version.score.overall } : {}) }));

/** What the last round's judge found, for new candidates that must avoid it. */
const feedback = (last: FunnelRound) => ({
  judgeSummary: last.evaluation?.summary,
  issues: [...last.mechanical, ...(last.evaluation?.issues ?? [])],
});

/** What the writer receives for new candidates only (the facts travel apart, where its provider caches them); after a round, what was tried and what went wrong. */
export function funnelExploreRequest<C extends FunnelCandidate>(words: FunnelWords<C>, candidatesWanted: number, last?: FunnelRound<C>, versions: readonly FunnelVersion<C>[] = []) {
  return {
    task: words.task,
    candidatesWanted,
    ...(last?.evaluation ? {
      note: words.noCleanNote,
      anglesSoFar: triedSoFar(versions, words),
      feedback: feedback(last as FunnelRound),
      suggestions: last.evaluation.suggestions,
    } : {}),
  };
}

/** A version to revise as the writer reads it: the candidate, its scores, every issue found on it, and the attempts that came out worse. */
export type FunnelRefineTarget<C extends FunnelCandidate> = ShownCandidate<C> & {
  scores?: FunnelScore;
  issues: FunnelIssue[];
  earlierAttempts: ({ id: string; overall: number; worse: string[] } & Record<string, unknown>)[];
};

/** The writer's request after the first round; the step names the list of targets (K). */
export type FunnelRefineRequest<C extends FunnelCandidate, K extends string> = {
  task: "revise";
  develop?: ShownCandidate<C>[];
  newAngles?: number;
  anglesSoFar?: FunnelTried[];
  feedback?: { judgeSummary?: string; issues: FunnelIssue[] };
  suggestions: string[];
  instruction: string;
} & { [P in K]: FunnelRefineTarget<C>[] };

/**
 * What the writer receives after the first round: each target to revise with
 * its scores, the program's findings and the judge's issues, and any earlier
 * attempt that came out worse; the proposals to edit; and, when the round
 * asks for new candidates, every one tried so far and what the last judgment
 * found.
 */
export function funnelRefineRequest<C extends FunnelCandidate, K extends string>(words: FunnelWords<C, K>, targets: readonly FunnelVersion<C>[], versions: readonly FunnelVersion<C>[], regressions: readonly FunnelRegression[], last: FunnelRound<C> | undefined, newCandidates = 0, proposals: readonly C[] = []): FunnelRefineRequest<C, K> {
  const instruction = [
    targets.length ? words.revise : "",
    targets.some((target) => target.score?.keep) ? "Each candidate's scores.keep names what the judge says must survive your revision: protect it, and change nothing else than what its issues name." : "",
    proposals.length ? words.develop : "",
    newCandidates > 0 ? words.newCandidates(newCandidates) : "",
  ].filter(Boolean).join(" ");
  return {
    task: "revise",
    [words.listKey]: targets.map((target) => ({
      ...shownCandidate(target.candidate),
      scores: target.score,
      issues: [...target.findings, ...target.issues],
      earlierAttempts: regressions.filter((regression) => regression.previousId === target.candidate.id).map((regression) => {
        const attempt = versions.find((version) => version.candidate.id === regression.candidateId)?.candidate;
        return { id: regression.candidateId, ...(attempt ? words.label(attempt) : {}), overall: regression.to, worse: regression.worse };
      }),
    })),
    ...(proposals.length ? { develop: proposals.map(shownCandidate) } : {}),
    ...(newCandidates > 0 ? { newAngles: newCandidates, anglesSoFar: triedSoFar(versions, words), ...(last ? { feedback: feedback(last as FunnelRound) } : {}) } : {}),
    suggestions: [...(last?.evaluation?.suggestions ?? [])],
    instruction,
  } as unknown as FunnelRefineRequest<C, K>;
}

/** What the judge receives each round, beside the facts: the candidates, the versions they revise with their scores, the program's findings. */
export function funnelJudgeRequest<C extends FunnelCandidate>(task: string, plan: readonly FunnelPlanRound[], round: number, candidates: readonly C[], mechanical: readonly FunnelIssue[], revised: readonly FunnelVersion<C>[]) {
  const proposalsWanted = plan[round - 1]?.proposals ?? 0;
  return {
    task,
    round,
    candidates: candidates.map(shownCandidate),
    ...(revised.length ? { previousVersions: revised.map((version) => ({ ...shownCandidate(version.candidate), scores: version.score, issues: [...version.findings, ...version.issues] })) } : {}),
    mechanicalFindings: mechanical,
    ...(proposalsWanted ? { proposalsWanted } : {}),
  };
}

/** Why a run ends without an accepted candidate: the best version's weak criteria and what is left to fix on it. */
export function funnelReviewNote(best: AnyVersion | undefined, last: FunnelRound | undefined, lead: string, gate: FunnelGate, article: string): string {
  const score = best?.score;
  const weak = score ? gate.criteria.flatMap((criterion) => { const value = criterionOf(score, criterion); return value !== undefined && value < criterionFloor(gate, criterion) ? [`${criterion} ${value}`] : []; }) : [];
  const standing = best && score
    ? `The best version, ${best.candidate.id}, scored ${score.overall}/100${weak.length ? ` (${weak.join(", ")})` : ""}.`
    : "Every version has a program finding.";
  const left = best ? best.issues : [...(last?.mechanical ?? []), ...(last?.evaluation?.issues ?? [])];
  const issues = left.slice(0, 6).map((issue) => `${issue.code}${issue.candidateId ? ` (${issue.candidateId}${issue.part ? ` · ${issue.part}` : ""})` : ""}`);
  return `${lead} ${standing}${issues.length ? ` Remaining issues: ${issues.join(", ")}.` : ""} Choose ${article} below or write it again.`;
}

/** The round a paused or stopped run continues from: the one it paused before, else a round written but not judged, else the next. */
export function funnelResumeRound(run: { resumeRound?: number; rounds: readonly { round: number; evaluation?: unknown }[] }): number {
  if (run.resumeRound) return run.resumeRound;
  const unjudged = run.rounds.find((round) => !round.evaluation);
  return unjudged ? unjudged.round : run.rounds.length + 1;
}

/**
 * Whether a run that ended without an accepted candidate can go on: every
 * round it ran was judged, and its step's plan has gained rounds since it
 * ended. It continues with the added rounds, from the versions it has.
 */
export function funnelExtendable(run: { status: string; rounds: readonly { evaluation?: unknown }[] }, planRounds: number): boolean {
  return run.status === "needs-review" && run.rounds.length > 0 && run.rounds.length < planRounds && run.rounds.every((round) => round.evaluation);
}

/** A run as it ended, for the session's record of earlier runs: everything but its rounds, its earlier runs and its resume point. */
export function funnelRunSummary<R extends FunnelRun & { previousRuns?: unknown }>(run: R): Omit<R, "rounds" | "previousRuns" | "resumeRound"> {
  const { rounds, previousRuns, resumeRound, ...summary } = run;
  void rounds; void previousRuns; void resumeRound;
  return summary;
}

function parseObject(answer: string, what: string): Record<string, unknown> {
  let parsed: unknown;
  try { parsed = JSON.parse(answer); } catch { throw new Draft2ResponseError(`The ${what} answer is not valid JSON`); }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Draft2ResponseError(`The ${what} answer is not an object`);
  return parsed as Record<string, unknown>;
}

export const funnelRecord = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
export const funnelText = (value: unknown, max: number): string | undefined =>
  typeof value === "string" && value.trim() && value.trim().length <= max ? value.trim() : undefined;

/** A list of fact ids, once each, at most ten. Whether they are verified facts is the program's check, not the parser's. */
export function funnelFactIds(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const ids: string[] = [];
  for (const entry of value) {
    const id = funnelText(entry, 24);
    if (id && !ids.includes(id)) ids.push(id);
  }
  return ids.slice(0, 10);
}

/** The writer's answer as candidates; anything malformed is a response error, never persisted. */
export function funnelParseCandidates<C extends FunnelCandidate>(answer: string, parse: (raw: unknown, fallbackId: string) => C | undefined, max: number): C[] {
  const body = parseObject(answer, "writer");
  if (!Array.isArray(body.candidates) || body.candidates.length === 0) throw new Draft2ResponseError("The writer returned no candidates");
  const seen = new Set<string>();
  return body.candidates.slice(0, max).map((raw, index) => {
    const candidate = parse(raw, `c${index + 1}`);
    const id = candidate?.id ?? funnelText(funnelRecord(raw).id, 24) ?? `c${index + 1}`;
    if (!candidate) throw new Draft2ResponseError(`Candidate ${id} is incomplete or malformed`);
    if (seen.has(id)) throw new Draft2ResponseError(`Candidate id ${id} is repeated`);
    seen.add(id);
    return candidate;
  });
}

/**
 * The judge's answer as an evaluation of these candidates. Every candidate
 * must be scored once, with integer scores on every criterion (clamped to
 * 1–100: the adapter strips the schema's bounds), and the winner must be one
 * of them. Issue codes outside the contract become OTHER; an issue naming no
 * known candidate keeps its detail without the id; a part outside the step's
 * parts is dropped. A malformed proposal is dropped, never fatal. A judge
 * that scores its own proposal beside the candidates, or names it the
 * winner, is not fatal either: the proposal competes in the next round,
 * judged blind, so its score is dropped and the best scored candidate stands
 * as the round's winner, with the verdict "revise" (the first real run that
 * failed this way, 2026-10-11, lost a whole visual round to one such score).
 */
export function funnelParseEvaluation<C extends FunnelCandidate, S extends FunnelScore, I extends FunnelIssue>(answer: string, candidateIds: readonly string[], { criteria, codes, parts, parseProposal, maxProposals }: {
  criteria: readonly string[];
  codes: readonly string[];
  parts: readonly string[];
  parseProposal: (raw: unknown, fallbackId: string) => C | undefined;
  maxProposals: number;
}): FunnelEvaluation<C, S, I> {
  const body = parseObject(answer, "judge");
  let verdict: "accept" | "revise" | undefined = body.verdict === "accept" || body.verdict === "revise" ? body.verdict : undefined;
  let winnerId = funnelText(body.winnerId, 24);
  let summary = funnelText(body.summary, 1_000);
  if (!verdict || !winnerId || !summary || !Array.isArray(body.scores)) throw new Draft2ResponseError("The judge's verdict is incomplete");
  // The judge's own candidates are inputs for the writer: a malformed one is dropped, never fatal.
  const offered = Array.isArray(body.proposals) ? body.proposals : [];
  const proposals = offered
    .flatMap((raw, index) => { const proposal = parseProposal(raw, `p${index + 1}`); return proposal ? [proposal] : []; })
    .slice(0, maxProposals);
  const proposed = new Set([...proposals.map((proposal) => proposal.id), ...offered.map((_, index) => `p${index + 1}`)]);
  const known = new Set(candidateIds);
  const scored = new Set<string>();
  const scores = body.scores.flatMap((raw): S[] => {
    const item = funnelRecord(raw);
    const candidateId = funnelText(item.candidateId, 24);
    // A score the judge gave its own proposal is dropped: the proposal is judged blind in the next round.
    if (candidateId && !known.has(candidateId) && proposed.has(candidateId)) return [];
    if (!candidateId || !known.has(candidateId)) throw new Draft2ResponseError(`The judge scored an unknown candidate (${String(item.candidateId)})`);
    if (scored.has(candidateId)) throw new Draft2ResponseError(`The judge scored ${candidateId} twice`);
    scored.add(candidateId);
    const value = (key: string) => {
      const number = item[key];
      if (typeof number !== "number" || !Number.isInteger(number)) throw new Draft2ResponseError(`The judge's ${key} score for ${candidateId} is not an integer`);
      return Math.min(100, Math.max(1, number));
    };
    const keep = funnelText(item.keep, 300);
    return [{ candidateId, ...Object.fromEntries(criteria.map((criterion) => [criterion, value(criterion)])), overall: value("overall"), note: funnelText(item.note, 600) ?? "", ...(keep ? { keep } : {}) } as unknown as S];
  });
  const unscored = candidateIds.filter((id) => !scored.has(id));
  if (unscored.length) throw new Draft2ResponseError(`The judge did not score ${unscored.join(", ")}`);
  if (!scored.has(winnerId)) {
    if (!proposed.has(winnerId)) throw new Draft2ResponseError(`The judge's winner ${winnerId} is not one of the candidates`);
    // Its own proposal cannot win the round it is proposed in: the best scored candidate stands, and the round goes on.
    const best = scores.reduce((lead, score) => (score.overall > lead.overall ? score : lead), scores[0]!);
    summary = `${summary} (The judge named its own proposal ${winnerId} the winner; it competes in the next round, and ${best.candidateId} stands as this round's best.)`.slice(0, 1_200);
    winnerId = best.candidateId;
    verdict = "revise";
  }
  const issues = (Array.isArray(body.issues) ? body.issues : []).slice(0, 40).flatMap((raw): I[] => {
    const item = funnelRecord(raw);
    const detail = funnelText(item.detail, 600);
    if (!detail) return [];
    const code = codes.find((candidate) => candidate === item.code) ?? "OTHER";
    const candidateId = funnelText(item.candidateId, 24);
    const part = parts.find((candidate) => candidate === item.part);
    return [{ code, detail, ...(candidateId && known.has(candidateId) ? { candidateId } : {}), ...(part ? { part } : {}), ...(item.material === true ? { material: true } : {}) } as I];
  });
  const suggestions = (Array.isArray(body.suggestions) ? body.suggestions : []).slice(0, 20).flatMap((item) => { const value = funnelText(item, 600); return value ? [value] : []; });
  return { verdict, winnerId, scores, issues, suggestions, summary, ...(proposals.length ? { proposals } : {}) };
}

/** The judge's answer schema: a score per candidate on every criterion, issues, suggestions and its own proposals. */
export function funnelEvaluationSchema({ criteria, codes, maxScored, item, maxProposals }: { criteria: readonly string[]; codes: readonly string[]; maxScored: number; item: Record<string, unknown>; maxProposals: number }): Record<string, unknown> {
  const score = { type: "integer", minimum: 1, maximum: 100 };
  const nullableString = { type: ["string", "null"] };
  return {
    type: "object",
    properties: {
      verdict: { type: "string", enum: ["accept", "revise"] },
      winnerId: { type: "string" },
      scores: {
        type: "array",
        minItems: 1,
        maxItems: maxScored,
        items: {
          type: "object",
          properties: {
            candidateId: { type: "string" },
            ...Object.fromEntries(criteria.map((criterion) => [criterion, score])),
            overall: score,
            note: { type: "string" },
            keep: { type: "string" },
          },
          required: ["candidateId", ...criteria, "overall", "note", "keep"],
          additionalProperties: false,
        },
      },
      issues: {
        type: "array",
        maxItems: 40,
        items: {
          type: "object",
          properties: {
            code: { type: "string", enum: [...codes] },
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
      proposals: { type: "array", maxItems: maxProposals, items: item },
    },
    required: ["verdict", "winnerId", "scores", "issues", "suggestions", "summary", "proposals"],
    additionalProperties: false,
  };
}

/** Words a reader sees: whitespace-separated tokens with a letter or digit, so a dash or an emoji is not a word. */
export function funnelWordCount(value: string): number {
  return value.trim().split(/\s+/).filter((token) => /[\p{L}\p{N}]/u.test(token)).length;
}

/** The longer words of a text (4+ letters), comparable across case, quotes and accents' composed forms. */
export function longWords(value: string): Set<string> {
  return new Set((comparableText(value).match(/[\p{L}\p{M}]+/gu) ?? []).filter((word) => [...word].length >= 4));
}

/** The share of two word sets they have in common. */
export function wordOverlap(a: Set<string>, b: Set<string>): number {
  let shared = 0;
  for (const word of a) if (b.has(word)) shared++;
  const union = a.size + b.size - shared;
  return union ? shared / union : 0;
}

/** The numbers a text states, as written and without separators ("$1.5 trillion" → 15), so "1,500" and "1500" compare equal. */
export function numbersIn(value: string): { written: string; digits: string }[] {
  return (value.match(/\d[\d.,]*/g) ?? []).map((match) => {
    const written = match.replace(/[.,]+$/, "");
    return { written, digits: written.replace(/[.,]/g, "") };
  });
}

/** A headline reduced to its letters and digits, to find two candidates that say the same thing. */
export const headlineKey = (value: string) => comparableText(value).replace(/[^\p{L}\p{N}]+/gu, " ").trim();

/** The numbers the cited facts state, plus a count the step may state on its own (a list's items). */
export function statedNumbers(cited: readonly Draft2Fact[], count?: number): Set<string> {
  // A list or a procedure states its count, and its items' or steps' own numbering (1…N) is not a quantity: real runs lost seven hooks to a "1".
  const numbering = count ? Array.from({ length: count }, (_, index) => String(index + 1)) : [];
  const stated = cited.flatMap((fact) => [...numbersIn(fact.claim), ...numbersIn(fact.evidence)].map((number) => number.digits));
  // A season or a term written as two consecutive years run together ("20262027", a source's lost hyphen) states both years, so "2026-2027" is not an unsupported number.
  const seasons = stated.flatMap((digits) => {
    const years = /^((?:19|20)\d\d)((?:19|20)\d\d)$/.exec(digits);
    return years && Number(years[2]) === Number(years[1]) + 1 ? [years[1], years[2]] : [];
  });
  return new Set([...stated, ...seasons, ...numbering]);
}

/**
 * What a failed call still tells: the usage a provider charged for it and,
 * on a cut-off, how far the answer got, so running out of tokens in
 * thinking can be told from an answer that grew too long.
 */
export function failedCall(error: unknown): Pick<Draft2TraceEntry, "usage" | "answerCharacters" | "stopReason"> {
  const failed = error && typeof error === "object" ? error as { usage?: Draft2TraceEntry["usage"]; details?: { stopReason?: unknown; answerCharacters?: unknown } } : {};
  return {
    ...(failed.usage && failed.usage.totalTokens > 0 ? { usage: failed.usage } : {}),
    ...(typeof failed.details?.answerCharacters === "number" ? { answerCharacters: failed.details.answerCharacters } : {}),
    ...(typeof failed.details?.stopReason === "string" ? { stopReason: failed.details.stopReason } : {}),
  };
}

/**
 * A schema with every enum inside an array's items removed (the values stay
 * the parser's to check). Anthropic's strict schemas compile to a grammar with
 * a size limit, and enums inside arrays are what grows it: the Focus failed
 * on one (HTTP 400 "The compiled grammar is too large"). A judge played by
 * Claude reads its evaluation schema this way; codes it names outside the
 * contract become OTHER and a proposal with a value outside it is dropped.
 */
export function funnelSchemaWithoutArrayEnums(schema: Record<string, unknown>): Record<string, unknown> {
  const strip = (node: unknown, inArray: boolean): unknown => {
    if (Array.isArray(node)) return node.map((entry) => strip(entry, inArray));
    if (!node || typeof node !== "object") return node;
    const entries = Object.entries(node as Record<string, unknown>).filter(([key]) => !(inArray && key === "enum"));
    return Object.fromEntries(entries.map(([key, value]) => [key, key === "items" ? strip(value, true) : key === "properties" ? Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([name, property]) => [name, strip(property, inArray)])) : strip(value, inArray)]));
  };
  return strip(schema, false) as Record<string, unknown>;
}
