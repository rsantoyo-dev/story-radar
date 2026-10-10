import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { annotateLogContext, createLogger, currentLogContext, enterRequestLogContext, installConsoleBridge, requestTrace, withLogContext } from "./logger";

function capture(work: () => void | Promise<void>): Promise<Record<string, unknown>[]> {
  const lines: string[] = [];
  const original = { info: console.info, warn: console.warn, error: console.error, debug: console.debug };
  const record = (line: unknown) => { lines.push(String(line)); };
  console.info = record; console.warn = record; console.error = record; console.debug = record;
  const previous = process.env.LOG_FORMAT;
  process.env.LOG_FORMAT = "json";
  return Promise.resolve(work()).then(() => lines.map((line) => JSON.parse(line) as Record<string, unknown>)).finally(() => {
    Object.assign(console, original);
    if (previous === undefined) delete process.env.LOG_FORMAT; else process.env.LOG_FORMAT = previous;
  });
}

describe("logger", () => {
  it("writes redacted JSON with the module and bound fields", async () => {
    const entries = await capture(() => {
      createLogger("billing").child({ purchaseId: "p1" }).info("Granted", { credits: 500, token: "secret-value" });
    });
    assert.equal(entries.length, 1);
    assert.equal(entries[0].module, "billing");
    assert.equal(entries[0].purchaseId, "p1");
    assert.equal(entries[0].credits, 500);
    assert.equal(entries[0].token, "[redacted]");
  });

  it("carries a request context set at the start of an awaited auth step into the handler", async () => {
    const request = new Request("https://app.test/api/radar/credits?x=1", { headers: { "x-vercel-id": "iad1::abc-123" } });
    async function authorize(req: Request) {
      enterRequestLogContext(req);
      await new Promise((resolve) => setTimeout(resolve, 1));
      annotateLogContext({ userId: "u1", workspaceId: "w1" });
    }
    const entries = await capture(() => withLogContext({}, async () => {
      await authorize(request);
      await Promise.resolve();
      createLogger("credits").warn("Handled");
    }));
    assert.equal(entries[0].requestId, "iad1::abc-123");
    assert.equal(entries[0].path, "/api/radar/credits");
    assert.equal(entries[0].method, "GET");
    assert.equal(entries[0].userId, "u1");
    assert.equal(entries[0].workspaceId, "w1");
  });

  it("keeps concurrent request contexts apart", async () => {
    const seen = await Promise.all(["a", "b"].map((id) => withLogContext({ requestId: id }, async () => {
      await new Promise((resolve) => setTimeout(resolve, id === "a" ? 5 : 1));
      return currentLogContext()?.requestId;
    })));
    assert.deepEqual(seen, ["a", "b"]);
  });

  it("honours LOG_LEVEL", async () => {
    process.env.LOG_LEVEL = "warn";
    try {
      const entries = await capture(() => { createLogger("x").info("hidden"); createLogger("x").error("shown"); });
      assert.deepEqual(entries.map((entry) => entry.msg), ["shown"]);
    } finally {
      delete process.env.LOG_LEVEL;
    }
  });

  it("bridges console.* through the redacting formatter", async () => {
    const lines: string[] = [];
    const original = { info: console.info, warn: console.warn, error: console.error, debug: console.debug, log: console.log };
    const record = (line: unknown) => { lines.push(String(line)); };
    // The bridge keeps the writers it finds, so install it over a recorder.
    console.info = record; console.warn = record; console.error = record; console.debug = record;
    process.env.LOG_FORMAT = "json";
    try {
      installConsoleBridge();
      console.error("Failed with sk_live_abcdefghijkl", new Error("boom"));
      const entry = JSON.parse(lines[0]) as Record<string, unknown>;
      assert.equal(entry.level, "error");
      assert.equal(entry.module, "console");
      assert.equal(entry.msg, "Failed with sk_live_[redacted]");
      assert.equal((entry.error as Record<string, unknown>).message, "boom");
    } finally {
      Object.assign(console, original);
      delete process.env.LOG_FORMAT;
    }
  });

  it("keeps a request's start time and its warnings and errors for the audit trail", async () => {
    let trace: ReturnType<typeof requestTrace>;
    await capture(() => withLogContext({}, async () => {
      const context = enterRequestLogContext(new Request("https://app.test/api/radar/evaluate", { method: "POST" }));
      const log = createLogger("evaluation");
      log.info("Started");
      log.warn("Provider slow", { provider: "gemini", apiKey: "secret-value" });
      for (let attempt = 0; attempt < 25; attempt += 1) log.error("Provider failed", { attempt });
      trace = requestTrace(context);
    }));
    assert.ok(trace!.startedAt instanceof Date);
    assert.equal(trace!.problems.length, 20);
    assert.equal(trace!.problems[0].level, "warn");
    assert.equal(trace!.problems[0].module, "evaluation");
    assert.equal(trace!.problems[0].apiKey, "[redacted]");
    assert.equal(trace!.problems[0].path, undefined);
    assert.ok(trace!.problems.slice(1).every((problem) => problem.level === "error"));
  });
});
