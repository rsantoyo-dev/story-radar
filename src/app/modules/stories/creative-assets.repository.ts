import "server-only";
import { CreativeBrandReferenceConflictError } from "./creative-brand-references.repository";
import { decodeGenerationReferences } from "./creative-brand-generation";

import { referenceEnvelopeHash } from "./creative-brand-generation";
import { randomUUID } from "node:crypto";

import { and, asc, desc, eq, inArray, ne, sql } from "drizzle-orm";

import { db } from "@/db/client";
import { creativeAssetBatches, creativeAssets, creativeDrafts } from "@/db/schema";

import {
  DEFAULT_CREATIVE_IMAGE_QUALITY,
  type CreativeAspectRatio,
  type CreativeAssetGenerationMode,
  type CreativeAssetBatch,
  type CreativeAssetBatchStatus,
  type CreativeBrandOverlaySnapshot,
  type CreativeCarouselChromeSnapshot,
  type CreativeCharacterSnapshot,
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
  /** Omitted historical callers resolve to an unbranded batch. */
  brandInputHash?: string;
};

type GenerationCompatibility = Pick<GenerationIdentity, "provider" | "model"> & {
  outputAspectRatio: CreativeAspectRatio;
  imageQuality?: CreativeImageQuality;
  brandInputHash?: string;
};

type NewAsset = {
  unitOrder: number;
  unitRole: CreativeUnit["role"];
  prompt: string;
  expectedText: string;
  unitSnapshot: CreativeUnit;
  generationMode: CreativeAssetGenerationMode;
  providerEndpoint: string;
  referenceSnapshot: CreativeCharacterSnapshot[] | import("./creative-brand-generation").GenerationReferences;
  referenceInputHash: string;
  brandOverlaySnapshot?: CreativeBrandOverlaySnapshot;
  carouselChromeSnapshot?: CreativeCarouselChromeSnapshot;
};

export async function findCurrentCreativeAssetBatch(
  draftId: string,
  draftVersion: number,
  identity: GenerationIdentity,
): Promise<CreativeAssetBatch | undefined> {
  const imageQuality = identity.imageQuality ?? DEFAULT_CREATIVE_IMAGE_QUALITY;
  const brandInputHash = identity.brandInputHash ?? "none";
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
        eq(creativeAssetBatches.brandInputHash, brandInputHash),
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
  const brandInputHash = compatibility.brandInputHash ?? "none";
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
        eq(creativeAssetBatches.brandInputHash, brandInputHash),
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

/**
 * Retrieves the most recent saved batch across every version of a draft for
 * the read-only Studio history. New generation keeps using version-scoped
 * lookups, so historical viewing cannot affect a current batch.
 */
export async function findLatestCreativeAssetBatchForDraft(
  draftId: string,
): Promise<CreativeAssetBatch | undefined> {
  const [batch] = await db
    .select()
    .from(creativeAssetBatches)
    .where(eq(creativeAssetBatches.draftId, draftId))
    .orderBy(desc(creativeAssetBatches.createdAt))
    .limit(1);

  return batch ? loadCreativeAssetBatch(batch) : undefined;
}

export type CreativeAssetBatchSummary = {
  id: string;
  draftVersion: number;
  status: CreativeAssetBatchStatus;
  totalAssets: number;
  createdAt: string;
};

/**
 * Lightweight list of a draft's image batches (id + version + status + count),
 * newest first — for pickers like the IG-04 link dialog. Does not load the
 * batch assets the way `loadCreativeAssetBatch` does.
 */
export async function listCreativeAssetBatchSummariesForDraft(
  draftId: string,
): Promise<CreativeAssetBatchSummary[]> {
  const rows = await db
    .select({
      id: creativeAssetBatches.id,
      draftVersion: creativeAssetBatches.draftVersion,
      status: creativeAssetBatches.status,
      totalAssets: creativeAssetBatches.totalAssets,
      createdAt: creativeAssetBatches.createdAt,
    })
    .from(creativeAssetBatches)
    .where(eq(creativeAssetBatches.draftId, draftId))
    .orderBy(desc(creativeAssetBatches.createdAt));

  return rows.map((row) => ({
    id: row.id,
    draftVersion: row.draftVersion,
    status: row.status,
    totalAssets: row.totalAssets,
    createdAt: row.createdAt.toISOString(),
  }));
}

/**
 * Pending provider jobs must remain pollable even after the profile logo or
 * another batch identity changes. Otherwise the old job can be orphaned.
 */
export async function findPendingCreativeAssetBatchesForDraft(
  draftId: string,
): Promise<CreativeAssetBatch[]> {
  const rows = await db
    .select()
    .from(creativeAssetBatches)
    .where(
      and(
        eq(creativeAssetBatches.draftId, draftId),
        inArray(creativeAssetBatches.status, ["queued", "generating"]),
      ),
    )
    .orderBy(desc(creativeAssetBatches.createdAt));

  return Promise.all(rows.map(loadCreativeAssetBatch));
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
      brandInputHash: identity.brandInputHash ?? "none",
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
        generationMode: asset.generationMode,
        providerEndpoint: asset.providerEndpoint,
        referenceSnapshot: asset.referenceSnapshot,
        referenceInputHash: asset.referenceInputHash,
        brandOverlaySnapshot: asset.brandOverlaySnapshot ?? null,
        carouselChromeSnapshot: asset.carouselChromeSnapshot ?? null,
        createdAt: now,
        updatedAt: now,
      })),
    ),
  ]);

  const saved = await findCreativeAssetBatchById(batchId);
  if (!saved) throw new Error("The creative asset batch could not be saved");
  return saved;
}

