import assert from "node:assert/strict";
import test from "node:test";
import { redactText } from "./log.core";

test("an Anthropic API key never reaches a log line", () => {
  assert.equal(redactText("key sk-ant-api03-abcDEF123456_-xyz done"), "key sk-ant-[redacted] done");
  assert.equal(redactText("x-api-key: sk-ant-api03-abcDEF123456"), "x-api-key: sk-ant-[redacted]");
  assert.equal(redactText("the sk-ant- prefix alone is not a key"), "the sk-ant- prefix alone is not a key");
});
