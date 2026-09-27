import { sql } from "drizzle-orm";
import { check, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import { instagramPublicationJobs } from "./instagram-publication-jobs";
import { instagramPublicationPackages } from "./instagram-publication-packages";
import { stories } from "./stories";
import { topics } from "./topics";
import { workspaces } from "./workspaces";

/** The explicit authorization and original set of destinations; never shrinks after a partial failure. */
export const metaPublicationOrders = pgTable("meta_publication_orders", {
  id: uuid("id").defaultRandom().primaryKey(),
  workspaceId: text("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  topicId: uuid("topic_id").notNull().references(() => topics.id, { onDelete: "cascade" }),
  storyId: uuid("story_id").notNull().references(() => stories.id, { onDelete: "cascade" }),
  editorialLineId: uuid("editorial_line_id"),
  idempotencyKey: text("idempotency_key").notNull(),
  action: text("action").notNull(),
  authorizedDestinations: jsonb("authorized_destinations").$type<Array<{ platform: "instagram" | "facebook"; accountId: string }>>().notNull(),
  authorization: jsonb("authorization").$type<Record<string, unknown>>().notNull(),
  authorizedBy: text("authorized_by"),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
}, table => [
  uniqueIndex("meta_publication_orders_idempotency_unique").on(table.idempotencyKey),
  index("meta_publication_orders_topic_story_idx").on(table.topicId, table.storyId),
  check("meta_publication_orders_action_check", sql`${table.action} IN ('publish-now', 'schedule')`),
  check("meta_publication_orders_destinations_check", sql`jsonb_typeof(${table.authorizedDestinations}) = 'array' AND jsonb_array_length(${table.authorizedDestinations}) > 0`),
]);

/** One durable destination and frozen package per send. A retry keeps this row. */
export const metaPublicationDeliveries = pgTable("meta_publication_deliveries", {
  id: uuid("id").defaultRandom().primaryKey(),
  orderId: uuid("order_id").notNull().references(() => metaPublicationOrders.id, { onDelete: "cascade" }),
  workspaceId: text("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  topicId: uuid("topic_id").notNull().references(() => topics.id, { onDelete: "cascade" }),
  storyId: uuid("story_id").notNull().references(() => stories.id, { onDelete: "cascade" }),
  editorialLineId: uuid("editorial_line_id"),
  platform: text("platform").notNull(),
  accountId: text("account_id").notNull(),
  connectionVersion: text("connection_version").notNull(),
  packageId: uuid("package_id").references(() => instagramPublicationPackages.id, { onDelete: "restrict" }),
  packageHash: text("package_hash").notNull(),
  /** Future Facebook packages can use this snapshot without changing Instagram's frozen rows. */
  packageSnapshot: jsonb("package_snapshot").$type<Record<string, unknown>>(),
  legacyInstagramJobId: uuid("legacy_instagram_job_id").references(() => instagramPublicationJobs.id, { onDelete: "restrict" }),
  status: text("status").notNull().default("queued"),
  attempts: integer("attempts").notNull().default(0),
  scheduledAt: timestamp("scheduled_at", { withTimezone: true, mode: "date" }),
  confirmedAt: timestamp("confirmed_at", { withTimezone: true, mode: "date" }),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
}, table => [
  uniqueIndex("meta_publication_deliveries_legacy_job_unique").on(table.legacyInstagramJobId),
  uniqueIndex("meta_publication_deliveries_order_platform_unique").on(table.orderId, table.platform),
  index("meta_publication_deliveries_topic_story_idx").on(table.topicId, table.storyId),
  index("meta_publication_deliveries_status_idx").on(table.status, table.scheduledAt),
  check("meta_publication_deliveries_platform_check", sql`${table.platform} IN ('instagram', 'facebook')`),
  check("meta_publication_deliveries_attempts_check", sql`${table.attempts} >= 0`),
]);

/** Written from a remote media ID before projecting a gallery row; safe to replay after local failure. */
export const metaPublicationConfirmations = pgTable("meta_publication_confirmations", {
  id: uuid("id").defaultRandom().primaryKey(),
  deliveryId: uuid("delivery_id").notNull().references(() => metaPublicationDeliveries.id, { onDelete: "cascade" }),
  platform: text("platform").notNull(),
  accountId: text("account_id").notNull(),
  remoteId: text("remote_id").notNull(),
  permalink: text("permalink"),
  confirmedAt: timestamp("confirmed_at", { withTimezone: true, mode: "date" }).notNull(),
}, table => [
  uniqueIndex("meta_publication_confirmations_delivery_unique").on(table.deliveryId),
  uniqueIndex("meta_publication_confirmations_remote_unique").on(table.platform, table.accountId, table.remoteId),
  check("meta_publication_confirmations_platform_check", sql`${table.platform} IN ('instagram', 'facebook')`),
]);
