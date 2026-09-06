import "server-only";

import { and, desc, eq, sql } from "drizzle-orm";

import { db } from "@/db/client";
import { stories, topicStories } from "@/db/schema";

export type ApprovedTopicStoryBrief = {
  id: string;
  title: string;
  publishedAt: string | null;
};

/**
 * Lightweight list of the topic's editorially approved stories (id + title +
 * published date), newest first. Used by the IG-04 link dialog to pick the
 * story a publication belongs to. `getEditorialDashboardStats(...).selectedStories`
 * produces the same set but joined with evaluations, sources and publications —
 * far more than a picker needs.
 */
export async function listApprovedTopicStoriesBrief(
  topicId: string,
): Promise<ApprovedTopicStoryBrief[]> {
  const rows = await db
    .select({
      id: stories.id,
      title: stories.title,
      publishedAt: stories.publishedAt,
    })
    .from(topicStories)
    .innerJoin(stories, eq(stories.id, topicStories.storyId))
    .where(
      and(
        eq(topicStories.topicId, topicId),
        eq(topicStories.reviewDecision, "approved"),
      ),
    )
    .orderBy(
      sql`${stories.publishedAt} desc nulls last`,
      desc(topicStories.reviewedAt),
    );

  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    publishedAt: row.publishedAt ? row.publishedAt.toISOString() : null,
  }));
}