export async function insertRegeneratedCreativeAsset({ previous, prompt, references, unitSnapshot }: {
  previous: CreativeGeneratedAsset;
  prompt: string;
  references?: import("./creative-brand-generation").GenerationReferences;
  unitSnapshot?: CreativeUnit;
}): Promise<CreativeGeneratedAsset> {
  const id = randomUUID();
  const guided = references ? Boolean(references.base || references.characters.length || references.brand.length) : undefined;
  const [, inserted] = await db.batch([
    db.select({ id: creativeAssetBatches.id }).from(creativeAssetBatches)
      .innerJoin(creativeDrafts, eq(creativeDrafts.id, creativeAssetBatches.draftId))
      .where(eq(creativeAssetBatches.id, previous.batchId)).for("update", { of: creativeDrafts }),
    db.execute(sql`
      INSERT INTO creative_assets (id,batch_id,unit_order,unit_role,version,status,provider,model,prompt_version,
        prompt,expected_text,unit_snapshot,generation_mode,provider_endpoint,reference_snapshot,reference_input_hash,
        brand_overlay_snapshot,carousel_chrome_snapshot)
      SELECT ${id}::uuid,a.batch_id,a.unit_order,a.unit_role,a.version+1,'queued',a.provider,a.model,a.prompt_version,
        ${prompt},a.expected_text,COALESCE(${unitSnapshot ? JSON.stringify(unitSnapshot) : null}::jsonb,a.unit_snapshot),
        COALESCE(${guided === undefined ? null : guided ? "reference-guided" : "text-to-image"}::creative_asset_generation_mode,a.generation_mode),
        COALESCE(${guided === undefined ? null : guided ? "openai/gpt-image-2/edit" : "openai/gpt-image-2"},a.provider_endpoint),
        COALESCE(${references ? JSON.stringify(references) : null}::jsonb,a.reference_snapshot),
        COALESCE(${references ? referenceEnvelopeHash(references) : null},a.reference_input_hash),a.brand_overlay_snapshot,a.carousel_chrome_snapshot
      FROM creative_assets a JOIN creative_asset_batches b ON b.id=a.batch_id JOIN creative_drafts d ON d.id=b.draft_id
      WHERE a.id=${previous.id}::uuid AND a.status NOT IN ('queued','generating') AND b.status <> 'stale' AND d.status='approved' AND d.version=b.draft_version
        AND NOT EXISTS (SELECT 1 FROM creative_assets newer WHERE newer.batch_id=a.batch_id AND newer.unit_order=a.unit_order AND newer.version>a.version)
      RETURNING id
    `),
  ]);
  if (!inserted.rows.length) throw new CreativeBrandReferenceConflictError("The image or draft changed. Reload before editing.");
  const found = await findCreativeAssetById(id);
  if (!found) throw new Error("The edited image was not saved");
  await updateBatchStatus(previous.batchId, "generating", null);
  return found.asset;
}

