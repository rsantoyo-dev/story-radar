import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import * as errors from "./creative-run-errors";
import type { CreativeDraft } from "./creative-content.types";
const code=ts.transpileModule(readFileSync(new URL('./manage-creative-content.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
function harness(completed=false){
 const events:string[]=[];
 const current={id:'draft',briefId:'brief',storyId:'story',version:1,status:'draft',format:'carousel',outputAspectRatio:'4:5',units:[{id:'stable-slide',order:1,headline:'old',storyReferences:[{photoId:'photo'}],brandReferenceSelection:{mode:'none'}}]} as unknown as CreativeDraft;
 const job={id:'request',draft_id:'draft',status:completed?'completed':'ready',lease_token:'lease',result:{stage:'reviewed',draft:{concept:'saved',caption:'caption',altText:'alt',hashtags:[],units:[{order:1,headline:'repaired',factIds:['fact-1']}]},usage:{}}};
 const mocks:Record<string,unknown>={
  './creative-run-errors':errors,
  '@/app/modules/topics/topic-context':{requireTopic:async()=>({id:'topic'})},
  './creative-content.config':{getCreativeContentRuntimeConfig:()=>({})},
  './creative-characters.repository':{listCreativeCharacterRoster:async()=>[],snapshotsForCreativeCharacterIds:async()=>[]},
  './creative-content.repository':{
   findCreativeDraftById:async()=>current,findCreativeBriefById:async()=>({}),
   replaceCreativeDraft:async(_topic:unknown,baseline:CreativeDraft,generated:CreativeDraft)=>{events.push('persist');assert.equal(baseline.version,1);return {...current,...generated,version:2};},
  },
  './creative-recovery.repository':{getRecovery:async()=>job,claimRecovery:async()=>job,finishRecovery:async()=>events.push('finish')},
  './creative-text-accounting.repository':{recordTextOutcome:async()=>events.push('outcome')},
  './creative-text-meter':{withCreativeTextBudget:()=>assert.fail('Reviewed checkpoints must not make model calls')},
  './gemini-creative-content-generator':{recoverCreativeDraft:()=>assert.fail('Reviewed checkpoints must not regenerate')},
 };
 const exports={} as typeof import('./manage-creative-content');
 vm.runInNewContext(code,{exports,Date,Error,console,require:(name:string)=>mocks[name]??{}});
 return {api:exports,events,current};
}
test('a reviewed recovery persists without AI and preserves slide identity and references',async()=>{
 const {api,events,current}=harness();
 const result=await api.recoverSavedCreativeDraft('topic','draft',1,'request');
 assert.equal(result.units[0].headline,'repaired');assert.equal(result.units[0].id,current.units[0].id);
 assert.deepEqual(result.units[0].storyReferences,current.units[0].storyReferences);
 assert.equal(result.status,'draft','human approval is still required');assert.equal(result.recoveryId,'request');
 assert.deepEqual(events,['persist','outcome','finish']);
});
test('replaying a completed recovery never persists or pays again',async()=>{
 const {api,events,current}=harness(true);
 assert.equal(await api.recoverSavedCreativeDraft('topic','draft',1,'request'),current);
 assert.deepEqual(events,['outcome','finish']);
});
test('a version conflict rejects recovery before any provider or persistence call',async()=>{
 const {api,events}=harness();
 await assert.rejects(api.recoverSavedCreativeDraft('topic','draft',2,'request'),errors.CreativeContentConflictError);
 assert.deepEqual(events,[]);
});
