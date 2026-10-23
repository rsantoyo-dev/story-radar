import type { CreativeAiUsage } from "../stories/creative-content.types";

/**
 * Facts, the first Draft 2 step: an extractor (GPT-6.1 Sol by default) turns
 * the article into checkable facts; an independent reviewer (Claude) judges
 * them against the article; the two loop, with the reviewer's suggestions,
 * for at most DRAFT2_FACTS_MAX_ROUNDS extractions. Everything here is pure:
 * contracts, schemas, parsing and the mechanical checks.
 */
export const DRAFT2_FACTS_MAX_ROUNDS = 3;
/** A dense article yields 25 to 30 facts; a cap below that made the extractor drop valid facts to add the missing ones. */
export const DRAFT2_FACTS_MAX_COUNT = 40;
/** Issues that justify leaving a fact out of the next list; any other dropped fact is restored by the program. */
const REMOVAL_CODES = new Set<Draft2IssueCode>(["DUPLICATE", "UNSUPPORTED", "EVIDENCE_NOT_FOUND"]);
export const DRAFT2_FACT_STATUSES = ["established", "attributed", "disputed"] as const;
export const DRAFT2_FACT_KINDS = ["event", "number", "date", "quote", "name", "claim"] as const;
export const DRAFT2_ISSUE_CODES = [
  "EVIDENCE_NOT_FOUND", "UNSUPPORTED", "MISQUALIFIED", "INEXACT_VALUE", "WRONG_ATTRIBUTION",
  "MISSING_KEY_FACT", "DUPLICATE", "VAGUE", "OTHER",
] as const;

export type Draft2FactStatus = (typeof DRAFT2_FACT_STATUSES)[number];
export type Draft2FactKind = (typeof DRAFT2_FACT_KINDS)[number];
export type Draft2IssueCode = (typeof DRAFT2_ISSUE_CODES)[number];

export type Draft2Fact = {
  id: string;
  /** One checkable claim, in the article's language. */
  claim: string;
  /** A verbatim excerpt of the article that supports the claim on its own. */
  evidence: string;
  kind: Draft2FactKind;
  /** established: the article states it; attributed: someone says it; disputed: contested or denied. */
  status: Draft2FactStatus;
  attribution?: string;
  /** The word that must travel with the claim: alleged, proposed, reported, expected… */
  qualifier?: string;
  importance: number;
  /** The editor changed the claim or the attribution by hand (2026-10-23): what they were, and when. The evidence is never edited. */
  edited?: { at: string; claim: string; attribution?: string };
};

/** A hand edit's limits: a claim is one checkable sentence or two; an attribution a name. */
export const FACT_CLAIM_MAX_CHARACTERS = 500;
export const FACT_ATTRIBUTION_MAX_CHARACTERS = 120;

/**
 * The facts with one fact's claim or attribution changed by hand (the
 * reviewer left a typo the article carried, "RAJC" for RACJ, and the facts
 * could only be taken as they stood or extracted again): the fact keeps its
 * evidence, status, kind and importance, and records what it said before.
 * An input error when the fact is unknown, the claim empty, or nothing changes.
 */
export function editedFacts(facts: readonly Draft2Fact[], factId: string, patch: { claim?: string; attribution?: string }, now: Date): Draft2Fact[] {
  const fact = facts.find((entry) => entry.id === factId);
  if (!fact) throw new Draft2InputError(`${factId} is not one of this session's facts.`);
  const claim = patch.claim === undefined ? fact.claim : patch.claim.replace(/\s+/g, " ").trim();
  const attribution = patch.attribution === undefined ? fact.attribution : patch.attribution.replace(/\s+/g, " ").trim() || undefined;
  if (!claim) throw new Draft2InputError("A fact's claim cannot be left empty.");
  if (claim.length > FACT_CLAIM_MAX_CHARACTERS) throw new Draft2InputError(`Keep the claim under ${FACT_CLAIM_MAX_CHARACTERS} characters.`);
  if ((attribution ?? "").length > FACT_ATTRIBUTION_MAX_CHARACTERS) throw new Draft2InputError(`Keep the attribution under ${FACT_ATTRIBUTION_MAX_CHARACTERS} characters.`);
  if (claim === fact.claim && attribution === fact.attribution) throw new Draft2InputError("This fact already says that.");
  const before = fact.edited ?? { at: now.toISOString(), claim: fact.claim, ...(fact.attribution ? { attribution: fact.attribution } : {}) };
  const next: Draft2Fact = { ...fact, claim, ...(attribution ? { attribution } : {}), edited: { ...before, at: now.toISOString() } };
  if (!attribution) delete next.attribution;
  return facts.map((entry) => entry.id === factId ? next : entry);
}

