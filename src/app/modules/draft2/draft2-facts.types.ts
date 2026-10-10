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
};

export type Draft2FactsIssue = { code: Draft2IssueCode; factId?: string; detail: string };

export type Draft2FactsEvaluation = {
  verdict: "valid" | "revise";
  score: number;
  issues: Draft2FactsIssue[];
  /** Concrete instructions for the extractor's next pass. */
  suggestions: string[];
  summary: string;
};

export type Draft2FactsRound = {
  round: number;
  facts: Draft2Fact[];
  /** Findings of the program that searched each fact's evidence in the article. */
  mechanical: Draft2FactsIssue[];
  /** Facts of the previous round the extractor dropped without a reason; the program put them back. */
  restored?: string[];
  evaluation?: Draft2FactsEvaluation;
  at: string;
};

export type Draft2HistoryTurn = { role: "user" | "assistant"; text: string };

/** The provider conversations the next steps continue. */
export type Draft2Threads = {
  openai?: { model: string; responseId: string };
  anthropic?: { model: string; history: Draft2HistoryTurn[] };
};

/** The pipeline's steps that have been built, in order. */
export type Draft2Step = "facts" | "opening";

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
  outcome: "ok" | "error";
  note?: string;
  /** The skill versions the call's instructions were composed from (skills/draft2-skills.ts). */
  skillVersions?: Record<string, string>;
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

/** The program's own findings: evidence that is not in the article, and repeated claims. These never depend on a model. */
export function mechanicalFactIssues(facts: readonly Draft2Fact[], articleText: string): Draft2FactsIssue[] {
  const article = comparableText(articleText);
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
