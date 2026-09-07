import "server-only";

import { and, asc, eq, sql } from "drizzle-orm";

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
        eq(creativeAssetEditRequests.status, "saved"),
      ),
    )
    .returning({ id: creativeAssetEditRequests.id });
  if (deleted.length > 0) return;

  // Nothing pending was removed. If a non-pending (already applied/running)
  // request exists, say so; otherwise treat discard as idempotent.
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
      "This edit request was already applied and is kept as history.",
    );
  }
}
