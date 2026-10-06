import { sql } from "drizzle-orm";
import { boolean, check, foreignKey, integer, jsonb, pgTable, real, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { topicStories } from "./topic-stories";

/** Append-only editorial copies; never overwrite the publisher's shared story. */
export const storyContentRevisions = pgTable("story_content_revisions", {
  id: uuid("id").defaultRandom().primaryKey(),
  topicId: uuid("topic_id").notNull(),
  storyId: uuid("story_id").notNull(),
  revision: integer("revision").notNull(),
  title: text("title").notNull(),
  content: text("content").notNull(),
  original: jsonb("original").$type<{ title: string; text: string }>().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, table => [
  foreignKey({ columns: [table.topicId, table.storyId], foreignColumns: [topicStories.topicId, topicStories.storyId] }).onDelete("cascade"),
  uniqueIndex("story_content_revision_unique").on(table.topicId, table.storyId, table.revision),
]);

/** Immutable image bytes and metadata. Revocation retains historical inputs. */
export const storyReferencePhotos = pgTable("story_reference_photos", {
  id: uuid("id").defaultRandom().primaryKey(),
  topicId: uuid("topic_id").notNull(),
  storyId: uuid("story_id").notNull(),
  name: text("name").notNull(),
  description: text("description").notNull(),
  provenance: text("provenance").notNull(),
  providerTransmissionAllowed: boolean("provider_transmission_allowed").notNull().default(false),
  active: boolean("active").notNull().default(true),
  objectKey: text("object_key").notNull(),
  sha256: text("sha256").notNull(),
  fileName: text("file_name").notNull(),
  contentType: text("content_type").notNull().default("image/webp"),
  fileSize: integer("file_size").notNull(),
  /**
   * Where the photo's subject is, as fractions of its width and height, set
   * by the editor. Crops keep this point; null leaves framing automatic. It
   * changes framing only, never the bytes. The repository writes both or
   * neither, and a row with only one reads as automatic framing.
   */
  focusX: real("focus_x"),
  focusY: real("focus_y"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, table => [
  foreignKey({ columns: [table.topicId, table.storyId], foreignColumns: [topicStories.topicId, topicStories.storyId] }).onDelete("cascade"),
  uniqueIndex("story_reference_object_unique").on(table.objectKey),
  check("story_reference_photo_focus_check", sql`(${table.focusX} IS NULL AND ${table.focusY} IS NULL) OR (${table.focusX} BETWEEN 0 AND 1 AND ${table.focusY} BETWEEN 0 AND 1)`),
]);

/**
 * Editor-provided evidence for one story: a fact the sources lack but a human
 * vouches for (e.g. a local peak season). It joins the brief's facts with
 * provenance "editor" so guards, the critic and regenerations treat it as
 * evidence instead of stripping copy that relies on it. Never edited in place:
 * retracting sets active=false and keeps the row for history.
 */
export const storyEditorFacts = pgTable("story_editor_facts", {
  id: uuid("id").defaultRandom().primaryKey(),
  topicId: uuid("topic_id").notNull(),
  storyId: uuid("story_id").notNull(),
  statement: text("statement").notNull(),
  sourceUrl: text("source_url"),
  note: text("note"),
  createdBy: text("created_by"),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  retractedAt: timestamp("retracted_at", { withTimezone: true }),
}, table => [
  foreignKey({ columns: [table.topicId, table.storyId], foreignColumns: [topicStories.topicId, topicStories.storyId] }).onDelete("cascade"),
]);
