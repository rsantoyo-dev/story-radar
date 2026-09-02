import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { stories } from "./stories";

export const storySources = pgTable(
  "story_sources",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    storyId: uuid("story_id")
      .notNull()
      .references(() => stories.id, { onDelete: "cascade" }),
    sourceId: text("source_id").notNull(),
    sourceName: text("source_name").notNull(),
    externalId: text("external_id").notNull(),
    sourceUrl: text("source_url").notNull(),
    /**
     * Present only when a web-grounded AI research collector selected this
     * source. The normal topic relevance score remains on topic_stories.
     */
    researchScore: integer("research_score"),
    researchReasons: text("research_reasons").array(),
    fetchedAt: timestamp("fetched_at", {
      withTimezone: true,
      mode: "date",
    }).notNull(),
    createdAt: timestamp("created_at", {
      withTimezone: true,
      mode: "date",
    })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("story_sources_source_external_id_unique").on(
      table.sourceId,
      table.externalId,
    ),
    index("story_sources_story_id_idx").on(table.storyId),
    index("story_sources_source_id_idx").on(table.sourceId),
    check(
      "story_sources_research_score_check",
      sql`${table.researchScore} IS NULL OR ${table.researchScore} BETWEEN 0 AND 100`,
    ),
  ],
);
