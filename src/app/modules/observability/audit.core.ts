import { sanitize } from "./log.core";

/** Who acted. `operator` is the shared collector credential; `worker` a scheduled job. */
export const AUDIT_ACTOR_TYPES = ["user", "operator", "worker", "stripe", "system"] as const;
export type AuditActorType = (typeof AUDIT_ACTOR_TYPES)[number];
export const AUDIT_OUTCOMES = ["success", "failure", "denied", "attempted"] as const;
export type AuditOutcome = (typeof AUDIT_OUTCOMES)[number];

/** `area.object.verb`, lowercase: billing.purchase.paid, topic.deleted, api.request. */
export const AUDIT_ACTION = /^[a-z][a-z0-9_]*([.][a-z0-9_]+)+$/u;

export type AuditEventInput = {
  action: string;
  outcome?: AuditOutcome;
  entityType?: string;
  entityId?: string;
  workspaceId?: string | null;
  topicId?: string | null;
  actorType?: AuditActorType;
  actorId?: string | null;
  details?: Record<string, unknown>;
};

export type AuditContext = {
  requestId?: string;
  method?: string;
  path?: string;
  actor?: unknown;
  userId?: unknown;
  workspaceId?: unknown;
  topicId?: unknown;
};

export type AuditRow = {
  action: string;
  outcome: AuditOutcome;
  actorType: AuditActorType;
  actorId: string | null;
  workspaceId: string | null;
  topicId: string | null;
  entityType: string | null;
  entityId: string | null;
  requestId: string | null;
  details: Record<string, unknown>;
};

const text = (value: unknown, max = 200): string | null =>
  typeof value === "string" && value.trim() ? value.trim().slice(0, max) : null;

function actorTypeFrom(value: unknown): AuditActorType | undefined {
  if (value === "member") return "user";
  return (AUDIT_ACTOR_TYPES as readonly unknown[]).includes(value) ? value as AuditActorType : undefined;
}

/**
 * The row to store: explicit values win over the request context; details are
 * redacted like logs. Throws for a malformed action (a programming error).
 */
export function buildAuditRow(input: AuditEventInput, context: AuditContext = {}): AuditRow {
  if (!AUDIT_ACTION.test(input.action)) throw new Error(`Invalid audit action "${input.action}"`);
  const actorType = input.actorType ?? actorTypeFrom(context.actor) ?? (text(context.userId) ? "user" : "system");
  const details = sanitize(input.details ?? {});
  return {
    action: input.action,
    outcome: input.outcome ?? "success",
    actorType,
    actorId: input.actorId !== undefined ? text(input.actorId) : actorType === "user" ? text(context.userId) : null,
    workspaceId: input.workspaceId !== undefined ? text(input.workspaceId) : text(context.workspaceId),
    topicId: input.topicId !== undefined ? text(input.topicId) : text(context.topicId),
    entityType: text(input.entityType, 80),
    entityId: text(input.entityId, 300) ?? (input.entityType === "route" && context.path ? `${context.method ?? ""} ${context.path}`.trim() : null),
    requestId: text(context.requestId, 128),
    details: details && typeof details === "object" && !Array.isArray(details) ? details as Record<string, unknown> : { value: details },
  };
}

const TOPIC_PATH = /\/topics\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?:\/|$)/iu;

/** The topic an API path or `?topicId=` names, if any. */
export function topicIdFromUrl(url: string): string | undefined {
  try {
    const parsed = new URL(url);
    const fromQuery = parsed.searchParams.get("topicId");
    return TOPIC_PATH.exec(parsed.pathname)?.[1] ?? (fromQuery && /^[0-9a-f-]{36}$/iu.test(fromQuery) ? fromQuery : undefined);
  } catch {
    return undefined;
  }
}

export function isMutatingMethod(method: string): boolean {
  return !["GET", "HEAD", "OPTIONS"].includes(method.toUpperCase());
}
