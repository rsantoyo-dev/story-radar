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
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { topics } from "./topics";
import { stories } from "./stories";
import { workspaces } from "./workspaces";

/**
 * Stable identity for a long-lived source document. Extracted content lives in
 * immutable versions so a new edition never destroys page-level citations.
 */
export const knowledgeDocuments = pgTable(
  "knowledge_documents",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    canonicalUrl: text("canonical_url").notNull(),
    sourceUrl: text("source_url").notNull(),
    documentType: text("document_type").default("guideline").notNull(),
    mimeType: text("mime_type").default("application/pdf").notNull(),
    language: text("language").default("unknown").notNull(),
    publisher: text("publisher"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    unique("knowledge_documents_workspace_id_id_unique").on(
      table.workspaceId,
      table.id,
    ),
    uniqueIndex("knowledge_documents_workspace_url_unique").on(
      table.workspaceId,
      table.canonicalUrl,
    ),
    index("knowledge_documents_workspace_updated_idx").on(
      table.workspaceId,
      table.updatedAt,
    ),
    check(
      "knowledge_documents_url_protocol_check",
      sql`${table.canonicalUrl} ~* '^https?://' AND ${table.sourceUrl} ~* '^https?://'`,
    ),
    check(
      "knowledge_documents_type_check",
      sql`${table.documentType} IN ('guideline', 'report', 'study', 'manual', 'other')`,
    ),
    check(
      "knowledge_documents_mime_check",
      sql`${table.mimeType} = 'application/pdf'`,
    ),
  ],
);

/** Topic-specific attachment and editorial priority for a reusable document. */
export const topicKnowledgeDocuments = pgTable(
  "topic_knowledge_documents",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    topicId: uuid("topic_id").notNull(),
    documentId: uuid("document_id").notNull(),
    enabled: boolean("enabled").default(true).notNull(),
    tags: text("tags")
      .array()
      .notNull()
      .default(sql`ARRAY[]::text[]`),
    priority: integer("priority").default(0).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("topic_knowledge_documents_topic_document_unique").on(
      table.topicId,
      table.documentId,
    ),
    index("topic_knowledge_documents_topic_enabled_idx").on(
      table.topicId,
      table.enabled,
    ),
    foreignKey({
      name: "topic_knowledge_documents_workspace_topic_fk",
      columns: [table.workspaceId, table.topicId],
      foreignColumns: [topics.workspaceId, topics.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "topic_knowledge_documents_workspace_document_fk",
      columns: [table.workspaceId, table.documentId],
      foreignColumns: [knowledgeDocuments.workspaceId, knowledgeDocuments.id],
    }).onDelete("cascade"),
    check(
      "topic_knowledge_documents_priority_check",
      sql`${table.priority} BETWEEN 0 AND 100`,
    ),
  ],
);

export const knowledgeDocumentVersions = pgTable(
  "knowledge_document_versions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    documentId: uuid("document_id")
      .notNull()
      .references(() => knowledgeDocuments.id, { onDelete: "cascade" }),
    contentHash: text("content_hash").notNull(),
    title: text("title").notNull(),
    author: text("author"),
    subject: text("subject"),
    edition: text("edition"),
    pageCount: integer("page_count").notNull(),
    sectionCount: integer("section_count").notNull(),
    sourceLastModified: text("source_last_modified"),
    extractedAt: timestamp("extracted_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("knowledge_document_versions_document_hash_unique").on(
      table.documentId,
      table.contentHash,
    ),
    index("knowledge_document_versions_document_extracted_idx").on(
      table.documentId,
      table.extractedAt,
    ),
    check(
      "knowledge_document_versions_counts_check",
      sql`${table.pageCount} > 0 AND ${table.sectionCount} > 0`,
    ),
  ],
);

