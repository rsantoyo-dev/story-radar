import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { creativeAssetBatches, creativeDrafts } from "./creative-content";
import { stories } from "./stories";
import { topics } from "./topics";

/**
 * PUB-03. An immutable, delivery-ready snapshot of an approved creative set,
 * frozen from a PUB-01 "ready" candidate. It captures the exact caption, slide
 * order, asset versions and file hashes, the script/policy snapshot and the
 * destination identity. A mutable draft id cannot reproduce what was published,
 * so everything needed lives here. Freezing does not publish or schedule.
 */
export const instagramPublicationPackages = pgTable(
  "instagram_publication_packages",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    topicId: uuid("topic_id")
      .notNull()
      .references(() => topics.id, { onDelete: "cascade" }),
    storyId: uuid("story_id")
      .notNull()
      .references(() => stories.id, { onDelete: "cascade" }),
    draftId: uuid("draft_id")
      .notNull()
      .references(() => creativeDrafts.id, { onDelete: "cascade" }),
    draftVersion: integer("draft_version").notNull(),
    batchId: uuid("batch_id")
      .notNull()
      .references(() => creativeAssetBatches.id, { onDelete: "cascade" }),
    /** The PUB-01 candidate `snapshotHash` this was frozen from. */
    candidateSnapshotHash: text("candidate_snapshot_hash").notNull(),
    /** Hash of the deliverable: caption + ordered slide hashes + destination identity. */
    packageHash: text("package_hash").notNull(),
    mediaType: text("media_type").notNull(),
    caption: text("caption").notNull(),
    hashtags: text("hashtags")
      .array()
      .notNull()
      .default(sql`ARRAY[]::text[]`),
    igUserId: text("ig_user_id"),
    igUsername: text("ig_username"),
    connectionVersion: text("connection_version").notNull(),
    scriptSnapshot: jsonb("script_snapshot").notNull(),
    policySnapshot: jsonb("policy_snapshot"),
    /** Per-slide human-readable technical transforms applied (re-encode only). */
    transforms: jsonb("transforms").notNull(),
    status: text("status").default("frozen").notNull(),
    /** True when frozen before the live publishing-access check passed. PUB-04
     * must re-verify capability before it can consume this package. */
    publishingAccessPending: boolean("publishing_access_pending")
      .default(false)
      .notNull(),
    expiresAt: timestamp("expires_at", {
      withTimezone: true,
      mode: "date",
    }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("instagram_publication_packages_draft_candidate_unique").on(
      table.draftId,
      table.candidateSnapshotHash,
    ),
    index("instagram_publication_packages_topic_draft_idx").on(
      table.topicId,
      table.draftId,
    ),
    index("instagram_publication_packages_status_expiry_idx").on(
      table.status,
      table.expiresAt,
    ),
    check(
      "instagram_publication_packages_values_check",
      sql`${table.draftVersion} > 0
        AND ${table.mediaType} IN ('image', 'carousel')
        AND ${table.status} IN ('frozen', 'stale', 'consumed')`,
    ),
    check(
      "instagram_publication_packages_dates_check",
      sql`${table.updatedAt} >= ${table.createdAt}
        AND ${table.expiresAt} > ${table.createdAt}`,
    ),
  ],
);

/**
 * One frozen JPEG per slide, served to Instagram's servers by opaque token via
 * the public `GET /api/deliver/<token>` route. `object_key` is a private R2 key
 * and never leaves the server.
 */
export const instagramDeliveryFiles = pgTable(
  "instagram_delivery_files",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    packageId: uuid("package_id")
      .notNull()
      .references(() => instagramPublicationPackages.id, { onDelete: "cascade" }),
    unitOrder: integer("unit_order").notNull(),
    assetVersion: integer("asset_version").notNull(),
    token: text("token").notNull(),
    objectKey: text("object_key").notNull(),
    contentType: text("content_type").notNull(),
    byteSize: integer("byte_size").notNull(),
    sha256: text("sha256").notNull(),
    sourceSha256: text("source_sha256").notNull(),
    width: integer("width").notNull(),
    height: integer("height").notNull(),
    expiresAt: timestamp("expires_at", {
      withTimezone: true,
      mode: "date",
    }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("instagram_delivery_files_token_unique").on(table.token),
    index("instagram_delivery_files_package_idx").on(table.packageId),
    index("instagram_delivery_files_expiry_idx").on(table.expiresAt),
    check(
      "instagram_delivery_files_values_check",
      sql`${table.unitOrder} > 0
        AND ${table.byteSize} > 0
        AND ${table.width} > 0
        AND ${table.height} > 0`,
    ),
  ],
);
