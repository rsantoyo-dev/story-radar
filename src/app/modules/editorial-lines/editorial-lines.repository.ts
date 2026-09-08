import "server-only";
import { randomUUID, createHash } from "node:crypto";
import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { editorialLines, editorialCollectionRuns, editorialStoryContexts, topics } from "@/db/schema";
import { listTopicRssSourceConfigs } from "../topics/topic-catalog.repository";
import { getAiResearchSourceConfig } from "../sources/ai-research/ai-research.repository";
import { EditorialLineError, parseLineConfig, type EditorialLine, type EditorialCollectionContext } from "./editorial-lines";

const asLine = (row: typeof editorialLines.$inferSelect): EditorialLine => ({...row.config,id:row.id,topicId:row.topicId,revision:row.revision,archived:row.archived,isDefault:row.id===defaultEditorialLineId(row.topicId)});
export async function listEditorialLines(topicId:string) { await ensureDefaultEditorialLine(topicId); return (await db.select().from(editorialLines).where(eq(editorialLines.topicId,topicId)).orderBy(desc(editorialLines.updatedAt))).map(asLine); }
export async function getEditorialLine(topicId:string,id:string) {
  const [row]=await db.select().from(editorialLines).where(and(eq(editorialLines.topicId,topicId),eq(editorialLines.id,id)));
  if(!row)throw new EditorialLineError("Editorial line not found",404);return asLine(row);
}
export async function saveEditorialLine(topicId:string,input:Record<string,unknown>) {
  const config=parseLineConfig(input.config);const id=input.id===undefined?randomUUID():validId(input.id);
  if(input.id!==undefined && (!Number.isInteger(input.revision)||Number(input.revision)<1)) throw new EditorialLineError("Expected revision is required");
  if(input.archived!==undefined && typeof input.archived!=="boolean")throw new EditorialLineError("Invalid archived state");
  const sources=await listTopicRssSourceConfigs(topicId);
  if([...config.sourceIds,...config.excludedSourceIds].some(id=>!sources.some(s=>s.id===id)))throw new EditorialLineError("A selected source does not belong to this brand");
  if(input.id!==undefined) await getEditorialLine(topicId,id);
  const archived=input.archived===true;
  if(archived && id===defaultEditorialLineId(topicId))throw new EditorialLineError("The default line can be edited but cannot be archived",409);
  const result=await db.execute(sql`
    WITH saved AS (
      INSERT INTO editorial_lines (id,topic_id,config,archived) VALUES (${id}::uuid,${topicId}::uuid,${JSON.stringify(config)}::jsonb,${archived})
      ON CONFLICT (id) DO UPDATE SET config=EXCLUDED.config,archived=EXCLUDED.archived,revision=editorial_lines.revision+1,updated_at=now()
      WHERE editorial_lines.topic_id=${topicId}::uuid AND editorial_lines.revision=${input.revision ?? null}
      RETURNING *
    ), history AS (
      INSERT INTO editorial_line_revisions(line_id,revision,config,archived) SELECT id,revision,config,archived FROM saved RETURNING line_id
    ) SELECT saved.id FROM saved JOIN history ON history.line_id=saved.id
  `);
  if(!result.rows.length)throw new EditorialLineError("The line changed. Reload before saving.",409);
  return getEditorialLine(topicId,id);
}
export function validId(value:unknown):string {
  if(typeof value!=="string"||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value))throw new EditorialLineError("Invalid identifier");return value;
}
/** All Collect and save calls share a brand budget, including the legacy entry point. */
export async function reserveCollection(topicId:string,id:string,context?:EditorialCollectionContext) {
  const configured=Number(process.env.COLLECTION_MAX_RUNS_PER_DAY || 20);
  const limit=Number.isInteger(configured)&&configured>0?Math.min(configured,1000):20;
  // Separate statements in one transaction: lock the topic before the quota read.
  const [,inserted]=await db.batch([
    db.select({id:topics.id}).from(topics).where(eq(topics.id,topicId)).for("update"),
    db.execute(sql`INSERT INTO editorial_collection_runs(id,topic_id,line_id,context)
      SELECT ${id}::uuid,${topicId}::uuid,${context?.lineId ?? null}::uuid,${context?JSON.stringify(context):null}::jsonb
      WHERE (SELECT count(*) FROM editorial_collection_runs WHERE topic_id=${topicId}::uuid AND started_at >= date_trunc('day',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC') < ${limit}
      ON CONFLICT(id) DO NOTHING RETURNING id`),
  ]);
  const [run]=await db.select().from(editorialCollectionRuns).where(and(eq(editorialCollectionRuns.topicId,topicId),eq(editorialCollectionRuns.id,id)));
  if(!run)throw new EditorialLineError("Collection daily budget exhausted",429);
  if(!inserted.rows.length) {
    if(JSON.stringify(identity(run.context))!==JSON.stringify(identity(context ?? null)))throw new EditorialLineError("This request ID belongs to another collection",409);
    if(run.result)return {cached:run.result};
    throw new EditorialLineError(run.status==="running"?"Collection already running; check its results before retrying":"Collection failed; start a new attempt",409);
  }
  return {cached:undefined};
}
export async function finishCollection(topicId:string,id:string,result?:Record<string,unknown>,error?:string) {
  const sources=result?.sources as {failed?:number;successful?:number}|undefined;
  const status=error ? "failed" : sources?.failed ? sources.successful ? "partial" : "failed" : "completed";
  await db.update(editorialCollectionRuns).set({status,result:result??null,error:error??null,finishedAt:new Date()}).where(and(eq(editorialCollectionRuns.topicId,topicId),eq(editorialCollectionRuns.id,id),eq(editorialCollectionRuns.status,"running")));
}
export async function attachStoryContext(topicId:string,storyId:string,runId:string,context:EditorialCollectionContext,reasons:string[]) {
  await db.insert(editorialStoryContexts).values({topicId,storyId,runId,context,reasons}).onConflictDoNothing();
}
export async function listStoryContexts(topicId:string) {
  return db.select({storyId:editorialStoryContexts.storyId,runId:editorialStoryContexts.runId,context:editorialStoryContexts.context,reasons:editorialStoryContexts.reasons}).from(editorialStoryContexts).where(eq(editorialStoryContexts.topicId,topicId)).orderBy(desc(editorialStoryContexts.createdAt)).limit(2000);
}
export async function recentLineRuns(topicId:string) {return db.select().from(editorialCollectionRuns).where(eq(editorialCollectionRuns.topicId,topicId)).orderBy(desc(editorialCollectionRuns.startedAt)).limit(20);}

