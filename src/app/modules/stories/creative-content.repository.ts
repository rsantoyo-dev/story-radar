import "server-only";

import { randomUUID } from "node:crypto";

import { and, count, desc, eq, gte, inArray, lt, sql } from "drizzle-orm";

import { db } from "@/db/client";
import {
  creativeAiRuns,
  creativeAssetBatches,
  creativeDrafts,
  creativeUnits,
  storyCreativeBriefs,
} from "@/db/schema";

import {
  DEFAULT_CREATIVE_VISUAL_GUIDANCE,
  type CreativeAspectRatio,
  type CreativeAiUsage,
  type CreativeBrief,
  type CreativeDailyUsage,
  type CreativeDraft,
  type CreativeFormat,
  type CreativeProfile,
  type EditableCreativeDraft,
  type GeneratedCreativeBrief,
  type GeneratedCreativeDraft,
} from "./creative-content.types";

type CreativeRunTask = "brief" | "draft";

export async function findLatestCreativeBrief(
  topicId: string,
  storyId: string,
): Promise<CreativeBrief | undefined> {
  const [row] = await db
    .select()
    .from(storyCreativeBriefs)
    .where(
      and(
        eq(storyCreativeBriefs.topicId, topicId),
        eq(storyCreativeBriefs.storyId, storyId),
      ),
    )
    .orderBy(desc(storyCreativeBriefs.createdAt))
    .limit(1);

  return row ? mapCreativeBrief(row) : undefined;
}

export async function findCreativeBriefById(
  topicId: string,
  briefId: string,
): Promise<CreativeBrief | undefined> {
  const [row] = await db
    .select()
    .from(storyCreativeBriefs)
    .where(
      and(
        eq(storyCreativeBriefs.id, briefId),
        eq(storyCreativeBriefs.topicId, topicId),
      ),
    )
    .limit(1);

  return row ? mapCreativeBrief(row) : undefined;
}

export async function findCachedCreativeBrief(
  topicId: string,
  storyId: string,
  provider: string,
  model: string,
  promptVersion: string,
  inputHash: string,
): Promise<CreativeBrief | undefined> {
  const [row] = await db
    .select()
    .from(storyCreativeBriefs)
    .where(
      and(
        eq(storyCreativeBriefs.topicId, topicId),
        eq(storyCreativeBriefs.storyId, storyId),
        eq(storyCreativeBriefs.provider, provider),
        eq(storyCreativeBriefs.model, model),
        eq(storyCreativeBriefs.promptVersion, promptVersion),
        eq(storyCreativeBriefs.inputHash, inputHash),
      ),
    )
    .limit(1);

  return row ? mapCreativeBrief(row) : undefined;
}

export async function insertCreativeBrief({
  topicId,
  storyId,
  profile,
  provider,
  model,
  modelVersion,
  promptVersion,
  inputHash,
  generated,
  usage,
}: {
  topicId: string;
  storyId: string;
  profile: CreativeProfile;
  provider: string;
  model: string;
  modelVersion?: string;
  promptVersion: string;
  inputHash: string;
  generated: GeneratedCreativeBrief;
  usage: CreativeAiUsage;
}): Promise<CreativeBrief> {
  const id = randomUUID();
  const [row] = await db
    .insert(storyCreativeBriefs)
    .values({
      id,
      topicId,
      storyId,
      profileId: profile.id,
      profileSnapshot: profile,
      provider,
      model,
      modelVersion: modelVersion ?? null,
      promptVersion,
      inputHash,
      recommendedFormat: generated.recommendedFormat,
      fallbackFormat: generated.fallbackFormat,
      formatScores: generated.formatScores,
      confidence: generated.confidence,
      targetAudience: generated.targetAudience,
      keyMessage: generated.keyMessage,
      angle: generated.angle,
      hook: generated.hook,
      tonePrimary: generated.tone.primary,
      toneEnergy: generated.tone.energy,
      toneHumor: generated.tone.humor,
      toneReason: generated.tone.reason,
      contentSufficiency: generated.contentSufficiency,
      keyFacts: generated.keyFacts,
      riskFlags: generated.riskFlags,
      suggestedConcepts: generated.suggestedConcepts,
      ...usage,
    })
    .returning();

  if (!row) {
    throw new Error("The creative brief could not be saved");
  }

  return mapCreativeBrief(row);
}

