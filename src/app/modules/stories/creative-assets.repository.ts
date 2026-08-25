import "server-only";

import { randomUUID } from "node:crypto";

import { and, asc, desc, eq } from "drizzle-orm";

import { db } from "@/db/client";
import { creativeAssetBatches, creativeAssets } from "@/db/schema";

import {
  DEFAULT_CREATIVE_IMAGE_QUALITY,
  type CreativeAspectRatio,
  type CreativeAssetBatch,
  type CreativeAssetBatchStatus,
  type CreativeGeneratedAsset,
  type CreativeImageQuality,
  type CreativeUnit,
} from "./creative-content.types";

type GenerationIdentity = {
  provider: string;
  model: string;
  promptVersion: string;
  /** Omitted callers use the current new-batch default. */
  imageQuality?: CreativeImageQuality;
};

type GenerationCompatibility = Pick<GenerationIdentity, "provider" | "model"> & {
  outputAspectRatio: CreativeAspectRatio;
  imageQuality?: CreativeImageQuality;
};

type NewAsset = {
  unitOrder: number;
  unitRole: CreativeUnit["role"];
  prompt: string;
  expectedText: string;
  unitSnapshot: CreativeUnit;
};

export async function findCurrentCreativeAssetBatch(
  draftId: string,
  draftVersion: number,
  identity: GenerationIdentity,
): Promise<CreativeAssetBatch | undefined> {
  const imageQuality = identity.imageQuality ?? DEFAULT_CREATIVE_IMAGE_QUALITY;
  const [batch] = await db
    .select()
    .from(creativeAssetBatches)
    .where(
      and(
        eq(creativeAssetBatches.draftId, draftId),
        eq(creativeAssetBatches.draftVersion, draftVersion),
        eq(creativeAssetBatches.provider, identity.provider),
        eq(creativeAssetBatches.model, identity.model),
        eq(creativeAssetBatches.promptVersion, identity.promptVersion),
        eq(creativeAssetBatches.imageQuality, imageQuality),
      ),
    )
    .limit(1);

  return batch ? loadCreativeAssetBatch(batch) : undefined;
}

/**
 * Finds the most recent batch made with the same model, intended canvas, and
 * image quality, even when a later image-prompt version has since been
 * deployed. This keeps still-valid provider URLs visible instead of treating
 * them as missing.
 */
export async function findLatestCompatibleCreativeAssetBatch(
  draftId: string,
  draftVersion: number,
  compatibility: GenerationCompatibility,
): Promise<CreativeAssetBatch | undefined> {
  const imageQuality =
    compatibility.imageQuality ?? DEFAULT_CREATIVE_IMAGE_QUALITY;
  const [batch] = await db
    .select()
    .from(creativeAssetBatches)
    .where(
      and(
        eq(creativeAssetBatches.draftId, draftId),
        eq(creativeAssetBatches.draftVersion, draftVersion),
        eq(creativeAssetBatches.provider, compatibility.provider),
        eq(creativeAssetBatches.model, compatibility.model),
        eq(
          creativeAssetBatches.outputAspectRatio,
          compatibility.outputAspectRatio,
        ),
        eq(creativeAssetBatches.imageQuality, imageQuality),
      ),
    )
    .orderBy(desc(creativeAssetBatches.createdAt))
    .limit(1);

  return batch ? loadCreativeAssetBatch(batch) : undefined;
}

/**
 * Last-resort history lookup for assets made with a retired model. It is used
 * for viewing only; new generation still uses the current model/configuration.
 */
export async function findLatestCreativeAssetBatch(
  draftId: string,
  draftVersion: number,
): Promise<CreativeAssetBatch | undefined> {
  const [batch] = await db
    .select()
    .from(creativeAssetBatches)
    .where(
      and(
        eq(creativeAssetBatches.draftId, draftId),
        eq(creativeAssetBatches.draftVersion, draftVersion),
      ),
    )
    .orderBy(desc(creativeAssetBatches.createdAt))
    .limit(1);

  return batch ? loadCreativeAssetBatch(batch) : undefined;
}

export async function findCreativeAssetBatchById(
  batchId: string,
): Promise<CreativeAssetBatch | undefined> {
  const [batch] = await db
    .select()
    .from(creativeAssetBatches)
    .where(eq(creativeAssetBatches.id, batchId))
    .limit(1);

  return batch ? loadCreativeAssetBatch(batch) : undefined;
}

export async function findCreativeAssetById(assetId: string): Promise<
  | {
      asset: CreativeGeneratedAsset;
      batch: CreativeAssetBatch;
    }
  | undefined
> {
  const [row] = await db
    .select()
    .from(creativeAssets)
    .where(eq(creativeAssets.id, assetId))
    .limit(1);

  if (!row) return undefined;
  const batch = await findCreativeAssetBatchById(row.batchId);
  if (!batch) return undefined;
  const versions = batch.assets.find((asset) => asset.unitOrder === row.unitOrder)
    ?.availableVersions ?? 1;
  return { asset: mapCreativeAsset(row, versions), batch };
}

