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
  storyContentStatusEnum,
  storyProcessingStatusEnum,
  storyReviewDecisionEnum,
} from "./enums";

export const stories = pgTable(
  "stories",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    canonicalUrl: text("canonical_url").notNull(),
    originalUrl: text("original_url").notNull(),
    title: text("title").notNull(),
    contentText: text("content_text"),
    contentStatus: storyContentStatusEnum("content_status").notNull(),
    language: text("language").notNull(),
    region: text("region").notNull(),
    tags: text("tags")
      .array()
      .notNull()
      .default(sql`ARRAY[]::text[]`),
    publishedAt: timestamp("published_at", {
      withTimezone: true,
      mode: "date",
    }),
    firstSeenAt: timestamp("first_seen_at", {
      withTimezone: true,
      mode: "date",
    })
      .defaultNow()
      .notNull(),
    lastSeenAt: timestamp("last_seen_at", {
      withTimezone: true,
      mode: "date",
    })
      .defaultNow()
      .notNull(),
    relevanceScore: integer("relevance_score").default(0).notNull(),
    relevanceReasons: text("relevance_reasons")
      .array()
      .notNull()
      .default(sql`ARRAY[]::text[]`),
    processingStatus: storyProcessingStatusEnum("processing_status")
      .default("new")
      .notNull(),
    reviewDecision: storyReviewDecisionEnum("review_decision"),
    reviewedAt: timestamp("reviewed_at", {
      withTimezone: true,
      mode: "date",
    }),
  },
  (table) => [
    uniqueIndex("stories_canonical_url_unique").on(table.canonicalUrl),
    index("stories_published_at_idx").on(table.publishedAt),
    index("stories_processing_status_idx").on(table.processingStatus),
    index("stories_review_decision_idx").on(table.reviewDecision),
    index("stories_retention_idx").on(
      table.processingStatus,
      table.lastSeenAt,
    ),
    index("stories_relevance_score_idx").on(table.relevanceScore),
    check(
      "stories_relevance_score_check",
      sql`${table.relevanceScore} BETWEEN 0 AND 100`,
    ),
    check(
      "stories_seen_dates_check",
      sql`${table.lastSeenAt} >= ${table.firstSeenAt}`,
    ),
    check(
      "stories_review_fields_check",
      sql`(${table.reviewDecision} IS NULL AND ${table.reviewedAt} IS NULL)
        OR (${table.reviewDecision} IS NOT NULL AND ${table.reviewedAt} IS NOT NULL)`,
    ),
    check(
      "stories_review_status_check",
      sql`${table.reviewDecision} IS NULL
        OR (${table.reviewDecision} = 'approved' AND ${table.processingStatus} IN ('selected', 'published'))
        OR (${table.reviewDecision} = 'rejected' AND ${table.processingStatus} = 'rejected')`,
    ),
  ],
);
