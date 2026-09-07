import "server-only";

import { and, asc, eq, inArray, sql } from "drizzle-orm";

import { db } from "@/db/client";
import {
  creativeAssetBatches,
  creativeAssetEditRequests,
  creativeAssets,
  creativeDrafts,
} from "@/db/schema";

import type { CreativeAssetEditRequestInput } from "./creative-asset-edit-request-input";
import type { CreativeAssetEditRequest } from "./creative-content.types";
import {
  CreativeContentConflictError,
  CreativeContentNotFoundError,
} from "./manage-creative-content";

export type { CreativeAssetEditRequest } from "./creative-content.types";

/**
 * IMG-01. Saved-but-not-executed per-slide image edit requests. Nothing here
 * calls the image provider, bumps `creative_drafts.version`, or touches
 * `creative_asset_batches` / asset approvals.
 */
type EditRequestRow = typeof creativeAssetEditRequests.$inferSelect;

function mapRow(row: EditRequestRow): CreativeAssetEditRequest {
  return {
    id: row.id,
    unitOrder: row.unitOrder,
    baseAssetId: row.baseAssetId,
    baseVersion: row.baseVersion,
    revision: row.revision,
    editType: row.editType as CreativeAssetEditRequest["editType"],
    instruction: row.instruction,
    useImageAsBase: row.useImageAsBase,
    brandReferenceIds: row.brandReferenceIds ?? [],
    status: row.status as CreativeAssetEditRequest["status"],
    appliedAssetId: row.appliedAssetId,
    appliedRevision: row.appliedRevision,
    appliedAt: row.appliedAt,
    blockedReason: row.blockedReason,
    lastError: row.lastError,
    updatedAt: row.updatedAt,
  };
}

async function requireTopicDraft(topicId: string, draftId: string): Promise<void> {
  const [draft] = await db
    .select({ id: creativeDrafts.id })
    .from(creativeDrafts)
    .where(
      and(eq(creativeDrafts.id, draftId), eq(creativeDrafts.topicId, topicId)),
    )
    .limit(1);
  if (!draft) {
    throw new CreativeContentNotFoundError("The creative draft was not found");
  }
}

export async function listCreativeAssetEditRequests(
  topicId: string,
  draftId: string,
): Promise<CreativeAssetEditRequest[]> {
  await requireTopicDraft(topicId, draftId);
  const rows = await db
    .select()
    .from(creativeAssetEditRequests)
    .where(
      and(
        eq(creativeAssetEditRequests.topicId, topicId),
        eq(creativeAssetEditRequests.draftId, draftId),
      ),
    )
    .orderBy(asc(creativeAssetEditRequests.unitOrder));
  return rows.map(mapRow);
}

export async function saveCreativeAssetEditRequest(
  topicId: string,
  draftId: string,
  input: CreativeAssetEditRequestInput,
): Promise<CreativeAssetEditRequest> {
  await requireTopicDraft(topicId, draftId);

  // Derive unitOrder / baseVersion from the base asset row itself; never trust
  // the client for those. The base asset must belong to this draft.
  const [base] = await db
    .select({
      unitOrder: creativeAssets.unitOrder,
      version: creativeAssets.version,
      draftId: creativeAssetBatches.draftId,
    })
    .from(creativeAssets)
    .innerJoin(
      creativeAssetBatches,
      eq(creativeAssetBatches.id, creativeAssets.batchId),
    )
    .where(eq(creativeAssets.id, input.baseAssetId))
    .limit(1);
  if (!base || base.draftId !== draftId) {
    throw new CreativeContentNotFoundError(
      "The image to edit was not found on this draft",
    );
  }

  const [row] = await db
    .insert(creativeAssetEditRequests)
    .values({
      topicId,
      draftId,
      unitOrder: base.unitOrder,
      baseAssetId: input.baseAssetId,
      baseVersion: base.version,
      revision: 1,
      editType: input.editType,
      instruction: input.instruction,
      useImageAsBase: input.useImageAsBase,
      brandReferenceIds: input.brandReferenceIds,
    })
    .onConflictDoUpdate({
      target: [
        creativeAssetEditRequests.draftId,
        creativeAssetEditRequests.unitOrder,
      ],
      set: {
        baseAssetId: input.baseAssetId,
        baseVersion: base.version,
        revision: sql`${creativeAssetEditRequests.revision} + 1`,
        editType: input.editType,
        instruction: input.instruction,
        useImageAsBase: input.useImageAsBase,
        brandReferenceIds: input.brandReferenceIds,
        compositionRecipe: null,
        status: "saved",
        appliedAssetId: null,
        appliedRevision: null,
        appliedAt: null,
        blockedReason: null,
        lastError: null,
        updatedAt: new Date(),
      },
    })
    .returning();

  return mapRow(row);
}

