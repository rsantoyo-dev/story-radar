import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";

import {
  buildLogEntry,
  consoleArgsToEntryInput,
  formatLogEntry,
  parseLogFormat,
  parseLogLevel,
  shouldLog,
  type LogLevel,
} from "./log.core";

/**
 * Structured server logging (FEAT-OBS-001).
 *
 *   const log = createLogger("billing");
 *   log.info("Credits granted", { purchaseId, credits });
 *   log.error("Checkout failed", { error, priceId });
 *
 * Each call writes one redacted JSON line with the request context (request
 * id, method, path, user, workspace) when there is one. Existing console.*
 * calls go through the same formatter once `installConsoleBridge()` runs at
 * startup (instrumentation.ts), so nothing logs a raw secret.
 *
 * LOG_LEVEL (debug | info | warn | error, default info) and LOG_FORMAT
 * (json | pretty; json in production) tune the output.
 */

export type LogContext = {
  requestId: string;
  method?: string;
  path?: string;
  userId?: string;
  workspaceId?: string;
  topicId?: string;
  [field: string]: unknown;
};

const contextStore = new AsyncLocalStorage<LogContext>();

/** What an API request's audit event keeps for debugging: kept beside the context so log lines stay lean. */
export type RequestProblem = { time: string; level: "warn" | "error"; module: string; msg: string; [field: string]: unknown };
type RequestTrace = { startedAt: number; problems: RequestProblem[] };
const traces = new WeakMap<LogContext, RequestTrace>();
const MAX_PROBLEMS = 20;
const CONTEXT_FIELDS = new Set(["requestId", "method", "path", "actor", "userId", "workspaceId", "topicId", "role"]);

type ConsoleMethod = (...args: unknown[]) => void;
type ConsoleWriters = Record<"debug" | "info" | "warn" | "error", ConsoleMethod>;

const BRIDGE_FLAG = Symbol.for("press-craftor.console-bridge");
const WRITERS = Symbol.for("press-craftor.console-writers");
type BridgedGlobal = typeof globalThis & { [BRIDGE_FLAG]?: boolean; [WRITERS]?: ConsoleWriters };

function writers(): ConsoleWriters {
  const global = globalThis as BridgedGlobal;
  return global[WRITERS] ?? {
    debug: console.debug.bind(console),
    info: console.info.bind(console),
    warn: console.warn.bind(console),
    error: console.error.bind(console),
  };
}

function settings(): { minimum: LogLevel; format: "json" | "pretty" } {
  const production = process.env.NODE_ENV === "production" || Boolean(process.env.VERCEL);
  return {
    minimum: parseLogLevel(process.env.LOG_LEVEL, "info"),
    format: parseLogFormat(process.env.LOG_FORMAT, production),
  };
}

function write(level: LogLevel, module: string, message: string, fields?: Record<string, unknown>): void {
  const { minimum, format } = settings();
  if (!shouldLog(level, minimum)) return;
  try {
    const context = contextStore.getStore();
    const entry = buildLogEntry({ level, module, message, fields, context });
    writers()[level](formatLogEntry(entry, format));
    const trace = context ? traces.get(context) : undefined;
    if (trace && (level === "warn" || level === "error") && trace.problems.length < MAX_PROBLEMS) {
      trace.problems.push(Object.fromEntries(Object.entries(entry).filter(([key]) => !CONTEXT_FIELDS.has(key))) as RequestProblem);
    }
  } catch {
    // Logging must never break the request it describes.
    writers().error(JSON.stringify({ time: new Date().toISOString(), level: "error", module: "logger", msg: "A log entry could not be written" }));
  }
}

export type Logger = {
  debug(message: string, fields?: Record<string, unknown>): void;
  info(message: string, fields?: Record<string, unknown>): void;
  warn(message: string, fields?: Record<string, unknown>): void;
  error(message: string, fields?: Record<string, unknown>): void;
  /** A logger whose entries all carry `fields` (a job id, a topic…). */
  child(fields: Record<string, unknown>): Logger;
};

export function createLogger(module: string, bound: Record<string, unknown> = {}): Logger {
  const merge = (fields?: Record<string, unknown>) => (fields ? { ...bound, ...fields } : bound);
  return {
    debug: (message, fields) => write("debug", module, message, merge(fields)),
    info: (message, fields) => write("info", module, message, merge(fields)),
    warn: (message, fields) => write("warn", module, message, merge(fields)),
    error: (message, fields) => write("error", module, message, merge(fields)),
    child: (fields) => createLogger(module, { ...bound, ...fields }),
  };
}

/** The request id Vercel (or a caller) assigned, or a new one. */
export function requestIdFrom(headers: Headers): string {
  const given = headers.get("x-request-id")?.trim() || headers.get("x-vercel-id")?.trim();
  return given && /^[A-Za-z0-9:._-]{1,128}$/u.test(given) ? given : randomUUID();
}

/** Runs `work` with a log context: every entry written inside carries it. */
export function withLogContext<T>(context: Partial<LogContext>, work: () => T): T {
  const parent = contextStore.getStore();
  return contextStore.run({ ...parent, ...context, requestId: context.requestId ?? parent?.requestId ?? randomUUID() }, work);
}

/**
 * Starts the log context of an API request for the rest of its handling.
 * Must be called synchronously at the start of the request's code path (before
 * any await) so the handler's later continuations inherit it.
 */
export function enterRequestLogContext(request: Request): LogContext {
  const current = contextStore.getStore();
  if (current?.path) return current;
  let path: string | undefined;
  try { path = new URL(request.url).pathname; } catch { path = undefined; }
  const context: LogContext = { requestId: requestIdFrom(request.headers), method: request.method, path };
  traces.set(context, { startedAt: Date.now(), problems: [] });
  contextStore.enterWith(context);
  return context;
}

/** When the request started and the warnings and errors it logged so far (redacted, at most 20). */
export function requestTrace(context: LogContext): { startedAt: Date; problems: RequestProblem[] } | undefined {
  const trace = traces.get(context);
  return trace ? { startedAt: new Date(trace.startedAt), problems: [...trace.problems] } : undefined;
}

/** Adds who the request acts for (or any other field) to the current context. */
export function annotateLogContext(fields: Partial<LogContext>): void {
  const current = contextStore.getStore();
  if (current) Object.assign(current, fields);
}

export function currentLogContext(): LogContext | undefined {
  return contextStore.getStore();
}

/**
 * Sends console.* through the structured, redacted formatter. Idempotent;
 * called once per server instance from instrumentation.ts.
 */
export function installConsoleBridge(): void {
  const global = globalThis as BridgedGlobal;
  if (global[BRIDGE_FLAG]) return;
  global[WRITERS] = writers();
  global[BRIDGE_FLAG] = true;
  const bridge = (level: LogLevel): ConsoleMethod => (...args: unknown[]) => {
    const { message, fields } = consoleArgsToEntryInput(args);
    write(level, "console", message, fields);
  };
  console.debug = bridge("debug");
  console.log = bridge("info");
  console.info = bridge("info");
  console.warn = bridge("warn");
  console.error = bridge("error");
}
