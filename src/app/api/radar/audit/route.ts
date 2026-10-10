import { and, desc, eq, inArray, like, lt, notLike, type SQL } from "drizzle-orm";
import { NextResponse } from "next/server";

import { authorizeRadarCollector, requestAccess } from "@/app/api/radar/radar-api-auth";
import { nextBefore, parseAuditQuery, uuidsIn } from "@/app/modules/observability/activity.core";
import { subjectTitles } from "@/app/modules/observability/request-trace";
import { db } from "@/db/client";
import { auditEvents, users } from "@/db/schema";

const NO_STORE = { "Cache-Control": "no-store" };

/**
 * The workspace's audit trail, newest first (owners and admins). Filters:
 * `action` (prefix, e.g. `billing.`), `excludeAction` (prefix), `outcome`,
 * `entityType` + `entityId`, `topicId`, `before` (ISO time, for paging),
 * `limit` (≤ 200). `actors` names the members who acted and `subjects` the
 * stories that API requests worked on. Platform staff may
 * pass `scope=all` for every workspace, including events with none (sign-ins).
 */
export async function GET(request: Request) {
  const unauthorized = await authorizeRadarCollector(request, "admin");
  if (unauthorized) return unauthorized;
  const access = requestAccess(request);
  const query = parseAuditQuery(new URL(request.url).searchParams, access.staff);
  const filters: SQL[] = [];
  if (query.scope === "workspace") filters.push(eq(auditEvents.workspaceId, access.workspaceId));
  if (query.action) filters.push(like(auditEvents.action, `${query.action}%`));
  if (query.excludeAction) filters.push(notLike(auditEvents.action, `${query.excludeAction}%`));
  if (query.outcome) filters.push(eq(auditEvents.outcome, query.outcome));
  if (query.entityType) filters.push(eq(auditEvents.entityType, query.entityType));
  if (query.entityId) filters.push(eq(auditEvents.entityId, query.entityId));
  if (query.topicId) filters.push(eq(auditEvents.topicId, query.topicId));
  if (query.before) filters.push(lt(auditEvents.occurredAt, query.before));

  try {
    const events = await db.select().from(auditEvents).where(filters.length ? and(...filters) : undefined).orderBy(desc(auditEvents.occurredAt)).limit(query.limit);
    const actorIds = [...new Set(events.filter((event) => event.actorType === "user").flatMap((event) => event.actorId ? [event.actorId] : []))];
    const people = actorIds.length
      ? await db.select({ id: users.id, name: users.name, email: users.email }).from(users).where(inArray(users.id, actorIds))
      : [];
    const actors = Object.fromEntries(people.map((person) => [person.id, person.name.trim() || person.email]));
    const subjects = await subjectTitles(events.flatMap((event) => event.action === "api.request" ? uuidsIn(event.entityId ?? "") : []));
    return NextResponse.json(
      { events, actors, subjects, scope: query.scope, canSeeAllWorkspaces: access.staff, nextBefore: nextBefore(events, query.limit) },
      { headers: NO_STORE },
    );
  } catch (error) {
    console.error("Audit trail could not be read", error);
    return NextResponse.json({ error: "The audit trail is unavailable right now." }, { status: 503, headers: NO_STORE });
  }
}
