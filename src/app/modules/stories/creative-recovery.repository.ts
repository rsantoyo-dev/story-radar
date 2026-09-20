import "server-only";
import { sql } from "drizzle-orm";
import { db } from "@/db/client";
import { CreativeContentConflictError } from "./creative-run-errors";
import type { CreativeDraft, CreativeBrief, GeneratedCreativeDraft, CreativeAiUsage } from "./creative-content.types";
export type RecoveryCheckpoint = {
    stage: "patched" | "reviewed";
    draft: GeneratedCreativeDraft;
    usage: CreativeAiUsage;
};
export type RecoveryRecord = {
    id: string;
    topic_id: string;
    draft_id: string;
    draft_version: number;
    status: string;
    lease_token: string;
    input: {
        draft: CreativeDraft;
        brief: CreativeBrief;
    };
    result: RecoveryCheckpoint | null;
    error: string | null;
};
export async function getRecovery(topicId: string, id: string): Promise<RecoveryRecord | undefined> {
    const r = await db.execute(sql `SELECT * FROM creative_draft_recoveries WHERE id=${id}::uuid AND topic_id=${topicId}::uuid`);
    return r.rows[0] as unknown as RecoveryRecord | undefined;
}
export async function latestRecovery(topicId: string, storyId: string) {
    const r = await db.execute(sql `SELECT id,draft_id AS "draftId",draft_version AS "draftVersion",status,error,result->>'stage' AS stage
  FROM creative_draft_recoveries WHERE topic_id=${topicId}::uuid AND story_id=${storyId}::uuid AND status<>'completed' ORDER BY created_at DESC LIMIT 1`);
    return r.rows[0] as {
        id: string;
        draftId: string;
        draftVersion: number;
        status: string;
        error: string | null;
        stage: string | null;
    } | undefined;
}
export async function claimRecovery(topicId: string, id: string, draft: CreativeDraft, brief: CreativeBrief): Promise<RecoveryRecord> {
    try {
        const [, , inserted] = await db.batch([
            db.execute(sql `SELECT id FROM topics WHERE id=${topicId}::uuid FOR UPDATE`),
            db.execute(sql `UPDATE creative_draft_recoveries SET status='failed',error='Draft version changed; retained checkpoint is historical.',updated_at=now()
    WHERE topic_id=${topicId}::uuid AND draft_id=${draft.id}::uuid AND draft_version<>${draft.version} AND status IN ('running','ready')
    AND EXISTS(SELECT 1 FROM creative_drafts WHERE id=${draft.id}::uuid AND topic_id=${topicId}::uuid AND version=${draft.version} AND status='draft')`),
            db.execute(sql `INSERT INTO creative_draft_recoveries(id,topic_id,story_id,draft_id,draft_version,input)
    SELECT ${id}::uuid,${topicId}::uuid,${draft.storyId}::uuid,${draft.id}::uuid,${draft.version},${JSON.stringify({ draft, brief })}::jsonb
    WHERE EXISTS(SELECT 1 FROM creative_drafts WHERE id=${draft.id}::uuid AND topic_id=${topicId}::uuid AND version=${draft.version} AND status='draft')
    ON CONFLICT(id) DO NOTHING RETURNING *`),
        ]);
        if (inserted.rows[0])
            return inserted.rows[0] as unknown as RecoveryRecord;
    }
    catch (error) {
        const databaseError = error as {
            code?: string;
            cause?: {
                code?: string;
            };
        };
        if (databaseError.code !== "23505" && databaseError.cause?.code !== "23505")
            throw error;
        throw new CreativeContentConflictError("A recovery is already running for this draft. Resume its saved result instead of starting another request.");
    }
    const current = await db.execute(sql `SELECT id FROM creative_drafts WHERE id=${draft.id}::uuid AND topic_id=${topicId}::uuid AND version=${draft.version} AND status='draft'`);
    if (!current.rows.length)
        throw new CreativeContentConflictError("The draft changed. Reload before recovering it.");
    const existing = await getRecovery(topicId, id);
    if (!existing || existing.draft_id !== draft.id || existing.draft_version !== draft.version)
        throw new CreativeContentConflictError("The recovery belongs to a different draft version.");
    if (existing.status === 'completed' || existing.result?.stage === 'reviewed')
        return existing;
    const claimed = await db.execute(sql `UPDATE creative_draft_recoveries SET status='running',updated_at=now(),error=NULL,lease_token=gen_random_uuid()
  WHERE id=${id}::uuid AND topic_id=${topicId}::uuid AND EXISTS(SELECT 1 FROM creative_drafts WHERE id=${draft.id}::uuid AND version=${draft.version} AND status='draft') AND (status='failed' OR (status='running' AND updated_at<now()-interval '10 minutes')) RETURNING *`);
    if (!claimed.rows[0])
        throw new CreativeContentConflictError("This recovery is still running. Reload to retrieve its checkpoint; a stopped worker can be resumed after 10 minutes.");
    return claimed.rows[0] as unknown as RecoveryRecord;
}
export async function checkpointRecovery(topicId: string, id: string, result: RecoveryCheckpoint, leaseToken: string) {
    const saved = await db.execute(sql `UPDATE creative_draft_recoveries SET result=${JSON.stringify(result)}::jsonb,status=${result.stage === 'reviewed' ? 'ready' : 'running'},updated_at=now()
  WHERE topic_id=${topicId}::uuid AND id=${id}::uuid AND status='running' AND lease_token=${leaseToken}::uuid RETURNING id`);
    if (!saved.rows.length)
        throw new CreativeContentConflictError("This recovery worker no longer owns the draft. Reload its saved state.");
}
export async function finishRecovery(topicId: string, id: string, leaseToken: string, error?: string) {
    await db.execute(sql `UPDATE creative_draft_recoveries SET status=${error ? 'failed' : 'completed'},error=${error ?? null},updated_at=now()
  WHERE topic_id=${topicId}::uuid AND id=${id}::uuid AND lease_token=${leaseToken}::uuid`);
}
