import { sql } from "drizzle-orm";
import {
  check,
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import {
  socialPublicationPlatformEnum,
  socialPublicationStatusEnum,
} from "./enums";
import { stories } from "./stories";
import { topics } from "./topics";

/**
 * Platform-specific publication tracking belongs to the topic/story pair.
 * Records are intentionally separate from topic_stories.processing_status so
 * editorial history remains intact while a story is scheduled or published.
 */
export const storySocialPublications = pgTable(
  "story_social_publications",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    topicId: uuid("topic_id")
      .notNull()
      .references(() => topics.id, { onDelete: "cascade" }),
    storyId: uuid("story_id")
      .notNull()
      .references(() => stories.id, { onDelete: "cascade" }),
    platform: socialPublicationPlatformEnum("platform").notNull(),
    status: socialPublicationStatusEnum("status").default("draft").notNull(),
    scheduledAt: timestamp("scheduled_at", {
      withTimezone: true,
      mode: "date",
    }),
    publishedAt: timestamp("published_at", {
      withTimezone: true,
      mode: "date",
    }),
    postUrl: text("post_url"),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("story_social_publications_topic_story_platform_unique").on(
      table.topicId,
      table.storyId,
      table.platform,
    ),
    index("story_social_publications_topic_status_idx").on(
      table.topicId,
      table.status,
    ),
    index("story_social_publications_story_id_idx").on(table.storyId),
    check(
      "story_social_publications_dates_check",
      sql`${table.publishedAt} IS NULL
        OR ${table.scheduledAt} IS NULL
        OR ${table.publishedAt} >= ${table.scheduledAt}`,
    ),
    check(
      "story_social_publications_post_url_check",
      sql`${table.postUrl} IS NULL OR ${table.postUrl} ~* '^https?://'`,
    ),
    check(
      "story_social_publications_note_length_check",
      sql`${table.note} IS NULL OR char_length(${table.note}) <= 2000`,
    ),
  ],
);
