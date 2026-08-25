import "server-only";

import { and, eq, gte, isNull, sql } from "drizzle-orm";

import { db } from "@/db/client";
import { topicStories } from "@/db/schema";

/**
 * Restores only automatic, score-based rejections that meet a topic's newly
 * lowered local candidate floor. Human decisions, hard/duplicate rejections,
 * and any selected or published workflow states remain untouched.
 */
export async function reactivateAutoRejectedStories(
  topicId: string,
  minLocalScore: number,
): Promise<number> {
  const reactivatedStories = await db
    .update(topicStories)
    .set({ processingStatus: "new" })
    .where(
      and(
        eq(topicStories.topicId, topicId),
        // This status condition inherently excludes selected and published
        // stories. The null checks also preserve every human-reviewed story.
        eq(topicStories.processingStatus, "rejected"),
        isNull(topicStories.reviewDecision),
        isNull(topicStories.reviewedAt),
        gte(topicStories.relevanceScore, minLocalScore),
        sql`not exists (
          select 1
          from unnest(${topicStories.relevanceReasons}) as reason(value)
          where reason.value like 'hard-reject:%'
            or reason.value like 'near-duplicate of:%'
        )`,
      ),
    )
    .returning({ storyId: topicStories.storyId });

  return reactivatedStories.length;
}
