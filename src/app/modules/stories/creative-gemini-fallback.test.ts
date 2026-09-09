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
    testGenerateJson:(input:unknown)=>Promise<{provider:string;usage:{totalTokens:number}}>;
    testBriefForPrompt:(input:unknown)=>{keyFacts:unknown;riskFlags:unknown;carouselPlan?:unknown;formatScores?:unknown};
  };
  const source=readFileSync(new URL("./gemini-creative-content-generator.ts",import.meta.url),"utf8")+"\nexports.testGenerateJson=generateJson; exports.testBriefForPrompt=briefForPrompt;";
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
  assert.equal(result.usage.totalTokens,30);
});
