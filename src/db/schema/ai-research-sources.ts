import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

import { topics } from "./topics";

/**
 * One optional web-grounded AI research collector per topic. Keeping this
 * independent from RSS sources lets a topic run either collector on its own
 * or both together without treating a model endpoint as a feed URL.
 */
export const aiResearchSources = pgTable(
  "ai_research_sources",
  {
    topicId: uuid("topic_id")
      .primaryKey()
      .references(() => topics.id, { onDelete: "cascade" }),
    enabled: boolean("enabled").default(false).notNull(),
    instruction: text("instruction").default("").notNull(),
    orientation: text("orientation").default("informative").notNull(),
    resultLimit: integer("result_limit").default(3).notNull(),
    lookbackHours: integer("lookback_hours").default(72).notNull(),
    language: text("language").default("en").notNull(),
    region: text("region").default("global").notNull(),
    includeContent: boolean("include_content").default(true).notNull(),
    priority: integer("priority").default(0).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    check(
      "ai_research_sources_instruction_length_check",
      sql`char_length(${table.instruction}) <= 2000`,
    ),
    check(
      "ai_research_sources_orientation_check",
      sql`${table.orientation} IN ('informative', 'trend', 'provocative')`,
    ),
    check(
      "ai_research_sources_result_limit_check",
      sql`${table.resultLimit} BETWEEN 1 AND 10`,
    ),
    check(
      "ai_research_sources_lookback_hours_check",
      sql`${table.lookbackHours} BETWEEN 1 AND 8760`,
    ),
    check(
      "ai_research_sources_language_not_blank_check",
      sql`char_length(btrim(${table.language})) > 0`,
    ),
    check(
      "ai_research_sources_region_not_blank_check",
      sql`char_length(btrim(${table.region})) > 0`,
    ),
    check(
      "ai_research_sources_priority_check",
      sql`${table.priority} BETWEEN 0 AND 100`,
    ),
  ],
);

export type AiResearchSource = typeof aiResearchSources.$inferSelect;
export type NewAiResearchSource = typeof aiResearchSources.$inferInsert;