export type Draft2FactsIssue = { code: Draft2IssueCode; factId?: string; detail: string };

export type Draft2FactsEvaluation = {
  verdict: "valid" | "revise";
  score: number;
  issues: Draft2FactsIssue[];
  /** Concrete instructions for the extractor's next pass. */
  suggestions: string[];
  summary: string;
  /** The editor took the list as it stands after the reviewer's last "revise" (acceptDraft2Facts), or the program repaired the facts the reviewer named and accepted the list (repairDraft2Facts): the issues stay in view, the next steps build on these facts. */
  accepted?: { by: "editor" | "program"; at: string; repaired?: Draft2FactsRepair };
};

/** What the program's repair changed: the facts rewritten, the duplicates removed, the key facts added. */
export type Draft2FactsRepair = { changed: string[]; removed: string[]; added: string[] };

export type Draft2FactsRound = {
  round: number;
  facts: Draft2Fact[];
  /** Findings of the program that searched each fact's evidence in the article. */
  mechanical: Draft2FactsIssue[];
  /** Facts of the previous round the extractor dropped without a reason; the program put them back. */
  restored?: string[];
  evaluation?: Draft2FactsEvaluation;
  /** The program's repair round (2026-10-23): one call that rewrote the facts the reviewer named, then the program's own checks. */
  repair?: Draft2FactsRepair;
  at: string;
};

export type Draft2HistoryTurn = { role: "user" | "assistant"; text: string };

/** The provider conversations the next steps continue. */
export type Draft2Threads = {
  openai?: { model: string; responseId: string };
  /** Kept by sessions from before the reviewer read the article as cached context (facts skill v1); no longer written. */
  anthropic?: { model: string; history: Draft2HistoryTurn[] };
};

/** The pipeline's steps that have been built, in order. */
export type Draft2Step = "facts" | "focus" | "spine" | "opening" | "closing" | "deck" | "review" | "inventory" | "visual" | "images" | "mentions" | "caption" | "publication";

export type Draft2TraceEntry = {
  at: string;
  step: Draft2Step;
  round: number;
  provider: "openai" | "anthropic";
  model: string;
  operation: string;
  durationMs: number;
  usage?: CreativeAiUsage;
  cachedInputTokens?: number;
  /** Prompt-cache writes (Claude), counted inside usage.promptTokens like the reads. */
  cacheWriteTokens?: number;
  /** The answer's length; for Claude, the output tokens beyond it went to thinking. Also kept on a cut-off, with the usage. */
  answerCharacters?: number;
  /** Why a provider stopped an answer short (max_tokens, refusal). */
  stopReason?: string;
  outcome: "ok" | "error";
  note?: string;
  /** The skill versions the call's instructions were composed from (skills/draft2-skills.ts). */
  skillVersions?: Record<string, string>;
  /** The reasoning effort the call ran at (Claude's output_config.effort, Sol's reasoning.effort). */
  effort?: "low" | "medium" | "high";
  /** What the call cost by the meter's rates (USD micros); absent when the model has no verified rate. */
  costMicros?: number;
};

export type Draft2SessionStatus = "running" | "ready" | "needs-review" | "failed";

/** A step that cannot start: missing text, unverified facts, a missing key. */
export class Draft2InputError extends Error {}
/** Another run of the story is still in progress. */
export class Draft2BusyError extends Error {}
/** A model answer that does not fit its contract; never persisted. */
export class Draft2ResponseError extends Error {}

const nullableString = { type: ["string", "null"] };

/** The extractor's tool: the complete facts list. */
export const DRAFT2_FACTS_SCHEMA: Record<string, unknown> = {
  type: "object",
  properties: {
    facts: {
      type: "array",
      minItems: 1,
      maxItems: DRAFT2_FACTS_MAX_COUNT,
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          claim: { type: "string" },
          evidence: { type: "string" },
          kind: { type: "string", enum: [...DRAFT2_FACT_KINDS] },
          status: { type: "string", enum: [...DRAFT2_FACT_STATUSES] },
          attribution: nullableString,
          qualifier: nullableString,
          importance: { type: "integer", minimum: 1, maximum: 100 },
        },
        required: ["id", "claim", "evidence", "kind", "status", "attribution", "qualifier", "importance"],
        additionalProperties: false,
      },
    },
  },
  required: ["facts"],
  additionalProperties: false,
};

