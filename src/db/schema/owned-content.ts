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

import { stories } from "./stories";
import { topics } from "./topics";

/**
 * The editor-owned source record behind a manually created radar story. The
 * normalized story remains the shared editorial workflow entry point.
 */
export const ownedContentEntries = pgTable(
  "owned_content_entries",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    topicId: uuid("topic_id")
      .notNull()
      .references(() => topics.id, { onDelete: "cascade" }),
    storyId: uuid("story_id")
      .notNull()
      .references(() => stories.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    content: text("content").notNull(),
    contentType: text("content_type").default("campaign").notNull(),
    language: text("language").default("en").notNull(),
    region: text("region").default("global").notNull(),
    sourceUrl: text("source_url"),
    publishedAt: timestamp("published_at", {
      withTimezone: true,
      mode: "date",
    }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("owned_content_entries_story_id_unique").on(table.storyId),
    index("owned_content_entries_topic_published_idx").on(
      table.topicId,
      table.publishedAt,
    ),
    check(
      "owned_content_entries_type_check",
      sql`${table.contentType} IN ('campaign', 'launch', 'promotion', 'product', 'announcement', 'educational')`,
    ),
    check(
      "owned_content_entries_title_not_blank_check",
      sql`char_length(btrim(${table.title})) > 0`,
    ),
    check(
      "owned_content_entries_content_not_blank_check",
      sql`char_length(btrim(${table.content})) > 0`,
    ),
  ],
);
