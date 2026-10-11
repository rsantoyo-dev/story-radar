import { textCostMicros, textRate } from "../stories/creative-text-cost";
import type { CreativeAiUsage } from "../stories/creative-content.types";

/**
 * What one provider call cost by the meter's rates (creative-text-cost.ts),
 * in USD micros, for the trace the canvas sums per step and per run. The
 * meter itself charges the call; this is the same arithmetic kept beside the
 * call so a run can be compared with another. Undefined when the model has
 * no verified rate (the meter then records the call unpriced too).
 */
export function traceCostMicros(provider: string, model: string, usage: CreativeAiUsage | undefined, cachedInputTokens = 0, cacheWriteTokens = 0): number | undefined {
  if (!usage || usage.totalTokens <= 0) return undefined;
  try {
    return textCostMicros(textRate(provider, model, usage.promptTokens), usage, cachedInputTokens, cacheWriteTokens);
  } catch {
    return undefined;
  }
}

/** The cost as a trace entry carries it: nothing when the model has no verified rate. */
export function traceCost(provider: string, model: string, usage: CreativeAiUsage | undefined, cachedInputTokens = 0, cacheWriteTokens = 0): { costMicros?: number } {
  const costMicros = traceCostMicros(provider, model, usage, cachedInputTokens, cacheWriteTokens);
  return costMicros === undefined ? {} : { costMicros };
}
