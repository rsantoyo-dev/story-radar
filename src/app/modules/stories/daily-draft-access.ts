import "server-only";
import { sql } from "drizzle-orm";
import { db } from "@/db/client";
import { getSelectedStoryContent, getStoryContent } from "./story-content.repository";

/** Draft preparation grants content access, never a human approval. */
export async function getDailyDraftStory(topicId:string,storyId:string,runId?:string,workspace=false) {
  if(!runId && !workspace)return getSelectedStoryContent(topicId,storyId);
  const result=await db.execute(sql`SELECT r.id FROM daily_preparation_runs r
    JOIN topic_stories ts ON ts.topic_id=r.topic_id AND ts.story_id=${storyId}::uuid
    WHERE r.topic_id=${topicId}::uuid AND r.progress->>'mode'='draft'
      AND r.progress->>'storyId'=${storyId}
      AND ts.review_decision IS DISTINCT FROM 'rejected' AND ts.processing_status NOT IN ('rejected','published')
      AND ts.duplicate_of_story_id IS NULL
      AND (${runId ?? null}::uuid IS NULL OR (
        r.id=${runId ?? null}::uuid
        AND (
          (${workspace} AND r.status IN ('running','needs-review','completed'))
          OR (NOT ${workspace} AND r.status='running')
        )
      )) LIMIT 1`);
  if(!result.rows.length)return getSelectedStoryContent(topicId,storyId);
  return getStoryContent(topicId,storyId);
}
