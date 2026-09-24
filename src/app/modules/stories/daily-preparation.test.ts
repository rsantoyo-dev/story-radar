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
function workflow({failEvaluate=false,limit=false,cachedCollection=false,draftMode=false,incomplete=false,likelyFull=false,failApproval=false,noChoice=false,editorialReady=true}={}) {
  const calls:string[]=[];
  const workspaceCalls:unknown[][]=[];
  const briefCalls:unknown[][]=[];
  let approved = false;
  let draftApproved = false;
  let run={id:lineId,topicId,lineId,timezone:"UTC",status:"running",step:"collect",leaseOwner:"owner",progress:{mode:draftMode?"draft":"day",lineName:"News",evaluated:0,evaluationBatches:0} as Record<string,unknown>,error:null as string|null};
  let evalCalls=0;
  const service=load("./daily-preparation.ts",{
    "./creative-quality":{isCreativeDraftReadyForAutomation:()=>editorialReady},
    "./approve-daily-story":{approveDailyStory:async()=>{if(failApproval)throw new Error("Approval failed");if(!approved){calls.push("approve");approved=true;}}},
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
    "./daily-editorial-planner":{getDailyPlanner:async()=>({running:false}),recommendForToday:async()=>{calls.push("recommend");return {running:false,stale:false,context:{candidates:[{storyId:topicId,title:"Story"}]},saved:{id:"plan",status:"completed",result:{recommendation:noChoice?null:{storyId:topicId}}}};}},
    "./story-content.repository":{getStoryContent:async()=>({contentStatus:incomplete?"summary":likelyFull?"likely-full":"full",text:"Article evidence"})},
    "./prepare-selected-story-content":{prepareStoryContent:async()=>({contentStatus:"summary",text:"Partial"})},
    "./manage-creative-content":{
      suggestEditorialFocus:async()=>{calls.push("focus");return {editorialDirection:"a sharper focus",daily:{}};},
      createCreativeBrief:async(...args:unknown[])=>{calls.push("brief");briefCalls.push(args);return {state:{brief:{id:"brief",contentSufficiency:"sufficient"}}};},
      getCreativeWorkspaceState:async(...args:unknown[])=>{workspaceCalls.push(args);return {briefIsCurrent:true,brief:{id:"brief",recommendedFormat:"carousel"},drafts:[{id:"draft",status:draftApproved?"approved":"draft",version:1}]};},
      createCreativeDraft:async()=>{calls.push("draft");return {state:{drafts:[{id:"draft",briefId:"brief",inputIsCurrent:true,format:"carousel",status:"draft",qualityReview:{status:"accepted",issues:[]}}]}};},
      approveSavedCreativeDraft:async()=>{calls.push("approve-draft");draftApproved=true;},
    },
    "./manage-creative-assets":{
      generateCreativeDraftAssets:async()=>{calls.push("images");return {batch:{id:"batch"},configuration:{},outcome:"submitted"};},
    },
    "./daily-preparation.repository":{
      claimPreparation:async()=>run.status==="running"?structuredClone(run):undefined,
      checkpointPreparation:async(_run:unknown,progress:Record<string,unknown>)=>{run.progress=structuredClone(progress);},
      savePreparation:async(_run:unknown,values:Partial<typeof run>)=>{run={...run,...values};},
    },
  });
  return {service,calls,workspaceCalls,briefCalls,get run(){return run;},retry(){run.status="running";failEvaluate=false;}};
}
test("daily workflow checkpoints collection, evaluates uncached batches then recommends",async()=>{
  const w=workflow();await w.service.drivePreparation(topicId,lineId);
  // Default target is "recommend" (select) itself — approval is now a
  // separate step, so it must not run yet.
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
    await repo.savePreparation(resumed,{status:"completed",step:"recommend",progress:{mode:"day",lineName:"News",evaluated:4,evaluationBatches:1,completedStep:"recommend",storyId:lineId}});
    await repo.continuePreparation(lineId,first.run.id,"draft");
    assert.equal((await repo.latestPreparation(topicId) as {status:string}).status,"completed");
    await repo.continuePreparation(topicId,first.run.id,"collect");
    assert.equal((await repo.latestPreparation(topicId) as {status:string}).status,"completed");
    const extended=await repo.continuePreparation(topicId,first.run.id,"brief") as {status:string;step:string;progress:{targetStep:string;mode:string}};
    // "recommend" now hands off to the dedicated "approve" step next, not
    // straight to "content".
    assert.equal(extended.status,"running");assert.equal(extended.step,"approve");
    assert.equal(extended.progress.targetStep,"brief");assert.equal(extended.progress.mode,"draft");
    await repo.continuePreparation(topicId,first.run.id,"draft");
    assert.equal((await repo.latestPreparation(topicId) as typeof extended).progress.targetStep,"brief");
  }finally{await client.close();}
});