/** The reviewer's tool: the verdict on a facts list. */
export const DRAFT2_FACTS_REVIEW_SCHEMA: Record<string, unknown> = {
  type: "object",
  properties: {
    verdict: { type: "string", enum: ["valid", "revise"] },
    score: { type: "integer", minimum: 1, maximum: 100 },
    issues: {
      type: "array",
      maxItems: 40,
      items: {
        type: "object",
        properties: {
          code: { type: "string", enum: [...DRAFT2_ISSUE_CODES] },
          factId: nullableString,
          detail: { type: "string" },
        },
        required: ["code", "factId", "detail"],
        additionalProperties: false,
      },
    },
    suggestions: { type: "array", maxItems: 20, items: { type: "string" } },
    summary: { type: "string" },
  },
  required: ["verdict", "score", "issues", "suggestions", "summary"],
  additionalProperties: false,
};

const MAX_CLAIM_CHARACTERS = 400;
const MAX_EVIDENCE_CHARACTERS = 700;

function parseObject(text: string, what: string): Record<string, unknown> {
  let parsed: unknown;
  try { parsed = JSON.parse(text); } catch { throw new Draft2ResponseError(`The ${what} answer is not valid JSON`); }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Draft2ResponseError(`The ${what} answer is not an object`);
  return parsed as Record<string, unknown>;
}

const text = (value: unknown, max: number): string | undefined =>
  typeof value === "string" && value.trim() && value.trim().length <= max ? value.trim() : undefined;
const optionalText = (value: unknown, max: number): string | undefined =>
  value === null || value === undefined || (typeof value === "string" && !value.trim()) ? undefined : text(value, max);

/** The extractor's answer as facts; anything malformed is a response error, never persisted. */
export function parseDraft2Facts(answer: string): Draft2Fact[] {
  const body = parseObject(answer, "extractor");
  if (!Array.isArray(body.facts) || body.facts.length === 0) throw new Draft2ResponseError("The extractor returned no facts");
  const seen = new Set<string>();
  return body.facts.slice(0, DRAFT2_FACTS_MAX_COUNT).map((raw, index) => {
    const item = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
    const id = text(item.id, 24) ?? `f${index + 1}`;
    const claim = text(item.claim, MAX_CLAIM_CHARACTERS);
    const evidence = text(item.evidence, MAX_EVIDENCE_CHARACTERS);
    const kind = DRAFT2_FACT_KINDS.find((candidate) => candidate === item.kind);
    const status = DRAFT2_FACT_STATUSES.find((candidate) => candidate === item.status);
    const importance = typeof item.importance === "number" && Number.isInteger(item.importance) ? Math.min(100, Math.max(1, item.importance)) : undefined;
    if (!claim || !evidence || !kind || !status || importance === undefined) throw new Draft2ResponseError(`Fact ${id} is incomplete or malformed`);
    if (seen.has(id)) throw new Draft2ResponseError(`Fact id ${id} is repeated`);
    seen.add(id);
    const attribution = optionalText(item.attribution, 200);
    const qualifier = optionalText(item.qualifier, 120);
    return { id, claim, evidence, kind, status, importance, ...(attribution ? { attribution } : {}), ...(qualifier ? { qualifier } : {}) };
  });
}

/** The reviewer's answer as an evaluation; issue codes outside the contract become OTHER. */
export function parseDraft2FactsEvaluation(answer: string): Draft2FactsEvaluation {
  const body = parseObject(answer, "reviewer");
  const verdict = body.verdict === "valid" ? "valid" : body.verdict === "revise" ? "revise" : undefined;
  const score = typeof body.score === "number" && Number.isFinite(body.score) ? Math.min(100, Math.max(1, Math.round(body.score))) : undefined;
  const summary = text(body.summary, 1_000);
  if (!verdict || score === undefined || !summary) throw new Draft2ResponseError("The reviewer's verdict is incomplete");
  const issues = (Array.isArray(body.issues) ? body.issues : []).slice(0, 40).flatMap((raw): Draft2FactsIssue[] => {
    const item = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
    const detail = text(item.detail, 600);
    if (!detail) return [];
    const code = DRAFT2_ISSUE_CODES.find((candidate) => candidate === item.code) ?? "OTHER";
    const factId = optionalText(item.factId, 24);
    return [{ code, detail, ...(factId ? { factId } : {}) }];
  });
  const suggestions = (Array.isArray(body.suggestions) ? body.suggestions : []).slice(0, 20).flatMap((item) => { const value = text(item, 600); return value ? [value] : []; });
  return { verdict, score, issues, suggestions, summary };
}

