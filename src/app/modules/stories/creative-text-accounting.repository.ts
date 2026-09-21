import "server-only";
import { sql } from "drizzle-orm";
import { db } from "@/db/client";
import { CreativeTextBudgetError, textBudgetMicros, type TextRate, type CreativeTextSpend } from "./creative-text-cost";
import type { TextSpendContext } from "./creative-text-meter";
import type { CreativeAiUsage, CreativeDraft } from "./creative-content.types";
export async function reserveTextCall(input: TextSpendContext & {
    id: string;
    provider: string;
    model: string;
    operation: string;
    rate: TextRate;
    reserved: number;
    limit: number;
}) {
    const [, , inserted, balance] = await db.batch([
        db.execute(sql `SELECT id FROM topics WHERE id=${input.topicId}::uuid FOR UPDATE`),
        // An unconfirmed call already finished, so it is never still in flight.
        // Charge it at its own estimate rather than holding the reservation
        // open forever: the provider most likely billed it, and a story whose
        // budget is consumed by limbo rows can never be resumed or completed.
        // The status stays 'uncertain' so the ledger keeps saying it was
        // presumed, not measured.
        db.execute(sql `UPDATE creative_text_calls SET charged_micros=reserved_micros
    WHERE topic_id=${input.topicId}::uuid AND story_id=${input.storyId}::uuid AND status='uncertain'
      AND charged_micros IS NULL AND finished_at < now() - interval '15 minutes'`),
        db.execute(sql `INSERT INTO creative_text_calls(id,topic_id,story_id,run_id,provider,model,operation,reserved_micros,pricing)
    SELECT ${input.id}::uuid,${input.topicId}::uuid,${input.storyId}::uuid,${input.runId}::uuid,${input.provider},${input.model},${input.operation},${input.reserved},${JSON.stringify(input.rate)}::jsonb
    WHERE coalesce((SELECT sum(coalesce(charged_micros,reserved_micros)) FROM creative_text_calls
      WHERE topic_id=${input.topicId}::uuid AND story_id=${input.storyId}::uuid),0)+${input.reserved} <= ${input.limit}
    RETURNING id`),
        db.execute(sql `SELECT coalesce(sum(charged_micros),0)::float8 AS spent,
          coalesce(sum(reserved_micros) FILTER(WHERE charged_micros IS NULL),0)::float8 AS reserved
          FROM creative_text_calls WHERE topic_id=${input.topicId}::uuid AND story_id=${input.storyId}::uuid`),
    ]);
    if (!inserted.rows.length) {
        const spent = Number(balance.rows[0]?.spent ?? 0);
        const reserved = Number(balance.rows[0]?.reserved ?? 0);
        const usd = (micros: number) => `US$${(micros / 1e6).toFixed(4)}`;
        throw new CreativeTextBudgetError(`This story's internal text budget cannot cover ${input.operation} (${input.model}). Limit: ${usd(input.limit)}; estimated usage: ${usd(spent)}; pending or unconfirmed reservations: ${usd(reserved)}; available: ${usd(Math.max(0, input.limit - spent - reserved))}; next call requires a reservation of ${usd(input.reserved)}. This is an application limit, not a provider credit balance. The saved draft is preserved. Review unconfirmed usage before raising the budget, then resume the saved draft.`);
    }
}
export async function finishTextCall(id: string, context: TextSpendContext, cost: number | null, usage?: CreativeAiUsage) {
    await db.execute(sql `UPDATE creative_text_calls SET status=${cost === null ? "uncertain" : "settled"},charged_micros=${cost},usage=${usage ? JSON.stringify(usage) : null}::jsonb,finished_at=now()
  WHERE id=${id}::uuid AND topic_id=${context.topicId}::uuid AND story_id=${context.storyId}::uuid AND status='reserved'`);
}
export async function recordTextOutcome(topicId: string, draft: CreativeDraft) {
    if (draft.format !== "carousel" || draft.companion)
        return;
    const accepted = draft.status === "approved" || draft.qualityReviewIsCurrent !== false && draft.qualityReview?.status === "accepted";
    await db.execute(sql `INSERT INTO creative_text_outcomes(topic_id,story_id,draft_id,draft_version,accepted)
  SELECT ${topicId}::uuid,${draft.storyId}::uuid,${draft.id}::uuid,${draft.version},${accepted ? 1 : 0}
  WHERE EXISTS(SELECT 1 FROM creative_text_calls WHERE topic_id=${topicId}::uuid AND story_id=${draft.storyId}::uuid)
  ON CONFLICT(draft_id,draft_version) DO UPDATE SET accepted=greatest(creative_text_outcomes.accepted,excluded.accepted)`);
}
export async function getCreativeTextSpend(topicId: string, storyId: string): Promise<CreativeTextSpend> {
    const result = await db.execute(sql `SELECT
  coalesce(sum(charged_micros) FILTER(WHERE story_id=${storyId}::uuid),0)::float8 AS spent,
  coalesce(sum(reserved_micros) FILTER(WHERE story_id=${storyId}::uuid AND charged_micros IS NULL),0)::float8 AS reserved,
  count(*) FILTER(WHERE story_id=${storyId}::uuid)::int AS calls,
  coalesce(sum(charged_micros),0)::float8 AS topic_spent,
  coalesce(sum(reserved_micros) FILTER(WHERE charged_micros IS NULL),0)::float8 AS topic_reserved,
  (SELECT count(DISTINCT draft_id)::int FROM creative_text_outcomes WHERE topic_id=${topicId}::uuid AND story_id=${storyId}::uuid AND accepted=1) AS accepted,
  (SELECT count(DISTINCT draft_id)::int FROM creative_text_outcomes WHERE topic_id=${topicId}::uuid AND accepted=1) AS topic_accepted,
  (SELECT count(*)::int FROM creative_ai_runs r WHERE r.topic_id=${topicId}::uuid AND r.story_id=${storyId}::uuid AND NOT EXISTS(SELECT 1 FROM creative_text_calls c WHERE c.run_id=r.id)) AS legacy
  FROM creative_text_calls WHERE topic_id=${topicId}::uuid`);
    const r = result.rows[0];
    const n = (key: string) => Number(r?.[key] ?? 0);
    const limit = textBudgetMicros() / 1e6;
    return { limitUsd: limit, estimatedUsd: n("spent") / 1e6, reservedUsd: n("reserved") / 1e6, availableUsd: Math.max(0, limit - (n("spent") + n("reserved")) / 1e6), calls: n("calls"),
        acceptedCarousels: n("accepted"), costPerAcceptedCarouselUsd: n("accepted") ? n("spent") / 1e6 / n("accepted") : null, legacyRuns: n("legacy"),
        topic: { estimatedUsd: n("topic_spent") / 1e6, reservedUsd: n("topic_reserved") / 1e6, acceptedCarousels: n("topic_accepted"), costPerAcceptedCarouselUsd: n("topic_accepted") ? n("topic_spent") / 1e6 / n("topic_accepted") : null } };
}