export async function findCreativeDrafts(
  topicId: string,
  briefId: string,
): Promise<CreativeDraft[]> {
  const rows = await db
    .select()
    .from(creativeDrafts)
    .where(
      and(
        eq(creativeDrafts.topicId, topicId),
        eq(creativeDrafts.briefId, briefId),
      ),
    )
    .orderBy(desc(creativeDrafts.updatedAt));

  if (rows.length === 0) {
    return [];
  }

  const unitRows = await db
    .select()
    .from(creativeUnits)
    .where(inArray(creativeUnits.draftId, rows.map((row) => row.id)))
    .orderBy(creativeUnits.draftId, creativeUnits.order);
  const unitsByDraft = new Map<
    string,
    (typeof creativeUnits.$inferSelect)[]
  >();

  unitRows.forEach((unit) => {
    const existing = unitsByDraft.get(unit.draftId) ?? [];
    existing.push(unit);
    unitsByDraft.set(unit.draftId, existing);
  });

  return rows.map((row) => mapCreativeDraft(row, unitsByDraft.get(row.id) ?? []));
}

export async function findCreativeDraftById(
  topicId: string,
  draftId: string,
): Promise<CreativeDraft | undefined> {
  const [row] = await db
    .select()
    .from(creativeDrafts)
    .where(
      and(
        eq(creativeDrafts.id, draftId),
        eq(creativeDrafts.topicId, topicId),
      ),
    )
    .limit(1);

  if (!row) {
    return undefined;
  }

  const units = await db
    .select()
    .from(creativeUnits)
    .where(eq(creativeUnits.draftId, draftId))
    .orderBy(creativeUnits.order);

  return mapCreativeDraft(row, units);
}

export async function findCachedCreativeDraft(
  topicId: string,
  briefId: string,
  format: CreativeFormat,
  inputHash: string,
): Promise<CreativeDraft | undefined> {
  const [row] = await db
    .select()
    .from(creativeDrafts)
    .where(
      and(
        eq(creativeDrafts.topicId, topicId),
        eq(creativeDrafts.briefId, briefId),
        eq(creativeDrafts.format, format),
        eq(creativeDrafts.inputHash, inputHash),
      ),
    )
    .limit(1);

  if (!row) {
    return undefined;
  }

  const units = await db
    .select()
    .from(creativeUnits)
    .where(eq(creativeUnits.draftId, row.id))
    .orderBy(creativeUnits.order);

  return mapCreativeDraft(row, units);
}

export async function insertCreativeDraft({
  topicId,
  storyId,
  briefId,
  format,
  outputAspectRatio,
  provider,
  model,
  modelVersion,
  promptVersion,
  inputHash,
  generated,
  usage,
}: {
  topicId: string;
  storyId: string;
  briefId: string;
  format: CreativeFormat;
  outputAspectRatio: CreativeAspectRatio;
  provider: string;
  model: string;
  modelVersion?: string;
  promptVersion: string;
  inputHash: string;
  generated: GeneratedCreativeDraft;
  usage: CreativeAiUsage;
}): Promise<CreativeDraft> {
  const id = randomUUID();
  const now = new Date();

  await db.batch([
    db.insert(creativeDrafts).values({
      id,
      topicId,
      storyId,
      briefId,
      format,
      outputAspectRatio,
      concept: generated.concept,
      caption: generated.caption,
      callToAction: generated.callToAction ?? null,
      hashtags: generated.hashtags,
      altText: generated.altText,
      provider,
      model,
      modelVersion: modelVersion ?? null,
      promptVersion,
      inputHash,
      aiSnapshot: generated,
      ...usage,
      createdAt: now,
      updatedAt: now,
    }),
    db.insert(creativeUnits).values(
      generated.units.map((unit) => ({
        id: randomUUID(),
        draftId: id,
        order: unit.order,
        type: unit.type,
        role: unit.role,
        headline: unit.headline,
        body: unit.body ?? null,
        visualDirection: unit.visualDirection,
        factIds: unit.factIds,
        assetRequest: unit.assetRequest,
        aspectRatio: unit.aspectRatio,
        createdAt: now,
        updatedAt: now,
      })),
    ),
  ]);

  const saved = await findCreativeDraftById(topicId, id);
  if (!saved) {
    throw new Error("The creative draft could not be saved");
  }
  return saved;
}

