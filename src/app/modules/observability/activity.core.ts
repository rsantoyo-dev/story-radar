import { AUDIT_OUTCOMES, type AuditOutcome } from "./audit.core";

/**
 * Query parsing for the Activity views (FEAT-OBS-001): the audit trail and the
 * record change history. Invalid filters are dropped rather than refused, so a
 * stale link still opens a list.
 */

export const DB_CHANGE_OPERATIONS = ["INSERT", "UPDATE", "DELETE"] as const;
export type DbChangeOperation = (typeof DB_CHANGE_OPERATIONS)[number];

export type AuditQuery = {
  /** Action prefix, e.g. `billing.` */
  action?: string;
  /** Action prefix to leave out, e.g. `api.request` (one row per change request). */
  excludeAction?: string;
  outcome?: AuditOutcome;
  entityType?: string;
  entityId?: string;
  topicId?: string;
  /** `all` spans every workspace, and events with none (sign-ins), for platform staff only. */
  scope: "workspace" | "all";
  before?: Date;
  limit: number;
};

export type ChangeQuery = {
  table?: string;
  operation?: DbChangeOperation;
  rowKey?: string;
  transactionId?: number;
  topicId?: string;
  /** `all` spans every workspace and is for platform staff only. */
  scope: "workspace" | "all";
  before?: Date;
  limit: number;
};

const ACTION_PREFIX = /^[a-z0-9_.]{1,80}$/u;
const SNAKE = /^[a-z_]{1,80}$/u;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

function value(params: URLSearchParams, name: string): string | undefined {
  return params.get(name)?.trim() || undefined;
}

function matching(text: string | undefined, pattern: RegExp): string | undefined {
  return text && pattern.test(text) ? text : undefined;
}

function beforeDate(params: URLSearchParams): Date | undefined {
  const text = value(params, "before");
  if (!text) return undefined;
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function pageSize(params: URLSearchParams): number {
  return Math.min(Math.max(Math.trunc(Number(params.get("limit"))) || 50, 1), 200);
}

/** Members see their own workspace's events; only platform staff may widen to every workspace. */
export function parseAuditQuery(params: URLSearchParams, staff: boolean): AuditQuery {
  const outcome = value(params, "outcome");
  const entityId = value(params, "entityId");
  return {
    action: matching(value(params, "action"), ACTION_PREFIX),
    excludeAction: matching(value(params, "excludeAction"), ACTION_PREFIX),
    outcome: (AUDIT_OUTCOMES as readonly string[]).includes(outcome ?? "") ? outcome as AuditOutcome : undefined,
    entityType: matching(value(params, "entityType"), SNAKE),
    entityId: entityId && entityId.length <= 300 ? entityId : undefined,
    topicId: matching(value(params, "topicId"), UUID),
    scope: staff && value(params, "scope") === "all" ? "all" : "workspace",
    before: beforeDate(params),
    limit: pageSize(params),
  };
}

/** Members see their own workspace's changes; only platform staff may widen to every workspace. */
export function parseChangeQuery(params: URLSearchParams, staff: boolean): ChangeQuery {
  const operation = value(params, "operation")?.toUpperCase();
  const rowKey = value(params, "rowKey");
  const transactionId = Number(params.get("transactionId"));
  return {
    table: matching(value(params, "table"), /^[a-z_]{1,63}$/u),
    operation: (DB_CHANGE_OPERATIONS as readonly string[]).includes(operation ?? "") ? operation as DbChangeOperation : undefined,
    rowKey: rowKey && rowKey.length <= 300 ? rowKey : undefined,
    transactionId: Number.isSafeInteger(transactionId) && transactionId > 0 ? transactionId : undefined,
    topicId: matching(value(params, "topicId"), UUID),
    scope: staff && value(params, "scope") === "all" ? "all" : "workspace",
    before: beforeDate(params),
    limit: pageSize(params),
  };
}

/** The cursor for the next page: the oldest time on a full page, otherwise none. */
export function nextBefore(rows: readonly { occurredAt: Date }[], limit: number): string | null {
  return rows.length === limit ? rows.at(-1)?.occurredAt.toISOString() ?? null : null;
}

/** Vercel's `x-vercel-id` or a UUID. */
export const REQUEST_ID = /^[A-Za-z0-9:._-]{1,128}$/u;

const FALLBACK_WINDOW_MS = 60_000;
const SETTLE_MS = 3_000;
const MAX_WINDOW_MS = 15 * 60_000;

/**
 * The span a request's record changes and AI calls are matched to: from its
 * recorded start (or a minute before its first event, for requests recorded
 * before starts were kept) to a few seconds after its last event, at most 15
 * minutes.
 */
export function requestWindow(details: Record<string, unknown>, recordedAt: readonly Date[]): { from: Date; to: Date; startedAt?: Date } {
  const last = Math.max(...recordedAt.map((date) => date.getTime()));
  const started = typeof details.startedAt === "string" ? new Date(details.startedAt) : undefined;
  const startedAt = started && !Number.isNaN(started.getTime()) && started.getTime() <= last ? started : undefined;
  const to = last + SETTLE_MS;
  const from = Math.max(startedAt ? startedAt.getTime() : last - FALLBACK_WINDOW_MS, to - MAX_WINDOW_MS);
  return { from: new Date(from), to: new Date(to), ...(startedAt ? { startedAt } : {}) };
}

/** The UUIDs in an API path, e.g. the story and draft a request worked on. */
export function uuidsIn(text: string): string[] {
  return text.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/giu) ?? [];
}

/** How long after a request its background work (images, follow-up writes) is still traced. */
export const FOLLOW_UP_MS = 10 * 60_000;
