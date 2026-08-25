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
  storyProcessingStatusEnum,
  storyReviewDecisionEnum,
} from "./enums";
import { stories } from "./stories";
import { topics } from "./topics";

/**
 * Editorial state belongs to a topic, not to the canonical article. This lets
 * the same URL be rejected in one topic and selected in another.
 */
export const topicStories = pgTable(
  "topic_stories",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    topicId: uuid("topic_id")
      .notNull()
      .references(() => topics.id, { onDelete: "cascade" }),
    storyId: uuid("story_id")
      .notNull()
      .references(() => stories.id, { onDelete: "cascade" }),
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
  },
  (table) => [
    uniqueIndex("topic_stories_topic_story_unique").on(
      table.topicId,
      table.storyId,
    ),
    index("topic_stories_topic_status_idx").on(
      table.topicId,
      table.processingStatus,
    ),
    index("topic_stories_topic_review_idx").on(
      table.topicId,
      table.reviewDecision,
    ),
    index("topic_stories_topic_relevance_idx").on(
      table.topicId,
      table.relevanceScore,
    ),
    index("topic_stories_topic_retention_idx").on(
      table.topicId,
      table.processingStatus,
      table.lastSeenAt,
    ),
    check(
      "topic_stories_relevance_score_check",
      sql`${table.relevanceScore} BETWEEN 0 AND 100`,
    ),
    check(
      "topic_stories_seen_dates_check",
      sql`${table.lastSeenAt} >= ${table.firstSeenAt}`,
    ),
    check(
      "topic_stories_review_fields_check",
      sql`(${table.reviewDecision} IS NULL AND ${table.reviewedAt} IS NULL)
        OR (${table.reviewDecision} IS NOT NULL AND ${table.reviewedAt} IS NOT NULL)`,
    ),
    check(
      "topic_stories_review_status_check",
      sql`${table.reviewDecision} IS NULL
        OR (${table.reviewDecision} = 'approved' AND ${table.processingStatus} IN ('selected', 'published'))
        OR (${table.reviewDecision} = 'rejected' AND ${table.processingStatus} = 'rejected')`,
    ),
  ],
);
