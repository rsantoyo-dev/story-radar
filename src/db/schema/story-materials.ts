import { boolean, foreignKey, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
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
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, table => [
  foreignKey({ columns: [table.topicId, table.storyId], foreignColumns: [topicStories.topicId, topicStories.storyId] }).onDelete("cascade"),
  uniqueIndex("story_reference_object_unique").on(table.objectKey),
]);
