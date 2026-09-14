import "server-only";
import { randomUUID } from "node:crypto";
import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { dailyPreparationRuns as runs } from "@/db/schema";
export async function latestPreparation(topicId:string) {
  return (await db.select().from(runs).where(eq(runs.topicId,topicId)).orderBy(desc(runs.startedAt)).limit(1))[0];
}
export async function startPreparation(topicId:string,lineId:string,lineName:string,timezone:string,mode:"day"|"draft"="day") {
  const [,inserted]=await db.batch([
    db.execute(sql`SELECT id FROM topics WHERE id=${topicId}::uuid FOR UPDATE`),
    db.execute(sql`INSERT INTO daily_preparation_runs(topic_id,line_id,timezone,progress)
      SELECT ${topicId}::uuid,${lineId}::uuid,${timezone},${JSON.stringify({lineName,mode,evaluated:0,evaluationBatches:0})}::jsonb
      WHERE NOT EXISTS(SELECT 1 FROM daily_preparation_runs WHERE topic_id=${topicId}::uuid AND status='running') RETURNING id`),
  ]);
  return {run:await latestPreparation(topicId),created:!!inserted.rows.length};
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