/** Comparable text: one case, one kind of quote and dash, single spaces, no soft hyphens. */
export function comparableText(value: string): string {
  return value
    .normalize("NFKC")
    .replace(/[­​-‍﻿]/g, "")
    .replace(/[‘’‚′]/g, "'")
    .replace(/[“”„″]/g, "\"")
    .replace(/[‐-―−]/g, "-")
    .replace(/…/g, "...")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/**
 * The program's own findings: evidence that is not in the article (its
 * headline included: a story's outcome may be stated only there, as a
 * Saint-Jean fraud story's "évite une perte de 4 000 $" was, 2026-10-17),
 * and repeated claims. These never depend on a model.
 */
export function mechanicalFactIssues(facts: readonly Draft2Fact[], articleText: string, title = ""): Draft2FactsIssue[] {
  const article = comparableText(`${title}\n${articleText}`);
  const issues: Draft2FactsIssue[] = [];
  const claims = new Map<string, string>();
  for (const fact of facts) {
    if (!article.includes(comparableText(fact.evidence))) {
      issues.push({ code: "EVIDENCE_NOT_FOUND", factId: fact.id, detail: "The evidence is not a verbatim excerpt of the article. Copy the supporting sentence exactly as written." });
    }
    const key = comparableText(fact.claim);
    const earlier = claims.get(key);
    if (earlier) issues.push({ code: "DUPLICATE", factId: fact.id, detail: `The claim repeats fact ${earlier}.` });
    else claims.set(key, fact.id);
    if (fact.status === "attributed" && !fact.attribution) {
      issues.push({ code: "WRONG_ATTRIBUTION", factId: fact.id, detail: "An attributed fact must name who says it, as the article does." });
    }
  }
  return issues;
}

/** The facts are ready only when the reviewer accepts them and the program found nothing. */
export function draft2FactsAreValid(mechanical: readonly Draft2FactsIssue[], evaluation: Draft2FactsEvaluation): boolean {
  return mechanical.length === 0 && evaluation.verdict === "valid";
}

/** The issues and suggestions the extractor receives for its next pass: the program's findings first, then the reviewer's. */
export function revisionRequest(previous: readonly Draft2Fact[], mechanical: readonly Draft2FactsIssue[], evaluation: Draft2FactsEvaluation) {
  return {
    reviewerVerdict: evaluation.verdict,
    reviewerScore: evaluation.score,
    reviewerSummary: evaluation.summary,
    issues: [...mechanical, ...evaluation.issues],
    suggestions: evaluation.suggestions,
    previousFacts: previous.map((fact) => ({ id: fact.id, claim: fact.claim })),
    instruction: `Apply the issues and suggestions above and return the complete revised facts list. It must keep every fact in previousFacts, with its id, unless an issue above names that fact as a duplicate or unsupported: fix, requalify or split facts in place and add the missing ones with new ids. Dropping a fact that no issue names is a regression. Up to ${DRAFT2_FACTS_MAX_COUNT} facts.`,
  };
}

/**
 * The revised list with every fact of the previous round the extractor
 * dropped without a reason put back: an issue naming the fact as a
 * duplicate, unsupported or without evidence is a reason; a fact rewritten
 * under a new id (same claim or same evidence) was not dropped.
 */
export function mergeRevisedFacts(previous: readonly Draft2Fact[], revised: readonly Draft2Fact[], previousIssues: readonly Draft2FactsIssue[]): { facts: Draft2Fact[]; restored: string[] } {
  const removable = new Set(previousIssues.filter((issue) => issue.factId && REMOVAL_CODES.has(issue.code)).map((issue) => issue.factId));
  const ids = new Set(revised.map((fact) => fact.id));
  const claims = new Set(revised.map((fact) => comparableText(fact.claim)));
  const evidence = new Set(revised.map((fact) => comparableText(fact.evidence)));
  const restored = previous.filter((fact) =>
    !ids.has(fact.id) && !removable.has(fact.id) && !claims.has(comparableText(fact.claim)) && !evidence.has(comparableText(fact.evidence)));
  return { facts: [...revised, ...restored].slice(0, DRAFT2_FACTS_MAX_COUNT), restored: restored.map((fact) => fact.id) };
}

/**
 * The repair (2026-10-23, the editor: "si vemos que necesita review, ya
 * sabemos el punto específico; debería ser una llamada simple para
 * arreglarse"). After the last extraction the reviewer still names a few
 * facts (a typo the article carried, a duplicate, an inferred attribution):
 * instead of a fourth rewrite of the whole list, or a human, one call fixes
 * the named facts only, and the program decides: every named fact changed or
 * removed, every key fact asked for added, every evidence found verbatim in
 * the article. Below a score of FACTS_REPAIR_MIN_SCORE, or with an issue that
 * names no fact, the list is the editor's to read.
 */
export const FACTS_REPAIR_MIN_SCORE = 70;

/** Whether the reviewer's last verdict is one the program can repair: every issue names a fact or asks for a missing one, and the list is close. */
export function factsRepairable(mechanical: readonly Draft2FactsIssue[], evaluation: Draft2FactsEvaluation): boolean {
  const issues = [...mechanical, ...evaluation.issues];
  return evaluation.verdict === "revise" && evaluation.score >= FACTS_REPAIR_MIN_SCORE && issues.length > 0
    && issues.every((issue) => Boolean(issue.factId) || issue.code === "MISSING_KEY_FACT");
}

/** The extractor's repair task: the facts named, the findings on each, and the reviewer's suggestions; it returns those facts corrected. */
export function repairRequest(facts: readonly Draft2Fact[], mechanical: readonly Draft2FactsIssue[], evaluation: Draft2FactsEvaluation) {
  const issues = [...mechanical, ...evaluation.issues];
  const named = new Set(issues.flatMap((issue) => issue.factId ? [issue.factId] : []));
  return {
    task: "repair",
    facts: facts.filter((fact) => named.has(fact.id)),
    issues,
    suggestions: evaluation.suggestions,
    instruction: "Return only the facts listed here, corrected as the issues and suggestions say, each with its id; omit a fact an issue calls a duplicate; for a missing key fact, add one with a new id. The evidence stays a verbatim excerpt of the article. Change nothing else.",
  };
}

/**
 * The repaired facts applied to the list: a named fact returned replaces its
 * own; a named fact omitted is removed only when an issue called it a
 * duplicate, else it is unaddressed; a new fact is added only when a key fact
 * was asked for; anything else the model returned is ignored.
 */
export function applyFactsRepair(facts: readonly Draft2Fact[], repaired: readonly Draft2Fact[], issues: readonly Draft2FactsIssue[]): { facts: Draft2Fact[]; repair: Draft2FactsRepair; unaddressed: string[] } {
  const named = [...new Set(issues.flatMap((issue) => issue.factId ? [issue.factId] : []))];
  const duplicates = new Set(issues.filter((issue) => issue.code === "DUPLICATE" && issue.factId).map((issue) => issue.factId));
  const missingKey = issues.some((issue) => issue.code === "MISSING_KEY_FACT");
  const byId = new Map(repaired.map((fact) => [fact.id, fact]));
  const known = new Set(facts.map((fact) => fact.id));
  const changed: string[] = [], removed: string[] = [], unaddressed: string[] = [];
  const next: Draft2Fact[] = [];
  for (const fact of facts) {
    if (!named.includes(fact.id)) { next.push(fact); continue; }
    const fixed = byId.get(fact.id);
    if (fixed) {
      const same = comparableText(fixed.claim) === comparableText(fact.claim) && (fixed.attribution ?? "") === (fact.attribution ?? "") && fixed.status === fact.status && (fixed.qualifier ?? "") === (fact.qualifier ?? "") && comparableText(fixed.evidence) === comparableText(fact.evidence);
      if (same) unaddressed.push(fact.id); else changed.push(fact.id);
      next.push(same ? fact : fixed);
    } else if (duplicates.has(fact.id)) removed.push(fact.id);
    else { unaddressed.push(fact.id); next.push(fact); }
  }
  const added = missingKey ? repaired.filter((fact) => !known.has(fact.id)).map((fact) => fact.id) : [];
  for (const fact of repaired) if (added.includes(fact.id)) next.push(fact);
  if (missingKey && !added.length) unaddressed.push("a missing key fact");
  return { facts: next, repair: { changed, removed, added }, unaddressed };
}
