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
class NotEligibleError extends Error {}
type Asset={id:string;unitOrder:number;status:string;safetyFlag?:boolean};
function workflow({failEvaluate=false,limit=false,cachedCollection=false,draftMode=false,incomplete=false,likelyFull=false,failApproval=false,noChoice=false,editorialReady=true,scoop=false,
  alternatives=[] as string[],sameEvent={} as Record<string,string[]>,published=[] as string[],incompleteFor=[] as string[],notEligible=[] as string[],autoApprove=false,failAutoApprove=false,
  images=[[{id:"a1",unitOrder:1,status:"generated"},{id:"a2",unitOrder:2,status:"generated"}]] as Asset[][]}={}) {
  let imagePolls=0;
  const contentCalls:string[]=[];
  const calls:string[]=[];
  const workspaceCalls:unknown[][]=[];
  const briefCalls:unknown[][]=[];
  let approved = false;
  let draftApproved = false;
  let run={id:lineId,topicId,lineId,timezone:"UTC",status:"running",step:"collect",leaseOwner:"owner",progress:{mode:draftMode?"draft":"day",lineName:"News",evaluated:0,evaluationBatches:0} as Record<string,unknown>,error:null as string|null};
  let evalCalls=0;
  const service=load("./daily-preparation.ts",{
    "./creative-quality":{isCreativeDraftReadyForAutomation:()=>editorialReady},
    "./approve-daily-story":{DailyStoryNotEligibleError:NotEligibleError,approveDailyStory:async(_topic:unknown,storyId:string)=>{if(failApproval)throw new Error("Approval failed");if(notEligible.includes(storyId))throw new NotEligibleError("not eligible");if(!approved){calls.push("approve");approved=true;}}},
    "./story-duplicates.repository":{storyAlreadyPublished:async(_topic:unknown,storyId:string)=>published.includes(storyId),sameEventStories:async(_topic:unknown,storyId:string)=>(sameEvent[storyId] ?? []).map(id=>({storyId:id,title:`Same ${id}`}))},
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
    "./daily-editorial-planner":{getDailyPlanner:async()=>({running:false}),recommendForToday:async()=>{calls.push("recommend");return {running:false,stale:false,context:{candidates:[{storyId:topicId,title:"Story"},...alternatives.map(id=>({storyId:id,title:`Alt ${id}`}))]},saved:{id:"plan",status:"completed",result:{summary:"A quiet news day",recommendation:noChoice?null:{storyId:topicId,reason:"Best local fit"},alternatives:alternatives.map(id=>({storyId:id}))}}};}},
    "./story-content.repository":{getStoryContent:async(_topic:unknown,storyId:string)=>{contentCalls.push(storyId);return {contentStatus:incomplete||incompleteFor.includes(storyId)?"summary":likelyFull?"likely-full":"full",text:"Article evidence"};}},
    "./prepare-selected-story-content":{prepareStoryContent:async()=>({contentStatus:"summary",text:"Partial"})},
    "./manage-creative-content":{
      approveSavedCreativeDraft:async()=>{if(failAutoApprove)throw new Error("Resolve the narrative blockers first.");calls.push("auto-approve-draft");draftApproved=true;},
      suggestEditorialFocus:async()=>{calls.push("focus");return {editorialDirection:"a sharper focus",daily:{}};},
      createCreativeBrief:async(...args:unknown[])=>{calls.push("brief");briefCalls.push(args);return {state:{brief:{id:"brief",contentSufficiency:"sufficient"}}};},
      getCreativeWorkspaceState:async(...args:unknown[])=>{workspaceCalls.push(args);return {briefIsCurrent:true,brief:{id:"brief",recommendedFormat:"carousel"},drafts:[{id:"draft",status:draftApproved?"approved":"draft",version:1}]};},
      createCreativeDraft:async()=>{calls.push("draft");return {state:{drafts:[{id:"draft",briefId:"brief",inputIsCurrent:true,format:"carousel",status:"draft",qualityReview:{status:"accepted",issues:[]}}]}};},
    },
    "./manage-creative-assets":{
      generateCreativeDraftAssets:async(_topic:unknown,_draft:unknown,_quality:unknown,options?:{provisional?:boolean})=>{calls.push(options?.provisional?"images:provisional":"images");return {batch:{id:"batch"},configuration:{},outcome:"submitted"};},
      getCreativeDraftAssets:async()=>({batch:{id:"batch",assets:images[Math.min(imagePolls++,images.length-1)]}}),
      changeCreativeAssetApproval:async(_topic:unknown,assetId:string)=>{calls.push(`approve-image:${assetId}`);},
    },
    "./daily-preparation.repository":{
      claimPreparation:async()=>run.status==="running"?structuredClone(run):undefined,
      checkpointPreparation:async(_run:unknown,progress:Record<string,unknown>)=>{run.progress=structuredClone(progress);},
      savePreparation:async(_run:unknown,values:Partial<typeof run>)=>{run={...run,...values};},
    },
  });
  if(scoop)run.progress.trigger="scoop";
  if(autoApprove)run.progress.autoApprove=true;
  return {service,calls,contentCalls,workspaceCalls,briefCalls,get run(){return run;},approveDraft(){draftApproved=true;},retry(){run.status="running";failEvaluate=false;}};
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
  assert.equal(w.run.status,"needs-review");
  assert.equal(w.run.step,"approve-draft");
  w.approveDraft();w.retry();
  await w.service.drivePreparation(topicId,lineId);
  assert.equal(w.run.status,"completed");
  assert.deepEqual(w.calls,["approve","draft","images"]);
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

test("the extended pipeline pauses for human draft approval before images",async()=>{
  const w=workflow({draftMode:true});
  w.run.progress.targetStep="images";
  await w.service.drivePreparation(topicId,lineId);
  assert.equal(w.run.status,"needs-review");
  assert.equal(w.run.step,"approve-draft");
  assert.match(w.run.error ?? "",/human approval/);
  assert.equal(w.calls.includes("images"),false);
  w.approveDraft();w.retry();
  await w.service.drivePreparation(topicId,lineId);
  assert.equal(w.run.status,"completed");
  assert.deepEqual(w.calls,["collect","evaluate","evaluate","recommend","approve","focus","brief","draft","images"]);
  // The focus step's suggestion is what the brief step actually used.
  assert.equal(w.briefCalls[0]?.[2],"a sharper focus");
  assert.equal(w.run.progress.assetBatchId,"batch");
});

test("approve-draft requires the existing human approval and never creates it",async()=>{
  const w=workflow({draftMode:true});
  w.run.progress.targetStep="approve-draft";
  await w.service.drivePreparation(topicId,lineId);
  assert.equal(w.run.status,"needs-review");
  w.approveDraft();w.retry();
  await w.service.drivePreparation(topicId,lineId);
  assert.equal(w.run.status,"completed");
  assert.equal(w.calls.includes("approve-draft"),false);
  w.run.status="running";w.run.step="approve-draft";
  await w.service.drivePreparation(topicId,lineId);
  assert.equal(w.calls.includes("approve-draft"),false);
});

test("a scoop whose draft the critic accepted reaches provisional images without approving the script",async()=>{
  const w=workflow({draftMode:true,scoop:true});
  w.run.progress.targetStep="images";
  await w.service.drivePreparation(topicId,lineId);
  assert.equal(w.run.status,"completed");
  assert.equal(w.run.progress.provisionalImages,true);
  assert.equal(w.calls.at(-1),"images:provisional","images are generated as provisional");
  assert.equal(w.calls.includes("approve-draft"),false,"the script is never approved automatically");
});

test("a scoop whose draft failed automated review stops before spending on images",async()=>{
  const w=workflow({draftMode:true,scoop:true,editorialReady:false});
  w.run.progress.targetStep="images";
  await w.service.drivePreparation(topicId,lineId);
  assert.equal(w.run.status,"needs-review");
  assert.equal(w.calls.some(call=>call.startsWith("images")),false);
  assert.equal(w.run.progress.provisionalImages,undefined);
});

const altA="33333333-3333-4333-8333-333333333333";
const altB="44444444-4444-4444-8444-444444444444";
const sameSource="55555555-5555-4555-8555-555555555555";
const drain=async(w:ReturnType<typeof workflow>)=>{for(let i=0;i<8 && w.run.status==="running";i++)await w.service.drivePreparation(topicId,lineId);};

test("an incomplete article tries the same event's other source, then the next recommended story",async()=>{
  const w=workflow({draftMode:true,incompleteFor:[topicId,sameSource],alternatives:[altA],sameEvent:{[topicId]:[sameSource]}});
  await drain(w);
  assert.deepEqual(w.contentCalls,[topicId,sameSource,altA]);
  assert.equal(w.run.progress.storyId,altA);
  assert.equal(w.run.status,"completed");
  assert.deepEqual((w.run.progress.skippedStories as {storyId:string}[]).map(s=>s.storyId),[topicId,sameSource]);
  assert.match((w.run.progress.skippedStories as {reason:string}[])[0].reason,/Incomplete/);
});

test("after three incomplete articles a human decides, before any brief is spent",async()=>{
  const w=workflow({draftMode:true,incompleteFor:[topicId,altA,altB,sameSource],alternatives:[altA,altB],sameEvent:{[altB]:[sameSource]}});
  await drain(w);
  assert.equal(w.run.status,"needs-review");
  assert.equal(w.contentCalls.length,3);
  assert.match(w.run.error ?? "",/None of the 3 stories tried could be prepared with complete content/);
  assert.equal(w.calls.includes("brief"),false);
});

test("an ineligible fallback is skipped without counting as an incomplete attempt",async()=>{
  const w=workflow({draftMode:true,incompleteFor:[topicId],notEligible:[sameSource],alternatives:[altA],sameEvent:{[topicId]:[sameSource]}});
  await drain(w);
  assert.equal(w.run.status,"completed");
  assert.equal(w.run.progress.storyId,altA);
  assert.deepEqual((w.run.progress.skippedStories as {reason:string}[]).map(s=>s.reason),["Incomplete article content (paywall or excerpt only)","Not eligible for approval"]);
});

test("with automatic approval the system approves an accepted script and finished images, and never publishes",async()=>{
  const w=workflow({draftMode:true,autoApprove:true,images:[
    [{id:"a1",unitOrder:1,status:"generating"},{id:"a2",unitOrder:2,status:"queued"}],
    [{id:"a1",unitOrder:1,status:"generated"},{id:"a2",unitOrder:2,status:"generated"}],
  ]});
  w.run.progress.targetStep="images";
  await drain(w);
  assert.equal(w.run.status,"completed");
  assert.deepEqual(w.calls.slice(-4),["auto-approve-draft","images","approve-image:a1","approve-image:a2"]);
  const audit=w.run.progress.autoApproved as {draftId?:string;assetIds?:string[]};
  assert.equal(audit.draftId,"draft");
  assert.deepEqual(Array.from(audit.assetIds ?? []),["a1","a2"]);
});

test("automatic approval never approves a script the automated review did not accept",async()=>{
  const w=workflow({draftMode:true,autoApprove:true,editorialReady:false});
  w.run.progress.targetStep="images";
  await drain(w);
  assert.equal(w.run.status,"needs-review");
  assert.equal(w.calls.includes("auto-approve-draft"),false);
  assert.equal(w.calls.includes("images"),false);
});

test("an ordinary approval refusal stops automatic approval with its reason",async()=>{
  const w=workflow({draftMode:true,autoApprove:true,failAutoApprove:true});
  w.run.progress.targetStep="images";
  await drain(w);
  assert.equal(w.run.status,"needs-review");
  assert.equal(w.run.step,"approve-draft");
  assert.match(w.run.error ?? "",/Automatic script approval stopped: Resolve the narrative blockers first/);
});

test("a failed or flagged image stops for a human instead of being approved",async()=>{
  for(const asset of [{id:"a1",unitOrder:1,status:"failed"},{id:"a1",unitOrder:1,status:"generated",safetyFlag:true}]) {
    const w=workflow({draftMode:true,autoApprove:true,images:[[asset,{id:"a2",unitOrder:2,status:"generated"}]]});
    w.run.progress.targetStep="images";
    await drain(w);
    assert.equal(w.run.status,"needs-review");
    assert.match(w.run.error ?? "",/image 1|Image 1/);
    assert.equal(w.calls.some(c=>c.startsWith("approve-image")),false);
  }
});

test("a resumed run never prepares a story that was published since; it moves to the next pick",async()=>{
  const w=workflow({draftMode:true,alternatives:[altA]});
  await drain(w);
  assert.equal(w.run.progress.storyId,topicId);
  // Days later the story is published, and the editor continues the same run.
  const again=workflow({draftMode:true,alternatives:[altA],published:[topicId]});
  Object.assign(again.run,{step:"brief",status:"running",progress:{...structuredClone(w.run.progress),completedStep:"focus",briefId:"old-brief"}});
  await drain(again);
  assert.equal(again.run.status,"completed");
  assert.equal(again.run.progress.storyId,altA);
  assert.notEqual(again.run.progress.briefId,"old-brief");
  assert.equal((again.run.progress.skippedStories as {reason:string}[])[0].reason,"Already published in this topic");
});

test("an older run with no fallbacks asks for a new run instead of preparing a published story",async()=>{
  const w=workflow({draftMode:true,published:[topicId]});
  Object.assign(w.run,{step:"brief",status:"running",progress:{...w.run.progress,storyId:topicId,storyTitle:"Story",completedStep:"focus"}});
  await drain(w);
  assert.equal(w.run.status,"needs-review");
  assert.match(w.run.error ?? "",/already published in this topic\. Start a new run/);
  assert.equal(w.calls.includes("brief"),false);
});

test("the run records a readable timeline, the selection's reason and the script at a glance",async()=>{
  const w=workflow({draftMode:true,alternatives:[altA]});
  await drain(w);
  const activity=Array.from(w.run.progress.activity as {text:string}[]).map(a=>a.text);
  assert.ok(activity.some(t=>/^Collected 4 stories from 1 source$/.test(t)),activity.join(" | "));
  assert.ok(activity.some(t=>/^Selected "Story" over 1 alternative$/.test(t)),activity.join(" | "));
  assert.ok(activity.some(t=>/^Article ready: 2 words$/.test(t)),activity.join(" | "));
  const selection=w.run.progress.selection as {reason:string;alternatives:string[]};
  assert.equal(selection.reason,"Best local fit");
  assert.deepEqual(Array.from(selection.alternatives),[`Alt ${altA}`]);
  assert.equal((w.run.progress.draftSummary as {format:string}).format,"carousel");
  assert.ok((w.run.progress.stepTimes as Record<string,string>).collect);
});