export async function replaceCreativeDraft(
  topicId: string,
  current: CreativeDraft,
  input: EditableCreativeDraft,
): Promise<CreativeDraft> {
  const now = new Date();

  await db.batch([
    db
      .update(creativeDrafts)
      .set({
        concept: input.concept,
        caption: input.caption,
        callToAction: input.callToAction ?? null,
        hashtags: input.hashtags,
        altText: input.altText,
        // The ratio is selected while creating the draft. Validation prevents
        // an edit request from silently changing this existing variant.
        outputAspectRatio: current.outputAspectRatio,
        status: "draft",
        approvedAt: null,
        version: current.version + 1,
        updatedAt: now,
      })
      .where(
        and(
          eq(creativeDrafts.id, current.id),
          eq(creativeDrafts.topicId, topicId),
        ),
      ),
    db
      .update(creativeAssetBatches)
      .set({ status: "stale", updatedAt: now })
      .where(eq(creativeAssetBatches.draftId, current.id)),
    db.delete(creativeUnits).where(eq(creativeUnits.draftId, current.id)),
    db.insert(creativeUnits).values(
      input.units.map((unit) => ({
        id: randomUUID(),
        draftId: current.id,
        order: unit.order,
        type: unit.type,
        role: unit.role,
        headline: unit.headline,
        body: unit.body ?? null,
        visualDirection: unit.visualDirection,
        factIds: unit.factIds,
        assetRequest: unit.assetRequest,
        aspectRatio: unit.aspectRatio,
        createdAt: now,
        updatedAt: now,
      })),
    ),
  ]);

  const saved = await findCreativeDraftById(topicId, current.id);
  if (!saved) {
    throw new Error("The creative draft could not be saved");
  }
  return saved;
}

export async function approveCreativeDraft(
  topicId: string,
  draftId: string,
): Promise<CreativeDraft> {
  const now = new Date();
  await db
    .update(creativeDrafts)
    .set({ status: "approved", approvedAt: now, updatedAt: now })
    .where(
      and(
        eq(creativeDrafts.id, draftId),
        eq(creativeDrafts.topicId, topicId),
      ),
    );

  const saved = await findCreativeDraftById(topicId, draftId);
  if (!saved) {
    throw new Error("The creative draft could not be approved");
  }
  return saved;
}

export async function unapproveCreativeDraft(
  topicId: string,
  draftId: string,
): Promise<CreativeDraft> {
  const now = new Date();
  await db
    .update(creativeDrafts)
    .set({ status: "draft", approvedAt: null, updatedAt: now })
    .where(
      and(
        eq(creativeDrafts.id, draftId),
        eq(creativeDrafts.topicId, topicId),
      ),
    );

  const saved = await findCreativeDraftById(topicId, draftId);
  if (!saved) {
    throw new Error("The creative draft could not be unapproved");
  }
  return saved;
}

export async function getCreativeDailyUsage(
  topicId: string,
  maxRuns: number,
  now = new Date(),
): Promise<CreativeDailyUsage> {
  const start = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1_000);
  const [row] = await db
    .select({
      runs: count(),
      promptTokens: sql<number>`coalesce(sum(${creativeAiRuns.promptTokens}), 0)::int`,
      outputTokens: sql<number>`coalesce(sum(${creativeAiRuns.outputTokens}), 0)::int`,
      thoughtsTokens: sql<number>`coalesce(sum(${creativeAiRuns.thoughtsTokens}), 0)::int`,
      totalTokens: sql<number>`coalesce(sum(${creativeAiRuns.totalTokens}), 0)::int`,
    })
    .from(creativeAiRuns)
    .where(
      and(
        eq(creativeAiRuns.topicId, topicId),
        gte(creativeAiRuns.startedAt, start),
        lt(creativeAiRuns.startedAt, end),
      ),
    );

  return {
    runs: row?.runs ?? 0,
    maxRuns,
    remainingRuns: Math.max(0, maxRuns - (row?.runs ?? 0)),
    promptTokens: row?.promptTokens ?? 0,
    outputTokens: row?.outputTokens ?? 0,
    thoughtsTokens: row?.thoughtsTokens ?? 0,
    totalTokens: row?.totalTokens ?? 0,
  };
}

export async function createCreativeAiRun({
  topicId,
  storyId,
  briefId,
  task,
  provider,
  model,
  promptVersion,
  inputHash,
}: {
  topicId: string;
  storyId: string;
  briefId?: string;
  task: CreativeRunTask;
  provider: string;
  model: string;
  promptVersion: string;
  inputHash: string;
}): Promise<string> {
  const [run] = await db
    .insert(creativeAiRuns)
    .values({
      topicId,
      storyId,
      briefId: briefId ?? null,
      task,
      provider,
      model,
      promptVersion,
      inputHash,
    })
    .returning({ id: creativeAiRuns.id });

  if (!run) {
    throw new Error("The creative AI run could not be created");
  }
  return run.id;
}

