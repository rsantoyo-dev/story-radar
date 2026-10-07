import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildLogEntry,
  consoleArgsToEntryInput,
  formatLogEntry,
  parseLogFormat,
  parseLogLevel,
  redactText,
  sanitize,
  shouldLog,
} from "./log.core";

describe("levels and format", () => {
  it("parses and compares levels", () => {
    assert.equal(parseLogLevel("WARN"), "warn");
    assert.equal(parseLogLevel("loud"), "info");
    assert.equal(parseLogLevel(undefined, "debug"), "debug");
    assert.equal(shouldLog("error", "warn"), true);
    assert.equal(shouldLog("debug", "info"), false);
  });

  it("defaults to JSON in production and pretty elsewhere", () => {
    assert.equal(parseLogFormat(undefined, true), "json");
    assert.equal(parseLogFormat(undefined, false), "pretty");
    assert.equal(parseLogFormat("json", false), "json");
  });
});

describe("redactText", () => {
  it("hides keys, tokens, links, connection strings and emails", () => {
    const text = redactText([
      "stripe sk_test_51AbCdEfGhIjKl and sk_live_xyzxyzxyz",
      "webhook whsec_abcdefghijk",
      "resend re_ABCDEFGHIJKLMNOPQRST",
      "header Bearer abc.def-ghi_123456",
      "db postgresql://user:pass@host.neon.tech/db?sslmode=require",
      "link https://app.test/api/auth/magic-link/verify?token=SECRET123&callbackURL=/",
      "meta EAABwzLixnjYBOZCZBexample0123456789",
      "jwt eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U",
      "mail ricardo.santoyo@example.com",
    ].join("\n"));
    for (const secret of ["51AbCdEfGhIjKl", "xyzxyzxyz", "abcdefghijk", "ABCDEFGHIJKLMNOPQRST", "abc.def-ghi_123456", "user:pass", "SECRET123", "BOZCZBexample", "eyJzdWIi", "ricardo.santoyo"]) {
      assert.ok(!text.includes(secret), `${secret} leaked: ${text}`);
    }
    assert.match(text, /sk_test_\[redacted\]/u);
    assert.match(text, /callbackURL=\//u);
    assert.match(text, /r\*\*\*@example\.com/u);
  });

  it("cuts very long text", () => {
    const text = redactText("x".repeat(5_000));
    assert.ok(text.length < 4_100);
    assert.match(text, /1000 more characters/u);
  });
});

describe("sanitize", () => {
  it("hides secret-looking string fields but keeps counts", () => {
    assert.deepEqual(sanitize({ accessToken: "abc", apiKey: "k", password: "p", inputTokens: 1200, name: "ok" }),
      { accessToken: "[redacted]", apiKey: "[redacted]", password: "[redacted]", inputTokens: 1200, name: "ok" });
  });

  it("serializes errors with their cause and code", () => {
    const error = Object.assign(new Error("Failed for a@b.co", { cause: new Error("inner") }), { code: "E_FAIL", status: 502 });
    const value = sanitize(error) as Record<string, unknown>;
    assert.equal(value.name, "Error");
    assert.equal(value.message, "Failed for a***@b.co");
    assert.equal(value.code, "E_FAIL");
    assert.equal(value.status, 502);
    assert.equal((value.cause as Record<string, unknown>).message, "inner");
    assert.match(String(value.stack), /Error: Failed/u);
  });

  it("handles cycles, depth, dates, bigint and binary", () => {
    const cyclic: Record<string, unknown> = { a: 1 };
    cyclic.self = cyclic;
    assert.deepEqual(sanitize(cyclic), { a: 1, self: "[circular]" });
    assert.match(JSON.stringify(sanitize({ a: { b: { c: { d: { e: { f: { g: 1 } } } } } } })), /\[truncated\]/u);
    assert.equal(sanitize(new Date("2026-10-07T00:00:00Z")), "2026-10-07T00:00:00.000Z");
    assert.equal(sanitize(10n), "10");
    assert.equal(sanitize(new Uint8Array(4)), "[binary 4 bytes]");
  });
});

describe("entries", () => {
  it("puts context and fields at the top level without overwriting the entry", () => {
    const entry = buildLogEntry({
      level: "info", module: "billing", message: "Credits granted",
      fields: { credits: 500, msg: "spoof", level: "error" },
      context: { requestId: "req-1", userId: "u1" },
      now: new Date("2026-10-07T12:00:00Z"),
    });
    assert.deepEqual(entry, {
      time: "2026-10-07T12:00:00.000Z", level: "info", module: "billing", msg: "Credits granted",
      requestId: "req-1", userId: "u1", credits: 500, field_msg: "spoof", field_level: "error",
    });
    assert.equal(JSON.parse(formatLogEntry(entry, "json")).credits, 500);
    assert.match(formatLogEntry(entry, "pretty"), /INFO {2}\[billing\] Credits granted \{/u);
  });

  it("turns console arguments into a message and fields", () => {
    const error = new Error("boom");
    assert.deepEqual(consoleArgsToEntryInput(["Failed to save", error]), { message: "Failed to save", fields: { error } });
    assert.deepEqual(consoleArgsToEntryInput(["Usage", { kind: "image" }]), { message: "Usage", fields: { kind: "image" } });
    assert.deepEqual(consoleArgsToEntryInput(["a", 1, 2]), { message: "a", fields: { details: [1, 2] } });
    assert.deepEqual(consoleArgsToEntryInput([error]), { message: "boom", fields: { error } });
    assert.deepEqual(consoleArgsToEntryInput(["only"]), { message: "only" });
  });
});
