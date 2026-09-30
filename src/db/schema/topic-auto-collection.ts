import { sql } from "drizzle-orm";
import { boolean, check, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import { topics } from "./topics";

/**
 * Optional, per-Topic scheduled reader: every N hours inside an active window
 * the server collects, evaluates and selects with one editorial line, and
 * flags scoops — stories above an explicit, configurable threshold. Scoops
 * are prepared ahead (content → brief → draft) but never published.
 */
export const topicAutoCollectionSettings = pgTable(
  "topic_auto_collection_settings",
  {
    topicId: uuid("topic_id").primaryKey().references(() => topics.id, { onDelete: "cascade" }),
    enabled: boolean("enabled").default(false).notNull(),
    lineId: uuid("line_id").notNull(),
    intervalHours: integer("interval_hours").default(4).notNull(),
    timezone: text("timezone").default("America/Toronto").notNull(),
    /** Local hours [activeFromHour, activeToHour) when runs may start. */
    activeFromHour: integer("active_from_hour").default(6).notNull(),
    activeToHour: integer("active_to_hour").default(22).notNull(),
    scoopEnabled: boolean("scoop_enabled").default(true).notNull(),
    scoopMinGrowth: integer("scoop_min_growth").default(85).notNull(),
    scoopMinEditorial: integer("scoop_min_editorial").default(80).notNull(),
    scoopMaxAgeHours: integer("scoop_max_age_hours").default(6).notNull(),
    /** Prepare a detected scoop ahead (content → brief → draft). */
    autoPrepareScoops: boolean("auto_prepare_scoops").default(true).notNull(),
    lastRunAt: timestamp("last_run_at", { withTimezone: true }),
    nextRunAt: timestamp("next_run_at", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    check(
      "topic_auto_collection_settings_values_check",
      sql`${table.intervalHours} BETWEEN 1 AND 24
        AND ${table.activeFromHour} BETWEEN 0 AND 23 AND ${table.activeToHour} BETWEEN 1 AND 24
        AND ${table.scoopMinGrowth} BETWEEN 1 AND 100 AND ${table.scoopMinEditorial} BETWEEN 1 AND 100
        AND ${table.scoopMaxAgeHours} BETWEEN 1 AND 72`,
    ),
  ],
);

/**
 * One scoop per Topic and Story. `reasons` keeps the exact signals that
 * qualified it (never one opaque score); status follows its preparation run.
 */
export const topicScoops = pgTable(
  "topic_scoops",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    topicId: uuid("topic_id").notNull().references(() => topics.id, { onDelete: "cascade" }),
    storyId: uuid("story_id").notNull(),
    preparationRunId: uuid("preparation_run_id"),
    growthScore: integer("growth_score").notNull(),
    editorialScore: integer("editorial_score").notNull(),
    storyPublishedAt: timestamp("story_published_at", { withTimezone: true }),
    reasons: jsonb("reasons").$type<string[]>().notNull(),
    status: text("status").default("detected").notNull(),
    blockedStep: text("blocked_step"),
    message: text("message"),
    detectedAt: timestamp("detected_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
    seenAt: timestamp("seen_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("topic_scoops_topic_story_unique").on(table.topicId, table.storyId),
    index("topic_scoops_topic_detected_idx").on(table.topicId, table.detectedAt),
    check("topic_scoops_status_check", sql`${table.status} IN ('detected', 'preparing', 'ready', 'blocked', 'dismissed')`),
  ],
);
