import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import { withUsageAttribution } from "../credits/usage-attribution";
import { recordAttributedUsage } from "../credits/usage-recorder";
import type { CreativeAiUsage } from "./creative-content.types";
import { textBudgetMicros, textCostMicros, textRate, type TextRate } from "./creative-text-cost";
export type TextSpendContext = {
    topicId: string;
    storyId: string;
    runId: string;
};
const scope = new AsyncLocalStorage<TextSpendContext>();
// The Creative Studio scope also attributes non-text spend (maps, photos) made inside it.
export const withCreativeTextBudget = <T>(context: TextSpendContext, work: () => Promise<T>): Promise<T> =>
    scope.run(context, () => withUsageAttribution({ topicId: context.topicId, storyId: context.storyId }, work));
type Usage = CreativeAiUsage & {
    cachedInputTokens?: number;
};
/**
 * Inside a Creative Studio scope, reserves against the Story text budget and
 * settles the measured cost. Outside one, the call is recorded as attributed
 * usage after it returns (unless the caller records its own charge). Never
 * log prompts.
 */
export async function meterCreativeText<T>(input: {
    provider: string;
    model: string;
    operation: string;
    payload: unknown;
    maxOutputTokens: number;
    /** The caller records its own usage charge; do not record it again outside a Creative Studio scope. */
    selfMetered?: boolean;
}, request: () => Promise<T>, usage: (value: T) => Usage | undefined): Promise<T> {
    const context = scope.getStore();
    if (!context) {
        const value = await request();
        if (!input.selfMetered)
            await recordUnscopedText(input, usage(value));
        return value;
    }
    const inputBound = Buffer.byteLength(JSON.stringify(input.payload), "utf8") + 2048;
    const rate = textRate(input.provider, input.model, inputBound);
    // Gemini's maxOutputTokens includes its reasoning; reserve once for the total output ceiling.
    const reserved = textCostMicros(rate, { promptTokens: inputBound, outputTokens: input.maxOutputTokens, thoughtsTokens: 0, totalTokens: 0 });
    const repository = await import("./creative-text-accounting.repository");
    const id = randomUUID();
    await repository.reserveTextCall({ ...context, id, ...input, rate, reserved, limit: textBudgetMicros() });
    let value: T;
    try {
        value = await request();
    }
    catch (error) {
        const e = error as {
            status?: number;
            usage?: Usage;
        };
        // Explicit request rejection has no inference charge; unknown transport outcomes retain the reservation.
        const rejected = [400, 401, 402, 403, 404, 413, 422, 429].includes(e?.status ?? 0);
        const known = e?.usage && e.usage.totalTokens > 0 ? e.usage : undefined;
        await repository.finishTextCall(id, context, known ? textCostMicros(rate, known, known.cachedInputTokens) : rejected ? 0 : null, known).catch(() => { });
        throw error;
    }
    const measured = usage(value);
    await repository.finishTextCall(id, context, measured ? textCostMicros(rate, measured, measured.cachedInputTokens) : null, measured);
    return value;
}
/** An unknown rate records the call unpriced (visible, not charged) instead of failing finished work. */
async function recordUnscopedText(input: { provider: string; model: string; operation: string }, measured: Usage | undefined): Promise<void> {
    if (!measured)
        return;
    let rate: TextRate | undefined;
    try {
        rate = textRate(input.provider, input.model, measured.promptTokens);
    }
    catch { /* unpriced */ }
    await recordAttributedUsage({
        kind: "text", provider: input.provider, model: input.model, operation: input.operation,
        units: { promptTokens: measured.promptTokens, outputTokens: measured.outputTokens, thoughtsTokens: measured.thoughtsTokens, cachedTokens: measured.cachedInputTokens ?? 0 },
        costMicros: rate ? textCostMicros(rate, measured, measured.cachedInputTokens) : null,
        estimated: false, rate: rate ? { ...rate } : { unpriced: true }, idempotencyKey: `text:${randomUUID()}`,
    });
}
