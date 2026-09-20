import assert from "node:assert/strict";
import test from "node:test";
import {readFileSync} from "node:fs";
import {createRequire} from "node:module";
import vm from "node:vm";
import ts from "typescript";
const localRequire=createRequire(import.meta.url);
type Params={contents:string;config:{maxOutputTokens:number;httpOptions:{retryOptions:{attempts:number}};responseJsonSchema:{type:string}}};
function load(request:(key:string,params:Params)=>Promise<unknown>) {
  const calls:string[]=[];const logs:unknown[]=[];
  const exports={} as {
    generateCreativeBrief:(input:unknown)=>Promise<unknown>;
    testParseDraft:(...args:unknown[])=>{units:{headline:string}[]};
    testDraftSchema:(format:string)=>{properties:{units:{items:{properties:{headline:{minLength:number;pattern:string};subheadline:{minLength?:number}}}}}};
    testCompact:(input:unknown,limit:number)=>unknown;
    testSchema:(taxonomy:unknown)=>{properties:{editorialAngle:{properties:{taxonomyVersion:{enum:number[]};angle:{enum:string[]}}}}};
    testGenerateJson:(input:unknown)=>Promise<{provider:string;fallbackReason?:string;usage:{totalTokens:number}}>;
    testBriefForPrompt:(input:unknown)=>{keyFacts:unknown;riskFlags:unknown;carouselPlan?:unknown;formatScores?:unknown};
  };
  const source=readFileSync(new URL("./gemini-creative-content-generator.ts",import.meta.url),"utf8")+"\nexports.testGenerateJson=generateJson; exports.testBriefForPrompt=briefForPrompt; exports.testCompact=compactGroqContents; exports.testSchema=creativeBriefSchema; exports.testParseDraft=parseCreativeDraft; exports.testDraftSchema=creativeDraftSchema;";
  const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
  class ApiError extends Error {constructor(public status:number){super("HTTP error");}}
  vm.runInNewContext(code,{exports,AbortController,AbortSignal,Buffer,Date,Map,Set,JSON,setTimeout,clearTimeout,console:{info:(...a:unknown[])=>logs.push(a),warn:(...a:unknown[])=>logs.push(a),error:(...a:unknown[])=>logs.push(a)},require:(id:string)=>{
    if(id==="server-only"||id==="./openai-structured-response")return {};
    if(id==="@google/genai")return {ApiError,GoogleGenAI:class {models;constructor({apiKey}:{apiKey:string}){this.models={generateContent:async(params:Params)=>{calls.push(apiKey);return request(apiKey,params);}}}}};
    if(id==="groq-sdk")return class {chat={completions:{create:async()=>{calls.push("groq");return {choices:[{message:{content:"{}"}}],usage:{prompt_tokens:10,completion_tokens:5,total_tokens:15}};}}};};
    return localRequire(id);
  }});
  return {exports,calls,logs,ApiError};
}
const input={apiKey:"primary-secret",paidGeminiApiKey:"secondary-secret",primaryProvider:"google",model:"gemini-3.6-flash",groqApiKey:"groq-secret",groqModel:"test",systemInstruction:"write JSON",schema:{type:"object"},contents:{privateText:"never logged"},maxOutputTokens:4096};
test("Gemini recovers truncation before switching providers, preserving schema and input",async()=>{
  const budgets:number[]=[];
  const service=load(async(_,params)=>{
    budgets.push(params.config.maxOutputTokens);
    assert.equal(params.config.httpOptions.retryOptions.attempts,1);
    assert.equal(params.contents,JSON.stringify(input.contents));
    assert.equal(params.config.responseJsonSchema.type,"object");
    return {text:"{}",candidates:[{finishReason:budgets.length===1?"MAX_TOKENS":"STOP"}]};
  });
  const result=await service.exports.testGenerateJson(input);
  assert.equal(result.provider,"google");assert.deepEqual(budgets,[8192,16384]);
  assert.deepEqual(service.calls,["primary-secret","primary-secret"]);
  assert.ok(!JSON.stringify(service.logs).includes("secret"));
  assert.ok(!JSON.stringify(service.logs).includes("never logged"));
});
test("repeated truncation skips the identical secondary request and keeps fallback usage",async()=>{
  const service=load(async()=>({candidates:[{finishReason:"MAX_TOKENS"}],usageMetadata:{totalTokenCount:20}}));
  const result=await service.exports.testGenerateJson(input);
  assert.deepEqual(service.calls,["primary-secret","primary-secret","groq"]);
  assert.equal(result.provider,"groq");assert.equal(result.usage.totalTokens,55);
  assert.match(result.fallbackReason??"",/Gemini primary/);
  assert.ok(!result.fallbackReason?.includes("secret"));
  assert.ok(!result.fallbackReason?.includes("never logged"));
});
test("draft brief projection retains factual evidence but omits duplicate plan and scoring",()=>{
  const service=load(async()=>({}));
  const brief={keyFacts:[{id:"fact",sourceExcerpt:"exact unmodified source"}],carouselPlan:{slides:[]},formatScores:[1],confidence:0.9,riskFlags:["warning"]};
  const result=service.exports.testBriefForPrompt(brief);
  assert.equal(result.keyFacts,brief.keyFacts);assert.equal(result.riskFlags,brief.riskFlags);
  assert.equal(result.carouselPlan,undefined);assert.equal(result.formatScores,undefined);
});

