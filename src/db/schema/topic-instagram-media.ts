import { sql } from "drizzle-orm";
import {
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

import { topics } from "./topics";

/**
 * Instagram publications imported from a topic's connected account (IG-02).
 * One row per media object. `igUserId` isolates rows by account: the gallery
 * filters by the connection's *current* igUserId, so reconnecting the same
 * account keeps its history and connecting a different account never mixes
 * publications. Rows are never deleted — a media object that stops appearing
 * in a results page is not treated as removed, and one confirmed inaccessible
 * keeps its row with `access_state = 'inaccessible'`.
 *
 * Importing here creates no editorial story, topic_story or approval.
 */
export const topicInstagramMedia = pgTable(
  "topic_instagram_media",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    topicId: uuid("topic_id")
      .notNull()
      .references(() => topics.id, { onDelete: "cascade" }),
    /** The connected Instagram Business/Creator account this media belongs to. */
    igUserId: text("ig_user_id").notNull(),
    /** Instagram's own media id. Unique per topic (see the unique index). */
    externalId: text("external_id").notNull(),
    mediaType: text("media_type").notNull(),
    mediaProductType: text("media_product_type"),
    permalink: text("permalink"),
    caption: text("caption"),
    /** Signed delivery URLs that expire; refreshed on every sync. */
    mediaUrl: text("media_url"),
    thumbnailUrl: text("thumbnail_url"),
    publishedAt: timestamp("published_at", {
      withTimezone: true,
      mode: "date",
    }).notNull(),
    accessState: text("access_state").default("accessible").notNull(),
    /** Snapshot of the Graph node as received, for debugging and future fields. */
    raw: jsonb("raw").notNull(),
    importedAt: timestamp("imported_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("topic_instagram_media_topic_external_unique").on(
      table.topicId,
      table.externalId,
    ),
    index("topic_instagram_media_topic_account_published_idx").on(
      table.topicId,
      table.igUserId,
      table.publishedAt,
    ),
    check(
      "topic_instagram_media_access_state_check",
      sql`${table.accessState} IN ('accessible', 'inaccessible')`,
    ),
  ],
);

/**
 * Elements of an imported carousel (CAROUSEL_ALBUM). A carousel stays one
 * publication with its elements — never several independent rows in
 * topic_instagram_media. Replaced deterministically on each sync of the parent.
 */
export const topicInstagramMediaChildren = pgTable(
  "topic_instagram_media_children",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    mediaId: uuid("media_id")
      .notNull()
      .references(() => topicInstagramMedia.id, { onDelete: "cascade" }),
    externalId: text("external_id").notNull(),
    mediaType: text("media_type").notNull(),
    mediaUrl: text("media_url"),
    thumbnailUrl: text("thumbnail_url"),
    order: integer("order").notNull(),
  },
  (table) => [
    uniqueIndex("topic_instagram_media_children_media_external_unique").on(
      table.mediaId,
      table.externalId,
    ),
    index("topic_instagram_media_children_media_id_idx").on(table.mediaId),
    check(
      "topic_instagram_media_children_order_check",
      sql`${table.order} > 0`,
    ),
  ],
);