/**
 * IMG-02: drop a version whose provider submit failed synchronously so the
 * previous version stays the head and a base-pinned edit request can retry.
 * Guarded to `failed` — it never deletes a real result.
 */
export async function discardFailedCreativeAssetVersion(
  assetId: string,
): Promise<void> {
  const [row] = await db
    .select({ batchId: creativeAssets.batchId })
    .from(creativeAssets)
    .where(and(eq(creativeAssets.id, assetId), eq(creativeAssets.status, "failed")))
    .limit(1);
  if (!row) return;
  await db
    .delete(creativeAssets)
    .where(and(eq(creativeAssets.id, assetId), eq(creativeAssets.status, "failed")));
  await refreshCreativeAssetBatchStatus(row.batchId);
}

/**
 * Internal-only immutable reference material for a stored asset. The public
 * asset mapper intentionally does not expose private R2 keys to the browser.
 */
export async function getCreativeAssetReferenceSnapshot(
  assetId: string,
): Promise<CreativeCharacterSnapshot[]> {
  const [row] = await db
    .select({ referenceSnapshot: creativeAssets.referenceSnapshot })
    .from(creativeAssets)
    .where(eq(creativeAssets.id, assetId))
    .limit(1);

  return decodeGenerationReferences(row?.referenceSnapshot).characters;
}

export async function getCreativeAssetGenerationReferences(assetId: string) {
  const [row] = await db.select({ snapshot: creativeAssets.referenceSnapshot })
    .from(creativeAssets).where(eq(creativeAssets.id, assetId)).limit(1);
  return decodeGenerationReferences(row?.snapshot);
}

/**
 * Internal-only immutable logo and placement material for post-processing.
 * The public asset mapper deliberately omits the private R2 object key.
 */
export async function getCreativeAssetBrandOverlaySnapshot(
  assetId: string,
): Promise<CreativeBrandOverlaySnapshot | undefined> {
  const [row] = await db
    .select({ brandOverlaySnapshot: creativeAssets.brandOverlaySnapshot })
    .from(creativeAssets)
    .where(eq(creativeAssets.id, assetId))
    .limit(1);

  return row?.brandOverlaySnapshot ?? undefined;
}

/** Internal-only immutable pagination material for post-processing. */
export async function getCreativeAssetCarouselChromeSnapshot(
  assetId: string,
): Promise<CreativeCarouselChromeSnapshot | undefined> {
  const [row] = await db
    .select({ carouselChromeSnapshot: creativeAssets.carouselChromeSnapshot })
    .from(creativeAssets)
    .where(eq(creativeAssets.id, assetId))
    .limit(1);

  return row?.carouselChromeSnapshot ?? undefined;
}

export async function setCreativeAssetRequest(
  assetId: string,
  requestId: string,
): Promise<void> {
  await db
    .update(creativeAssets)
    .set({ requestId, status: "queued", error: null, updatedAt: new Date() })
    .where(and(eq(creativeAssets.id, assetId), inArray(creativeAssets.status, ["queued", "generating"])));
}

