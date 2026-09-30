import "server-only";

import { sql } from "drizzle-orm";

import { db } from "@/db/client";

export class OwnedContentSelectionConflictError extends Error {}

/**
 * Human approval of editor-authored content. The expected duplicate identity
 * guards against approving a different match after the editor reviewed it.
 * One update records the approval and makes a false-positive override sticky.
 * No AI evaluation is invented or changed.
 */
export async function selectOwnedContentStory(
  topicId: string,
  storyId: string,
  expectedDuplicateStoryId: string | null,
  selectedAt = new Date(),
): Promise<void> {
  const result = await db.execute(sql`
    UPDATE topic_stories AS ts SET
      review_decision = 'approved',
      reviewed_at = ${selectedAt.toISOString()}::timestamptz,
      processing_status = 'selected',
      duplicate_overridden_at = CASE
        WHEN ts.duplicate_of_story_id IS NOT NULL THEN ${selectedAt.toISOString()}::timestamptz
        ELSE ts.duplicate_overridden_at
      END,
      duplicate_of_story_id = NULL,
      duplicate_detected_at = NULL,
      duplicate_similarity = NULL
    WHERE ts.topic_id = ${topicId}::uuid
      AND ts.story_id = ${storyId}::uuid
      AND ts.review_decision IS NULL
      AND ts.processing_status = 'ready'
      AND ts.duplicate_of_story_id IS NOT DISTINCT FROM ${expectedDuplicateStoryId}::uuid
      AND EXISTS (
        SELECT 1 FROM owned_content_entries own
        WHERE own.topic_id = ts.topic_id AND own.story_id = ts.story_id
      )
    RETURNING ts.story_id
  `);

  if (!result.rows.length) {
    throw new OwnedContentSelectionConflictError(
      "This original-content Story changed or is no longer available for selection. Refresh and review it again.",
    );
  }
}
