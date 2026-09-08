import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import {createElement} from "react";
import {renderToStaticMarkup} from "react-dom/server";
import ts from "typescript";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import * as schema from "../../../db/schema";
import * as lines from "../editorial-lines/editorial-lines";
const requireLocal=createRequire(import.meta.url);
const config:lines.EditorialLineConfig={name:"Integration",objective:"Loneliness among immigrants",themes:["belonging"],mode:"context",timezone:"America/Toronto",period:{kind:"relative",hours:8760},sourceMode:"inherit",sourceIds:[],excludedSourceIds:[],domains:[],researchEnabled:true};
const line:lines.EditorialLine={...config,id:"00000000-0000-4000-8000-000000000011",topicId:"00000000-0000-4000-8000-000000000001",revision:1,archived:false};
const now=new Date("2026-09-08T12:00:00Z");
test("line windows preserve news freshness and admit older context without inventing unknown dates",()=>{
  const study=new Date("2026-02-01T00:00:00Z");
  const news=lines.collectionContext({...line,mode:"news",period:{kind:"relative",hours:72}},[],"",undefined,now);
  const context=lines.collectionContext(line,[],"Loneliness",undefined,now);
  assert.equal(lines.inEditorialWindow(study,news),false);
  assert.equal(lines.inEditorialEvaluationWindow(now,news,new Date("2026-09-15")),false);assert.equal(lines.inEditorialWindow(study,context),true);
  assert.equal(lines.inEditorialWindow(undefined,context),false);
  assert.equal(lines.inEditorialWindow(undefined,lines.collectionContext(line,[],"",{kind:"any"},now)),true);
  assert.equal(lines.inEditorialWindow(new Date("2027-01-01"),context),false);
  assert.equal(line.period.kind,"relative");assert.equal(context.query,"Loneliness");
});
test("source inheritance cannot enable disabled sources, cross-brand IDs or excluded domains",()=>{
  const sources=[{id:"a",enabled:true},{id:"b",enabled:false},{id:"c",enabled:true}];
  assert.deepEqual(lines.collectionContext({...line,excludedSourceIds:["c"],sourceIds:["b","other-brand"]},sources).sourceIds,["a"]);
  assert.deepEqual(lines.collectionContext({...line,sourceMode:"selected",sourceIds:["b","c"]},sources).sourceIds,["c"]);
  assert.equal(lines.allowedEditorialUrl("https://sub.example.org/article",["example.org"]),true);
  assert.equal(lines.allowedEditorialUrl("https://example.org.evil.test/article",["example.org"]),false);
  assert.throws(()=>lines.parseLineConfig({...config,timezone:"not-a-zone"}));
  assert.throws(()=>lines.parsePeriod({kind:"range",from:"2026-02-01",to:"2026-03-01"}));
  assert.throws(()=>lines.collectionContext({...line,archived:true},sources));
  const range=lines.parsePeriod({kind:"range",from:"2026-02-01T00:00:00-05:00",to:"2026-03-01T00:00:00-05:00"});
  assert.equal(range.kind==="range"&&range.from,"2026-02-01T05:00:00.000Z");
});
function load<T>(path:string,deps:Record<string,unknown>):T{
  const code=ts.transpileModule(readFileSync(path,"utf8"),{fileName:path,compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
  const exports={};vm.runInNewContext(code,{exports,Date,Map,Set,JSON,URL,Buffer,process:{env:{COLLECTION_MAX_RUNS_PER_DAY:"2"}},require:(id:string)=>id==="server-only"?{}:id in deps?deps[id]:requireLocal(id)});return exports as T;
}
test("new line schema and repository preserve revisions, isolate brands and reserve an idempotent shared quota",async()=>{
  const client=new PGlite();try{
    await client.exec(`CREATE TABLE topics(id uuid PRIMARY KEY);CREATE TABLE topic_stories(topic_id uuid,story_id uuid,PRIMARY KEY(topic_id,story_id));INSERT INTO topics VALUES ('${line.topicId}'),('00000000-0000-4000-8000-000000000002');`);
    await client.exec(readFileSync("drizzle/0055_lonely_sphinx.sql","utf8"));
    const database=drizzle(client);const db=Object.assign(database,{batch:async(queries:PromiseLike<unknown>[])=>{await client.exec("BEGIN");try{const results=[];for(const query of queries)results.push(await query);await client.exec("COMMIT");return results;}catch(e){await client.exec("ROLLBACK");throw e;}}});
    const repo=load<typeof import("../editorial-lines/editorial-lines.repository")>("src/app/modules/editorial-lines/editorial-lines.repository.ts",{"@/db/client":{db},"@/db/schema":schema,"./editorial-lines":lines,"../topics/topic-catalog.repository":{listTopicRssSourceConfigs:async()=>[]},"../sources/ai-research/ai-research.repository":{getAiResearchSourceConfig:async()=>brandResearch}});
    const saved=await repo.saveEditorialLine(line.topicId,{config});
    const updated=await repo.saveEditorialLine(line.topicId,{id:saved.id,revision:1,config:{...config,name:"Wellbeing"}});
    assert.equal(updated.revision,2);
    await assert.rejects(repo.saveEditorialLine(line.topicId,{id:saved.id,revision:1,config}),/changed/);
    await assert.rejects(repo.getEditorialLine("00000000-0000-4000-8000-000000000002",saved.id),/not found/);
    assert.equal((await client.query<{count:number}>("select count(*)::int as count from editorial_line_revisions")).rows[0].count,2);
    const defaultLine=await repo.ensureDefaultEditorialLine(line.topicId);
    assert.equal(defaultLine.name,"Actualidad");
    assert.equal(defaultLine.isDefault,true);
    assert.deepEqual(defaultLine.period,{kind:"relative",hours:72});
    assert.equal((await repo.listEditorialLines(line.topicId)).length,2);
    assert.equal((await repo.ensureDefaultEditorialLine(line.topicId)).id,defaultLine.id);
    const editedDefault=await repo.saveEditorialLine(line.topicId,{id:defaultLine.id,revision:1,config:{...defaultLine,name:"News",period:{kind:"relative",hours:24}}});
    assert.equal((await repo.ensureDefaultEditorialLine(line.topicId)).name,"News");
    await assert.rejects(repo.saveEditorialLine(line.topicId,{id:defaultLine.id,revision:editedDefault.revision,config:editedDefault,archived:true}),/cannot be archived/);
    const otherBrand=await repo.ensureDefaultEditorialLine("00000000-0000-4000-8000-000000000002");
    assert.notEqual(otherBrand.id,defaultLine.id);
    assert.equal((await repo.listEditorialLines(otherBrand.topicId)).length,1);
    const context=lines.collectionContext(updated,[],"",undefined,now);
    const first="00000000-0000-4000-8000-000000000101",second="00000000-0000-4000-8000-000000000102",third="00000000-0000-4000-8000-000000000103";
    await repo.reserveCollection(line.topicId,first,context);await repo.finishCollection(line.topicId,first,{ok:true});
    assert.deepEqual((await repo.reserveCollection(line.topicId,first,{...context,to:new Date().toISOString()})).cached,{ok:true});
    await repo.reserveCollection(line.topicId,second);await repo.finishCollection(line.topicId,second,undefined,"provider failure");
    await assert.rejects(repo.reserveCollection(line.topicId,third,context),/budget/);
    const story="00000000-0000-4000-8000-000000000201";
    await client.exec(`INSERT INTO topic_stories VALUES ('${line.topicId}','${story}')`);
    await repo.attachStoryContext(line.topicId,story,first,context,["Relevant study"]);await repo.attachStoryContext(line.topicId,story,first,context,["Retry"]);
    assert.equal((await repo.storyCollectionContexts(line.topicId,story)).length,1);
    await assert.rejects(repo.attachStoryContext("00000000-0000-4000-8000-000000000002",story,first,context,[]));
    await repo.saveEditorialLine(line.topicId,{id:saved.id,revision:2,config,archived:true});
    assert.equal((await repo.storyCollectionContexts(line.topicId,story)).length,1);
  }finally{await client.close();}
});

test("actual research collector applies a line window after discovery and retains unknown dates only for undated context",async()=>{
  const collector=load<typeof import("../sources/ai-research/collect-ai-research-candidates")>("src/app/modules/sources/ai-research/collect-ai-research-candidates.ts",{
    "../../editorial-lines/editorial-lines":lines,
    "@/app/modules/stories/deduplicate-story-candidates":requireLocal("./deduplicate-story-candidates"),
    "@/app/modules/stories/deduplicate-similar-stories":requireLocal("./deduplicate-similar-stories"),
    "./openai-ai-research":{},
  });
  const base={topicId:line.topicId,topicName:"Brand",enabled:true,instruction:"",orientation:"informative" as const,resultLimit:10,lookbackHours:72,language:"es",region:"Canada",includeContent:true,priority:50,updatedAt:now};
  const discovery={title:"Immigrant loneliness study",url:"https://example.org/study",publishedAt:new Date("2026-02-01"),summary:"A study examines social connection.",researchScore:90,scoreReasons:["Study directly addresses the research objective"]};
  const options={config:base,profile:{} as import("./editorial-profile.types").EditorialProfile,now,discover:async()=>[discovery]};
  assert.equal((await collector.collectAiResearchCandidates(options)).items.length,0);
  const context=lines.collectionContext(line,[],"Loneliness",undefined,now);
  const results=await collector.collectAiResearchCandidates({...options,config:{...base,collectionContext:context}});
  assert.equal(results.items.length,1);assert.equal(results.items[0].publishedAt?.toISOString(),"2026-02-01T00:00:00.000Z");
  const missingDate={...options,discover:async()=>[{...discovery,publishedAt:undefined}]};
  assert.equal((await collector.collectAiResearchCandidates({...missingDate,config:{...base,collectionContext:context}})).items.length,0);
  assert.equal((await collector.collectAiResearchCandidates({...missingDate,config:{...base,collectionContext:{...context,from:null,period:{kind:"any"}}}})).items[0].publishedAt,undefined);
  assert.equal((await collector.collectAiResearchCandidates({...options,config:{...base,collectionContext:{...context,domains:["another.org"]}}})).items.length,0);
});

const brandResearch: import("../sources/ai-research/ai-research.types").AiResearchSourceConfig={
  topicId:line.topicId,topicName:"Canada en claro",enabled:false,instruction:"Brand news",
  orientation:"informative",resultLimit:3,lookbackHours:72,language:"es",region:"Canada",
  includeContent:true,priority:60,updatedAt:now
};
test("legacy research inheritance follows brand settings and explicit off stays off",()=>{
  const context=lines.collectionContext(line,[],"",undefined,now);
  assert.deepEqual(lines.parseLineConfig(config).research,{mode:"inherit"});
  assert.deepEqual(lines.parseLineConfig({...config,researchEnabled:false}).research,{mode:"disabled"});
  assert.equal(lines.resolveLineResearch(brandResearch,line,context).enabled,false);
  const enabled={...brandResearch,enabled:true};
  assert.equal(lines.resolveLineResearch(enabled,line,context).enabled,true);
  assert.equal(lines.resolveLineResearch(enabled,{...line,researchEnabled:false},context).enabled,false);
  assert.equal(lines.resolveLineResearch(enabled,{...line,research:{mode:"disabled"}},context).enabled,false);
  assert.equal(lines.resolveLineResearch({...enabled,language:"fr"},line,context).language,"fr");
});
test("custom line research runs independently with no feeds and snapshots effective settings",()=>{
  const custom:lines.EditorialLine={...line,sourceMode:"selected",period:{kind:"any"},
    research:{...lines.researchSettings(brandResearch),mode:"custom",instruction:"Find studies about loneliness",resultLimit:7,language:"fr",region:"Quebec"}};
  const context=lines.collectionContext(custom,[{id:"unused",enabled:true}],"Recent immigrants",undefined,now);
  assert.deepEqual(context.sourceIds,[]);
  const effective=lines.resolveLineResearch(brandResearch,custom,context);
  assert.equal(effective.enabled,true);
  assert.equal(effective.topicId,brandResearch.topicId);
  assert.equal(effective.language,"fr");
  assert.equal(effective.resultLimit,7);
  assert.equal(effective.collectionContext?.from,null);
  assert.deepEqual(effective.collectionContext?.period,{kind:"any"});
  assert.equal(effective.collectionContext?.research?.instruction,"Find studies about loneliness");
  assert.equal(effective.instruction.split("Recent immigrants").length,2);
  assert.equal(brandResearch.instruction,"Brand news");
  assert.equal(context.research,undefined);
  const changed=lines.resolveLineResearch({...brandResearch,language:"en",instruction:"Changed"},custom,context);
  assert.equal(changed.instruction,effective.instruction);
  assert.equal(changed.language,"fr");
  assert.deepEqual(Object.keys(lines.researchSettings({...brandResearch})).sort(),
    ["includeContent","instruction","language","orientation","priority","region","resultLimit"].sort());
});
test("custom research settings reject invalid options before persistence",()=>{
  const research={...lines.researchSettings(brandResearch),mode:"custom"};
  assert.equal(lines.parseLineConfig({...config,research}).research?.mode,"custom");
  for(const patch of [{resultLimit:0},{resultLimit:11},{priority:101},{orientation:"invented"},{instruction:""},
    {instruction:"x".repeat(2001)},{language:"x".repeat(33)},{includeContent:"true"},{mode:"unknown"}]){
    assert.throws(()=>lines.parseLineConfig({...config,research:{...research,...patch}}),lines.EditorialLineError);
  }
});

test("Collection only selects a saved line while Topics owns configuration",()=>{
  const {EditorialLinesPanel}=load<{EditorialLinesPanel:(props:{topicId:string;secret:string;manageOnly?:boolean})=>import("react").ReactElement}>(
    "src/app/editorial-lines-panel.tsx",{"./radar-dashboard.generated.module.css":{}});
  const collection=renderToStaticMarkup(createElement(EditorialLinesPanel,{topicId:line.topicId,secret:""}));
  assert.match(collection,/Choose an editorial line/);
  assert.doesNotMatch(collection,/Existing brand collection/);
  assert.doesNotMatch(collection,/Manage editorial lines|Save line|Search instruction|Period for this collection only/);
  assert.match(collection,/#configuration/);
  const management=renderToStaticMarkup(createElement(EditorialLinesPanel,{topicId:line.topicId,secret:"",manageOnly:true}));
  assert.match(management,/Manage editorial lines/);
  assert.match(management,/Custom AI search for this line/);
  assert.match(management,/Save line/);
  assert.doesNotMatch(management,/Existing brand collection|Research today/);
});

test("brief context hashing survives actual JSONB storage without invalidating legacy briefs",async()=>{
  const client=new PGlite();
  try{
    const context={...lines.collectionContext(line,[],"Employment",undefined,now),research:{...lines.researchSettings(brandResearch),enabled:true}};
    const stored=(await client.query<{context:lines.EditorialCollectionContext}>("SELECT $1::jsonb AS context",[JSON.stringify(context)])).rows[0].context;
    const original={...stored,runId:"00000000-0000-4000-8000-000000000777"};
    const reloaded=(await client.query<{context:typeof original}>("SELECT $1::jsonb AS context",[JSON.stringify(original)])).rows[0].context;
    assert.notEqual(JSON.stringify(original),JSON.stringify(reloaded));
    assert.equal(JSON.stringify(lines.collectionContextForHash(reloaded)),JSON.stringify(original));
    assert.equal(JSON.stringify(lines.collectionContextForHash(original)),JSON.stringify(original));
    const normalized=lines.collectionContextForHash({...reloaded,themes:["second","first"]});
    assert.deepEqual(normalized.themes,["second","first"]);
    assert.notEqual(JSON.stringify(lines.collectionContextForHash({...reloaded,query:"Housing"})),JSON.stringify(original));
  }finally{await client.close();}
});
