import "server-only";

import { after } from "next/server";

import { db } from "@/db/client";
import { auditEvents } from "@/db/schema";

import { buildAuditRow, type AuditEventInput } from "./audit.core";
import { createLogger, currentLogContext } from "./logger";

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

async function recordAuditEventWithContext(input: AuditEventInput, context: ReturnType<typeof currentLogContext>): Promise<void> {
  try {
    const row = buildAuditRow(input, context);
    await db.insert(auditEvents).values(row);
  } catch (error) {
    log.error("Audit event could not be stored", { action: input.action, error });
  }
}