function identity(context:EditorialCollectionContext|null){if(!context)return null;return [context.lineId,context.revision,context.query,JSON.stringify(context.period,Object.keys(context.period).sort())];}
export async function storyCollectionContexts(topicId:string,storyId:string) {
  return db.select({runId:editorialStoryContexts.runId,context:editorialStoryContexts.context}).from(editorialStoryContexts).where(and(eq(editorialStoryContexts.topicId,topicId),eq(editorialStoryContexts.storyId,storyId))).orderBy(desc(editorialStoryContexts.createdAt)).limit(30);
}
export async function selectedStoryContext(topicId:string,storyId:string,runId?:string) {
  const choices=await storyCollectionContexts(topicId,storyId);
  if(runId){validId(runId);const chosen=choices.find(c=>c.runId===runId);if(!chosen)throw new EditorialLineError("Research context not found on this story",404);return {...chosen.context,runId};}
  if(choices.length>1)throw new EditorialLineError("Choose the research context for this new brief",409);
  return choices[0]?{...choices[0].context,runId:choices[0].runId}:undefined;
}

// Stable per-brand identity makes concurrent initialization idempotent, including brands
// that already have thematic lines. Never overwrite an editor's subsequent changes.
export function defaultEditorialLineId(topicId:string):string {
  const hash=createHash("sha256").update("press-craftor:default-line:"+topicId.toLowerCase()).digest("hex");
  return hash.slice(0,8)+"-"+hash.slice(8,12)+"-8"+hash.slice(13,16)+"-a"+hash.slice(17,20)+"-"+hash.slice(20,32);
}
export async function ensureDefaultEditorialLine(topicId:string):Promise<EditorialLine> {
  const id=defaultEditorialLineId(topicId);
  const [existing]=await db.select().from(editorialLines).where(and(eq(editorialLines.topicId,topicId),eq(editorialLines.id,id)));
  if(existing)return asLine(existing);
  const research=await getAiResearchSourceConfig(topicId);
  const config=parseLineConfig({name:"Actualidad",objective:research.instruction.trim() || "Collect current news relevant to "+research.topicName,
    themes:[],mode:"news",period:{kind:"relative",hours:72},timezone:"UTC",
    sourceMode:"inherit",sourceIds:[],excludedSourceIds:[],domains:[],researchEnabled:true,research:{mode:"inherit"}});
  await db.execute(sql`WITH inserted AS (
    INSERT INTO editorial_lines(id,topic_id,config) VALUES (${id}::uuid,${topicId}::uuid,${JSON.stringify(config)}::jsonb)
    ON CONFLICT(id) DO NOTHING RETURNING id,revision,config,archived
  ) INSERT INTO editorial_line_revisions(line_id,revision,config,archived)
    SELECT id,revision,config,archived FROM inserted`);
  return getEditorialLine(topicId,id);
}
