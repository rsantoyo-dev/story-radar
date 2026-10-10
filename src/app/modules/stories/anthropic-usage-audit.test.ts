import * as textMeter from "./creative-text-meter";
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import * as crypto from "node:crypto";
import vm from "node:vm";
import ts from "typescript";

const compiled = ts.transpileModule(readFileSync(new URL("./anthropic-structured-response.ts", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

type Result = { text: string; usage: { promptTokens: number; outputTokens: number; totalTokens: number }; cachedInputTokens?: number; stopReason?: string };
type Exports = {
  generateAnthropicStructuredResponse: (input: unknown) => Promise<Result>;
  anthropicSchema: (schema: unknown) => unknown;
};
type FetchCall = { url: string; init: { headers: Record<string, string>; body: string } };

const answer = { facts: [{ id: "f1", text: "private generated fact" }] };
const successBody = JSON.stringify({
  id: "msg_test", type: "message", role: "assistant", model: "claude-sonnet-5-5",
  content: [{ type: "thinking", thinking: "private reasoning", signature: "sig" }, { type: "text", text: JSON.stringify(answer) }],
  stop_reason: "end_turn",
  usage: { input_tokens: 80, output_tokens: 60, cache_creation_input_tokens: 0, cache_read_input_tokens: 20 },
});
const errorBody = JSON.stringify({ type: "error", error: { type: "rate_limit_error", message: "private rate limit detail" } });
const schema = {
  type: "object",
  properties: { facts: { type: "array", minItems: 1, maxItems: 24, items: { type: "object", properties: { id: { type: "string", maxLength: 24 }, minimum: { type: "integer" }, importance: { type: "integer", minimum: 1, maximum: 100 } }, required: ["id", "minimum", "importance"], additionalProperties: false } } },
  required: ["facts"], additionalProperties: false,
};

function load(fetchImpl: (url: string, init: FetchCall["init"]) => Promise<unknown>, logs: Record<string, unknown>[]) {
  const exports = {} as Exports;
  vm.runInNewContext(compiled, {
    exports, Date, Error, AbortController, setTimeout, clearTimeout,
    console: { info: (_label: string, json: string) => logs.push(JSON.parse(json)) },
    require: (name: string) => name === "node:crypto" ? crypto : name === "./creative-text-meter" ? textMeter : {},
    fetch: fetchImpl,
  });
  return exports;
}

const request = (extra: Record<string, unknown> = {}) => ({
  apiKey: "private-api-key", model: "claude-sonnet-5-5", instructions: "private instructions",
  auditContext: { runId: "run-test", topicId: "topic-test", storyId: "story-test" },
  contents: { story: "private evidence" }, schema, schemaName: "draft2_facts", maxOutputTokens: 4096, selfMetered: true, retryDelayMs: 0, ...extra,
});
const response = (status: number, body: string) => ({ ok: status < 400, status, headers: { get: () => "request-test" }, text: async () => body });

test("Claude receipts identify charges and uncertain requests without exposing content or credentials", async () => {
  for (const outcome of ["success", "transport", "invalid", "http"] as const) {
    const logs: Record<string, unknown>[] = [];
    const exports = load(async () => {
      if (outcome === "transport") throw new Error("private transport context");
      if (outcome === "invalid") return response(200, "private invalid output");
      return outcome === "http" ? response(429, errorBody) : response(200, successBody);
    }, logs);
    const call = exports.generateAnthropicStructuredResponse(request({ attempts: 1 }));
    if (outcome === "success") await call;
    else await assert.rejects(call);
    assert.equal(logs.length, 2, outcome);
    assert.equal(logs[0].event, "started");
    assert.equal(logs[0].auditId, logs[1].auditId);
    assert.equal(logs[1].model, "claude-sonnet-5-5");
    assert.deepEqual(logs[1].context, { runId: "run-test", topicId: "topic-test", storyId: "story-test" });
    assert.equal(logs[1].operation, "draft2_facts");
    assert.ok(!JSON.stringify(logs).includes("private"), outcome);
    if (outcome === "success" || outcome === "http") {
      assert.equal(logs[1].requestId, "request-test");
      assert.equal(logs[1].httpStatus, outcome === "http" ? 429 : 200);
    } else assert.equal(logs[1].usageKnown, false);
    if (outcome === "success") {
      assert.equal(logs[1].cachedInputTokens, 20);
      assert.equal((logs[1].usage as { promptTokens: number }).promptTokens, 100, "cache reads count inside the prompt");
      assert.equal(logs[1].stopReason, "end_turn");
    }
  }
});

test("the request asks for JSON output under the schema the API accepts, keeps the history cached and converts images", async () => {
  const calls: FetchCall[] = [];
  const exports = load(async (url, init) => { calls.push({ url, init }); return response(200, successBody); }, []);
  const result = await exports.generateAnthropicStructuredResponse(request({
    effort: "high",
    images: ["data:image/png;base64,QUJD", "https://example.com/cover.jpg"],
    history: [{ role: "user", text: "private article turn" }, { role: "assistant", text: "{\"verdict\":\"revise\"}" }],
  }));
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://api.anthropic.com/v1/messages");
  assert.equal(calls[0].init.headers["x-api-key"], "private-api-key");
  assert.equal(calls[0].init.headers["anthropic-version"], "2023-06-01");
  const body = JSON.parse(calls[0].init.body);
  assert.equal(body.model, "claude-sonnet-5-5");
  assert.equal(body.max_tokens, 4096);
  assert.equal(body.system, "private instructions");
  assert.equal(body.tools, undefined, "no forced tool: Sonnet 5.5 rejects tool_choice");
  assert.equal(body.tool_choice, undefined);
  assert.equal(body.output_config.effort, "high");
  assert.equal(body.output_config.format.type, "json_schema");
  const sent = body.output_config.format.schema;
  assert.equal(sent.properties.facts.minItems, 1);
  assert.equal(sent.properties.facts.maxItems, undefined, "array size constraints are stripped");
  const item = sent.properties.facts.items.properties;
  assert.deepEqual(item.importance, { type: "integer" }, "numeric constraints are stripped");
  assert.deepEqual(item.id, { type: "string" }, "length constraints are stripped");
  assert.deepEqual(item.minimum, { type: "integer" }, "a field that happens to be named like a keyword survives");
  assert.deepEqual(body.messages.map((message: { role: string }) => message.role), ["user", "assistant", "user"]);
  assert.deepEqual(body.messages[0].content[0].cache_control, { type: "ephemeral" }, "the first history turn is cached");
  assert.equal(body.messages[1].content[0].cache_control, undefined);
  assert.deepEqual(body.messages[2].content, [
    { type: "text", text: JSON.stringify({ story: "private evidence" }) },
    { type: "image", source: { type: "base64", media_type: "image/png", data: "QUJD" } },
    { type: "image", source: { type: "url", url: "https://example.com/cover.jpg" } },
  ]);
  assert.equal(result.text, JSON.stringify(answer), "thinking blocks never reach the output");
  // The result is built inside the vm realm: compare values, not prototypes.
  assert.equal(JSON.stringify(result.usage), JSON.stringify({ promptTokens: 100, outputTokens: 60, thoughtsTokens: 0, totalTokens: 160 }));
  assert.equal(result.cachedInputTokens, 20);
  assert.equal(result.stopReason, "end_turn");
});

test("a step's stable context is its own cached block before the contents, and cache writes are reported apart from reads", async () => {
  const calls: FetchCall[] = [];
  const logs: Record<string, unknown>[] = [];
  const written = JSON.stringify({ ...JSON.parse(successBody), usage: { input_tokens: 40, output_tokens: 60, cache_creation_input_tokens: 1200, cache_read_input_tokens: 0 } });
  const exports = load(async (url, init) => { calls.push({ url, init }); return response(200, written); }, logs);
  const result = await exports.generateAnthropicStructuredResponse(request({ context: { verifiedFacts: ["private fact"] } })) as Result & { cacheWriteTokens?: number };
  const body = JSON.parse(calls[0].init.body);
  assert.equal(body.messages.length, 1, "no history: one user turn");
  assert.deepEqual(body.messages[0].content, [
    { type: "text", text: JSON.stringify({ verifiedFacts: ["private fact"] }), cache_control: { type: "ephemeral" } },
    { type: "text", text: JSON.stringify({ story: "private evidence" }) },
  ]);
  assert.equal(result.cacheWriteTokens, 1200);
  assert.equal(result.cachedInputTokens, 0);
  assert.equal(result.usage.promptTokens, 1240, "writes count inside the prompt, like reads");
  assert.equal(logs[1].cacheWriteTokens, 1200);
  assert.ok(!JSON.stringify(logs).includes("private fact"));
});

test("an overloaded provider gets one more attempt; a rate limit does not", async () => {
  let overloaded = 0;
  const logs: Record<string, unknown>[] = [];
  const retried = load(async () => overloaded++ === 0 ? response(529, errorBody) : response(200, successBody), logs);
  const result = await retried.generateAnthropicStructuredResponse(request());
  assert.equal(result.stopReason, "end_turn");
  assert.deepEqual(logs.map((entry) => [entry.event, entry.attempt]), [["started", undefined], ["http-error", 1], ["response-received", 2]]);

  let limited = 0;
  const notRetried = load(async () => { limited++; return response(429, errorBody); }, []);
  await assert.rejects(notRetried.generateAnthropicStructuredResponse(request()), (error: Error & { status?: number }) => {
    assert.equal(error.status, 429);
    assert.doesNotMatch(error.message, /private-api-key|private evidence/);
    return true;
  });
  assert.equal(limited, 1);
});

test("a refusal or a cut-off answer fails with its usage, so the meter can settle the cost", async () => {
  for (const [stopReason, pattern] of [["max_tokens", /ran out of output tokens/], ["refusal", /refused/]] as const) {
    const body = JSON.stringify({ content: [{ type: "text", text: "{\"facts\":[{\"id\":\"f1\"" }], stop_reason: stopReason, usage: { input_tokens: 100, output_tokens: 4096 } });
    const exports = load(async () => response(200, body), []);
    await assert.rejects(exports.generateAnthropicStructuredResponse(request()), (error: Error & { usage?: { totalTokens: number } }) => {
      assert.match(error.message, pattern);
      assert.equal(error.usage?.totalTokens, 4196);
      return true;
    });
  }
});
