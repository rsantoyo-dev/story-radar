import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import ts from "typescript";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import * as schema from "@/db/schema";
const localRequire=createRequire(import.meta.url);
function load(file:string,mocks:Record<string,unknown>) {
  const exports:Record<string,(...args:unknown[])=>Promise<unknown>>={};
  const code=ts.transpileModule(readFileSync(new URL(file,import.meta.url),"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
  vm.runInNewContext(code,{exports,Date,JSON,console,require:(name:string)=>name==="server-only"?{}:name in mocks?mocks[name]:localRequire(name)});
  return exports;
}
const topicId="11111111-1111-4111-8111-111111111111";
const lineId="22222222-2222-4222-8222-222222222222";
class LimitError extends Error {}
function workflow({failEvaluate=false,limit=false,cachedCollection=false,draftMode=false,incomplete=false}={}) {
  const calls:string[]=[];
  let run={id:lineId,topicId,lineId,timezone:"UTC",status:"running",step:"collect",leaseOwner:"owner",progress:{mode:draftMode?"draft":"day",lineName:"News",evaluated:0,evaluationBatches:0} as Record<string,unknown>,error:null as string|null};
  let evalCalls=0;
  const service=load("./daily-preparation.ts",{
    "../topics/topic-context":{requireTopic:async()=>({id:topicId})},
    "../editorial-lines/editorial-lines":{collectionContext:()=>({sourceIds:[lineId]}),resolveLineResearch:()=>({enabled:true,collectionContext:{sourceIds:[lineId]}})},
    "../editorial-lines/editorial-lines.repository":{storyCollectionContexts:async()=>[],getEditorialLine:async()=>({name:"News"}),reserveCollection:async()=>({cached:cachedCollection?{counts:{included:4},sources:{successful:1,failed:0}}:undefined}),finishCollection:async()=>{}},
    "../topics/topic-catalog.repository":{listTopicRssSourceConfigs:async()=>[{id:lineId,enabled:true}]},
    "../sources/ai-research/ai-research.repository":{getAiResearchSourceConfig:async()=>({})},
    "./editorial-profile.repository":{getEditorialProfile:async()=>({})},
    "./story-preferences.repository":{getStoryKeywordPreferences:async()=>({})},
    "./collect-and-persist-story-candidates":{collectAndPersistStoryCandidates:async()=>{calls.push("collect");return {radar:{sources:{successful:1,failed:0},counts:{included:4}},persistence:{}};}},
    "./evaluate-editorial-candidates":{EditorialEvaluationDailyLimitError:LimitError,evaluateEditorialCandidates:async()=>{
      calls.push("evaluate");evalCalls++;
      if(failEvaluate)throw new Error("PRIVATE PROVIDER RAW ERROR");
      if(limit)throw new LimitError();
      return {status:"completed",evaluatedStories:2,cachedStories:evalCalls===1?0:2,candidatesScanned:4};
    }},
    "./daily-editorial-planner":{getDailyPlanner:async()=>({running:false}),recommendForToday:async()=>{calls.push("recommend");return {running:false,stale:false,context:{candidates:[{storyId:topicId,title:"Story"}]},saved:{id:"plan",status:"completed",result:{recommendation:{storyId:topicId}}}};}},
    "./story-content.repository":{getStoryContent:async()=>({contentStatus:incomplete?"summary":"full",text:"Article evidence"})},
    "./prepare-selected-story-content":{prepareStoryContent:async()=>({contentStatus:"summary",text:"Partial"})},
    "./manage-creative-content":{
      createCreativeBrief:async()=>{calls.push("brief");return {state:{brief:{id:"brief",contentSufficiency:"sufficient"}}};},
      getCreativeWorkspaceState:async()=>({briefIsCurrent:true,brief:{id:"brief",recommendedFormat:"carousel"}}),
      createCreativeDraft:async()=>{calls.push("draft");return {state:{drafts:[{id:"draft",briefId:"brief",inputIsCurrent:true,format:"carousel",status:"draft",qualityReview:{status:"accepted",issues:[]}}]}};},
    },
    "./daily-preparation.repository":{
      claimPreparation:async()=>run.status==="running"?structuredClone(run):undefined,
      checkpointPreparation:async(_run:unknown,progress:Record<string,unknown>)=>{run.progress=structuredClone(progress);},
      savePreparation:async(_run:unknown,values:Partial<typeof run>)=>{run={...run,...values};},
    },
  });
  return {service,calls,get run(){return run;},retry(){run.status="running";failEvaluate=false;}};
}
test("daily workflow checkpoints collection, evaluates uncached batches then recommends",async()=>{
  const w=workflow();await w.service.drivePreparation(topicId,lineId);
  assert.deepEqual(w.calls,["collect","evaluate","evaluate","recommend"]);
  assert.equal(w.run.status,"completed");assert.equal(w.run.progress.collected,4);assert.equal(w.run.progress.evaluated,4);
  await w.service.drivePreparation(topicId,lineId);assert.equal(w.calls.length,4);
});
test("evaluation failure retries that step, never recollects and never exposes raw provider errors",async()=>{
  const w=workflow({failEvaluate:true});await w.service.drivePreparation(topicId,lineId);
  assert.equal(w.run.status,"failed");assert.equal(w.run.step,"evaluate");assert.doesNotMatch(w.run.error!,/PRIVATE/);
  w.retry();await w.service.drivePreparation(topicId,lineId);
  assert.equal(w.calls.filter(c=>c==="collect").length,1);assert.equal(w.run.status,"completed");
});
test("quota exhaustion is a visible partial evaluation, not a fabricated success",async()=>{
  const w=workflow({limit:true});await w.service.drivePreparation(topicId,lineId);
  assert.deepEqual(w.calls,["collect","evaluate","recommend"]);assert.match(String(w.run.progress.evaluationWarning),/daily limit/);assert.equal(w.run.progress.evaluated,0);
});
test("recovery reuses a completed collection instead of calling collectors again",async()=>{
  const w=workflow({cachedCollection:true});await w.service.drivePreparation(topicId,lineId);
  assert.equal(w.calls.includes("collect"),false);assert.equal(w.run.progress.collected,4);
});
test("database reservations serialize jobs and claims, fence old workers and isolate topics",async()=>{
  const client=new PGlite();
  try {
    await client.exec(`CREATE TABLE topics(id uuid PRIMARY KEY); INSERT INTO topics VALUES('${topicId}'),('${lineId}');`);
    await client.exec(readFileSync(new URL("../../../../drizzle/0071_woozy_captain_universe.sql",import.meta.url),"utf8"));
    const pg=drizzle(client);
    const db=Object.assign(pg,{batch:async(queries:Promise<unknown>[])=>{const results=[];for(const q of queries)results.push(await q);return results;}});
    const repo=load("./daily-preparation.repository.ts",{"@/db/client":{db},"@/db/schema":schema});
    const first=await repo.startPreparation(topicId,lineId,"News","UTC") as {run:{id:string}};
    const second=await repo.startPreparation(topicId,lineId,"News","UTC") as {created:boolean};
    assert.equal(second.created,false);
    const claim=await repo.claimPreparation(topicId,first.run.id);
    assert.ok(claim);assert.equal(await repo.claimPreparation(topicId,first.run.id),undefined);
    assert.equal(await repo.claimPreparation(lineId,first.run.id),undefined);
    await repo.savePreparation(claim,{status:"failed"});
    await repo.retryPreparation(topicId,first.run.id);
    const resumed=await repo.claimPreparation(topicId,first.run.id);assert.ok(resumed);
    await repo.savePreparation(claim,{status:"completed"});
    assert.equal((await repo.latestPreparation(topicId) as {status:string}).status,"running");
  }finally{await client.close();}
});

test("draft mode extends the same pipeline through content, brief and draft",async()=>{
  const w=workflow({draftMode:true});await w.service.drivePreparation(topicId,lineId);
  assert.deepEqual(w.calls,["collect","evaluate","evaluate","recommend","brief","draft"]);
  assert.equal(w.run.progress.draftId,"draft");assert.equal(w.run.status,"completed");
});
test("incomplete content stops for review before spending on brief or draft",async()=>{
  const w=workflow({draftMode:true,incomplete:true});await w.service.drivePreparation(topicId,lineId);
  assert.equal(w.run.status,"needs-review");assert.equal(w.run.step,"content");
  assert.equal(w.calls.includes("brief"),false);assert.equal(w.calls.includes("draft"),false);
});
test("draft access is scoped to the job and topic; ordinary generation keeps the human approval gate",async()=>{
  const client=new PGlite();
  try {
    await client.exec(`CREATE TABLE daily_preparation_runs(id uuid,topic_id uuid,status text,progress jsonb);
      CREATE TABLE topic_stories(topic_id uuid,story_id uuid,review_decision text,processing_status text,duplicate_of_story_id uuid);
      INSERT INTO topic_stories VALUES('${topicId}','${lineId}',NULL,'ready',NULL);
      INSERT INTO daily_preparation_runs VALUES('${lineId}','${topicId}','running','{"mode":"draft","storyId":"${lineId}"}');`);
    const access=load("./daily-draft-access.ts",{"@/db/client":{db:drizzle(client)},"./story-content.repository":{
      getStoryContent:async()=>({text:"Evidence"}),getSelectedStoryContent:async()=>{throw new Error("Human approval required");},
    }});
    await assert.rejects(access.getDailyDraftStory(topicId,lineId),/Human approval/);
    assert.ok(await access.getDailyDraftStory(topicId,lineId,lineId));
    await assert.rejects(access.getDailyDraftStory(lineId,lineId,lineId),/Human approval/);
    await client.exec(`UPDATE daily_preparation_runs SET status='completed'`);
    await assert.rejects(access.getDailyDraftStory(topicId,lineId,lineId),/Human approval/);
    assert.ok(await access.getDailyDraftStory(topicId,lineId,undefined,true));
    await client.exec(`UPDATE topic_stories SET review_decision='rejected'`);
    await assert.rejects(access.getDailyDraftStory(topicId,lineId,undefined,true),/Human approval/);
  }finally{await client.close();}
});
