/**
 * Structured log entries without server dependencies, so redaction and
 * formatting can be tested directly. `logger.ts` adds the request context and
 * writes them.
 *
 * Every entry is one JSON object per line: easy to search in Vercel's logs and
 * in any log drain. Secrets, tokens, sign-in links, connection strings and
 * email addresses are redacted before anything is written.
 */

export const LOG_LEVELS = ["debug", "info", "warn", "error"] as const;
export type LogLevel = (typeof LOG_LEVELS)[number];
export type LogFormat = "json" | "pretty";

const RANK: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

export function parseLogLevel(value: string | undefined, fallback: LogLevel = "info"): LogLevel {
  const level = value?.trim().toLowerCase();
  return (LOG_LEVELS as readonly string[]).includes(level ?? "") ? level as LogLevel : fallback;
}

export function shouldLog(level: LogLevel, minimum: LogLevel): boolean {
  return RANK[level] >= RANK[minimum];
}

export function parseLogFormat(value: string | undefined, production: boolean): LogFormat {
  const format = value?.trim().toLowerCase();
  if (format === "json" || format === "pretty") return format;
  return production ? "json" : "pretty";
}

const REDACTED = "[redacted]";
const MAX_STRING = 4_000;
const MAX_DEPTH = 6;
const MAX_ITEMS = 50;
const MAX_KEYS = 100;

/** Keys whose string values are always secret, whatever they contain. */
const SECRET_KEY = /pass(word)?|secret|token|authorization|cookie|api[-_]?key|signature|credential|private[-_]?key|client[-_]?secret|verifier/i;