test("quota failure can still use the secondary account with the larger budget",async()=>{
  const service=load(async(key,params)=>{
    assert.equal(params.config.maxOutputTokens,8192);
    if(key==="primary-secret")throw new service.ApiError(429);
    return {text:"{}",candidates:[{finishReason:"STOP"}],usageMetadata:{totalTokenCount:30}};
  });
  const result=await service.exports.testGenerateJson(input);
  assert.deepEqual(service.calls,["primary-secret","primary-secret","secondary-secret"]);
  assert.equal(result.provider,"google");
  assert.match(result.fallbackReason??"",/Gemini primary/);
  assert.equal(result.usage.totalTokens,30);
});


test("fallback compaction preserves exact evidence, complete taxonomy and retry feedback", () => {
  const service=load(async()=>({}));
  const protectedInput={story:{text:"Exact source.\n".repeat(70)},keyFacts:[{statement:"Qualified claim ".repeat(40),sourceExcerpt:"Verbatim quotation ".repeat(40)}],acquisitionTaxonomy:{taxonomyVersion:17,lenses:Array.from({length:12},(_,i)=>({key:`lens-${i}`}))},previousValidationError:"Correct the qualifier ".repeat(30)};
  const input={...protectedInput,description:"optional guidance ".repeat(300)};
  const result=service.exports.testCompact(input,6000) as typeof input;
  for(const key of Object.keys(protectedInput)) assert.equal(JSON.stringify(result[key as keyof typeof result]),JSON.stringify(input[key as keyof typeof input]));
  assert.ok(JSON.stringify(result).length<=6000);
  assert.equal(input.description.length,"optional guidance ".repeat(300).length);
  assert.throws(()=>service.exports.testCompact(input,500),/cannot fit the complete evidence/);
});

test("brief schema pins the Topic taxonomy version and enabled angle keys",()=>{
  const service=load(async()=>({}));
  const schema=service.exports.testSchema({taxonomyVersion:17,lenses:[{key:"enabled",enabled:true},{key:"disabled",enabled:false}]});
  const properties=schema.properties.editorialAngle.properties;
  assert.equal(JSON.stringify(properties.taxonomyVersion.enum),"[17]");
  assert.equal(JSON.stringify(properties.angle.enum),'["enabled"]');
});

