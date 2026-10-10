import "server-only";

import { and, asc, eq, gt, gte, inArray, lte, type SQL } from "drizzle-orm";

import { db } from "@/db/client";
import { aiUsageCharges, auditEvents, creativeDrafts, creativeTextCalls, dbChangeLog, stories, storyCreativeBriefs, topics, users } from "@/db/schema";

import { FOLLOW_UP_MS, requestWindow, uuidsIn } from "./activity.core";

/**
 * Everything Activity can show about one API request (FEAT-OBS-001): its audit
 * events, the warnings and errors it logged, and — matched by workspace and
 * time, because each Neon HTTP query is its own transaction — the record
 * changes and AI or provider calls made while it ran. Work a request starts in
 * the background (images finish after the response) is followed for ten more
 * minutes through the records it touched and the story it worked on.
 */
export type RequestTrace = Awaited<ReturnType<typeof readRequestTrace>>;

export async function readRequestTrace({ requestId, workspaceId, allWorkspaces }: { requestId: string; workspaceId: string; allWorkspaces: boolean }) {
  const events = await db.select().from(auditEvents)
    .where(and(eq(auditEvents.requestId, requestId), allWorkspaces ? undefined : eq(auditEvents.workspaceId, workspaceId)))
    .orderBy(asc(auditEvents.occurredAt)).limit(100);
  if (!events.length) return undefined;

  const primary = events.find((event) => event.action === "api.request") ?? events[0]!;
  const window = requestWindow(primary.details, events.map((event) => event.occurredAt));
  const followUntil = new Date(window.to.getTime() + FOLLOW_UP_MS);
  const scope = primary.workspaceId;
  const subjects = await resolveSubjects(uuidsIn(primary.entityId ?? ""));
  const storyIds = [...new Set(subjects.map((subject) => subject.storyId))];
  const [changes, textCalls, charges, actor] = await Promise.all([
    scope
      ? db.select().from(dbChangeLog)
        .where(and(eq(dbChangeLog.workspaceId, scope), gte(dbChangeLog.occurredAt, window.from), lte(dbChangeLog.occurredAt, window.to)))
        .orderBy(asc(dbChangeLog.occurredAt)).limit(200)
      : [],
    scope ? aiTextCalls(and(eq(topics.workspaceId, scope), gte(creativeTextCalls.createdAt, window.from), lte(creativeTextCalls.createdAt, window.to))) : [],
    scope ? aiCharges(and(eq(topics.workspaceId, scope), gte(aiUsageCharges.createdAt, window.from), lte(aiUsageCharges.createdAt, window.to))) : [],
    primary.actorType === "user" && primary.actorId
      ? db.select({ name: users.name, email: users.email }).from(users).where(eq(users.id, primary.actorId)).limit(1)
      : [],
  ]);

  // After the response: later changes to the same rows, and AI calls for the same story.
  const touched = new Set(changes.map((change) => `${change.tableName}|${change.rowKey}`));
  const touchedKeys = [...new Set(changes.map((change) => change.rowKey))].slice(0, 200);
  const [laterChanges, laterTextCalls, laterCharges] = await Promise.all([
    scope && touchedKeys.length
      ? db.select().from(dbChangeLog)
        .where(and(eq(dbChangeLog.workspaceId, scope), inArray(dbChangeLog.rowKey, touchedKeys), gt(dbChangeLog.occurredAt, window.to), lte(dbChangeLog.occurredAt, followUntil)))
        .orderBy(asc(dbChangeLog.occurredAt)).limit(200)
        .then((rows) => rows.filter((change) => touched.has(`${change.tableName}|${change.rowKey}`)))
      : [],
    scope && storyIds.length
      ? aiTextCalls(and(eq(topics.workspaceId, scope), inArray(creativeTextCalls.storyId, storyIds), gt(creativeTextCalls.createdAt, window.to), lte(creativeTextCalls.createdAt, followUntil)))
      : [],
    scope && storyIds.length
      ? aiCharges(and(eq(topics.workspaceId, scope), inArray(aiUsageCharges.storyId, storyIds), gt(aiUsageCharges.createdAt, window.to), lte(aiUsageCharges.createdAt, followUntil)))
      : [],
  ]);
  const allTextCalls = [...textCalls, ...laterTextCalls];
  const allCharges = [...charges, ...laterCharges];

  const problems = Array.isArray(primary.details.problems) ? primary.details.problems as Record<string, unknown>[] : [];
  const titles = Object.fromEntries(subjects.map((subject) => [subject.id, subject.title]));
  return {
    requestId,
    request: {
      route: primary.entityType === "route" ? primary.entityId : null,
      outcome: primary.outcome,
      actorType: primary.actorType,
      actorName: actor[0] ? actor[0].name.trim() || actor[0].email : null,
      workspaceId: primary.workspaceId,
      topicId: primary.topicId,
      startedAt: window.startedAt?.toISOString() ?? null,
      finishedAt: primary.occurredAt.toISOString(),
      durationMs: typeof primary.details.durationMs === "number" ? primary.details.durationMs : null,
    },
    /** Changes and calls are matched to this window; without a recorded start it is a guess. `followUntil` ends the after-the-response follow-up. */
    window: { from: window.from.toISOString(), to: window.to.toISOString(), followUntil: followUntil.toISOString(), approximate: !window.startedAt },
    events,
    problems,
    changes: [...changes, ...laterChanges],
    textCalls: allTextCalls,
    charges: allCharges,
    subjects: { ...titles, ...await subjectTitles([...allTextCalls.map((call) => call.storyId), ...allCharges.flatMap((charge) => charge.storyId ? [charge.storyId] : [])]) },
    totals: {
      providerCostMicros: allCharges.reduce((sum, charge) => sum + (charge.costMicros ?? 0), 0),
      chargedTextMicros: allTextCalls.reduce((sum, call) => sum + (call.chargedMicros ?? 0), 0),
    },
  };
}

