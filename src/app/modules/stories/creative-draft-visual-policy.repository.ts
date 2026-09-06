import "server-only";

import { sql } from "drizzle-orm";

import { db } from "@/db/client";
import { creativeAssetBatches, creativeDrafts } from "@/db/schema";
import type { VisualFidelityMode } from "./creative-content.types";

/** A single compare-and-swap: only batches belonging to the changed revision retire. */
export async function reviseCreativeDraftVisualPolicy(input: {
  topicId: string;
  draftId: string;
  expectedVersion: number;
  expectedStatus: "draft" | "approved";
  override?: { mode: null } | { mode: VisualFidelityMode; reason: string; by?: string | null };
}): Promise<boolean> {
  const now = new Date();
  const override = input.override;
  const overrideFields = override === undefined ? sql`` : sql`,
    visual_fidelity_override = ${override.mode},
    visual_fidelity_override_reason = ${override.mode === null ? null : override.reason.trim()},
    visual_fidelity_override_at = ${override.mode === null ? null : now},
    visual_fidelity_override_by = ${override.mode === null ? null : override.by ?? null}
  `;
  const result = await db.execute(sql`
    WITH changed_draft AS (
      UPDATE ${creativeDrafts}
      SET version = version + 1, status = 'draft', approved_at = NULL,
          updated_at = ${now} ${overrideFields}
      WHERE id = ${input.draftId} AND topic_id = ${input.topicId}
        AND version = ${input.expectedVersion} AND status = ${input.expectedStatus}
      RETURNING id
    ), retired_batches AS (
      UPDATE ${creativeAssetBatches}
      SET status = 'stale', updated_at = ${now}
      WHERE draft_id IN (SELECT id FROM changed_draft)
        AND draft_version <= ${input.expectedVersion} AND status <> 'stale'
      RETURNING id
    )
    SELECT id FROM changed_draft
  `);
  return result.rows.length > 0;
}

export class CreativeVisualPolicyConflictError extends Error {}