test("validation retries resume Groq without retrying failed Gemini accounts",async()=>{
  const service=load(async()=>{throw new Error("Gemini must not run");});
  const result=await service.exports.testGenerateJson({...input,startAt:"groq"});
  assert.equal(result.provider,"groq");
  assert.deepEqual(service.calls,["groq"]);
});


test("brief validation retries do not restart the failed provider chain",async()=>{
  const service=load(async()=>{throw new service.ApiError(503);});
  await assert.rejects(service.exports.generateCreativeBrief({...input,
    story:{text:"Complete source evidence.",title:"Source"},topic:{name:"Topic"},
    profile:{framingStrategy:"auto",brandOverlay:{enabled:false}},
    acquisitionTaxonomy:{taxonomyVersion:17,lenses:[{key:"general",enabled:true,isFallback:true}]},
  }));
  assert.equal(service.calls.filter((key)=>key==="primary-secret").length,2);
  assert.equal(service.calls.filter((key)=>key==="secondary-secret").length,2);
  assert.equal(service.calls.filter((key)=>key==="groq").length,2);
});

test("long sources fit fallback budgets through exact complete sentences, preserving selected facts",()=>{
  const service=load(async()=>({}));
  const source="The report says some workers changed jobs. ".repeat(350);
  const input={story:{text:source,title:"Report"},keyFacts:[{id:"fact-1",statement:"Some workers changed jobs.",sourceExcerpt:"The report says some workers changed jobs."}]};
  for(const budget of [9000,7500,5000]) {
    const result=service.exports.testCompact(input,budget) as typeof input & {story:{evidenceScope:string}};
    assert.ok(JSON.stringify(result).length<=budget);
    assert.ok(result.story.text.length>0 && result.story.text.length<source.length);
    assert.ok(source.startsWith(result.story.text));
    assert.ok(result.story.text.endsWith("jobs."));
    assert.match(result.story.evidenceScope,/Partial source/);
    assert.equal(JSON.stringify(result.keyFacts),JSON.stringify(input.keyFacts));
  }
  assert.equal(input.story.text,source);
  assert.throws(()=>service.exports.testCompact({story:{text:"x".repeat(10000)}},7500),/cannot fit/);
});

test("missing optional protected fields remain serializable on fallback providers",()=>{
  const service=load(async()=>({}));
  const result=service.exports.testCompact({creativeBrief:{keyFacts:[],carouselPlan:undefined}},9000);
  assert.equal(JSON.stringify(result),'{"creativeBrief":{"keyFacts":[]}}');
});


test("missing initial headlines reach repair while strict editorial parsing still rejects them",()=>{
 const service=load(async()=>({}));
 const brief={keyFacts:[{id:"fact-1"}]};
 const draft={concept:"Employment",caption:"Some workers changed jobs.",altText:"Employment data",hashtags:[],units:[{role:"cover",body:"Some workers changed jobs.",visualDirection:"An employment chart",factIds:["fact-1"],assetRequest:"generated-image",characterIds:[]}]};
 for(const headline of [undefined,null,"","  "]) {
   const raw=JSON.stringify({...draft,units:[{...draft.units[0],headline}]});
   const args=[raw,"meme",brief,"4:5",[],undefined,false,true,"Test provider"];
   assert.equal(service.exports.testParseDraft(...args,true).units[0].headline,"");
   assert.throws(()=>service.exports.testParseDraft(...args),/headline on slide 1/);
 }
 assert.throws(()=>service.exports.testParseDraft(JSON.stringify({...draft,units:[{...draft.units[0],headline:{bad:true}}]}),"meme",brief,"4:5",[],undefined,false,true,"Test",true),/headline on slide 1/);
 const properties=service.exports.testDraftSchema("meme").properties.units.items.properties;
 assert.equal(properties.headline.minLength,1);
 assert.equal(new RegExp(properties.headline.pattern).test("   "),false);
 assert.equal(properties.subheadline.minLength,undefined);
});
