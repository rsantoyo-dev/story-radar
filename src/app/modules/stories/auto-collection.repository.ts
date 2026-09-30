import "server-only";

import { and, desc, eq } from "drizzle-orm";

import { db } from "@/db/client";
import { stories, topicAutoCollectionSettings, topicScoops } from "@/db/schema";

import { getEditorialLine } from "../editorial-lines/editorial-lines.repository";

export class AutoCollectionValidationError extends Error {}

export type AutoCollectionSettings = {
  enabled: boolean;
  lineId: string;
  intervalHours: number;
  timezone: string;
  activeFromHour: number;
  activeToHour: number;
  scoopEnabled: boolean;
  scoopMinGrowth: number;
  scoopMinEditorial: number;
  scoopMaxAgeHours: number;
  autoPrepareScoops: boolean;
  lastRunAt?: string;
  nextRunAt?: string;
};

export async function getAutoCollectionSettings(topicId: string): Promise<AutoCollectionSettings | undefined> {
  const [row] = await db.select().from(topicAutoCollectionSettings).where(eq(topicAutoCollectionSettings.topicId, topicId)).limit(1);
  if (!row) return undefined;
  return {
    enabled: row.enabled, lineId: row.lineId, intervalHours: row.intervalHours, timezone: row.timezone,
    activeFromHour: row.activeFromHour, activeToHour: row.activeToHour, scoopEnabled: row.scoopEnabled,
    scoopMinGrowth: row.scoopMinGrowth, scoopMinEditorial: row.scoopMinEditorial, scoopMaxAgeHours: row.scoopMaxAgeHours,
    autoPrepareScoops: row.autoPrepareScoops,
    ...(row.lastRunAt ? { lastRunAt: row.lastRunAt.toISOString() } : {}),
    ...(row.nextRunAt ? { nextRunAt: row.nextRunAt.toISOString() } : {}),
  };
}

function integer(value: unknown, name: string, min: number, max: number): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < min || value > max) {
    throw new AutoCollectionValidationError(`${name} must be a whole number from ${min} to ${max}.`);
  }
  return value;
}

export async function saveAutoCollectionSettings(topicId: string, input: unknown): Promise<AutoCollectionSettings> {
  const value = input && typeof input === "object" ? (input as Record<string, unknown>) : {};
  if (typeof value.lineId !== "string") throw new AutoCollectionValidationError("Choose the editorial line the reader uses.");
  await getEditorialLine(topicId, value.lineId); // must belong to this Topic
  const timezone = typeof value.timezone === "string" && value.timezone.trim() ? value.timezone.trim() : "America/Toronto";
  try { new Intl.DateTimeFormat("en", { timeZone: timezone }); } catch { throw new AutoCollectionValidationError("Unknown time zone."); }
  const settings = {
    enabled: value.enabled === true,
    lineId: value.lineId,
    intervalHours: integer(value.intervalHours ?? 4, "Interval (hours)", 1, 24),
    timezone,
    activeFromHour: integer(value.activeFromHour ?? 6, "Active from", 0, 23),
    activeToHour: integer(value.activeToHour ?? 22, "Active to", 1, 24),
    scoopEnabled: value.scoopEnabled !== false,
    scoopMinGrowth: integer(value.scoopMinGrowth ?? 85, "Scoop growth threshold", 1, 100),
    scoopMinEditorial: integer(value.scoopMinEditorial ?? 80, "Scoop editorial threshold", 1, 100),
    scoopMaxAgeHours: integer(value.scoopMaxAgeHours ?? 6, "Scoop freshness (hours)", 1, 72),
    autoPrepareScoops: value.autoPrepareScoops !== false,
    updatedAt: new Date(),
  };
  await db.insert(topicAutoCollectionSettings).values({ topicId, ...settings })
    .onConflictDoUpdate({ target: topicAutoCollectionSettings.topicId, set: settings });
  return (await getAutoCollectionSettings(topicId))!;
}

export type TopicScoop = {
  id: string; storyId: string; storyTitle?: string; growthScore: number; editorialScore: number;
  reasons: string[]; status: string; blockedStep?: string; message?: string; preparationRunId?: string;
  detectedAt: string; seen: boolean;
};

export async function listTopicScoops(topicId: string, limit = 20): Promise<TopicScoop[]> {
  const rows = await db.select({ scoop: topicScoops, title: stories.title }).from(topicScoops)
    .leftJoin(stories, eq(stories.id, topicScoops.storyId))
    .where(eq(topicScoops.topicId, topicId)).orderBy(desc(topicScoops.detectedAt)).limit(limit);
  return rows.map(({ scoop, title }) => ({
    id: scoop.id, storyId: scoop.storyId, ...(title ? { storyTitle: title } : {}),
    growthScore: scoop.growthScore, editorialScore: scoop.editorialScore, reasons: scoop.reasons, status: scoop.status,
    ...(scoop.blockedStep ? { blockedStep: scoop.blockedStep } : {}), ...(scoop.message ? { message: scoop.message } : {}),
    ...(scoop.preparationRunId ? { preparationRunId: scoop.preparationRunId } : {}),
    detectedAt: scoop.detectedAt.toISOString(), seen: Boolean(scoop.seenAt),
  }));
}

/** "seen" hides the alert; "dismiss" also stops any not-yet-started preparation. */
export async function updateTopicScoop(topicId: string, scoopId: string, action: unknown) {
  if (action !== "seen" && action !== "dismiss") throw new AutoCollectionValidationError("Unknown scoop action.");
  await db.update(topicScoops).set(action === "seen" ? { seenAt: new Date() } : { status: "dismissed", seenAt: new Date(), updatedAt: new Date() })
    .where(and(eq(topicScoops.id, scoopId), eq(topicScoops.topicId, topicId)));
  return listTopicScoops(topicId);
}
