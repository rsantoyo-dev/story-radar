import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import * as crypto from "node:crypto";
import vm from "node:vm";
import ts from "typescript";

const compiled = ts.transpileModule(readFileSync(new URL("./openai-structured-response.ts", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

test("OpenAI receipts identify charges and uncertain requests without exposing content or credentials", async () => {
  for (const outcome of ["success", "transport", "invalid", "http"] as const) {
    const logs: Record<string, unknown>[] = [];
    const exports = {} as { generateOpenAiStructuredResponse: (input: unknown) => Promise<unknown> };
    vm.runInNewContext(compiled, {
      exports, Date, Error, AbortController, setTimeout, clearTimeout,
      console: { info: (_label: string, json: string) => logs.push(JSON.parse(json)) },
      require: (name: string) => name === "node:crypto" ? crypto : {},
      fetch: async () => {
        if (outcome === "transport") throw new Error("private transport context");
        return {
          ok: outcome !== "http", status: outcome === "http" ? 429 : 200,
          headers: { get: () => "request-test" },
          text: async () => outcome === "invalid" ? "private invalid output" : JSON.stringify({
            output_text: "private generated text", usage: {
              input_tokens: 100, output_tokens: 60, total_tokens: 160,
              input_tokens_details: { cached_tokens: 20 }, output_tokens_details: { reasoning_tokens: 40 },
            },
          }),
        };
      },
    });
    const call = exports.generateOpenAiStructuredResponse({
      apiKey: "private-api-key", model: "gpt-5.6-terra", instructions: "private instructions",
      auditContext: { runId: "run-test", topicId: "topic-test", storyId: "story-test" },
      contents: { story: "private evidence" }, schema: {}, schemaName: "creative_editorial_final_audit", maxOutputTokens: 4096,
    });
    if (outcome === "success") await call;
    else await assert.rejects(call);
    assert.equal(logs.length, 2);
    assert.equal(logs[0].event, "started");
    assert.equal(logs[0].auditId, logs[1].auditId);
    assert.equal(logs[1].model, "gpt-5.6-terra");
    assert.deepEqual(logs[1].context, { runId: "run-test", topicId: "topic-test", storyId: "story-test" });
    assert.equal(logs[1].operation, "creative_editorial_final_audit");
    assert.ok(!JSON.stringify(logs).includes("private"));
    if (outcome === "success" || outcome === "http") {
      assert.equal(logs[1].cachedInputTokens, 20);
      assert.equal((logs[1].usage as { totalTokens: number }).totalTokens, 160, "Reasoning is already part of output tokens");
      assert.equal(logs[1].requestId, "request-test");
    } else assert.equal(logs[1].usageKnown, false);
  }
});
