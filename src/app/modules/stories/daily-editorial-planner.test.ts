import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import ts from "typescript";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import * as schema from "@/db/schema";
import * as types from "./daily-editorial-planner.types";
import * as lines from "../editorial-lines/editorial-lines";

const id="11111111-1111-4111-8111-111111111111";
const other="22222222-2222-4222-8222-222222222222";
const requireLocal=createRequire(import.meta.url);
function load(file:string,mocks:Record<string,unknown>) {
  const exports:Record<string,(...args:unknown[])=>Promise<unknown>>={};
  const code=ts.transpileModule(readFileSync(new URL(file,import.meta.url),"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
  vm.runInNewContext(code,{exports,Date,Map,Set,JSON,console,setTimeout,clearTimeout,process:{env:{}},require:(name:string)=>name==="server-only"?{}:name in mocks?mocks[name]:requireLocal(name)});
  return exports;
}
const decision={outcome:"recommendation",recommendation:{storyId:id,reason:"Timely update"},alternatives:[],deferred:[],summary:"Today’s strongest relevant update",uncertainty:"No performance evidence available"};
test("planner rejects unknown/duplicate IDs and inconsistent no-candidate output",()=>{
  assert.equal(types.parseDailyPlan(JSON.stringify(decision),[{storyId:id}]).recommendation?.storyId,id);
  assert.throws(()=>types.parseDailyPlan(JSON.stringify(decision),[]));
  assert.throws(()=>types.parseDailyPlan(JSON.stringify({...decision,alternatives:[decision.recommendation]}),[{storyId:id}]));
  assert.throws(()=>types.parseDailyPlan(JSON.stringify({...decision,outcome:"no-strong-candidate"}),[{storyId:id}]));
  assert.equal(types.parseDailyPlan(JSON.stringify({...decision,outcome:"no-strong-candidate",recommendation:null}),[]).outcome,"no-strong-candidate");
});
test("planner day follows timezone across midnight and DST",()=>{
  assert.equal(types.plannerDay("America/Toronto",new Date("2026-09-14T02:00:00Z")).localDate,"2026-09-13");
  assert.equal(types.plannerDay("UTC",new Date("2026-09-14T02:00:00Z")).localDate,"2026-09-14");
  assert.equal(types.plannerDay("America/Toronto",new Date("2026-11-01T06:30:00Z")).weekday,"Sunday");
  assert.throws(()=>types.plannerDay("invalid-zone"));
});
test("history merges story, media and URL identities across platforms before taking ten",()=>{
  const base={storyId:id,title:"Story",caption:"",publishedAt:"2026-09-13T12:00:00.000Z",platform:"instagram",mediaId:null,url:null};
  const rows:types.PlannerPublication[]=[{...base,url:"https://instagram.com/p/one/"},{...base,storyId:null,mediaId:"media",url:"https://instagram.com/p/one/?x=1"},{...base,mediaId:"media",caption:"Actual published caption"},{...base,platform:"facebook"}];
  assert.equal(types.recentPlannerPublications(rows).length,1);
  assert.equal(types.recentPlannerPublications(rows)[0].caption,"Actual published caption");
  assert.equal(types.recentPlannerPublications(Array.from({length:15},(_,i)=>({...base,storyId:String(i)}))).length,10);
});
test("real SQL excludes all published/queued/rejected/duplicate stories, preserves owned guides and local edits",async()=>{
  const client=new PGlite();
  try {
    await client.exec(`
      CREATE TABLE topics(id uuid PRIMARY KEY);
      INSERT INTO topics VALUES('${id}'),('${other}');
      CREATE TABLE stories(id uuid PRIMARY KEY,title text,content_text text,canonical_url text,published_at timestamptz,last_seen_at timestamptz,tags text[]);
      CREATE TABLE topic_stories(topic_id uuid,story_id uuid,review_decision text,duplicate_of_story_id uuid,processing_status text);
      CREATE TABLE story_editorial_evaluations(id uuid,topic_id uuid,story_id uuid,editorial_priority int,editorial_score int,growth_score int,reason text,risk_flags text[],evaluated_at timestamptz,decision text);
      CREATE TABLE story_content_revisions(topic_id uuid,story_id uuid,title text,content text,revision int,created_at timestamptz);
      CREATE TABLE story_content_enrichments(story_id uuid,status text,content_text text);
      CREATE TABLE story_sources(story_id uuid,source_id text,source_name text,fetched_at timestamptz);
      CREATE TABLE topic_sources(topic_id uuid,rss_source_id uuid,tags text[]);
      CREATE TABLE editorial_story_contexts(topic_id uuid,story_id uuid,context jsonb,created_at timestamptz,run_id uuid);
      CREATE TABLE owned_content_entries(topic_id uuid,story_id uuid);
      CREATE TABLE story_social_publications(topic_id uuid,story_id uuid,status text,published_at timestamptz,updated_at timestamptz,platform text,note text,post_url text,scheduled_at timestamptz);
      CREATE TABLE instagram_publication_jobs(topic_id uuid,story_id uuid,status text,package_id uuid,finished_at timestamptz,updated_at timestamptz,published_media_id text,permalink text);
      CREATE TABLE instagram_publication_packages(id uuid,caption text);
      CREATE TABLE topic_instagram_media(topic_id uuid,ig_user_id text,linked_story_id uuid,caption text,published_at timestamptz,external_id text,permalink text);
      CREATE TABLE topic_meta_connections(topic_id uuid,ig_user_id text);
      INSERT INTO stories SELECT ('00000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,'Story '||i,'Text','https://example.org/'||i,'2026-09-12','2026-09-12',ARRAY[]::text[] FROM generate_series(1,20) i;
      INSERT INTO topic_stories SELECT '${id}',id,NULL,NULL,'ready' FROM stories;
      INSERT INTO story_editorial_evaluations SELECT id,'${id}',id,80,80,90,'Evidence',ARRAY[]::text[],'2026-09-12','shortlist' FROM stories;
      INSERT INTO story_social_publications SELECT '${id}',id,'published','2026-09-12','2026-09-12','facebook','','',NULL FROM stories WHERE title IN ('Story 1','Story 2');
      INSERT INTO instagram_publication_jobs SELECT '${id}',id,'pending-confirmation',NULL,NULL,now(),NULL,NULL FROM stories WHERE title='Story 3';
      UPDATE topic_stories SET review_decision='rejected' WHERE story_id=(SELECT id FROM stories WHERE title='Story 4');
      UPDATE topic_stories SET duplicate_of_story_id='${other}' WHERE story_id=(SELECT id FROM stories WHERE title='Story 5');
      UPDATE stories SET published_at='2025-01-01',last_seen_at='2025-01-01' WHERE title IN ('Story 6','Story 7');
      INSERT INTO owned_content_entries SELECT '${id}',id FROM stories WHERE title='Story 7';
      INSERT INTO story_content_revisions SELECT '${id}',id,'Edited title','Edited evidence',1,'2026-09-13' FROM stories WHERE title='Story 7';
      UPDATE stories SET published_at='2027-01-01' WHERE title='Story 8';
      INSERT INTO topic_meta_connections VALUES('${id}','current');
      INSERT INTO topic_instagram_media SELECT '${id}','current',id,'Published',now(),'9',NULL FROM stories WHERE title='Story 9';
      INSERT INTO topic_instagram_media SELECT '${id}','old-account',id,'Old post',now(),'10',NULL FROM stories WHERE title='Story 10';
    `);
    await client.exec(readFileSync(new URL("../../../../drizzle/0070_woozy_norman_osborn.sql",import.meta.url),"utf8"));
    const pg=drizzle(client);
    // PGlite adapter for Neon's transaction batch contract.
    const db=Object.assign(pg,{batch:async(queries:Promise<unknown>[])=>{const results=[];for(const q of queries)results.push(await q);return results;}});
    const repository=load("./daily-editorial-planner.repository.ts",{"@/db/client":{db},"@/db/schema":schema,"../editorial-lines/editorial-lines":lines,"./daily-editorial-planner.types":types});
    const inputs=await repository.plannerInputs(id,{updatedAt:new Date("2026-01-01"),freshness:{newsMaxAgeHours:72,researchMaxAgeHours:240}},new Date("2026-09-13")) as types.PlannerContext;
    assert.equal(inputs.candidates.length,12);
    assert.ok(inputs.candidates.some(c=>c.title==="Story 10"));
    assert.equal(inputs.candidates.find(c=>c.title==="Edited title")?.contentPreview,"Edited evidence");
    assert.equal(inputs.recentPublications.length,3);
    assert.equal(inputs.commitments[0].status,"pending-confirmation");
    const context={...inputs,localDate:"2026-09-13",timezone:"UTC",weekday:"Sunday",topic:{name:"Test"},profile:{},preferences:{}};
    const runId=await repository.reserveDailyPlan(id,"hash",context,false,2) as string;
    assert.ok(runId);
    assert.equal(await repository.reserveDailyPlan(id,"hash",context,true,2),undefined);
    await repository.finishDailyPlan(id,runId,{status:"completed",result:decision});
    assert.equal(await repository.reserveDailyPlan(id,"hash",context,false,2),undefined);
    const second=await repository.reserveDailyPlan(id,"changed",context,false,2) as string;
    assert.ok(second);
    await repository.finishDailyPlan(id,second,{status:"failed"});
    assert.equal(await repository.reserveDailyPlan(id,"third",context,true,2),undefined);
    assert.equal(await repository.cachedDailyPlan(other,"hash"),undefined);
  } finally {await client.close();}
});
test("planner uses configured Gemini schema and rejects bad IDs before Groq fallback; normal evaluations remain separate",async()=>{
  let geminiCalls=0,groqCalls=0;
  const provider=load("./gemini-story-editorial-evaluator.ts",{
    "./daily-editorial-planner.types":types,
    "@google/genai":{ApiError:class extends Error {},GoogleGenAI:class { models={generateContent:async(input:{contents:string;config:{systemInstruction:string;responseJsonSchema:unknown}})=>{
      geminiCalls++;
      assert.match(input.config.systemInstruction,/daily editorial planner/);
      assert.equal(JSON.parse(input.contents).localDate,"2026-09-13");
      assert.equal(input.config.responseJsonSchema,types.PLANNER_SCHEMA);
      return {text:JSON.stringify({...decision,recommendation:{storyId:other,reason:"unknown"}})};
    }};}},
    "groq-sdk":class {chat={completions:{create:async(input:{messages:{content:string}[]})=>{
      groqCalls++;assert.match(input.messages[0].content,/daily editorial planner/);
      return {choices:[{message:{content:JSON.stringify(decision)}}],usage:{total_tokens:42}};
    }}};},
  });
  const options={apiKey:"test",model:"configured-model",topic:{name:"Test"},candidates:[],preferences:{favoredTerms:[],unfavoredTerms:[]}};
  const empty=await provider.evaluateStoriesWithGemini(options) as {evaluations:unknown[];dailyPlan?:unknown};
  assert.equal(empty.evaluations.length,0);assert.equal(empty.dailyPlan,undefined);assert.equal(geminiCalls,0);
  const result=await provider.evaluateStoriesWithFallback({...options,groqApiKey:"test",groqModel:"configured-fallback",planningContext:{localDate:"2026-09-13",candidates:[{storyId:id}]}}) as {provider:string;model:string;dailyPlan:types.DailyPlan;evaluations:unknown[]};
  assert.equal(result.provider,"groq");assert.equal(result.model,"configured-fallback");
  assert.equal(result.dailyPlan.recommendation?.storyId,id);assert.equal(result.evaluations.length,0);
  assert.equal(geminiCalls,1);assert.equal(groqCalls,1);
});
test("planner service rechecks publication changes after generation without persisting evaluations",async()=>{
  let reads=0,providerCalls=0;
  let stored:Record<string,unknown>|undefined;
  const contextInputs={candidates:[{storyId:id,title:"Story"}],recentPublications:[],commitments:[]};
  const service=load("./daily-editorial-planner.ts",{
    "../topics/topic-context":{requireTopic:async()=>({name:"Topic",description:"Audience"})},
    "./editorial-profile.repository":{getEditorialProfile:async()=>({updatedAt:new Date("2026-01-01"),audience:"Readers"})},
    "./story-preferences.repository":{getStoryKeywordPreferences:async()=>({favoredTerms:[],unfavoredTerms:[]})},
    "./editorial-evaluation.config":{getEditorialEvaluationPublicConfig:()=>({model:"configured"}),getEditorialEvaluationRuntimeConfig:()=>({apiKey:"private",model:"configured",maxRunsPerDay:6})},
    "./gemini-story-editorial-evaluator":{evaluateStoriesWithFallback:async(options:{candidates:unknown[];planningContext:unknown})=>{providerCalls++;assert.equal(options.candidates.length,0);return {dailyPlan:decision,provider:"google",model:"configured",usage:{totalTokens:9}};}},
    "./daily-editorial-planner.types":types,
    "./daily-editorial-planner.repository":{
      plannerInputs:async()=>{reads++;return reads===1?contextInputs:{...contextInputs,candidates:[]};},
      cachedDailyPlan:async()=>undefined,
      latestDailyPlan:async()=>stored,
      reserveDailyPlan:async(topicId:string,inputHash:string,context:unknown)=>{stored={id:other,topicId,inputHash,context,status:"running",startedAt:new Date(),error:null};assert.doesNotMatch(JSON.stringify(context),/private/);return other;},
      finishDailyPlan:async(_topicId:string,_id:string,values:Record<string,unknown>)=>{stored={...stored,...values};},
    },
  });
  const view=await service.recommendForToday(id,"UTC",false) as types.PlannerView;
  assert.equal(providerCalls,1);assert.equal(view.stale,true);assert.equal(view.saved?.result?.recommendation?.storyId,id);
  assert.equal(view.context.candidates.length,0);
});
