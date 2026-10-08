import { and, desc, eq, lt, type SQL } from "drizzle-orm";
import { NextResponse } from "next/server";

import { authorizeRadarCollector, requestAccess } from "@/app/api/radar/radar-api-auth";
import { nextBefore, parseChangeQuery } from "@/app/modules/observability/activity.core";
import { db } from "@/db/client";
import { dbChangeLog } from "@/db/schema";

const NO_STORE = { "Cache-Control": "no-store" };

/**
 * Row-level change history of the critical tables, newest first. Owners and
 * admins see their workspace's rows; platform staff may pass `scope=all` to
 * span every workspace, including rows that belong to none (users, staff).
 * Filters: `table`, `operation`, `rowKey`, `transactionId`, `topicId`,
 * `before` (ISO time), `limit` (≤ 200).
 */
export async function GET(request: Request) {
  const unauthorized = await authorizeRadarCollector(request, "admin");
  if (unauthorized) return unauthorized;
  const access = requestAccess(request);
  const query = parseChangeQuery(new URL(request.url).searchParams, access.staff);
  const filters: SQL[] = [];
  if (query.scope === "workspace") filters.push(eq(dbChangeLog.workspaceId, access.workspaceId));
  if (query.table) filters.push(eq(dbChangeLog.tableName, query.table));
  if (query.operation) filters.push(eq(dbChangeLog.operation, query.operation));
  if (query.rowKey) filters.push(eq(dbChangeLog.rowKey, query.rowKey));
  if (query.transactionId) filters.push(eq(dbChangeLog.transactionId, query.transactionId));
  if (query.topicId) filters.push(eq(dbChangeLog.topicId, query.topicId));
  if (query.before) filters.push(lt(dbChangeLog.occurredAt, query.before));

  try {
    const changes = await db.select().from(dbChangeLog).where(filters.length ? and(...filters) : undefined)
      .orderBy(desc(dbChangeLog.occurredAt)).limit(query.limit);
    return NextResponse.json(
      { changes, scope: query.scope, canSeeAllWorkspaces: access.staff, nextBefore: nextBefore(changes, query.limit) },
      { headers: NO_STORE },
    );
  } catch (error) {
    console.error("Change history could not be read", error);
    return NextResponse.json({ error: "The change history is unavailable right now." }, { status: 503, headers: NO_STORE });
  }
}