export async function setCreativeAssetProgress(
  assetId: string,
  status: "queued" | "generating",
): Promise<void> {
  await db
    .update(creativeAssets)
    .set({ status, updatedAt: new Date() })
    .where(and(eq(creativeAssets.id, assetId), inArray(creativeAssets.status, ["queued", "generating"])));
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
    .where(and(eq(creativeAssets.id, assetId), inArray(creativeAssets.status, ["queued", "generating"])));
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
    .where(and(eq(creativeAssets.id, assetId), inArray(creativeAssets.status, ["queued", "generating"])));
}

/** Lock in the same order as edits, then recheck on a fresh statement snapshot. */
export async function setCreativeAssetApproval(assetId: string, approved: boolean): Promise<void> {
  const [,, result] = await db.batch([
    db.execute(sql`SELECT d.id FROM creative_assets a JOIN creative_asset_batches b ON b.id=a.batch_id
      JOIN creative_drafts d ON d.id=b.draft_id WHERE a.id=${assetId}::uuid FOR UPDATE OF d`),
    db.execute(sql`SELECT r.id FROM creative_brand_references r WHERE r.id IN (
      SELECT (e->>'id')::uuid FROM creative_assets a,
      jsonb_array_elements(CASE WHEN jsonb_typeof(a.reference_snapshot)='object'
        THEN COALESCE(a.reference_snapshot->'brand','[]'::jsonb) || COALESCE(a.reference_snapshot->'provenanceBrand','[]'::jsonb)
        ELSE '[]'::jsonb END) e WHERE a.id=${assetId}::uuid) FOR SHARE OF r`),
    db.execute(sql`UPDATE creative_assets a SET status=${approved ? "approved" : "generated"}::creative_asset_status,
      approved_at=${approved ? new Date() : null},updated_at=now()
      FROM creative_asset_batches b,creative_drafts d
      WHERE a.id=${assetId}::uuid AND b.id=a.batch_id AND d.id=b.draft_id
      AND b.status<>'stale' AND d.version=b.draft_version AND d.status='approved'
      AND a.status=${approved ? "generated" : "approved"}::creative_asset_status
      AND NOT EXISTS (SELECT 1 FROM creative_assets newer WHERE newer.batch_id=a.batch_id AND newer.unit_order=a.unit_order AND newer.version>a.version)
      AND (${!approved} OR NOT EXISTS (
        SELECT 1 FROM jsonb_array_elements(CASE WHEN jsonb_typeof(a.reference_snapshot)='object'
          THEN COALESCE(a.reference_snapshot->'brand','[]'::jsonb) || COALESCE(a.reference_snapshot->'provenanceBrand','[]'::jsonb)
          ELSE '[]'::jsonb END) e
        LEFT JOIN creative_brand_references r ON r.id=(e->>'id')::uuid AND r.topic_id=d.topic_id
        WHERE r.id IS NULL OR NOT r.is_active OR NOT r.provider_transmission_allowed
          OR r.version<>(e->>'version')::int OR r.sha256<>e->>'sha256' OR r.usage_note IS DISTINCT FROM e->>'usageNote')) RETURNING a.id`),
  ]);
  if (!result.rows.length) throw new CreativeBrandReferenceConflictError("The image, draft or reference permissions changed. Reload before approval.");
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
    .where(and(eq(creativeAssetBatches.id, batchId), ne(creativeAssetBatches.status, "stale")));
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
    brandInputHash: row.brandInputHash,
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
  const references = decodeGenerationReferences(row.referenceSnapshot);
  return {
    referenceContextVersion: Array.isArray(row.referenceSnapshot) ? undefined : 1,
    hasBrandReferenceOverride: Boolean(references.selectionOverride),
    ...(references.base ? { editSource: { assetId: references.base.assetId, version: references.base.version }, editInstruction: references.editInstruction } : {}),
    ...(typeof references.editRequestRevision === "number" ? { editRevision: references.editRequestRevision } : {}),
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
    generationMode: row.generationMode,
    providerEndpoint: row.providerEndpoint,
    referenceInputHash: row.referenceInputHash,
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