/** Search-sized chunks that never cross their source heading boundaries. */
export const knowledgeDocumentSections = pgTable(
  "knowledge_document_sections",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    documentVersionId: uuid("document_version_id")
      .notNull()
      .references(() => knowledgeDocumentVersions.id, { onDelete: "cascade" }),
    ordinal: integer("ordinal").notNull(),
    heading: text("heading").notNull(),
    pageStart: integer("page_start").notNull(),
    pageEnd: integer("page_end").notNull(),
    printedPageStart: integer("printed_page_start"),
    printedPageEnd: integer("printed_page_end"),
    text: text("text").notNull(),
    textHash: text("text_hash").notNull(),
    characterCount: integer("character_count").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("knowledge_document_sections_version_ordinal_unique").on(
      table.documentVersionId,
      table.ordinal,
    ),
    index("knowledge_document_sections_version_pages_idx").on(
      table.documentVersionId,
      table.pageStart,
    ),
    check(
      "knowledge_document_sections_values_check",
      sql`${table.ordinal} >= 0
        AND ${table.pageStart} > 0
        AND ${table.pageEnd} >= ${table.pageStart}
        AND ((${table.printedPageStart} IS NULL AND ${table.printedPageEnd} IS NULL)
          OR (${table.printedPageStart} > 0
            AND ${table.printedPageEnd} >= ${table.printedPageStart}))
        AND ${table.characterCount} > 0
        AND char_length(btrim(${table.heading})) > 0
        AND char_length(btrim(${table.text})) > 0`,
    ),
  ],
);

/**
 * Traceability from an editorial story back to the immutable PDF section that
 * supplied its copy. A section may support multiple editorial treatments, but
 * it may only be attached once to the same story.
 */
export const storyKnowledgeOrigins = pgTable(
  "story_knowledge_origins",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    topicId: uuid("topic_id")
      .notNull()
      .references(() => topics.id, { onDelete: "cascade" }),
    storyId: uuid("story_id")
      .notNull()
      .references(() => stories.id, { onDelete: "cascade" }),
    sectionId: uuid("section_id")
      .notNull()
      .references(() => knowledgeDocumentSections.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("story_knowledge_origins_topic_story_section_unique").on(
      table.topicId,
      table.storyId,
      table.sectionId,
    ),
    index("story_knowledge_origins_story_idx").on(table.storyId),
  ],
);

export const knowledgeDocumentIngestionRuns = pgTable(
  "knowledge_document_ingestion_runs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    documentId: uuid("document_id")
      .notNull()
      .references(() => knowledgeDocuments.id, { onDelete: "cascade" }),
    status: text("status").default("queued").notNull(),
    stage: text("stage").default("queued").notNull(),
    pagesProcessed: integer("pages_processed").default(0).notNull(),
    pagesTotal: integer("pages_total"),
    error: text("error"),
    startedAt: timestamp("started_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
    finishedAt: timestamp("finished_at", { withTimezone: true, mode: "date" }),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("knowledge_document_ingestion_runs_document_started_idx").on(
      table.documentId,
      table.startedAt,
    ),
    index("knowledge_document_ingestion_runs_status_idx").on(table.status),
    check(
      "knowledge_document_ingestion_runs_status_check",
      sql`${table.status} IN ('queued', 'processing', 'completed', 'failed')`,
    ),
    check(
      "knowledge_document_ingestion_runs_stage_check",
      sql`${table.stage} IN ('queued', 'fetching', 'extracting', 'persisting', 'completed', 'failed')`,
    ),
    check(
      "knowledge_document_ingestion_runs_progress_check",
      sql`${table.pagesProcessed} >= 0
        AND (${table.pagesTotal} IS NULL OR ${table.pagesTotal} > 0)
        AND (${table.pagesTotal} IS NULL OR ${table.pagesProcessed} <= ${table.pagesTotal})`,
    ),
    check(
      "knowledge_document_ingestion_runs_result_check",
      sql`(${table.status} = 'completed' AND ${table.finishedAt} IS NOT NULL AND ${table.error} IS NULL)
        OR (${table.status} = 'failed' AND ${table.finishedAt} IS NOT NULL AND ${table.error} IS NOT NULL)
        OR (${table.status} IN ('queued', 'processing') AND ${table.finishedAt} IS NULL AND ${table.error} IS NULL)`,
    ),
  ],
);

export type KnowledgeDocument = typeof knowledgeDocuments.$inferSelect;
export type TopicKnowledgeDocument = typeof topicKnowledgeDocuments.$inferSelect;
export type KnowledgeDocumentVersion = typeof knowledgeDocumentVersions.$inferSelect;
export type KnowledgeDocumentSection = typeof knowledgeDocumentSections.$inferSelect;
export type KnowledgeDocumentIngestionRun = typeof knowledgeDocumentIngestionRuns.$inferSelect;
export type StoryKnowledgeOrigin = typeof storyKnowledgeOrigins.$inferSelect;
