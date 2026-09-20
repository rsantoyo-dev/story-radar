import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import type { CreativeAiUsage } from "./creative-content.types";
import { textBudgetMicros, textCostMicros, textRate } from "./creative-text-cost";
export type TextSpendContext = {
    topicId: string;
    storyId: string;
    runId: string;
};
const scope = new AsyncLocalStorage<TextSpendContext>();
export const withCreativeTextBudget = <T>(context: TextSpendContext, work: () => Promise<T>): Promise<T> => scope.run(context, work);
type Usage = CreativeAiUsage & {
    cachedInputTokens?: number;
};
/** No scope means this is not a Creative Studio text operation. Never log prompts. */
export async function meterCreativeText<T>(input: {
    provider: string;
    model: string;
    operation: string;
    payload: unknown;
    maxOutputTokens: number;
}, request: () => Promise<T>, usage: (value: T) => Usage | undefined): Promise<T> {
    const context = scope.getStore();
    if (!context)
        return request();
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
