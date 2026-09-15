import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import type { TopicAcquisitionLens } from "@/app/modules/stories/acquisition-lenses";

import { editorialLines } from "./editorial-lines";
import { topics } from "./topics";

/** Immutable acquisition-lens snapshots. Version 1 uses only topic-level rows. */
export const topicAcquisitionLenses = pgTable(
  "topic_acquisition_lenses",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    topicId: uuid("topic_id")
      .notNull()
      .references(() => topics.id, { onDelete: "cascade" }),
    /** Reserved for a future explicit Editorial Line override. */
    lineId: uuid("line_id"),
    taxonomyVersion: integer("taxonomy_version").notNull(),
    lenses: jsonb("lenses").$type<TopicAcquisitionLens[]>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("topic_acquisition_lenses_topic_default_version_unique")
      .on(table.topicId, table.taxonomyVersion)
      .where(sql`${table.lineId} IS NULL`),
    uniqueIndex("topic_acquisition_lenses_topic_line_version_unique")
      .on(table.topicId, table.lineId, table.taxonomyVersion)
      .where(sql`${table.lineId} IS NOT NULL`),
    index("topic_acquisition_lenses_topic_created_idx").on(
      table.topicId,
      table.createdAt,
    ),
    foreignKey({
      columns: [table.topicId, table.lineId],
      foreignColumns: [editorialLines.topicId, editorialLines.id],
      name: "topic_acquisition_lenses_editorial_line_fk",
    }).onDelete("cascade"),
    check(
      "topic_acquisition_lenses_version_check",
      sql`${table.taxonomyVersion} >= 1`,
    ),
    check(
      "topic_acquisition_lenses_lenses_check",
      sql`jsonb_typeof(${table.lenses}) = 'array' AND jsonb_array_length(${table.lenses}) > 0`,
    ),
  ],
);

export type TopicAcquisitionLensSnapshot =
  typeof topicAcquisitionLenses.$inferSelect;