test("draft mode extends the same pipeline through content, brief and draft",async()=>{
  const w=workflow({draftMode:true});await w.service.drivePreparation(topicId,lineId);
  assert.deepEqual(w.calls,["collect","evaluate","evaluate","recommend","approve","focus","brief","draft"]);
  assert.deepEqual(w.workspaceCalls,[[topicId,topicId,lineId]]);
  assert.equal(w.run.progress.draftId,"draft");assert.equal(w.run.status,"completed");
});
test("clicking successive targets resumes checkpoints without recollecting or reevaluating", async () => {
  const w=workflow({draftMode:true});
  w.run.progress.targetStep="recommend";
  await w.service.drivePreparation(topicId,lineId);
  assert.equal(w.run.status,"completed");
  assert.equal(w.run.progress.completedStep,"recommend");
  assert.equal(w.run.progress.storyId,topicId);
  assert.equal(w.calls.includes("brief"),false);
  w.run.status="running";w.run.step="content";w.run.progress.targetStep="brief";
  await w.service.drivePreparation(topicId,lineId);
  assert.equal(w.run.progress.completedStep,"brief");
  // "brief" is now the merged step: reaching it produces the draft and its
  // carrousel script together, not as a separate stop.
  assert.equal(w.calls.includes("draft"),true);
  assert.deepEqual(w.calls,["collect","evaluate","evaluate","recommend","approve","focus","brief","draft"]);
});
test("a run still sitting at the legacy 'draft' step from before the brief/draft merge keeps resolving", async () => {
  // No new run ever reaches step="draft" (the "brief" test above proves
  // that), but a run persisted there before this change must not hit
  // "Unknown preparation stage" after a deploy — it has to keep resuming
  // through its own dedicated legacy branch in daily-preparation.ts.
  const w=workflow({draftMode:true});
  w.run.progress.storyId=topicId;w.run.progress.briefId="brief";w.run.progress.targetStep="images";
  w.run.status="running";w.run.step="draft";
  await w.service.drivePreparation(topicId,lineId);
  assert.equal(w.run.status,"completed");
  assert.deepEqual(w.calls,["approve","draft","approve-draft","images"]);
  assert.equal(w.run.progress.draftId,"draft");
});
test("each target stops before the next stage",async()=>{
  for(const target of ["collect","evaluate","content"]) {
    const w=workflow({draftMode:true});w.run.progress.targetStep=target;
    await w.service.drivePreparation(topicId,lineId);
    assert.equal(w.run.status,"completed");assert.equal(w.run.step,target);
    assert.equal(w.run.progress.completedStep,target);
    if(target==="collect")assert.deepEqual(w.calls,["collect"]);
    if(target==="evaluate")assert.equal(w.calls.includes("recommend"),false);
    assert.equal(w.calls.includes("brief"),false);
  }
  // "brief" reached as a target now produces both the brief and the
  // draft/carrousel in the same stop.
  const w=workflow({draftMode:true});w.run.progress.targetStep="brief";
  await w.service.drivePreparation(topicId,lineId);
  assert.equal(w.run.status,"completed");assert.equal(w.run.step,"brief");
  assert.equal(w.run.progress.completedStep,"brief");
  assert.deepEqual(w.calls,["collect","evaluate","evaluate","recommend","approve","focus","brief","draft"]);
});
test("incomplete content stops for review before spending on brief or draft",async()=>{
  const w=workflow({draftMode:true,incomplete:true});await w.service.drivePreparation(topicId,lineId);
  assert.equal(w.run.status,"needs-review");assert.equal(w.run.step,"content");
  assert.equal(w.calls.includes("brief"),false);assert.equal(w.calls.includes("draft"),false);
});
test("substantial likely-full content continues without a redundant extraction",async()=>{
  const w=workflow({draftMode:true,likelyFull:true});await w.service.drivePreparation(topicId,lineId);
  assert.equal(w.run.status,"completed");
  assert.deepEqual(w.calls,["collect","evaluate","evaluate","recommend","approve","focus","brief","draft"]);
});
test("approval failure stops before creating any creative output",async()=>{
  const w=workflow({draftMode:true,failApproval:true});
  await w.service.drivePreparation(topicId,lineId);
  assert.equal(w.run.status,"failed");
  // Selecting the story (recommend) now succeeds on its own; the dedicated
  // approve step is what fails.
  assert.equal(w.run.step,"approve");
  assert.equal(w.calls.includes("brief"),false);
  assert.equal(w.calls.includes("draft"),false);
});
test("no strong recommendation never approves a story",async()=>{
  const w=workflow({draftMode:true,noChoice:true});
  await w.service.drivePreparation(topicId,lineId);
  assert.equal(w.run.status,"needs-review");
  assert.equal(w.calls.includes("approve"),false);
  assert.equal(w.calls.includes("brief"),false);
});
test("automatic approval reuses ordinary actions and rejects unavailable candidates",async()=>{
  class Missing extends Error {}
  let approved=false;
  let decision="shortlist";
  const calls:unknown[][]=[];
  const config={model:"test"};
  const service=load("./approve-daily-story.ts",{
    "./story-content.repository":{
      SelectedStoryContentNotFoundError:Missing,
      getSelectedStoryContent:async()=>{if(!approved)throw new Missing();return {};},
    },
    "./editorial-profile.repository":{getEditorialProfile:async()=>({})},
    "./daily-editorial-planner.repository":{plannerInputs:async()=>({candidates:decision==="missing"?[]:[{storyId:lineId,decision}]})},
    "./editorial-evaluation.config":{getEditorialEvaluationPublicConfig:()=>config},
    "./story-editorial.repository":{
      reviewEditorialShortlist:async(...args:unknown[])=>{calls.push(["shortlist",...args]);approved=true;},
      promoteEditorialReviewCandidate:async(...args:unknown[])=>{calls.push(["promote",...args]);approved=true;},
    },
  });
  await service.approveDailyStory(topicId,lineId);
  assert.equal(JSON.stringify(calls),JSON.stringify([["shortlist",topicId,[lineId],"approved",config]]));
  await service.approveDailyStory(topicId,lineId);
  assert.equal(calls.length,1);
  approved=false;decision="review";
  await service.approveDailyStory(topicId,lineId);
  assert.deepEqual(calls[1],["promote",topicId,lineId,config]);
  for(decision of ["missing","reject"]) {
    approved=false;
    await assert.rejects(service.approveDailyStory(topicId,lineId),/no longer eligible/);
  }
  assert.equal(calls.length,2);
});
test("daily runs and workspace access require the ordinary persisted story approval",async()=>{
  let approved=false;
  const access=load("./daily-draft-access.ts",{"./story-content.repository":{
    getSelectedStoryContent:async(topic:string,story:string)=>{
      assert.equal(topic,topicId);assert.equal(story,lineId);
      if(!approved)throw new Error("Approval required");
      return {text:"Evidence"};
    },
  }});
  for(const workspace of [false,true]) {
    await assert.rejects(access.getDailyDraftStory(topicId,lineId,lineId,workspace),/Approval required/);
  }
  approved=true;
  assert.ok(await access.getDailyDraftStory(topicId,lineId));
  assert.ok(await access.getDailyDraftStory(topicId,lineId,lineId,true));
});

