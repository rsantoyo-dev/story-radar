import "server-only";
import { DAILY_PREPARATION_STEPS, type DailyPreparationStep } from "./daily-preparation.types";
import { randomUUID } from "node:crypto";
import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { dailyPreparationRuns as runs } from "@/db/schema";
export async function latestPreparation(topicId:string) {
  return (await db.select().from(runs).where(eq(runs.topicId,topicId)).orderBy(desc(runs.startedAt)).limit(1))[0];
}
export async function startPreparation(topicId:string,lineId:string,lineName:string,timezone:string,mode:"day"|"draft"="day",targetStep:DailyPreparationStep=mode==="draft"?"brief":"recommend") {
  const [,inserted]=await db.batch([
    db.execute(sql`SELECT id FROM topics WHERE id=${topicId}::uuid FOR UPDATE`),
    db.execute(sql`INSERT INTO daily_preparation_runs(topic_id,line_id,timezone,progress)
      SELECT ${topicId}::uuid,${lineId}::uuid,${timezone},${JSON.stringify({lineName,mode:DAILY_PREPARATION_STEPS.indexOf(targetStep)>2?"draft":mode,targetStep,evaluated:0,evaluationBatches:0})}::jsonb
      WHERE NOT EXISTS(SELECT 1 FROM daily_preparation_runs WHERE topic_id=${topicId}::uuid AND status='running') RETURNING id`),
  ]);
  return {run:await latestPreparation(topicId),created:!!inserted.rows.length};
}
/** Extend only the latest stopped run; never overwrite a worker's active lease. */
export async function continuePreparation(topicId:string,id:string,targetStep:DailyPreparationStep) {
  const run=await latestPreparation(topicId);
  if(!run || run.id!==id || run.status==="running")return run;
  const completed=run.progress.completedStep ?? (run.status==="completed" ? run.step as DailyPreparationStep : undefined);
  if(completed && DAILY_PREPARATION_STEPS.indexOf(targetStep)<=DAILY_PREPARATION_STEPS.indexOf(completed))return run;
  let step=run.step;
  if(run.status==="completed")step=DAILY_PREPARATION_STEPS[DAILY_PREPARATION_STEPS.indexOf(completed!)+1];
  // Older day-only runs did not store the chosen story. Resolve their recommendation once.
  if((step==="content" || step==="approve") && !run.progress.storyId)step="recommend";
  if(DAILY_PREPARATION_STEPS.indexOf(targetStep)<DAILY_PREPARATION_STEPS.indexOf(step as DailyPreparationStep))return run;
  const progress={...run.progress,targetStep,mode:DAILY_PREPARATION_STEPS.indexOf(targetStep)>2?"draft" as const:run.progress.mode};
  if(step==="collect")delete progress.collectionRunId;
  await db.batch([
    db.execute(sql`SELECT id FROM topics WHERE id=${topicId}::uuid FOR UPDATE`),
    db.execute(sql`UPDATE daily_preparation_runs SET status='running',step=${step},progress=${JSON.stringify(progress)}::jsonb,error=NULL,lease_owner=NULL,lease_until=NULL,updated_at=now()
      WHERE topic_id=${topicId}::uuid AND id=${id}::uuid AND status=${run.status} AND progress=${JSON.stringify(run.progress)}::jsonb
      AND id=(SELECT id FROM daily_preparation_runs WHERE topic_id=${topicId}::uuid ORDER BY started_at DESC LIMIT 1)
      AND NOT EXISTS(SELECT 1 FROM daily_preparation_runs WHERE topic_id=${topicId}::uuid AND status='running')`),
  ]);
  return latestPreparation(topicId);
}
/**
 * Accepts the brief step's already-saved brief despite limited/insufficient
 * evidence — a human reviewed it in the workspace and chose to continue,
 * rather than retrying (which only re-checks the same source and would
 * loop forever when the gap is inherent to the source, not a fluke).
 * Scoped to `step='brief'` and `status='needs-review'` so it can never
 * silently skip a different checkpoint.
 */
export async function acknowledgePreparationBrief(topicId:string,id:string) {
  await db.batch([
    db.execute(sql`SELECT id FROM topics WHERE id=${topicId}::uuid FOR UPDATE`),
    db.execute(sql`UPDATE daily_preparation_runs SET status='running',error=NULL,lease_owner=NULL,lease_until=NULL,updated_at=now(),
      progress=progress || jsonb_build_object('acknowledgedBriefId', progress->'briefId')
      WHERE topic_id=${topicId}::uuid AND id=${id}::uuid AND step='brief' AND status='needs-review' AND progress ? 'briefId'
      AND NOT EXISTS(SELECT 1 FROM daily_preparation_runs WHERE topic_id=${topicId}::uuid AND status='running')`),
  ]);
  return latestPreparation(topicId);
}
export async function retryPreparation(topicId:string,id:string) {
  await db.batch([
    db.execute(sql`SELECT id FROM topics WHERE id=${topicId}::uuid FOR UPDATE`),
    db.execute(sql`UPDATE daily_preparation_runs SET status='running',error=NULL,lease_owner=NULL,lease_until=NULL,updated_at=now(),
      progress=CASE WHEN step='collect' THEN progress-'collectionRunId' ELSE progress END
      WHERE topic_id=${topicId}::uuid AND id=${id}::uuid AND status IN ('failed','needs-review')
      AND NOT EXISTS(SELECT 1 FROM daily_preparation_runs WHERE topic_id=${topicId}::uuid AND status='running')`),
  ]);
  return latestPreparation(topicId);
}
export async function claimPreparation(topicId:string,id:string) {
  const owner=randomUUID();
  const [run]=await db.update(runs).set({leaseOwner:owner,leaseUntil:sql`now()+interval '15 minutes'`,updatedAt:new Date()}).where(and(eq(runs.id,id),eq(runs.topicId,topicId),eq(runs.status,"running"),sql`(${runs.leaseUntil} IS NULL OR ${runs.leaseUntil}<now())`)).returning();
  return run;
}
export async function savePreparation(run:typeof runs.$inferSelect,values:Partial<Pick<typeof runs.$inferInsert,"status"|"step"|"progress"|"error">>) {
  return db.update(runs).set({...values,leaseOwner:null,leaseUntil:null,updatedAt:new Date()}).where(and(eq(runs.id,run.id),eq(runs.topicId,run.topicId),eq(runs.leaseOwner,run.leaseOwner!))).returning();
}
export async function pendingPreparations() {
  return db.select({id:runs.id,topicId:runs.topicId}).from(runs).where(and(eq(runs.status,"running"),sql`(${runs.leaseUntil} IS NULL OR ${runs.leaseUntil}<now())`)).orderBy(runs.updatedAt).limit(3);
}

export async function checkpointPreparation(run:typeof runs.$inferSelect,progress:typeof run.progress) {
  const updated=await db.update(runs).set({progress,updatedAt:new Date()}).where(and(eq(runs.id,run.id),eq(runs.topicId,run.topicId),eq(runs.leaseOwner,run.leaseOwner!))).returning({id:runs.id});
  if(!updated.length)throw new Error("Preparation lease lost");
}
