import "server-only";

import { after } from "next/server";

import { db } from "@/db/client";
import { auditEvents } from "@/db/schema";

import { buildAuditRow, type AuditEventInput } from "./audit.core";
import { createLogger, currentLogContext, requestTrace } from "./logger";

export type { AuditEventInput } from "./audit.core";

const log = createLogger("audit");

/**
 * Stores one audit event (FEAT-OBS-001, layer 2), filling actor, workspace and
 * request id from the request context. Never throws: an audit write that
 * fails is logged as an error instead of failing the action it describes.
 */
export async function recordAuditEvent(input: AuditEventInput): Promise<void> {
  try {
    const row = buildAuditRow(input, currentLogContext());
    await db.insert(auditEvents).values(row);
    log.info("Audit event", { action: row.action, outcome: row.outcome, entityType: row.entityType, entityId: row.entityId });
  } catch (error) {
    log.error("Audit event could not be stored", { action: input.action, error });
  }
}

/**
 * Stores the event after the response is sent, so it adds no latency.
 * Outside a request (scripts, tests) it is written right away.
 */
export function recordAuditEventLater(input: AuditEventInput): void {
  const context = currentLogContext();
  const snapshot = context ? { ...context } : undefined;
  const write = () => recordAuditEventWithContext(input, snapshot);
  try {
    after(write);
  } catch {
    void write();
  }
}

/**
 * The `api.request` event for the request in progress, written after the
 * response with when it started, how long it took and the warnings and errors
 * it logged, so Activity can replay it. `onlyOnError` skips a request that
 * logged no error (reads, which are not otherwise audited).
 */
export function recordRequestAuditLater(input: AuditEventInput, options: { onlyOnError?: boolean } = {}): void {
  const context = currentLogContext();
  const snapshot = context ? { ...context } : undefined;
  const write = async () => {
    const trace = context ? requestTrace(context) : undefined;
    if (options.onlyOnError && !trace?.problems.some((problem) => problem.level === "error")) return;
    const timing = trace ? { startedAt: trace.startedAt.toISOString(), durationMs: Date.now() - trace.startedAt.getTime() } : {};
    const problems = trace?.problems.length ? { problems: trace.problems } : {};
    await recordAuditEventWithContext({ ...input, details: { ...input.details, ...timing, ...problems } }, snapshot);
  };
  try {
    after(write);
  } catch {
    void write();
  }
}

async function recordAuditEventWithContext(input: AuditEventInput, context: ReturnType<typeof currentLogContext>): Promise<void> {
  try {
    const row = buildAuditRow(input, context);
    await db.insert(auditEvents).values(row);
  } catch (error) {
    log.error("Audit event could not be stored", { action: input.action, error });
  }
}
