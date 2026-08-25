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

import {
  storyContentEnrichmentMethodEnum,
  storyContentEnrichmentStatusEnum,
  storyContentStatusEnum,
} from "./enums";
import { stories } from "./stories";

export const storyContentEnrichments = pgTable(
  "story_content_enrichments",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    storyId: uuid("story_id")
      .notNull()
      .references(() => stories.id, { onDelete: "cascade" }),
    status: storyContentEnrichmentStatusEnum("status")
      .default("pending")
      .notNull(),
    method: storyContentEnrichmentMethodEnum("method")
      .default("direct")
      .notNull(),
    sourceUrl: text("source_url").notNull(),
    resolvedUrl: text("resolved_url"),
    articleTitle: text("article_title"),
    byline: text("byline"),
    contentText: text("content_text"),
    contentHash: text("content_hash"),
    contentStatus: storyContentStatusEnum("content_status"),
    wordCount: integer("word_count"),
    attempts: integer("attempts").default(0).notNull(),
    error: text("error"),
    startedAt: timestamp("started_at", {
      withTimezone: true,
      mode: "date",
    })
      .defaultNow()
      .notNull(),
    fetchedAt: timestamp("fetched_at", {
      withTimezone: true,
      mode: "date",
    }),
    updatedAt: timestamp("updated_at", {
      withTimezone: true,
      mode: "date",
    })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("story_content_enrichments_story_id_unique").on(
      table.storyId,
    ),
    index("story_content_enrichments_status_idx").on(table.status),
    index("story_content_enrichments_updated_at_idx").on(table.updatedAt),
    check(
      "story_content_enrichments_counts_check",
      sql`${table.attempts} >= 0
        AND (${table.wordCount} IS NULL OR ${table.wordCount} >= 0)`,
    ),
    check(
      "story_content_enrichments_dates_check",
      sql`${table.fetchedAt} IS NULL OR ${table.fetchedAt} >= ${table.startedAt}`,
    ),
    check(
      "story_content_enrichments_result_check",
      sql`(
          ${table.status} = 'completed'
          AND ${table.resolvedUrl} IS NOT NULL
          AND ${table.contentText} IS NOT NULL
          AND ${table.contentHash} IS NOT NULL
          AND ${table.contentStatus} IS NOT NULL
          AND ${table.wordCount} IS NOT NULL
          AND ${table.fetchedAt} IS NOT NULL
          AND ${table.error} IS NULL
        ) OR (
          ${table.status} = 'pending'
          AND ${table.fetchedAt} IS NULL
          AND ${table.error} IS NULL
        ) OR (
          ${table.status} IN ('failed', 'blocked')
          AND ${table.error} IS NOT NULL
        )`,
    ),
  ],
);
