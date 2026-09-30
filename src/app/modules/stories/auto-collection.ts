import "server-only";

import { and, desc, eq, gte, inArray, sql } from "drizzle-orm";

import { db } from "@/db/client";
import { dailyPreparationRuns, stories, storyEditorialEvaluations, topicAutoCollectionSettings, topicScoops, topicStories } from "@/db/schema";

import { getEditorialLine, storyCollectionContexts } from "../editorial-lines/editorial-lines.repository";
import { isAutoCollectionDue, nextAutoCollectionRun, scoopDecision } from "./auto-collection.policy";
import { drivePreparation } from "./daily-preparation";
import { pendingPreparations, startPreparation, startScoopPreparation } from "./daily-preparation.repository";

/**
 * The scheduled reader (one bounded pass per call; see the auto-collection
 * worker route). Scoops are prepared ahead but never approved or published:
 * the preparation stops, with its work saved, wherever a human is needed.
 */

/** Spend guard: scoop preparations a Topic may start per rolling 24 h. */
export const MAX_SCOOP_PREPARATIONS_PER_DAY = 3;
const DRIVE_BUDGET_MS = 200_000;

type Settings = typeof topicAutoCollectionSettings.$inferSelect;

export async function tickAutoCollection(now = new Date()) {
  const settings = await db.select().from(topicAutoCollectionSettings).where(eq(topicAutoCollectionSettings.enabled, true));
  await syncScoopStatuses();
  const detected: string[] = [];
  const preparing: string[] = [];
  const started: string[] = [];
  for (const topic of settings) {
    try {
      if (topic.scoopEnabled) detected.push(...await detectScoops(topic, now));
      if (topic.scoopEnabled && topic.autoPrepareScoops && await prepareNextScoop(topic, now)) {
        preparing.push(topic.topicId);
        continue; // The scoop has priority; the regular reader waits for the next pass.
      }
      if (isAutoCollectionDue(topic, now) && await startDueCollection(topic, now)) started.push(topic.topicId);
    } catch {
      // One Topic's configuration problem must not stop the others. Keep ids only.
      console.error(`Auto collection pass failed for topic ${topic.topicId}`);
    }
  }
  return { topics: settings.length, started, detected, preparing, pending: await pendingPreparations() };
}

/** Advance pending runs within a time budget (called after the response). */
export async function drivePendingPreparations(runs: { topicId: string; id: string }[]) {
  await Promise.allSettled(runs.map((run) => drivePreparation(run.topicId, run.id, DRIVE_BUDGET_MS)));
}

async function startDueCollection(topic: Settings, now: Date): Promise<boolean> {
  const line = await getEditorialLine(topic.topicId, topic.lineId);
  const { created } = await startPreparation(topic.topicId, topic.lineId, line.name, topic.timezone, "day", "recommend", "auto");
  // Another run is active: leave nextRunAt so the next pass tries again.
  if (!created) return false;
  await db.update(topicAutoCollectionSettings)
    .set({ lastRunAt: now, nextRunAt: nextAutoCollectionRun(now, topic.intervalHours), updatedAt: now })
    .where(eq(topicAutoCollectionSettings.topicId, topic.topicId));
  return true;
}

type ScoopCandidateRow = { story_id: string; title: string | null; growth_score: number | null; editorial_score: number; published_at: string | Date | null; first_seen_at: string | Date | null; already_flagged: boolean };

/** Latest evaluation per recently evaluated story that clears both score thresholds. */
async function scoopCandidateRows(topicId: string, thresholds: { scoopMinGrowth: number; scoopMinEditorial: number; scoopMaxAgeHours: number }, now: Date): Promise<ScoopCandidateRow[]> {
  const since = new Date(now.getTime() - Math.max(thresholds.scoopMaxAgeHours, 24) * 3_600_000);
  const rows = await db.execute(sql`
    SELECT DISTINCT ON (e.story_id) e.story_id, s.title, e.growth_score, e.editorial_score, s.published_at, ts.first_seen_at,
      EXISTS (SELECT 1 FROM ${topicScoops} sc WHERE sc.topic_id = e.topic_id AND sc.story_id = e.story_id) AS already_flagged
    FROM ${storyEditorialEvaluations} e
    JOIN ${stories} s ON s.id = e.story_id
    JOIN ${topicStories} ts ON ts.topic_id = e.topic_id AND ts.story_id = e.story_id
    WHERE e.topic_id = ${topicId}::uuid AND e.evaluated_at >= ${since.toISOString()}::timestamptz
      AND e.growth_score >= ${thresholds.scoopMinGrowth} AND e.editorial_score >= ${thresholds.scoopMinEditorial}
    ORDER BY e.story_id, e.evaluated_at DESC`);
  return rows.rows as ScoopCandidateRow[];
}