export async function createCreativeAssetBatch({
  draftId,
  draftVersion,
  outputAspectRatio,
  imageQuality = DEFAULT_CREATIVE_IMAGE_QUALITY,
  width,
  height,
  identity,
  assets,
}: {
  draftId: string;
  draftVersion: number;
  outputAspectRatio: CreativeAspectRatio;
  imageQuality?: CreativeImageQuality;
  width: number;
  height: number;
  identity: GenerationIdentity;
  assets: NewAsset[];
}): Promise<CreativeAssetBatch> {
  const batchId = randomUUID();
  const now = new Date();
  // `imageQuality` belongs to the immutable batch identity, not its child
  // asset rows. Keep the persisted batch argument authoritative even if an
  // older caller carries it inside the identity object.
  const assetIdentity = {
    provider: identity.provider,
    model: identity.model,
    promptVersion: identity.promptVersion,
  };

  await db.batch([
    db.insert(creativeAssetBatches).values({
      id: batchId,
      draftId,
      draftVersion,
      outputAspectRatio,
      status: "queued",
      ...assetIdentity,
      imageQuality,
      width,
      height,
      totalAssets: assets.length,
      createdAt: now,
      updatedAt: now,
    }),
    db.insert(creativeAssets).values(
      assets.map((asset) => ({
        id: randomUUID(),
        batchId,
        unitOrder: asset.unitOrder,
        unitRole: asset.unitRole,
        version: 1,
        status: "queued" as const,
        ...assetIdentity,
        prompt: asset.prompt,
        expectedText: asset.expectedText,
        unitSnapshot: asset.unitSnapshot,
        createdAt: now,
        updatedAt: now,
      })),
    ),
  ]);

  const saved = await findCreativeAssetBatchById(batchId);
  if (!saved) throw new Error("The creative asset batch could not be saved");
  return saved;
}

