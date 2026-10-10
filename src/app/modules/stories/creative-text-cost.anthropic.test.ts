import assert from "node:assert/strict";
import test from "node:test";
import { CreativeTextPricingError, textCostMicros, textRate } from "./creative-text-cost";

const date = Date.parse("2026-10-09");
const usage = { promptTokens: 1000, outputTokens: 1000, thoughtsTokens: 500, totalTokens: 2000 };

test("Claude rates price thinking as output, discount cache reads and carry the long-context premium", () => {
  const sonnet = textRate("anthropic", "claude-sonnet-5-5", 1000, undefined, date);
  assert.equal(sonnet.version, "2026-10-09");
  assert.equal(textCostMicros(sonnet, usage), 12_000, "thinking is already inside output tokens");
  assert.equal(textCostMicros(sonnet, usage, 500), 11_100, "cache reads cost 10% of input");
  assert.equal(textCostMicros(textRate("anthropic", "claude-opus-5-5", 1000, undefined, date), usage), 24_000);
  assert.equal(textCostMicros(textRate("anthropic", "claude-haiku-4-5-20251001", 1000, undefined, date), usage), 6_000);
  assert.equal(textCostMicros(textRate("anthropic", "claude-fable-5-1", 1000, undefined, date), usage), 60_000);
  const long = textRate("anthropic", "claude-sonnet-5-5", 250_000, undefined, date);
  assert.deepEqual([long.input, long.output, long.cached], [4, 15, .4]);
});

test("an unknown or expired Claude rate fails closed before spending, and an override still applies", () => {
  assert.throws(() => textRate("anthropic", "claude-unknown-9-9", 1000, undefined, date), CreativeTextPricingError);
  assert.throws(() => textRate("anthropic", "claude-sonnet-5-5", 1000, undefined, Date.parse("2027-02-01")), CreativeTextPricingError);
  const configured = textRate("anthropic", "claude-sonnet-5-5", 1000, JSON.stringify({ "anthropic/claude-sonnet-5-5": { input: 1, output: 5, cached: .1 } }), date);
  assert.equal(configured.version, "configured");
  assert.equal(textCostMicros(configured, usage), 6_000);
});
