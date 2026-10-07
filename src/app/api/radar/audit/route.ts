import { and, desc, eq, like, lt, type SQL } from "drizzle-orm";
import { NextResponse } from "next/server";

import { authorizeRadarCollector, requestAccess } from "@/app/api/radar/radar-api-auth";
import { db } from "@/db/client";
import { auditEvents } from "@/db/schema";

const NO_STORE = { "Cache-Control": "no-store" };

/**
 * The workspace's audit trail, newest first (owners and admins). Filters:
 * `action` (prefix, e.g. `billing.`), `entityType` + `entityId`, `topicId`,
 * `before` (ISO time, for paging), `limit` (≤ 200).
 */
export async function GET(request: Request) {
  const unauthorized = await authorizeRadarCollector(request, "admin");
  if (unauthorized) return unauthorized;
  const params = new URL(request.url).searchParams;
  const filters: SQL[] = [eq(auditEvents.workspaceId, requestAccess(request).workspaceId)];
  const action = params.get("action")?.trim();
  if (action && /^[a-z0-9_.]{1,80}$/u.test(action)) filters.push(like(auditEvents.action, `${action}%`));
  const entityType = params.get("entityType")?.trim();
  if (entityType && /^[a-z_]{1,80}$/u.test(entityType)) filters.push(eq(auditEvents.entityType, entityType));
  const entityId = params.get("entityId")?.trim();
  if (entityId && entityId.length <= 300) filters.push(eq(auditEvents.entityId, entityId));
  const topicId = params.get("topicId")?.trim();
  if (topicId && /^[0-9a-f-]{36}$/iu.test(topicId)) filters.push(eq(auditEvents.topicId, topicId));
  const before = params.get("before") ? new Date(params.get("before")!) : undefined;
  if (before && !Number.isNaN(before.getTime())) filters.push(lt(auditEvents.occurredAt, before));
  const limit = Math.min(Math.max(Number(params.get("limit")) || 50, 1), 200);

  try {
    const events = await db.select().from(auditEvents).where(and(...filters)).orderBy(desc(auditEvents.occurredAt)).limit(limit);
    return NextResponse.json({ events, nextBefore: events.length === limit ? events.at(-1)?.occurredAt.toISOString() : null }, { headers: NO_STORE });
  } catch (error) {
    console.error("Audit trail could not be read", error);
    return NextResponse.json({ error: "The audit trail is unavailable right now." }, { status: 503, headers: NO_STORE });
  }
}
