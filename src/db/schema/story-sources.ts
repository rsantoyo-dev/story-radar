import {
  index,
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
  ],
);