test("daily draft progression stops when exact-version automated readiness fails",async()=>{
  const w=workflow({draftMode:true,editorialReady:false});
  await w.service.drivePreparation(topicId,lineId);
  assert.equal(w.run.status,"needs-review");
  assert.equal(w.run.progress.draftId,"draft");
  assert.match(w.run.error ?? "",/exact version/);
});

test("the extended pipeline carries the suggested focus into the brief, then approves the carrousel and submits images",async()=>{
  const w=workflow({draftMode:true});
  w.run.progress.targetStep="images";
  await w.service.drivePreparation(topicId,lineId);
  assert.equal(w.run.status,"completed");
  assert.deepEqual(w.calls,["collect","evaluate","evaluate","recommend","approve","focus","brief","draft","approve-draft","images"]);
  // The focus step's suggestion is what the brief step actually used.
  assert.equal(w.briefCalls[0]?.[2],"a sharper focus");
  assert.equal(w.run.progress.assetBatchId,"batch");
});

test("approve-draft does not re-approve a carrousel that is already approved",async()=>{
  const w=workflow({draftMode:true});
  w.run.progress.targetStep="approve-draft";
  await w.service.drivePreparation(topicId,lineId);
  assert.equal(w.run.status,"completed");
  assert.equal(w.calls.filter(c=>c==="approve-draft").length,1);
  // Re-running the same step now finds the draft already approved (the mock's
  // getCreativeWorkspaceState reflects it) and must not approve it again.
  w.run.status="running";w.run.step="approve-draft";
  await w.service.drivePreparation(topicId,lineId);
  assert.equal(w.calls.filter(c=>c==="approve-draft").length,1);
});