export async function discardCreativeAssetEditRequest(
  topicId: string,
  draftId: string,
  unitOrder: number,
): Promise<void> {
  await requireTopicDraft(topicId, draftId);

  const deleted = await db
    .delete(creativeAssetEditRequests)
    .where(
      and(
        eq(creativeAssetEditRequests.draftId, draftId),
        eq(creativeAssetEditRequests.unitOrder, unitOrder),
        inArray(creativeAssetEditRequests.status, ["saved", "failed"]),
      ),
    )
    .returning({ id: creativeAssetEditRequests.id });
  if (deleted.length > 0) return;

  // Nothing pending was removed. If a running/applied request exists, say so;
  // otherwise treat discard as idempotent.
  const [existing] = await db
    .select({ status: creativeAssetEditRequests.status })
    .from(creativeAssetEditRequests)
    .where(
      and(
        eq(creativeAssetEditRequests.draftId, draftId),
        eq(creativeAssetEditRequests.unitOrder, unitOrder),
      ),
    )
    .limit(1);
  if (existing) {
    throw new CreativeContentConflictError(
      existing.status === "running"
        ? "This edit is running. Wait for it to finish before discarding."
        : "This edit request was already applied and is kept as history.",
    );
  }
}

/** IMG-02: internal lookup used by the apply orchestration. */
export async function findCreativeAssetEditRequest(
  topicId: string,
  draftId: string,
  unitOrder: number,
): Promise<CreativeAssetEditRequest | undefined> {
  const [row] = await db
    .select()
    .from(creativeAssetEditRequests)
    .where(
      and(
        eq(creativeAssetEditRequests.topicId, topicId),
        eq(creativeAssetEditRequests.draftId, draftId),
        eq(creativeAssetEditRequests.unitOrder, unitOrder),
      ),
    )
    .limit(1);
  return row ? mapRow(row) : undefined;
}

/**
 * IMG-02 concurrency guard: compare-and-swap `saved → running`. A second
 * concurrent apply (double click) finds the row no longer `saved` and is
 * rejected instead of starting a duplicate job.
 */
export async function beginCreativeAssetEditRequestRun(
  topicId: string,
  draftId: string,
  unitOrder: number,
): Promise<CreativeAssetEditRequest> {
  const [row] = await db
    .update(creativeAssetEditRequests)
    .set({ status: "running", updatedAt: new Date() })
    .where(
      and(
        eq(creativeAssetEditRequests.topicId, topicId),
        eq(creativeAssetEditRequests.draftId, draftId),
        eq(creativeAssetEditRequests.unitOrder, unitOrder),
        eq(creativeAssetEditRequests.status, "saved"),
      ),
    )
    .returning();
  if (row) return mapRow(row);

  const existing = await findCreativeAssetEditRequest(topicId, draftId, unitOrder);
  throw new CreativeContentConflictError(
    !existing
      ? "Save this change before applying it."
      : existing.status === "running"
        ? "This change is already being applied."
        : existing.status === "applied"
          ? "This change was already applied. Edit it to apply again."
          : "Save this change before applying it.",
  );
}

export async function completeCreativeAssetEditRequestRun(
  id: string,
  { appliedAssetId, appliedRevision }: { appliedAssetId: string; appliedRevision: number },
): Promise<void> {
  await db
    .update(creativeAssetEditRequests)
    .set({
      status: "applied",
      appliedAssetId,
      appliedRevision,
      appliedAt: new Date(),
      blockedReason: null,
      lastError: null,
      updatedAt: new Date(),
    })
    .where(eq(creativeAssetEditRequests.id, id));
}

/**
 * IMG-06: an incompatible request is kept pending (`saved`) with a visible
 * explanation; it is never executed and the policy is never changed here.
 */
export async function blockCreativeAssetEditRequest(
  id: string,
  reason: string,
): Promise<void> {
  await db
    .update(creativeAssetEditRequests)
    .set({
      status: "saved",
      blockedReason: reason.slice(0, 500),
      updatedAt: new Date(),
    })
    .where(eq(creativeAssetEditRequests.id, id));
}

/** IMG-02: a provider/storage failure during apply; retryable via re-apply. */
export async function failCreativeAssetEditRequest(
  id: string,
  reason: string,
): Promise<void> {
  await db
    .update(creativeAssetEditRequests)
    .set({
      status: "failed",
      lastError: reason.slice(0, 500),
      updatedAt: new Date(),
    })
    .where(eq(creativeAssetEditRequests.id, id));
}