function aiTextCalls(where: SQL | undefined) {
  return db.select({
    id: creativeTextCalls.id, createdAt: creativeTextCalls.createdAt, finishedAt: creativeTextCalls.finishedAt,
    topicId: creativeTextCalls.topicId, storyId: creativeTextCalls.storyId, provider: creativeTextCalls.provider,
    model: creativeTextCalls.model, operation: creativeTextCalls.operation, status: creativeTextCalls.status,
    reservedMicros: creativeTextCalls.reservedMicros, chargedMicros: creativeTextCalls.chargedMicros, usage: creativeTextCalls.usage,
  }).from(creativeTextCalls).innerJoin(topics, eq(topics.id, creativeTextCalls.topicId))
    .where(where).orderBy(asc(creativeTextCalls.createdAt)).limit(100);
}

function aiCharges(where: SQL | undefined) {
  return db.select({
    id: aiUsageCharges.id, createdAt: aiUsageCharges.createdAt, topicId: aiUsageCharges.topicId, storyId: aiUsageCharges.storyId,
    kind: aiUsageCharges.kind, provider: aiUsageCharges.provider, model: aiUsageCharges.model, operation: aiUsageCharges.operation,
    units: aiUsageCharges.units, costMicros: aiUsageCharges.costMicros, estimated: aiUsageCharges.estimated,
  }).from(aiUsageCharges).innerJoin(topics, eq(topics.id, aiUsageCharges.topicId))
    .where(where).orderBy(asc(aiUsageCharges.createdAt)).limit(100);
}

/** The stories that ids name: a story itself, a creative brief or a draft (as API paths do). */
async function resolveSubjects(ids: readonly string[]): Promise<{ id: string; storyId: string; title: string }[]> {
  const unique = [...new Set(ids)].slice(0, 200);
  if (!unique.length) return [];
  const [direct, drafts, briefs] = await Promise.all([
    db.select({ id: stories.id, storyId: stories.id, title: stories.title }).from(stories).where(inArray(stories.id, unique)),
    db.select({ id: creativeDrafts.id, storyId: stories.id, title: stories.title }).from(creativeDrafts)
      .innerJoin(stories, eq(stories.id, creativeDrafts.storyId)).where(inArray(creativeDrafts.id, unique)),
    db.select({ id: storyCreativeBriefs.id, storyId: stories.id, title: stories.title }).from(storyCreativeBriefs)
      .innerJoin(stories, eq(stories.id, storyCreativeBriefs.storyId)).where(inArray(storyCreativeBriefs.id, unique)),
  ]);
  return [...direct, ...drafts, ...briefs];
}

/** Story titles for ids that name a story, a creative brief or a draft. */
export async function subjectTitles(ids: readonly string[]): Promise<Record<string, string>> {
  return Object.fromEntries((await resolveSubjects(ids)).map((subject) => [subject.id, subject.title]));
}
