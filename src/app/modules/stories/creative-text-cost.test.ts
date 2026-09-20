import assert from "node:assert/strict";
import test from "node:test";
import { textRate, textCostMicros, textBudgetMicros, CreativeTextPricingError } from "./creative-text-cost";
const date = Date.parse("2026-09-20");
const usage = { promptTokens: 1000, outputTokens: 1000, thoughtsTokens: 500, totalTokens: 2000 };
test("OpenAI reasoning is already output; Gemini reasoning is charged separately", () => {
    assert.equal(textCostMicros(textRate("openai", "gpt-5.6-luna", 1000, undefined, date), usage), 1400);
    assert.equal(textCostMicros(textRate("google", "gemini-3.6-flash", 1000, undefined, date), usage), 6375);
});
test("cached input is discounted without negative charges", () => {
    const rate = textRate("openai", "gpt-5.6-terra", 1000, undefined, date);
    assert.equal(textCostMicros(rate, usage, 500), 13100);
    assert.equal(textCostMicros(rate, usage, 2000), 12200);
});
test("unverified model and expired promotional rates fail before spending", () => {
    assert.throws(() => textRate("groq", "unknown", 1000, undefined, date), CreativeTextPricingError);
    assert.throws(() => textRate("openai", "gpt-5.6-sol", 1000, undefined, Date.parse("2026-12-01")), CreativeTextPricingError);
    assert.equal(textRate("groq", "custom", 0, JSON.stringify({ "groq/custom": { input: 0, output: 0, cached: 0 } }), date).input, 0);
    assert.throws(() => textRate("groq", "custom", 0, JSON.stringify({ "groq/custom": { input: -1, output: 0, cached: 0 } }), date), CreativeTextPricingError);
});
test("story budget defaults to one dollar and validates configuration", () => {
    const old = process.env.CREATIVE_STORY_TEXT_BUDGET_USD;
    try {
        delete process.env.CREATIVE_STORY_TEXT_BUDGET_USD;
        assert.equal(textBudgetMicros(), 1000000);
        process.env.CREATIVE_STORY_TEXT_BUDGET_USD = "0.5";
        assert.equal(textBudgetMicros(), 500000);
        process.env.CREATIVE_STORY_TEXT_BUDGET_USD = "invalid";
        assert.throws(textBudgetMicros);
    }
    finally {
        if (old === undefined)
            delete process.env.CREATIVE_STORY_TEXT_BUDGET_USD;
        else
            process.env.CREATIVE_STORY_TEXT_BUDGET_USD = old;
    }
});

test("all configured Flash generations use verified rates, including the January price change", () => {
 for (const model of ["gemini-3.6-flash", "gemini-3.7-flash", "gemini-3.8-flash"]) {
  assert.equal(textRate("google", model, 1000, undefined, date).output, 3.75);
  assert.equal(textRate("google", model, 1000, undefined, Date.parse("2027-01-01")).output, 7.5);
 }
});
