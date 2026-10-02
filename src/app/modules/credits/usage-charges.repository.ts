import "server-only";

import { sql } from "drizzle-orm";

import { db } from "@/db/client";

import { demoMarkupBasisPoints } from "./demo-credit-policy";

export type UsageChargeKind = "image" | "text" | "search" | "map" | "embedding" | "reader";

export type UsageChargeInput = {
  /** Resolves topic and story from the draft; otherwise pass topicId (and storyId when known). */
  draftId?: string;
  topicId?: string;
  storyId?: string | null;
  kind: UsageChargeKind;
  provider: string;
  model: string;
  operation: string;
  units: Record<string, unknown>;
  /** Provider cost before markup; null records the spend as unpriced. */
  costMicros: number | null;
  estimated: boolean;
  rate: Record<string, unknown>;
  idempotencyKey: string;
};

/**
 * Records one billable provider request, once per idempotency key, with the
 * markup in force now. Billing must never break the work it accounts for, so
 * a failure here is logged and swallowed.
 */
export async function recordUsageCharge(input: UsageChargeInput): Promise<void> {
  const pricing = JSON.stringify({ ...input.rate, demoMarkupBasisPoints: demoMarkupBasisPoints() });
  const units = JSON.stringify(input.units);
  try {
    if (input.draftId) {
      await db.execute(sql`INSERT INTO ai_usage_charges (topic_id, story_id, kind, provider, model, operation, units, cost_micros, estimated, pricing, idempotency_key)
        SELECT d.topic_id, d.story_id, ${input.kind}, ${input.provider}, ${input.model}, ${input.operation}, ${units}::jsonb,
          ${input.costMicros}, ${input.estimated}, ${pricing}::jsonb, ${input.idempotencyKey}
        FROM creative_drafts d WHERE d.id = ${input.draftId}::uuid
        ON CONFLICT (idempotency_key) DO NOTHING`);
    } else if (input.topicId) {
      await db.execute(sql`INSERT INTO ai_usage_charges (topic_id, story_id, kind, provider, model, operation, units, cost_micros, estimated, pricing, idempotency_key)
        VALUES (${input.topicId}::uuid, ${input.storyId ?? null}::uuid, ${input.kind}, ${input.provider}, ${input.model}, ${input.operation}, ${units}::jsonb,
          ${input.costMicros}, ${input.estimated}, ${pricing}::jsonb, ${input.idempotencyKey})
        ON CONFLICT (idempotency_key) DO NOTHING`);
    }
  } catch (error) {
    console.error("Usage charge could not be recorded", { key: input.idempotencyKey, kind: input.kind, error: error instanceof Error ? error.message : "unknown" });
  }
}
