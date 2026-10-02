import { sql } from "drizzle-orm";
import { boolean, check, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import { stories } from "./stories";
import { topics } from "./topics";

/**
 * Every paid provider spend that is not a metered creative text call:
 * images, searches, maps, embeddings, evaluation text. One row per billable
 * request, keyed by an idempotency key, priced at the time of the request
 * (or left unpriced and visible when no rate is configured). Settled rows
 * become demo-credit debits through sync_demo_credit_text_usage().
 */
export const aiUsageCharges = pgTable(
  "ai_usage_charges",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    topicId: uuid("topic_id").notNull().references(() => topics.id, { onDelete: "restrict" }),
    storyId: uuid("story_id").references(() => stories.id, { onDelete: "set null" }),
    /** image | text | search | map | embedding | reader */
    kind: text("kind").notNull(),
    provider: text("provider").notNull(),
    model: text("model").notNull(),
    operation: text("operation").notNull(),
    /** What was billed: image size and quality, tokens, request count. */
    units: jsonb("units").$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
    /** Provider cost before markup; null when no rate is configured (unpriced). */
    costMicros: integer("cost_micros"),
    /** The provider does not report a cost, so it was computed from published rates. */
    estimated: boolean("estimated").notNull().default(true),
    /** The rate snapshot used, including demoMarkupBasisPoints at the time. */
    pricing: jsonb("pricing").$type<Record<string, unknown>>().notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("ai_usage_charges_idempotency_idx").on(table.idempotencyKey),
    index("ai_usage_charges_topic_time_idx").on(table.topicId, table.createdAt),
    check("ai_usage_charges_kind_check", sql`${table.kind} IN ('image', 'text', 'search', 'map', 'embedding', 'reader')`),
    check("ai_usage_charges_cost_check", sql`${table.costMicros} IS NULL OR ${table.costMicros} >= 0`),
  ],
);

export type AiUsageCharge = typeof aiUsageCharges.$inferSelect;
