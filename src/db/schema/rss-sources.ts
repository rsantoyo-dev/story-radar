import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  foreignKey,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

import { rssContentModeEnum } from "./enums";
import { topics } from "./topics";
import { workspaces } from "./workspaces";

/**
 * A feed belongs to one workspace and can be reused by any of its topics.
 * Scheduling and feed parsing settings are source-level because the feed is
 * fetched once, then evaluated separately for each attached topic.
 */
export const rssSources = pgTable(
  "rss_sources",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    url: text("url").notNull(),
    language: text("language").notNull(),
    region: text("region").notNull(),
    contentMode: rssContentModeEnum("content_mode").default("auto").notNull(),
    pollEveryMinutes: integer("poll_every_minutes").default(60).notNull(),
    isActive: boolean("is_active").default(true).notNull(),
    createdAt: timestamp("created_at", {
      withTimezone: true,
      mode: "date",
    })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", {
      withTimezone: true,
      mode: "date",
    })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    unique("rss_sources_workspace_slug_unique").on(
      table.workspaceId,
      table.slug,
    ),
    unique("rss_sources_workspace_url_unique").on(
      table.workspaceId,
      table.url,
    ),
    // This supports the composite foreign key in topic_sources.
    unique("rss_sources_workspace_id_id_unique").on(
      table.workspaceId,
      table.id,
    ),
    index("rss_sources_workspace_active_idx").on(
      table.workspaceId,
      table.isActive,
    ),
    check(
      "rss_sources_name_not_blank_check",
      sql`char_length(btrim(${table.name})) > 0`,
    ),
    check(
      "rss_sources_slug_format_check",
      sql`${table.slug} ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'`,
    ),
    check(
      "rss_sources_url_protocol_check",
      sql`${table.url} ~* '^https?://'`,
    ),
    check(
      "rss_sources_poll_interval_check",
      sql`${table.pollEveryMinutes} BETWEEN 5 AND 1440`,
    ),
  ],
);

/**
 * Topic-specific feed settings. A feed may be enabled, tagged and prioritized
 * differently for each topic without duplicating its connection details.
 */
export const topicSources = pgTable(
  "topic_sources",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    topicId: uuid("topic_id").notNull(),
    rssSourceId: uuid("rss_source_id").notNull(),
    enabled: boolean("enabled").default(true).notNull(),
    tags: text("tags")
      .array()
      .notNull()
      .default(sql`ARRAY[]::text[]`),
    priority: integer("priority").default(0).notNull(),
    createdAt: timestamp("created_at", {
      withTimezone: true,
      mode: "date",
    })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", {
      withTimezone: true,
      mode: "date",
    })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    unique("topic_sources_topic_source_unique").on(
      table.topicId,
      table.rssSourceId,
    ),
    index("topic_sources_workspace_topic_enabled_idx").on(
      table.workspaceId,
      table.topicId,
      table.enabled,
    ),
    index("topic_sources_rss_source_id_idx").on(table.rssSourceId),
    foreignKey({
      name: "topic_sources_workspace_topic_fk",
      columns: [table.workspaceId, table.topicId],
      foreignColumns: [topics.workspaceId, topics.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "topic_sources_workspace_rss_source_fk",
      columns: [table.workspaceId, table.rssSourceId],
      foreignColumns: [rssSources.workspaceId, rssSources.id],
    }).onDelete("cascade"),
    check(
      "topic_sources_priority_check",
      sql`${table.priority} BETWEEN 0 AND 100`,
    ),
  ],
);

export type RssSource = typeof rssSources.$inferSelect;
export type NewRssSource = typeof rssSources.$inferInsert;
export type TopicSource = typeof topicSources.$inferSelect;
export type NewTopicSource = typeof topicSources.$inferInsert;
