import "server-only";

import { randomUUID } from "node:crypto";

import { and, count, desc, eq, gte, inArray, lt, sql } from "drizzle-orm";

import { db } from "@/db/client";
import {
  creativeAiRuns,
  creativeAssetBatches,
  creativeDrafts,
  creativeUnits,
  creativeUnitCharacters,
  storyCreativeBriefs,
} from "@/db/schema";

import {
  DEFAULT_CREATIVE_VISUAL_GUIDANCE,
  type CreativeAspectRatio,
  type CreativeAiUsage,
  type CreativeBrief,
  type CreativeCharacterSnapshot,
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
        eq(storyCreativeBriefs.promptVersion, promptVersion),
        eq(storyCreativeBriefs.inputHash, inputHash),
      ),
    )
    .orderBy(desc(storyCreativeBriefs.createdAt))
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

  return loadCreativeDrafts(rows);
}

/**
 * Returns every draft ever created for one story within a topic. The current
 * workspace uses this to retain an inspectable history when a fresh brief
 * supersedes an older draft that already has generated assets.
 */
export async function findCreativeDraftsForStory(
  topicId: string,
  storyId: string,
): Promise<CreativeDraft[]> {
  const rows = await db
    .select()
    .from(creativeDrafts)
    .where(
      and(
        eq(creativeDrafts.topicId, topicId),
        eq(creativeDrafts.storyId, storyId),
      ),
    )
    .orderBy(desc(creativeDrafts.updatedAt));

  return loadCreativeDrafts(rows);
}

async function loadCreativeDrafts(
  rows: Array<typeof creativeDrafts.$inferSelect>,
): Promise<CreativeDraft[]> {
  if (rows.length === 0) return [];

  const unitRows = await db
    .select()
    .from(creativeUnits)
    .where(inArray(creativeUnits.draftId, rows.map((row) => row.id)))
    .orderBy(creativeUnits.draftId, creativeUnits.order);
  const characterIdsByUnit = await findCharacterIdsByUnit(
    unitRows.map((unit) => unit.id),
  );
  const unitsByDraft = new Map<
    string,
    (typeof creativeUnits.$inferSelect)[]
  >();

  unitRows.forEach((unit) => {
    const existing = unitsByDraft.get(unit.draftId) ?? [];
    existing.push(unit);
    unitsByDraft.set(unit.draftId, existing);
  });

  return rows.map((row) =>
    mapCreativeDraft(
      row,
      unitsByDraft.get(row.id) ?? [],
      characterIdsByUnit,
    ),
  );
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
  const characterIdsByUnit = await findCharacterIdsByUnit(
    units.map((unit) => unit.id),
  );

  return mapCreativeDraft(row, units, characterIdsByUnit);
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
  const characterIdsByUnit = await findCharacterIdsByUnit(
    units.map((unit) => unit.id),
  );

  return mapCreativeDraft(row, units, characterIdsByUnit);
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
  characterSnapshots,
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
  characterSnapshots: Map<string, CreativeCharacterSnapshot>;
}): Promise<CreativeDraft> {
  const id = randomUUID();
  const now = new Date();
  const units = draftUnitRows(id, generated.units, now);
  const assignments = unitCharacterAssignments(units, characterSnapshots, now);

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
    db.insert(creativeUnits).values(units),
    ...(assignments.length > 0
      ? [db.insert(creativeUnitCharacters).values(assignments)]
      : []),
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
  characterSnapshots: Map<string, CreativeCharacterSnapshot>,
  options: { inputHash?: string } = {},
): Promise<CreativeDraft> {
  const now = new Date();
  const units = draftUnitRows(current.id, input.units, now);
  const assignments = unitCharacterAssignments(units, characterSnapshots, now);

  await db.batch([
    db
      .update(creativeDrafts)
      .set({
        concept: input.concept,
        caption: input.caption,
        callToAction: input.callToAction ?? null,
        hashtags: input.hashtags,
        altText: input.altText,
        outputAspectRatio: input.outputAspectRatio,
        ...(options.inputHash ? { inputHash: options.inputHash } : {}),
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
    db.insert(creativeUnits).values(units),
    ...(assignments.length > 0
      ? [db.insert(creativeUnitCharacters).values(assignments)]
      : []),
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
        // A provider error must not spend the topic's daily creative budget.
        // Keep in-flight runs in the count to prevent concurrent requests from
        // bypassing the limit, and retain completed runs for cost control.
        inArray(creativeAiRuns.status, ["running", "completed"]),
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
  provider?: { provider: string; model: string },
): Promise<void> {
  await db
    .update(creativeAiRuns)
    .set({
      status: "completed",
      ...(ids.briefId ? { briefId: ids.briefId } : {}),
      ...(ids.draftId ? { draftId: ids.draftId } : {}),
      ...(provider ? provider : {}),
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
  characterIdsByUnit: Map<string, string[]>,
): CreativeDraft {
  const generated = row.aiSnapshot as Partial<GeneratedCreativeDraft>;
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
    ...(generated.characterPlan ? { characterPlan: generated.characterPlan } : {}),
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
      characterIds: characterIdsByUnit.get(unit.id) ?? [],
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

function draftUnitRows(
  draftId: string,
  units: GeneratedCreativeDraft["units"],
  now: Date,
) {
  return units.map((unit) => ({
    id: randomUUID(),
    draftId,
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
    characterIds: unit.characterIds ?? [],
  }));
}

function unitCharacterAssignments(
  units: Array<ReturnType<typeof draftUnitRows>[number]>,
  characterSnapshots: Map<string, CreativeCharacterSnapshot>,
  now: Date,
) {
  return units.flatMap((unit) =>
    unit.characterIds.map((characterId) => {
      const characterSnapshot = characterSnapshots.get(characterId);
      if (!characterSnapshot) {
        throw new Error("The selected supporting character snapshot is missing");
      }
      return {
        id: randomUUID(),
        unitId: unit.id,
        characterId,
        characterSnapshot,
        createdAt: now,
      };
    }),
  );
}

async function findCharacterIdsByUnit(
  unitIds: string[],
): Promise<Map<string, string[]>> {
  if (unitIds.length === 0) return new Map();
  const rows = await db
    .select({
      unitId: creativeUnitCharacters.unitId,
      characterId: creativeUnitCharacters.characterId,
    })
    .from(creativeUnitCharacters)
    .where(inArray(creativeUnitCharacters.unitId, unitIds));
  const characterIdsByUnit = new Map<string, string[]>();

  rows.forEach((row) => {
    const current = characterIdsByUnit.get(row.unitId) ?? [];
    current.push(row.characterId);
    characterIdsByUnit.set(row.unitId, current);
  });

  return characterIdsByUnit;
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
