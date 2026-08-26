import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

import { workspaces } from "./workspaces";

/**
 * Topics are independently configurable editorial streams within a workspace.
 */
export const topics = pgTable(
  "topics",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    description: text("description"),
    themeKey: text("theme_key").default("press-green").notNull(),
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
    unique("topics_workspace_slug_unique").on(table.workspaceId, table.slug),
    // This supports the composite foreign key in topic_sources, which prevents
    // a topic from being linked to a source owned by another workspace.
    unique("topics_workspace_id_id_unique").on(table.workspaceId, table.id),
    index("topics_workspace_active_idx").on(table.workspaceId, table.isActive),
    check(
      "topics_name_not_blank_check",
      sql`char_length(btrim(${table.name})) > 0`,
    ),
    check(
      "topics_slug_format_check",
      sql`${table.slug} ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'`,
    ),
  ],
);

export type Topic = typeof topics.$inferSelect;
export type NewTopic = typeof topics.$inferInsert;
