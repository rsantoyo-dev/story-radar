import "server-only";

import { and, eq, inArray, ne, sql } from "drizzle-orm";

import { db } from "@/db/client";
import { reviseCreativeDraftVisualPolicy } from "./creative-draft-visual-policy.repository";
import {
  creativeAssetBatches,
  creativeDrafts,
  storyCreativeBriefs,
} from "@/db/schema";

export {
  isVisualPolicySnapshotStale,
  readSnapshotPolicyVersion,
} from "./creative-visual-policy";

export type VisualPolicyInvalidationResult = {
  /**
   * Drafts whose brief snapshot predates the current policy that carried an
   * approval or a live image batch, and were moved to a fresh version with
   * their non-stale batches retired.
   */
  draftsRetired: number;
};

/**
 * Invalidates approvals made under a superseded visual fidelity policy
 * (FEAT-GEO-001 / GEO-01, criterion 4). Idempotent and safe to call on every
 * profile save: it selects work purely from stored state (drafts whose brief
 * snapshot carries an older `visualPolicyVersion`), so a retry after a partial
 * failure finishes the job even though `saveCreativeProfile` no longer sees a
 * "policy changed" delta.
 *
 * History is preserved, not rewritten. A stale draft that is approved OR still
 * has a non-stale image batch gets a NEW version and its older non-stale batches are
 * marked `stale`, in ONE atomic SQL statement. No `creative_assets` row is
 * touched: the old version's batch and its approved images stay exactly as
 * they were, as the record of what that version shipped; the new version has
 * no batch and must be regenerated under the current policy. The per-draft
 * guard on `version` makes each draft's write a no-op on a retry.
 *
 * Until GEO-03..06 link places to individual units, "stale" is topic-wide:
 * over-invalidation is the safe direction the policy demands.
 */
export async function invalidateApprovalsForVisualPolicyChange(input: {
  topicId: string;
  currentPolicyVersion: number;
}): Promise<VisualPolicyInvalidationResult> {
  const { topicId, currentPolicyVersion } = input;

  const staleSnapshot = sql<boolean>`
    coalesce(
      (${storyCreativeBriefs.profileSnapshot} ->> 'visualPolicyVersion')::int,
      1
    ) < ${currentPolicyVersion}
  `;

  const staleDrafts = await db
    .select({
      id: creativeDrafts.id,
      status: creativeDrafts.status,
      version: creativeDrafts.version,
    })
    .from(creativeDrafts)
    .innerJoin(
      storyCreativeBriefs,
      eq(storyCreativeBriefs.id, creativeDrafts.briefId),
    )
    .where(and(eq(creativeDrafts.topicId, topicId), staleSnapshot));

  if (staleDrafts.length === 0) return { draftsRetired: 0 };

  const draftsWithLiveBatch = new Set(
    (
      await db
        .select({ draftId: creativeAssetBatches.draftId })
        .from(creativeAssetBatches)
        .where(
          and(
            inArray(
              creativeAssetBatches.draftId,
              staleDrafts.map((row) => row.id),
            ),
            ne(creativeAssetBatches.status, "stale"),
          ),
        )
    ).map((row) => row.draftId),
  );

  let draftsRetired = 0;

  for (const draft of staleDrafts) {
    if (draft.status !== "approved" && !draftsWithLiveBatch.has(draft.id)) {
      continue;
    }
    const changed = await reviseCreativeDraftVisualPolicy({
      topicId,
      draftId: draft.id,
      expectedVersion: draft.version,
      expectedStatus: draft.status,
    });
    if (changed) draftsRetired += 1;
  }

  if (draftsRetired > 0) {
    console.info(
      `Visual fidelity policy v${currentPolicyVersion} for topic ${topicId}: ` +
        `retired ${draftsRetired} stale-policy draft(s)`,
    );
  }

  return { draftsRetired };
}
