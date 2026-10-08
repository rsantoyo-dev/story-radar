import "server-only";

import { and, asc, between, desc, eq, gte, ilike, inArray, like, lt, lte, or, sql, type SQL } from "drizzle-orm";

import { db } from "@/db/client";
import { apiRequestLog, auditEvents, dbChangeLog, topics, users, workspaceMembers } from "@/db/schema";

import { containsPattern, statusRange, type ActivityFilters } from "./activity.core";

/** Whose activity: one workspace, or every workspace (platform staff). */
export type ActivityScope = { workspaceId: string } | { all: true };

function scoped(column: typeof apiRequestLog.workspaceId | typeof auditEvents.workspaceId | typeof dbChangeLog.workspaceId, scope: ActivityScope): SQL | undefined {
  return "all" in scope ? undefined : eq(column, scope.workspaceId);
}

function timeWindow(column: typeof apiRequestLog.occurredAt | typeof auditEvents.occurredAt | typeof dbChangeLog.occurredAt, filters: ActivityFilters): SQL[] {
  const conditions: SQL[] = [];
  if (filters.from) conditions.push(gte(column, filters.from));
  if (filters.to) conditions.push(lte(column, filters.to));
  if (filters.before) conditions.push(lt(column, filters.before));
  return conditions;
}

function page<T extends { occurredAt: Date }>(rows: T[], limit: number) {
  return { rows, nextBefore: rows.length === limit ? rows.at(-1)!.occurredAt.toISOString() : null };
}

function requestConditions(scope: ActivityScope, filters: ActivityFilters): SQL[] {
  const t = apiRequestLog;
  const conditions = [scoped(t.workspaceId, scope), ...timeWindow(t.occurredAt, filters)].filter(Boolean) as SQL[];
  if (filters.actorId) conditions.push(eq(t.actorId, filters.actorId));
  if (filters.topicId) conditions.push(eq(t.topicId, filters.topicId));
  if (filters.requestId) conditions.push(eq(t.requestId, filters.requestId));
  if (filters.method) conditions.push(eq(t.method, filters.method));
  if (typeof filters.status === "number") conditions.push(eq(t.status, filters.status));
  else if (filters.status) {
    const range = statusRange(filters.status);
    conditions.push(range.only ? inArray(t.status, range.only) : between(t.status, range.min, range.max));
  }
  if (filters.path) conditions.push(like(t.path, containsPattern(filters.path)));
  if (filters.q) {
    const pattern = containsPattern(filters.q);
    conditions.push(or(eq(t.requestId, filters.q), ilike(t.path, pattern), ilike(t.responseBody, pattern), ilike(t.requestBody, pattern))!);
  }
  return conditions;
}

/** API requests, newest first. Bodies are included; the console shows them on demand. */
export async function listRequestLogs(scope: ActivityScope, filters: ActivityFilters) {
  const rows = await db.select().from(apiRequestLog).where(and(...requestConditions(scope, filters)))
    .orderBy(desc(apiRequestLog.occurredAt)).limit(filters.limit);
  return page(rows, filters.limit);
}

/** Deletes the request logs matching the filters (never the audit trail or change history). */
export async function purgeRequestLogs(scope: ActivityScope, filters: ActivityFilters): Promise<number> {
  const conditions = requestConditions(scope, filters);
  const deleted = await db.delete(apiRequestLog).where(conditions.length ? and(...conditions) : undefined)
    .returning({ id: apiRequestLog.id });
  return deleted.length;
}

export async function listAuditEvents(scope: ActivityScope, filters: ActivityFilters) {
  const t = auditEvents;
  const conditions = [scoped(t.workspaceId, scope), ...timeWindow(t.occurredAt, filters)].filter(Boolean) as SQL[];
  if (filters.actorId) conditions.push(eq(t.actorId, filters.actorId));
  if (filters.topicId) conditions.push(eq(t.topicId, filters.topicId));
  if (filters.requestId) conditions.push(eq(t.requestId, filters.requestId));
  if (filters.action) conditions.push(like(t.action, `${filters.action}%`));
  if (filters.outcome) conditions.push(eq(t.outcome, filters.outcome));
  if (filters.q) {
    const pattern = containsPattern(filters.q);
    conditions.push(or(eq(t.requestId, filters.q), ilike(t.entityId, pattern), ilike(t.action, pattern), sql`${t.details}::text ILIKE ${pattern}`)!);
  }
  const rows = await db.select().from(t).where(and(...conditions)).orderBy(desc(t.occurredAt)).limit(filters.limit);
  return page(rows, filters.limit);
}