export async function completeCreativeAiRun(
  topicId: string,
  runId: string,
  usage: CreativeAiUsage,
  ids: { briefId?: string; draftId?: string },
): Promise<void> {
  await db
    .update(creativeAiRuns)
    .set({
      status: "completed",
      ...(ids.briefId ? { briefId: ids.briefId } : {}),
      ...(ids.draftId ? { draftId: ids.draftId } : {}),
      ...usage,
      error: null,
      finishedAt: new Date(),
    })
    .where(
      and(
        eq(creativeAiRuns.id, runId),
        eq(creativeAiRuns.topicId, topicId),
      ),
    );
}

export async function failCreativeAiRun(
  topicId: string,
  runId: string,
  error: string,
): Promise<void> {
  await db
    .update(creativeAiRuns)
    .set({
      status: "failed",
      error: error.slice(0, 1_000),
      finishedAt: new Date(),
    })
    .where(
      and(
        eq(creativeAiRuns.id, runId),
        eq(creativeAiRuns.topicId, topicId),
      ),
    );
}

function mapCreativeBrief(
  row: typeof storyCreativeBriefs.$inferSelect,
): CreativeBrief {
  return {
    id: row.id,
    storyId: row.storyId,
    profileId: row.profileId,
    profileSnapshot: mapProfileSnapshot(row.profileSnapshot),
    provider: row.provider,
    model: row.model,
    ...(row.modelVersion ? { modelVersion: row.modelVersion } : {}),
    promptVersion: row.promptVersion,
    inputHash: row.inputHash,
    recommendedFormat: row.recommendedFormat,
    fallbackFormat: row.fallbackFormat,
    formatScores: row.formatScores as CreativeBrief["formatScores"],
    confidence: row.confidence,
    targetAudience: row.targetAudience,
    keyMessage: row.keyMessage,
    angle: row.angle,
    hook: row.hook,
    tone: {
      primary: row.tonePrimary,
      energy: row.toneEnergy,
      humor: row.toneHumor,
      reason: row.toneReason,
    },
    contentSufficiency: row.contentSufficiency,
    keyFacts: row.keyFacts as CreativeBrief["keyFacts"],
    riskFlags: row.riskFlags,
    suggestedConcepts:
      row.suggestedConcepts as CreativeBrief["suggestedConcepts"],
    usage: usageFromRow(row),
    createdAt: row.createdAt,
  };
}

function mapCreativeDraft(
  row: typeof creativeDrafts.$inferSelect,
  units: (typeof creativeUnits.$inferSelect)[],
): CreativeDraft {
  return {
    id: row.id,
    storyId: row.storyId,
    briefId: row.briefId,
    format: row.format,
    outputAspectRatio: row.outputAspectRatio,
    status: row.status,
    concept: row.concept,
    caption: row.caption,
    ...(row.callToAction ? { callToAction: row.callToAction } : {}),
    hashtags: row.hashtags,
    altText: row.altText,
    units: units.map((unit) => ({
      id: unit.id,
      order: unit.order,
      type: unit.type,
      role: unit.role,
      headline: unit.headline,
      ...(unit.body ? { body: unit.body } : {}),
      visualDirection: unit.visualDirection,
      factIds: unit.factIds,
      assetRequest: unit.assetRequest,
      aspectRatio: unit.aspectRatio,
    })),
    provider: row.provider,
    model: row.model,
    ...(row.modelVersion ? { modelVersion: row.modelVersion } : {}),
    promptVersion: row.promptVersion,
    inputHash: row.inputHash,
    version: row.version,
    usage: usageFromRow(row),
    ...(row.approvedAt ? { approvedAt: row.approvedAt } : {}),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function usageFromRow(row: {
  promptTokens: number;
  outputTokens: number;
  thoughtsTokens: number;
  totalTokens: number;
}): CreativeAiUsage {
  return {
    promptTokens: row.promptTokens,
    outputTokens: row.outputTokens,
    thoughtsTokens: row.thoughtsTokens,
    totalTokens: row.totalTokens,
  };
}

function mapProfileSnapshot(value: unknown): CreativeProfile {
  const profile = value as CreativeProfile & { updatedAt: Date | string };
  return {
    ...profile,
    visualGuidance:
      typeof profile.visualGuidance === "string" && profile.visualGuidance.trim()
        ? profile.visualGuidance
        : DEFAULT_CREATIVE_VISUAL_GUIDANCE,
    updatedAt: new Date(profile.updatedAt),
  };
}