const TEXT_RULES: [RegExp, string][] = [
  [/\b(sk|rk|pk)_(live|test)_[A-Za-z0-9]{6,}/g, "$1_$2_[redacted]"],
  [/\bwhsec_[A-Za-z0-9]{6,}/g, "whsec_[redacted]"],
  [/\bre_[A-Za-z0-9]{16,}/g, "re_[redacted]"],
  [/\bAIza[0-9A-Za-z_-]{30,}/g, "AIza[redacted]"],
  [/\bEAA[A-Za-z0-9]{20,}/g, "EAA[redacted]"],
  [/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g, "[redacted-jwt]"],
  [/\bBearer\s+[A-Za-z0-9._~+/=-]{6,}/gi, "Bearer [redacted]"],
  [/\b(postgres(?:ql)?|mysql|redis|mongodb(?:\+srv)?):\/\/[^\s"'<>]+/gi, "$1://[redacted]"],
  [/([?&](?:token|access_token|refresh_token|id_token|code|state|client_secret|signature|sig|key|apikey|api_key)=)[^&\s"'<>#]+/gi, "$1[redacted]"],
  [/\b([A-Za-z0-9._%+-])[A-Za-z0-9._%+-]*@([A-Za-z0-9.-]+\.[A-Za-z]{2,})\b/g, "$1***@$2"],
];

/** Removes secrets and personal data from free text. */
export function redactText(value: string): string {
  let text = value.length > MAX_STRING ? `${value.slice(0, MAX_STRING)}… [${value.length - MAX_STRING} more characters]` : value;
  for (const [pattern, replacement] of TEXT_RULES) text = text.replace(pattern, replacement);
  return text;
}

type ErrorLike = Error & { code?: unknown; status?: unknown; statusCode?: unknown; digest?: unknown; cause?: unknown };

function serializeError(error: ErrorLike, depth: number, seen: WeakSet<object>): Record<string, unknown> {
  const serialized: Record<string, unknown> = {
    name: error.name,
    message: redactText(error.message ?? ""),
  };
  if (error.stack) serialized.stack = redactText(error.stack.split("\n").slice(0, 12).join("\n"));
  for (const key of ["code", "status", "statusCode", "digest"] as const) {
    if (error[key] !== undefined) serialized[key] = sanitize(error[key], depth + 1, seen);
  }
  if (error.cause !== undefined) serialized.cause = sanitize(error.cause, depth + 1, seen);
  return serialized;
}

/**
 * A JSON-safe, redacted copy: errors become {name, message, stack, code},
 * secret-looking keys hide their string values, long or deep values are cut.
 */
export function sanitize(value: unknown, depth = 0, seen: WeakSet<object> = new WeakSet()): unknown {
  if (value === null || value === undefined) return value ?? null;
  if (typeof value === "string") return redactText(value);
  if (typeof value === "number") return Number.isFinite(value) ? value : String(value);
  if (typeof value === "boolean") return value;
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "symbol" || typeof value === "function") return `[${typeof value}]`;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? "Invalid Date" : value.toISOString();
  if (typeof value !== "object") return String(value);
  if (seen.has(value)) return "[circular]";
  if (depth >= MAX_DEPTH) return "[truncated]";
  seen.add(value);
  if (value instanceof Error) return serializeError(value, depth, seen);
  if (value instanceof URL) return redactText(value.toString());
  if (typeof Headers !== "undefined" && value instanceof Headers) return "[headers]";
  if (ArrayBuffer.isView(value) || value instanceof ArrayBuffer) return `[binary ${(value as ArrayBuffer).byteLength} bytes]`;
  if (Array.isArray(value)) {
    const items = value.slice(0, MAX_ITEMS).map((item) => sanitize(item, depth + 1, seen));
    if (value.length > MAX_ITEMS) items.push(`[${value.length - MAX_ITEMS} more items]`);
    return items;
  }
  if (value instanceof Map) return sanitize(Object.fromEntries(value), depth, seen);
  if (value instanceof Set) return sanitize([...value], depth, seen);
  const output: Record<string, unknown> = {};
  const entries = Object.entries(value as Record<string, unknown>);
  for (const [key, item] of entries.slice(0, MAX_KEYS)) {
    output[key] = SECRET_KEY.test(key) && typeof item === "string" && item ? REDACTED : sanitize(item, depth + 1, seen);
  }
  if (entries.length > MAX_KEYS) output["…"] = `${entries.length - MAX_KEYS} more keys`;
  return output;
}

export type LogEntry = {
  time: string;
  level: LogLevel;
  module: string;
  msg: string;
  [field: string]: unknown;
};

const RESERVED = new Set(["time", "level", "module", "msg"]);

/**
 * One entry. `fields` are spread at the top level (searchable); `context` is
 * the request context (request id, user, workspace). Reserved names in fields
 * are prefixed so they can never overwrite the entry's own.
 */
export function buildLogEntry(input: {
  level: LogLevel;
  module: string;
  message: string;
  fields?: Record<string, unknown>;
  context?: Record<string, unknown>;
  now?: Date;
}): LogEntry {
  const entry: LogEntry = {
    time: (input.now ?? new Date()).toISOString(),
    level: input.level,
    module: input.module,
    msg: redactText(input.message),
  };
  for (const source of [input.context, input.fields]) {
    if (!source) continue;
    for (const [key, value] of Object.entries(sanitize(source) as Record<string, unknown>)) {
      if (value === undefined) continue;
      entry[RESERVED.has(key) ? `field_${key}` : key] = value;
    }
  }
  return entry;
}

/** console.* arguments as an entry: the first string is the message, the rest are details. */
export function consoleArgsToEntryInput(args: readonly unknown[]): { message: string; fields?: Record<string, unknown> } {
  const [first, ...rest] = args;
  const message = typeof first === "string" ? first : first instanceof Error ? first.message : "";
  const details = typeof first === "string" ? rest : args;
  if (!details.length) return { message };
  const errors = details.filter((detail): detail is Error => detail instanceof Error);
  const others = details.filter((detail) => !(detail instanceof Error));
  const fields: Record<string, unknown> = {};
  if (errors.length) fields.error = errors.length === 1 ? errors[0] : errors;
  if (others.length === 1 && others[0] && typeof others[0] === "object" && !Array.isArray(others[0])) {
    Object.assign(fields, others[0]);
  } else if (others.length) {
    fields.details = others.length === 1 ? others[0] : others;
  }
  return { message, fields };
}

export function formatLogEntry(entry: LogEntry, format: LogFormat): string {
  if (format === "json") return JSON.stringify(entry);
  const { time, level, module, msg, ...rest } = entry;
  const extra = Object.keys(rest).length ? ` ${JSON.stringify(rest)}` : "";
  return `${time.slice(11, 23)} ${level.toUpperCase().padEnd(5)} [${module}] ${msg}${extra}`;
}
