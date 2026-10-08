/**
 * Filters of the activity console (requests, actions, data changes), parsed
 * from query parameters without server dependencies so they can be tested.
 * Unknown or malformed values are ignored rather than rejected.
 */

export type StatusClass = "2xx" | "3xx" | "4xx" | "5xx" | "denied" | "errors";

export type ActivityFilters = {
  from?: Date;
  to?: Date;
  /** Paging: rows strictly older than this. */
  before?: Date;
  actorId?: string;
  topicId?: string;
  requestId?: string;
  /** Requests: method. */
  method?: string;
  /** Requests: a status class or one exact status. */
  status?: StatusClass | number;
  /** Requests: path contains; events: action prefix; changes: table name. */
  path?: string;
  action?: string;
  table?: string;
  outcome?: string;
  /** Free text: request id, path, entity id or row key. */
  q?: string;
  limit: number;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
const METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD"];
const STATUS_CLASSES: StatusClass[] = ["2xx", "3xx", "4xx", "5xx", "denied", "errors"];
const OUTCOMES = ["success", "failure", "denied", "attempted"];

function date(value: string | null): Date | undefined {
  if (!value) return undefined;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

function safeText(value: string | null, pattern: RegExp, max = 200): string | undefined {
  const text = value?.trim();
  return text && text.length <= max && pattern.test(text) ? text : undefined;
}

export function parseActivityFilters(params: URLSearchParams, defaults: { limit?: number; maxLimit?: number } = {}): ActivityFilters {
  const maxLimit = defaults.maxLimit ?? 200;
  const limit = Math.min(Math.max(Math.trunc(Number(params.get("limit"))) || defaults.limit || 50, 1), maxLimit);
  const statusParam = params.get("status")?.trim().toLowerCase();
  const exactStatus = statusParam && /^[1-5]\d\d$/u.test(statusParam) ? Number(statusParam) : undefined;
  const method = params.get("method")?.trim().toUpperCase();
  const outcome = params.get("outcome")?.trim().toLowerCase();
  return {
    from: date(params.get("from")),
    to: date(params.get("to")),
    before: date(params.get("before")),
    actorId: safeText(params.get("actorId"), /^[A-Za-z0-9_-]+$/u, 100),
    topicId: safeText(params.get("topicId"), UUID, 36),
    requestId: safeText(params.get("requestId"), /^[A-Za-z0-9:._-]+$/u, 128),
    method: method && METHODS.includes(method) ? method : undefined,
    status: exactStatus ?? (STATUS_CLASSES.includes(statusParam as StatusClass) ? statusParam as StatusClass : undefined),
    path: safeText(params.get("path"), /^[A-Za-z0-9/_.[\]-]+$/u, 200),
    action: safeText(params.get("action"), /^[a-z0-9_.]+$/u, 80),
    table: safeText(params.get("table"), /^[a-z_]+$/u, 63),
    outcome: outcome && OUTCOMES.includes(outcome) ? outcome : undefined,
    q: safeText(params.get("q"), /^[^%\\]+$/u, 200),
    limit,
  };
}

/** The status range a class stands for, inclusive. */
export function statusRange(status: StatusClass): { min: number; max: number; only?: number[] } {
  switch (status) {
    case "2xx": return { min: 200, max: 299 };
    case "3xx": return { min: 300, max: 399 };
    case "4xx": return { min: 400, max: 499 };
    case "5xx": return { min: 500, max: 599 };
    case "denied": return { min: 401, max: 403, only: [401, 403] };
    case "errors": return { min: 400, max: 599 };
  }
}

/** A LIKE pattern for user text, with wildcards escaped. */
export function containsPattern(text: string): string {
  return `%${text.replace(/[%_\\]/gu, (character) => `\\${character}`)}%`;
}