/**
 * Read-only: which recent stories would qualify as scoops with these
 * thresholds (defaults: the Topic's saved ones). Starts nothing, spends no AI.
 */
export async function previewScoops(topicId: string, thresholds: { scoopMinGrowth: number; scoopMinEditorial: number; scoopMaxAgeHours: number }, now = new Date()) {
  return (await scoopCandidateRows(topicId, thresholds, now)).map((row) => ({
    storyId: row.story_id, title: row.title, alreadyFlagged: row.already_flagged,
    ...scoopDecision({
      growthScore: row.growth_score, editorialScore: row.editorial_score,
      publishedAt: row.published_at ? new Date(row.published_at) : null,
      firstSeenAt: row.first_seen_at ? new Date(row.first_seen_at) : null,
    }, thresholds, now),
  })).sort((a, b) => Number(b.qualifies) - Number(a.qualifies));
}

/** New scoops among the Topic's latest evaluations. Returns the story ids flagged. */
async function detectScoops(topic: Settings, now: Date): Promise<string[]> {
  const rows = (await scoopCandidateRows(topic.topicId, topic, now)).filter((row) => !row.already_flagged);
  const flagged: string[] = [];
  for (const row of rows) {
    const decision = scoopDecision({
      growthScore: row.growth_score,
      editorialScore: row.editorial_score,
      publishedAt: row.published_at ? new Date(row.published_at) : null,
      firstSeenAt: row.first_seen_at ? new Date(row.first_seen_at) : null,
    }, topic, now);
    if (!decision.qualifies) continue;
    const inserted = await db.insert(topicScoops).values({
      topicId: topic.topicId, storyId: row.story_id, growthScore: row.growth_score!, editorialScore: row.editorial_score,
      storyPublishedAt: row.published_at ? new Date(row.published_at) : null, reasons: decision.reasons,
    }).onConflictDoNothing().returning({ id: topicScoops.id });
    if (inserted.length) flagged.push(row.story_id);
  }
  return flagged;
}

/** Starts preparing the Topic's strongest waiting scoop, within the daily cap. */
async function prepareNextScoop(topic: Settings, now: Date): Promise<boolean> {
  const dayAgo = new Date(now.getTime() - 86_400_000);
  const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(topicScoops)
    .where(and(eq(topicScoops.topicId, topic.topicId), sql`${topicScoops.preparationRunId} IS NOT NULL`, gte(topicScoops.updatedAt, dayAgo)));
  if (count >= MAX_SCOOP_PREPARATIONS_PER_DAY) return false;
  const [scoop] = await db.select().from(topicScoops)
    .where(and(eq(topicScoops.topicId, topic.topicId), eq(topicScoops.status, "detected"), sql`${topicScoops.preparationRunId} IS NULL`))
    .orderBy(desc(topicScoops.growthScore), desc(topicScoops.editorialScore)).limit(1);
  if (!scoop) return false;
  const [line, contexts, story] = await Promise.all([
    getEditorialLine(topic.topicId, topic.lineId),
    storyCollectionContexts(topic.topicId, scoop.storyId),
    db.select({ title: stories.title }).from(stories).where(eq(stories.id, scoop.storyId)).limit(1),
  ]);
  const run = await startScoopPreparation({
    topicId: topic.topicId, lineId: topic.lineId, lineName: line.name, timezone: topic.timezone,
    storyId: scoop.storyId, storyTitle: story[0]?.title, scoopId: scoop.id, collectionRunId: contexts[0]?.runId,
  });
  if (!run) return false; // Another run is active; retried on the next pass.
  await db.update(topicScoops).set({ preparationRunId: run.id, status: "preparing", updatedAt: now }).where(eq(topicScoops.id, scoop.id));
  return true;
}

/** Mirror each preparing scoop's run: ready when the draft exists, blocked where it stopped. */
async function syncScoopStatuses() {
  const preparing = await db.select().from(topicScoops).where(eq(topicScoops.status, "preparing"));
  const runIds = preparing.flatMap((scoop) => scoop.preparationRunId ? [scoop.preparationRunId] : []);
  if (!runIds.length) return;
  const runs = await db.select().from(dailyPreparationRuns).where(inArray(dailyPreparationRuns.id, runIds));
  for (const scoop of preparing) {
    const run = runs.find((candidate) => candidate.id === scoop.preparationRunId);
    if (!run || run.status === "running") continue;
    const blocked = run.status === "failed" || run.status === "needs-review";
    await db.update(topicScoops).set({
      status: blocked ? "blocked" : "ready",
      blockedStep: blocked ? run.step : null,
      message: blocked ? run.error : null,
      updatedAt: new Date(),
    }).where(and(eq(topicScoops.id, scoop.id), eq(topicScoops.status, "preparing")));
  }
}
