import type { CreativeAiUsage } from "./creative-content.types";
export class CreativeTextBudgetError extends Error {
}
export class CreativeTextPricingError extends Error {
}
export type TextRate = {
    input: number;
    output: number;
    cached: number;
    thoughtsExtra?: boolean;
    version: string;
};
// USD / million tokens; each call persists its rate snapshot. Standard API,
// no tools/images. Sources and expiry rules are documented in docs/creative-text-recovery.md.
export function textRate(provider: string, model: string, inputTokens: number, overrides = process.env.CREATIVE_TEXT_PRICES_JSON, now = Date.now()): TextRate {
    let rate: TextRate | undefined;
    if (overrides) {
        const configured = JSON.parse(overrides)[`${provider}/${model}`];
        if (configured)
            rate = { ...configured, version: "configured" };
    }
    if (!rate && provider === "openai") {
        // gpt-5.6-* kept for any call still recorded under the retired
        // generation (rates are snapshotted per call; nothing re-reads this
        // after settlement). gpt-6-* checked September 24, 2026, no stated
        // promotional end date; re-verify by the same date below regardless.
        const rates: Record<string, number[]> = { "gpt-5.6-luna": [.2, 1.2, .02], "gpt-5.6-terra": [2, 12, .2], "gpt-5.6-sol": [4, 20, .4], "gpt-6-luna": [.1, .5, .01], "gpt-6-sol": [2, 10, .2] };
        const expiry: Record<string, string> = { "gpt-5.6-luna": "2026-11-22", "gpt-5.6-terra": "2026-11-22", "gpt-5.6-sol": "2026-11-22", "gpt-6-luna": "2026-11-24", "gpt-6-sol": "2026-11-24" };
        const r = rates[model];
        if (r && now < Date.parse(expiry[model]))
            rate = { input: r[0], output: r[1], cached: r[2], version: "2026-09-24" };
        if (rate && inputTokens > 272000)
            rate = { ...rate, input: rate.input * 2, cached: rate.cached * 2, output: rate.output * 1.5 };
    }
    if (!rate && provider === "google" && ["gemini-3.6-flash", "gemini-3.7-flash", "gemini-3.8-flash"].includes(model)) {
        const factor = now < Date.parse("2027-01-01") ? 1 : 2;
        rate = { input: .75 * factor, output: 3.75 * factor, cached: .075 * factor, thoughtsExtra: true, version: "2026-09-20" };
    }
    if (!rate || ![rate.input, rate.output, rate.cached].every(n => Number.isFinite(n) && n >= 0))
        throw new CreativeTextPricingError(`Configure a verified text rate for ${provider}/${model} before spending credits.`);
    return rate;
}
export function textCostMicros(rate: TextRate, usage: CreativeAiUsage, cached = 0): number {
    const input = Math.max(0, usage.promptTokens), cache = Math.min(input, Math.max(0, cached));
    return Math.ceil((input - cache) * rate.input + cache * rate.cached +
        (Math.max(0, usage.outputTokens) + (rate.thoughtsExtra ? Math.max(0, usage.thoughtsTokens) : 0)) * rate.output);
}
export function textBudgetMicros(): number {
    const dollars = Number(process.env.CREATIVE_STORY_TEXT_BUDGET_USD ?? "1");
    if (!Number.isFinite(dollars) || dollars <= 0 || dollars > 1000)
        throw new CreativeTextBudgetError("CREATIVE_STORY_TEXT_BUDGET_USD must be greater than 0 and at most 1000.");
    return Math.floor(dollars * 1e6);
}
export type CreativeTextSpend = {
    limitUsd: number;
    estimatedUsd: number;
    reservedUsd: number;
    availableUsd: number;
    calls: number;
    acceptedCarousels: number;
    costPerAcceptedCarouselUsd: number | null;
    legacyRuns: number;
    topic: {
        estimatedUsd: number;
        reservedUsd: number;
        acceptedCarousels: number;
        costPerAcceptedCarouselUsd: number | null;
    };
};
