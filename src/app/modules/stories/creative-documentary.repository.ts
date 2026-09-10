import "server-only";
import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { creativeAssets, creativeAssetBatches, creativeDrafts } from "@/db/schema";
import { findCreativeAssetBatchById } from "./creative-assets.repository";
import { DOCUMENTARY_PROVIDER, documentarySnapshot, type DocumentarySnapshot } from "./creative-documentary";

// Fingerprint only source/policy inputs, not unrelated ingestion counters.
function sourceQuery(topicId: string, storyId: string, lock = false) {
  return sql`SELECT md5(jsonb_build_array(to_jsonb(p) - 'geo_provider_contact', s.title, s.original_url, s.content_text,
    e.content_hash, e.content_text, e.status, ts.review_decision)::text) AS token
    FROM (SELECT * FROM creative_profiles WHERE topic_id = ${topicId} ${lock ? sql`FOR UPDATE` : sql``}) p
    JOIN (SELECT * FROM topic_stories WHERE topic_id = ${topicId} AND story_id = ${storyId} ${lock ? sql`FOR UPDATE` : sql``}) ts ON ts.topic_id = p.topic_id
    JOIN (SELECT * FROM stories WHERE id = ${storyId} ${lock ? sql`FOR UPDATE` : sql``}) s ON s.id = ts.story_id
    LEFT JOIN (SELECT * FROM story_content_enrichments WHERE story_id = ${storyId} ${lock ? sql`FOR UPDATE` : sql``}) e ON e.story_id = s.id
    WHERE p.topic_id = ${topicId} AND s.id = ${storyId}`;
}
export async function documentarySourceToken(topicId: string, storyId: string): Promise<string> {
  const result = await db.execute(sourceQuery(topicId, storyId));
  const token = result.rows[0]?.token;
  if (typeof token !== "string") throw new Error("Documentary source is unavailable");
  return token;
}
export async function latestDocumentaryBatch(topicId: string, storyId: string) {
  const [row] = await db.select({ id: creativeAssetBatches.id }).from(creativeAssetBatches)
    .innerJoin(creativeDrafts, eq(creativeDrafts.id, creativeAssetBatches.draftId))
    .where(and(eq(creativeDrafts.topicId, topicId), eq(creativeDrafts.storyId, storyId), eq(creativeAssetBatches.provider, DOCUMENTARY_PROVIDER)))
    .orderBy(desc(creativeAssetBatches.createdAt)).limit(1);
  return row ? findCreativeAssetBatchById(row.id) : undefined;
}
/** Bounded, topic-private reusable library backed by immutable existing asset snapshots. */
export async function documentaryLibrary(topicId: string): Promise<DocumentarySnapshot[]> {
  const rows = await db.select({ snapshot: creativeAssets.unitSnapshot }).from(creativeAssets)
    .innerJoin(creativeAssetBatches, eq(creativeAssetBatches.id, creativeAssets.batchId))
    .innerJoin(creativeDrafts, eq(creativeDrafts.id, creativeAssetBatches.draftId))
    .where(and(eq(creativeDrafts.topicId, topicId), eq(creativeAssets.provider, DOCUMENTARY_PROVIDER)))
    .orderBy(desc(creativeAssets.createdAt)).limit(100);
  return rows.flatMap(row => {
    const snapshot = documentarySnapshot(row.snapshot);
    return snapshot?.photo && snapshot.review?.decision !== "rejected" ? [snapshot] : [];
  });
}
/** One conditional statement approves the exact script and every image, or neither. */
export async function reviewDocumentaryBatch(input: {
  topicId: string; storyId: string; draftId: string; draftVersion: number; batchId: string;
  inputHash: string; sourceToken: string; actor: string; decision: "approved" | "rejected";
}): Promise<boolean> {
  const approved = input.decision === "approved";
  const now = new Date().toISOString();
  const review = JSON.stringify({ decision: input.decision, actor: input.actor, at: now });
  const result = await db.execute(sql`
    WITH locked_draft AS MATERIALIZED (
      SELECT id FROM creative_drafts WHERE id = ${input.draftId} AND topic_id = ${input.topicId}
        AND story_id = ${input.storyId} AND version = ${input.draftVersion}
        AND provider = ${DOCUMENTARY_PROVIDER} FOR UPDATE
    ), current_source AS (${sourceQuery(input.topicId, input.storyId, true)}),
    eligible AS MATERIALIZED (
      SELECT b.id FROM creative_asset_batches b JOIN locked_draft d ON d.id = b.draft_id
      WHERE b.id = ${input.batchId} AND b.draft_version = ${input.draftVersion}
        AND b.provider = ${DOCUMENTARY_PROVIDER} AND b.status IN ('completed', 'partial', 'failed')
        AND (${!approved} OR b.status = 'completed')
        AND EXISTS (SELECT 1 FROM current_source WHERE token = ${input.sourceToken})
        AND NOT EXISTS (SELECT 1 FROM creative_asset_batches newer WHERE newer.draft_id IN
          (SELECT id FROM creative_drafts WHERE topic_id = ${input.topicId} AND story_id = ${input.storyId})
          AND newer.provider = ${DOCUMENTARY_PROVIDER} AND newer.created_at > b.created_at)
        AND (SELECT count(*) FROM creative_assets a WHERE a.batch_id = b.id) = b.total_assets
        AND NOT EXISTS (SELECT 1 FROM creative_assets a WHERE a.batch_id = b.id AND (
          (${approved} AND (a.status NOT IN ('generated', 'approved') OR a.image_url IS NULL)) OR
          a.unit_snapshot->'documentary'->>'inputHash' IS DISTINCT FROM ${input.inputHash} OR
          a.unit_snapshot->'documentary'->>'sourceToken' IS DISTINCT FROM ${input.sourceToken} OR
          (${approved} AND a.unit_snapshot->'documentary'->>'representation' = 'blocked')))
      FOR UPDATE OF b
    ), changed_draft AS (
      UPDATE creative_drafts SET status = ${approved ? "approved" : "draft"}::creative_draft_status,
        approved_at = ${approved ? now : null}::timestamptz, updated_at = ${now}::timestamptz
      WHERE id IN (SELECT id FROM locked_draft) AND EXISTS (SELECT 1 FROM eligible) RETURNING id
    ), changed_assets AS (
      UPDATE creative_assets SET status = CASE WHEN ${approved} THEN 'approved'::creative_asset_status WHEN status = 'approved' THEN 'generated'::creative_asset_status ELSE status END,
        approved_at = ${approved ? now : null}::timestamptz, updated_at = ${now}::timestamptz,
        unit_snapshot = jsonb_set(
          jsonb_set(unit_snapshot, '{documentary,reviews}', coalesce(unit_snapshot->'documentary'->'reviews', '[]'::jsonb) || jsonb_build_array(${review}::jsonb)),
          '{documentary,review}', ${review}::jsonb)
      WHERE batch_id IN (SELECT id FROM eligible) AND EXISTS (SELECT 1 FROM changed_draft) RETURNING id
    ) SELECT id FROM changed_assets`);
  return result.rows.length > 0;
}
