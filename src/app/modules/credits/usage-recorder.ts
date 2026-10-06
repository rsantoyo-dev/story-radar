import { currentUsageAttribution } from "./usage-attribution";
import type { UsageChargeInput } from "./usage-charges.repository";

/**
 * Records spend for the Topic (and Story) of the workflow in progress, from
 * `withUsageAttribution` or a Creative Studio scope. A call made outside any
 * attribution is logged so the gap is visible, never charged to a guess.
 * Billing must not break the work it accounts for: failures are logged.
 */
export async function recordAttributedUsage(input: Omit<UsageChargeInput, "draftId" | "topicId" | "storyId">): Promise<void> {
  const attribution = currentUsageAttribution();
  if (!attribution) {
    console.warn("Provider usage without a Topic was not recorded", {
      kind: input.kind, provider: input.provider, model: input.model, operation: input.operation, costMicros: input.costMicros,
    });
    return;
  }
  try {
    const { recordUsageCharge } = await import("./usage-charges.repository");
    await recordUsageCharge({ ...input, topicId: attribution.topicId, storyId: attribution.storyId ?? null });
  } catch (error) {
    console.error("Usage charge could not be recorded", { kind: input.kind, operation: input.operation, error: error instanceof Error ? error.message : "unknown" });
  }
}
