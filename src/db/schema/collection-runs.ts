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
  collectionRunStatusEnum,
  collectionSourceStatusEnum,
} from "./enums";
import { topics } from "./topics";

export const collectionRuns = pgTable(
  "collection_runs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    topicId: uuid("topic_id")
      .notNull()
      .references(() => topics.id, { onDelete: "cascade" }),
    status: collectionRunStatusEnum("status").notNull(),
    startedAt: timestamp("started_at", {
      withTimezone: true,
      mode: "date",
    }).notNull(),
    finishedAt: timestamp("finished_at", {
      withTimezone: true,
      mode: "date",
    }).notNull(),
    requestedSources: integer("requested_sources").notNull(),
    successfulSources: integer("successful_sources").notNull(),
    failedSources: integer("failed_sources").notNull(),
    fetchedItems: integer("fetched_items").notNull(),
    includedItems: integer("included_items").notNull(),
    filteredOutItems: integer("filtered_out_items").notNull(),
    duplicatesRemoved: integer("duplicates_removed").notNull(),
    exactDuplicatesRemoved: integer("exact_duplicates_removed")
      .default(0)
      .notNull(),
    similarDuplicatesRemoved: integer("similar_duplicates_removed")
      .default(0)
      .notNull(),
    readyItems: integer("ready_items").default(0).notNull(),
    needsEnrichmentItems: integer("needs_enrichment_items")
      .default(0)
      .notNull(),
    reviewItems: integer("review_items").default(0).notNull(),
    rejectedItems: integer("rejected_items").default(0).notNull(),
    createdAt: timestamp("created_at", {
      withTimezone: true,
      mode: "date",
    })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("collection_runs_topic_started_at_idx").on(
      table.topicId,
      table.startedAt,
    ),
    index("collection_runs_started_at_idx").on(table.startedAt),
    check(
      "collection_runs_sources_check",
      sql`${table.requestedSources} >= 0
        AND ${table.successfulSources} >= 0
        AND ${table.failedSources} >= 0
        AND ${table.requestedSources} = ${table.successfulSources} + ${table.failedSources}`,
    ),
    check(
      "collection_runs_items_check",
      sql`${table.fetchedItems} >= 0
        AND ${table.includedItems} >= 0
        AND ${table.filteredOutItems} >= 0
        AND ${table.duplicatesRemoved} >= 0
        AND ${table.fetchedItems} = ${table.includedItems} + ${table.filteredOutItems} + ${table.duplicatesRemoved}`,
    ),
    check(
      "collection_runs_dates_check",
      sql`${table.finishedAt} >= ${table.startedAt}`,
    ),
    check(
      "collection_runs_duplicate_types_check",
      sql`${table.exactDuplicatesRemoved} >= 0
        AND ${table.similarDuplicatesRemoved} >= 0
        AND ${table.duplicatesRemoved} = ${table.exactDuplicatesRemoved} + ${table.similarDuplicatesRemoved}`,
    ),
    check(
      "collection_runs_relevance_check",
      sql`${table.readyItems} >= 0
        AND ${table.needsEnrichmentItems} >= 0
        AND ${table.reviewItems} >= 0
        AND ${table.rejectedItems} >= 0
        AND ${table.includedItems} = ${table.readyItems} + ${table.needsEnrichmentItems} + ${table.reviewItems} + ${table.rejectedItems}`,
    ),
  ],
);

export const collectionSourceRuns = pgTable(
  "collection_source_runs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    collectionRunId: uuid("collection_run_id")
      .notNull()
      .references(() => collectionRuns.id, { onDelete: "cascade" }),
    sourceId: text("source_id").notNull(),
    sourceName: text("source_name").notNull(),
    status: collectionSourceStatusEnum("status").notNull(),
    fetchedItems: integer("fetched_items").notNull(),
    includedItems: integer("included_items").notNull(),
    filteredOutItems: integer("filtered_out_items").notNull(),
    duplicatesRemoved: integer("duplicates_removed").notNull(),
    error: text("error"),
    createdAt: timestamp("created_at", {
      withTimezone: true,
      mode: "date",
    })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("collection_source_runs_run_source_unique").on(
      table.collectionRunId,
      table.sourceId,
    ),
    index("collection_source_runs_collection_run_id_idx").on(
      table.collectionRunId,
    ),
    index("collection_source_runs_source_id_idx").on(table.sourceId),
    check(
      "collection_source_runs_items_check",
      sql`${table.fetchedItems} >= 0
        AND ${table.includedItems} >= 0
        AND ${table.filteredOutItems} >= 0
        AND ${table.duplicatesRemoved} >= 0
        AND ${table.fetchedItems} = ${table.includedItems} + ${table.filteredOutItems} + ${table.duplicatesRemoved}`,
    ),
  ],
);