export async function listDataChanges(scope: ActivityScope, filters: ActivityFilters) {
  const t = dbChangeLog;
  const conditions = [scoped(t.workspaceId, scope), ...timeWindow(t.occurredAt, filters)].filter(Boolean) as SQL[];
  if (filters.topicId) conditions.push(eq(t.topicId, filters.topicId));
  if (filters.table) conditions.push(eq(t.tableName, filters.table));
  if (filters.q) {
    const pattern = containsPattern(filters.q);
    conditions.push(or(eq(t.rowKey, filters.q), ilike(t.rowKey, pattern), sql`${t.newValues}::text ILIKE ${pattern}`, sql`${t.oldValues}::text ILIKE ${pattern}`)!);
  }
  const rows = await db.select().from(t).where(and(...conditions)).orderBy(desc(t.occurredAt)).limit(filters.limit);
  return page(rows, filters.limit);
}

/** Everything one request did: its log rows, its audit events and the data changed while it ran. */
export async function requestTrail(scope: ActivityScope, requestId: string) {
  const requests = await db.select().from(apiRequestLog)
    .where(and(eq(apiRequestLog.requestId, requestId), scoped(apiRequestLog.workspaceId, scope)))
    .orderBy(asc(apiRequestLog.occurredAt)).limit(20);
  const events = await db.select().from(auditEvents)
    .where(and(eq(auditEvents.requestId, requestId), scoped(auditEvents.workspaceId, scope)))
    .orderBy(asc(auditEvents.occurredAt)).limit(100);
  const first = requests[0];
  // The change log has no request id; changes in the same workspace while the request ran are listed as related.
  const changes = first
    ? await db.select().from(dbChangeLog).where(and(
      scoped(dbChangeLog.workspaceId, first.workspaceId ? { workspaceId: first.workspaceId } : scope),
      gte(dbChangeLog.occurredAt, new Date(first.occurredAt.getTime() - 1_000)),
      lte(dbChangeLog.occurredAt, new Date(first.occurredAt.getTime() + first.durationMs + 2_000)),
    )).orderBy(asc(dbChangeLog.occurredAt)).limit(200)
    : [];
  return { requests, events, changes };
}

/** Counts for the console header over the last `hours`. */
export async function activitySummary(scope: ActivityScope, hours = 24) {
  const since = new Date(Date.now() - hours * 3_600_000);
  const workspaceFilter = (column: SQL) => ("all" in scope ? sql`TRUE` : sql`${column} = ${scope.workspaceId}`);
  const [requests] = (await db.execute(sql`SELECT count(*)::int AS total,
      count(*) FILTER (WHERE status >= 500)::int AS server_errors,
      count(*) FILTER (WHERE status IN (401, 403))::int AS denied,
      count(*) FILTER (WHERE status >= 400 AND status < 500)::int AS client_errors,
      coalesce(round(percentile_cont(0.95) WITHIN GROUP (ORDER BY duration_ms))::int, 0) AS p95_ms
    FROM api_request_log WHERE occurred_at >= ${since} AND ${workspaceFilter(sql`workspace_id`)}`)).rows;
  const [events] = (await db.execute(sql`SELECT count(*)::int AS total,
      count(*) FILTER (WHERE outcome IN ('failure', 'denied'))::int AS failures
    FROM audit_events WHERE occurred_at >= ${since} AND ${workspaceFilter(sql`workspace_id`)}`)).rows;
  const [changes] = (await db.execute(sql`SELECT count(*)::int AS total
    FROM db_change_log WHERE occurred_at >= ${since} AND ${workspaceFilter(sql`workspace_id`)}`)).rows;
  return {
    hours,
    requests: Number(requests?.total ?? 0),
    serverErrors: Number(requests?.server_errors ?? 0),
    clientErrors: Number(requests?.client_errors ?? 0),
    denied: Number(requests?.denied ?? 0),
    p95Ms: Number(requests?.p95_ms ?? 0),
    events: Number(events?.total ?? 0),
    failedEvents: Number(events?.failures ?? 0),
    changes: Number(changes?.total ?? 0),
  };
}

/** Members and brands of the workspace, for the console's filters and names. */
export async function activityDirectory(scope: ActivityScope) {
  if ("all" in scope) {
    const people = await db.select({ id: users.id, name: users.name, email: users.email }).from(users).orderBy(users.name).limit(500);
    const brands = await db.select({ id: topics.id, name: topics.name }).from(topics).orderBy(topics.name).limit(500);
    return { people: people.map((person) => ({ ...person, role: null })), brands };
  }
  const people = await db.select({ id: users.id, name: users.name, email: users.email, role: workspaceMembers.role })
    .from(workspaceMembers).innerJoin(users, eq(users.id, workspaceMembers.userId))
    .where(eq(workspaceMembers.workspaceId, scope.workspaceId)).orderBy(users.name);
  const brands = await db.select({ id: topics.id, name: topics.name }).from(topics)
    .where(eq(topics.workspaceId, scope.workspaceId)).orderBy(topics.name);
  return { people, brands };
}
