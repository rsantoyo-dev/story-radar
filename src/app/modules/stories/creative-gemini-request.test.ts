import assert from "node:assert/strict";
import test from "node:test";
import {geminiOutputBudget, requestCreativeGemini, GeminiOutputLimitError, GeminiDeadlineError} from "./creative-gemini-request";

const metadata={promptTokenCount: 100, candidatesTokenCount: 40, thoughtsTokenCount: 10, totalTokenCount: 150};
const options={model:"gemini-3.6-flash",requestedTokens:4096,isTransient:()=>false,log:()=>{}};
test("budgets grow by task size without assuming a custom model supports 24k",()=>{
  assert.equal(geminiOutputBudget(options.model,4096).initial,8192);
  assert.equal(geminiOutputBudget(options.model,6144).initial,12288);
  assert.equal(geminiOutputBudget(options.model,12288).initial,24576);
  assert.equal(geminiOutputBudget("custom-model",6144).initial,8192);
});
test("MAX_TOKENS retries once with more room, discards partial JSON and counts both attempts",async()=>{
  const budgets:number[]=[];
  const result=await requestCreativeGemini({...options,request:async budget=>{
    budgets.push(budget);
    return {text:budgets.length===1?'{"broken":':'{"ok":true}',candidates:[{finishReason:budgets.length===1?"MAX_TOKENS":"STOP"}],usageMetadata:metadata};
  }});
  assert.deepEqual(budgets,[8192,16384]);
  assert.equal(result.response.text,'{"ok":true}');
  assert.equal(result.usage.totalTokens,300);
  assert.equal(result.usage.thoughtsTokens,20);
});
test("persistent truncation stops at two attempts and retains consumed tokens",async()=>{
  let calls=0;
  await assert.rejects(requestCreativeGemini({...options,requestedTokens:6144,request:async budget=>{
    calls++; assert.ok(budget<=24576);
    return {candidates:[{finishReason:"MAX_TOKENS"}],usageMetadata:metadata};
  }}),e=>e instanceof GeminiOutputLimitError&&e.usage.totalTokens===300);
  assert.equal(calls,2);
});
test("successful responses and non-transient errors never get a speculative retry",async()=>{
  let calls=0;
  await requestCreativeGemini({...options,request:async()=>{calls++;return {text:"{}",candidates:[{finishReason:"STOP"}]};}});
  assert.equal(calls,1);
  const failure=new Error("bad schema");
  await assert.rejects(requestCreativeGemini({...options,request:async()=>{throw failure;}}),e=>e===failure);
});
test("one deadline aborts the active request and prevents another attempt",async()=>{
  let calls=0;let signal:AbortSignal|undefined;
  await assert.rejects(requestCreativeGemini({...options,timeoutMs:10,request:async(_,active)=>{
    calls++; signal=active; return new Promise(()=>{});
  }}),GeminiDeadlineError);
  assert.equal(signal?.aborted,true);
  assert.equal(calls,1);
});
