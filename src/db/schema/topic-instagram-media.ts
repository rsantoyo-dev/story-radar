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

import { creativeAssetBatches, creativeDrafts } from "./creative-content";
import { instagramPublicationPackages } from "./instagram-publication-packages";
import { stories } from "./stories";
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
    /**
     * The editorial story this publication is linked to (IG-04). Null = pending
     * to link; a post has at most one linked story within the topic. Kept here
     * so IG-03's link-state and its "linked / pending" filter are real from the
     * start; IG-04 only fills it in.
     */
    linkedStoryId: uuid("linked_story_id").references(() => stories.id, {
      onDelete: "set null",
    }),
    /**
     * Optional creative draft and image batch that produced this publication
     * (IG-04). Both are optional even when a story is linked (historical posts
     * may predate the draft model). A draft is only accepted when it belongs to
     * `linkedStoryId`; a batch only when it belongs to `linkedDraftId` — those
     * invariants are enforced by `linkInstagramMediaToStory`, not a DB check,
     * because a hard story delete cascades several `SET NULL`s onto this row.
     */
    linkedDraftId: uuid("linked_draft_id").references(() => creativeDrafts.id, {
      onDelete: "set null",
    }),
    /**
     * The draft revision that was published, snapshotted at link time. A draft
     * row's `version` is an in-place counter, so without this a later edit of
     * the same draft would silently move the publication's reference to newer
     * content. When a batch is linked this is that batch's `draftVersion`.
     */
    linkedDraftVersion: integer("linked_draft_version"),
    linkedBatchId: uuid("linked_batch_id").references(
      () => creativeAssetBatches.id,
      { onDelete: "set null" },
    ),
    /**
     * The frozen PUB-03 package this row was published from (PUB-04/PUB-06).
     * Null for media imported by IG-02 that this app did not send. Set once,
     * when a publication job confirms; a later IG-02 re-sync keeps it.
     */
    publishedPackageId: uuid("published_package_id").references(
      () => instagramPublicationPackages.id,
      { onDelete: "set null" },
    ),
    /**
     * When and who last changed the link (create, correct or remove). Never
     * nulled — an unlink still records who did it. `linked_by` is free text
     * ("auto" for URL auto-linking) since the app has no user identity yet.
     */
    linkedAt: timestamp("linked_at", { withTimezone: true, mode: "date" }),
    linkedBy: text("linked_by"),
    /**
     * Current Instagram insights for this publication (IG-05). `null` = never
     * fetched (pending, distinct from a real zero). Shape per metric:
     * `{ value: number | null, state: "ok" | "unavailable" | "error",
     *    period: string | null, unit: string | null, error?: string }`.
     * A per-metric failure keeps that metric's last good value with
     * `state: "error"`; a whole-request failure sets `metricsError` and leaves
     * this blob untouched. Validated in code, not the DB.
     */
    metrics: jsonb("metrics"),
    /** When the last (partial or full) successful metrics refresh ran. */
    metricsQueriedAt: timestamp("metrics_queried_at", {
      withTimezone: true,
      mode: "date",
    }),
    /** Graph API version used for the stored metrics (e.g. "v21.0"). */
    metricsApiVersion: text("metrics_api_version"),
    /** Message of the last whole-request metrics failure; blob kept intact. */
    metricsError: text("metrics_error"),
    metricsErroredAt: timestamp("metrics_errored_at", {
      withTimezone: true,
      mode: "date",
    }),
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
    index("topic_instagram_media_topic_linked_story_idx").on(
      table.topicId,
      table.linkedStoryId,
    ),
    check(
      "topic_instagram_media_access_state_check",
      sql`${table.accessState} IN ('accessible', 'inaccessible')`,
    ),
    check(
      "topic_instagram_media_linked_by_length_check",
      sql`${table.linkedBy} IS NULL OR char_length(${table.linkedBy}) <= 200`,
    ),
    check(
      "topic_instagram_media_linked_draft_version_check",
      sql`${table.linkedDraftVersion} IS NULL OR ${table.linkedDraftVersion} > 0`,
    ),
    check(
      "topic_instagram_media_metrics_error_length_check",
      sql`${table.metricsError} IS NULL OR char_length(${table.metricsError}) <= 500`,
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