export async function insertRegeneratedCreativeAsset({
  previous,
  prompt,
}: {
  previous: CreativeGeneratedAsset;
  prompt: string;
}): Promise<CreativeGeneratedAsset> {
  const now = new Date();
  const nextVersion = previous.availableVersions + 1;
  const [row] = await db
    .insert(creativeAssets)
    .values({
      id: randomUUID(),
      batchId: previous.batchId,
      unitOrder: previous.unitOrder,
      unitRole: previous.unitRole,
      version: nextVersion,
      status: "queued",
      provider: previous.provider,
      model: previous.model,
      promptVersion: previous.promptVersion,
      prompt,
      expectedText: previous.expectedText,
      unitSnapshot: previous.unitSnapshot,
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  if (!row) throw new Error("The regenerated creative asset could not be saved");
  await updateBatchStatus(previous.batchId, "generating", null);
  return mapCreativeAsset(row, nextVersion);
}

export async function setCreativeAssetRequest(
  assetId: string,
  requestId: string,
): Promise<void> {
  await db
    .update(creativeAssets)
    .set({ requestId, status: "queued", error: null, updatedAt: new Date() })
    .where(eq(creativeAssets.id, assetId));
}

export async function setCreativeAssetProgress(
  assetId: string,
  status: "queued" | "generating",
): Promise<void> {
  await db
    .update(creativeAssets)
    .set({ status, updatedAt: new Date() })
    .where(eq(creativeAssets.id, assetId));
}

export async function completeCreativeAsset(
  assetId: string,
  image: {
    url: string;
    contentType?: string;
    fileName?: string;
    fileSize?: number;
    width?: number;
    height?: number;
    seed?: number;
    safetyFlag?: boolean;
  },
): Promise<void> {
  const now = new Date();
  await db
    .update(creativeAssets)
    .set({
      status: "generated",
      imageUrl: image.url,
      contentType: image.contentType ?? null,
      fileName: image.fileName ?? null,
      fileSize: image.fileSize ?? null,
      width: image.width ?? null,
      height: image.height ?? null,
      seed: image.seed ?? null,
      safetyFlag: image.safetyFlag ?? null,
      error: null,
      completedAt: now,
      approvedAt: null,
      updatedAt: now,
    })
    .where(eq(creativeAssets.id, assetId));
}

export async function failCreativeAsset(
  assetId: string,
  message: string,
): Promise<void> {
  const now = new Date();
  await db
    .update(creativeAssets)
    .set({
      status: "failed",
      error: message.slice(0, 1_000),
      completedAt: now,
      approvedAt: null,
      updatedAt: now,
    })
    .where(eq(creativeAssets.id, assetId));
}

export async function setCreativeAssetApproval(
  assetId: string,
  approved: boolean,
): Promise<void> {
  const now = new Date();
  await db
    .update(creativeAssets)
    .set({
      status: approved ? "approved" : "generated",
      approvedAt: approved ? now : null,
      updatedAt: now,
    })
    .where(eq(creativeAssets.id, assetId));
}

export async function refreshCreativeAssetBatchStatus(
  batchId: string,
): Promise<CreativeAssetBatch> {
  const batch = await findCreativeAssetBatchById(batchId);
  if (!batch) throw new Error("The creative asset batch was not found");
  const status = resolveBatchStatus(batch.assets);
  const completedAt = isTerminalBatchStatus(status) ? new Date() : null;
  await updateBatchStatus(batchId, status, completedAt);
  const refreshed = await findCreativeAssetBatchById(batchId);
  if (!refreshed) throw new Error("The creative asset batch could not be refreshed");
  return refreshed;
}

export async function markDraftAssetBatchesStale(draftId: string): Promise<void> {
  await db
    .update(creativeAssetBatches)
    .set({ status: "stale", updatedAt: new Date() })
    .where(eq(creativeAssetBatches.draftId, draftId));
}

async function updateBatchStatus(
  batchId: string,
  status: CreativeAssetBatchStatus,
  completedAt: Date | null,
): Promise<void> {
  await db
    .update(creativeAssetBatches)
    .set({ status, completedAt, updatedAt: new Date() })
    .where(eq(creativeAssetBatches.id, batchId));
}

async function loadCreativeAssetBatch(
  row: typeof creativeAssetBatches.$inferSelect,
): Promise<CreativeAssetBatch> {
  const rows = await db
    .select()
    .from(creativeAssets)
    .where(eq(creativeAssets.batchId, row.id))
    .orderBy(asc(creativeAssets.unitOrder), desc(creativeAssets.version));
  const versionCounts = new Map<number, number>();
  const latest = new Map<number, typeof creativeAssets.$inferSelect>();

  for (const asset of rows) {
    versionCounts.set(asset.unitOrder, (versionCounts.get(asset.unitOrder) ?? 0) + 1);
    if (!latest.has(asset.unitOrder)) latest.set(asset.unitOrder, asset);
  }

  const assets = [...latest.values()]
    .sort((a, b) => a.unitOrder - b.unitOrder)
    .map((asset) => mapCreativeAsset(asset, versionCounts.get(asset.unitOrder) ?? 1));
  const approvedAssets = assets.filter((asset) => asset.status === "approved").length;

  return {
    id: row.id,
    draftId: row.draftId,
    draftVersion: row.draftVersion,
    status: row.status,
    provider: row.provider,
    model: row.model,
    promptVersion: row.promptVersion,
    outputAspectRatio: row.outputAspectRatio,
    imageQuality: row.imageQuality,
    width: row.width,
    height: row.height,
    totalAssets: row.totalAssets,
    approvedAssets,
    allApproved: assets.length === row.totalAssets && approvedAssets === row.totalAssets,
    assets,
    ...(row.completedAt ? { completedAt: row.completedAt } : {}),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function mapCreativeAsset(
  row: typeof creativeAssets.$inferSelect,
  availableVersions: number,
): CreativeGeneratedAsset {
  return {
    id: row.id,
    batchId: row.batchId,
    unitOrder: row.unitOrder,
    unitRole: row.unitRole,
    version: row.version,
    availableVersions,
    status: row.status,
    provider: row.provider,
    model: row.model,
    promptVersion: row.promptVersion,
    prompt: row.prompt,
    expectedText: row.expectedText,
    unitSnapshot: row.unitSnapshot as CreativeUnit,
    ...(row.requestId ? { requestId: row.requestId } : {}),
    ...(row.imageUrl ? { imageUrl: row.imageUrl } : {}),
    ...(row.contentType ? { contentType: row.contentType } : {}),
    ...(row.fileName ? { fileName: row.fileName } : {}),
    ...(row.fileSize !== null ? { fileSize: row.fileSize } : {}),
    ...(row.width !== null ? { width: row.width } : {}),
    ...(row.height !== null ? { height: row.height } : {}),
    ...(row.seed !== null ? { seed: row.seed } : {}),
    ...(row.safetyFlag !== null ? { safetyFlag: row.safetyFlag } : {}),
    ...(row.error ? { error: row.error } : {}),
    ...(row.completedAt ? { completedAt: row.completedAt } : {}),
    ...(row.approvedAt ? { approvedAt: row.approvedAt } : {}),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function resolveBatchStatus(
  assets: CreativeGeneratedAsset[],
): CreativeAssetBatchStatus {
  const statuses = assets.map((asset) => asset.status);
  if (statuses.some((status) => status === "stale")) return "stale";
  if (statuses.length > 0 && statuses.every((status) => status === "queued")) {
    return "queued";
  }
  if (statuses.some((status) => status === "queued" || status === "generating")) {
    return "generating";
  }
  if (statuses.length > 0 && statuses.every((status) => status === "failed")) {
    return "failed";
  }
  if (statuses.some((status) => status === "failed")) return "partial";
  return "completed";
}

function isTerminalBatchStatus(status: CreativeAssetBatchStatus): boolean {
  return status === "completed" || status === "partial" || status === "failed";
}
