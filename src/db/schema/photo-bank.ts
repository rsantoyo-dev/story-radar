import { sql } from "drizzle-orm";
import { boolean, check, index, integer, jsonb, pgTable, primaryKey, real, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import { stories } from "./stories";
import { topics } from "./topics";
import { workspaces } from "./workspaces";

/**
 * The workspace's photo bank: every photo its stories received (uploaded by
 * the editor, or imported from Wikimedia Commons), stored once with its rights
 * and credit, so a later story about the same place or person finds it before
 * any outside source. A story uses a bank photo through its own copy
 * (story_reference_photos.bank_photo_id): the story's material stays an
 * immutable snapshot, and retiring a bank photo never changes a story or a
 * publication. Never deleted: a retired photo is no longer offered.
 */
export const photoBankPhotos = pgTable("photo_bank_photos", {
  id: uuid("id").defaultRandom().primaryKey(),
  workspaceId: text("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description").notNull(),
  provenance: text("provenance").notNull(),
  providerTransmissionAllowed: boolean("provider_transmission_allowed").notNull().default(false),
  /** What the publication may do with it, as the editor declares it (story_reference_photos' rule): "own" and "licensed" may be published. */
  publicationRights: text("publication_rights").$type<"own" | "licensed" | "reference">().notNull().default("reference"),
  /** How it entered the bank: the editor's upload, or a Commons import. */
  source: text("source").$type<"upload" | "commons">().notNull(),
  /** Content-addressed and permanent (no retention class): the same bytes are one object. */
  objectKey: text("object_key").notNull(),
  sha256: text("sha256").notNull(),
  fileName: text("file_name").notNull(),
  contentType: text("content_type").notNull().default("image/webp"),
  fileSize: integer("file_size").notNull(),
  /** Where its subject is, as fractions of its width and height; a story's copy starts from it. */
  focusX: real("focus_x"),
  focusY: real("focus_y"),
  /** The brand and story it was first added to; null when it was uploaded to the bank itself. */
  originTopicId: uuid("origin_topic_id").references(() => topics.id, { onDelete: "set null" }),
  originStoryId: uuid("origin_story_id").references(() => stories.id, { onDelete: "set null" }),
  retiredAt: timestamp("retired_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex("photo_bank_photos_workspace_sha_unique").on(table.workspaceId, table.sha256),
  uniqueIndex("photo_bank_photos_object_unique").on(table.objectKey),
  check("photo_bank_photos_rights_check", sql`${table.publicationRights} IN ('own', 'licensed', 'reference')`),
  check("photo_bank_photos_source_check", sql`${table.source} IN ('upload', 'commons')`),
  check("photo_bank_photos_focus_check", sql`(${table.focusX} IS NULL AND ${table.focusY} IS NULL) OR (${table.focusX} BETWEEN 0 AND 1 AND ${table.focusY} BETWEEN 0 AND 1)`),
]);

/**
 * A place or a person the bank's photos show, with what identifies it beyond
 * its name: a place's Google Maps place id and Wikidata item, a public
 * person's Wikidata item. A story's place or person is matched by those ids
 * first, then by its name or one of its aliases (the names the stories gave
 * it).
 */
export const photoBankSubjects = pgTable("photo_bank_subjects", {
  id: uuid("id").defaultRandom().primaryKey(),
  workspaceId: text("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  kind: text("kind").$type<"place" | "person">().notNull(),
  name: text("name").notNull(),
  aliases: jsonb("aliases").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
  googlePlaceId: text("google_place_id"),
  wikidataId: text("wikidata_id"),
  address: text("address"),
  latitude: real("latitude"),
  longitude: real("longitude"),
  /** A person Wikidata does not know: the editor recorded that they agreed to appear in the publication's posts. */
  consentAt: timestamp("consent_at", { withTimezone: true }),
  /** A person: the editor once confirmed that a story's person is this one; the next stories that name them take their photo on their own. */
  confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex("photo_bank_subjects_google_unique").on(table.workspaceId, table.googlePlaceId).where(sql`${table.googlePlaceId} IS NOT NULL`),
  uniqueIndex("photo_bank_subjects_wikidata_unique").on(table.workspaceId, table.kind, table.wikidataId).where(sql`${table.wikidataId} IS NOT NULL`),
  check("photo_bank_subjects_kind_check", sql`${table.kind} IN ('place', 'person')`),
  check("photo_bank_subjects_name_check", sql`char_length(btrim(${table.name})) > 0`),
]);

/** What a bank photo shows: one row per place or person in it, with the story where the editor first gave it to them (null when tagged in the bank). */
export const photoBankTags = pgTable("photo_bank_tags", {
  photoId: uuid("photo_id").notNull().references(() => photoBankPhotos.id, { onDelete: "cascade" }),
  subjectId: uuid("subject_id").notNull().references(() => photoBankSubjects.id, { onDelete: "cascade" }),
  originTopicId: uuid("origin_topic_id").references(() => topics.id, { onDelete: "set null" }),
  originStoryId: uuid("origin_story_id").references(() => stories.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  primaryKey({ columns: [table.photoId, table.subjectId] }),
  index("photo_bank_tags_subject_idx").on(table.subjectId),
]);

export type PhotoBankPhotoRow = typeof photoBankPhotos.$inferSelect;
export type PhotoBankSubjectRow = typeof photoBankSubjects.$inferSelect;
