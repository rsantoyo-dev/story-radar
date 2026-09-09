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
 * PUB-04 + PUB-07. One durable row per "publish now" order for a frozen
 * PUB-03 package. Editorial approval never creates one of these — only the
 * explicit publish action does. The row is the single source of truth for the
 * send: every Instagram container id, the published media id and every state
 * transition are persisted here so the job survives the editor closing the
 * browser, a redeploy, or a crash. Progress is driven by `after()` kicks and
 * reconcile-on-read; no endpoint holds a sleep until completion.
 *
 * `idempotency_key` (unique) makes a double click, a retry and two workers
 * converge on the same row instead of starting parallel sends. Workers claim a
 * row with `lease_owner`/`lease_until` and advance it with conditional
 * transitions; a stale worker's write matches zero rows and no-ops.
 */
export const instagramPublicationJobs = pgTable(
  "instagram_publication_jobs",
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
    batchId: uuid("batch_id")
      .notNull()
      .references(() => creativeAssetBatches.id, { onDelete: "cascade" }),
    /** The frozen package being published. Kept while a job references it. */
    packageId: uuid("package_id")
      .notNull()
      .references(() => instagramPublicationPackages.id, { onDelete: "restrict" }),
    /** sha256(packageHash + igUserId + "publish-now"). Retries reuse the row. */
    idempotencyKey: text("idempotency_key").notNull(),
    status: text("status").default("queued").notNull(),
    mediaType: text("media_type"),
    igUserId: text("ig_user_id"),
    connectionVersion: text("connection_version").notNull(),
    apiVersion: text("api_version").notNull(),
    appConfigurationVersion: text("app_configuration_version"),
    /** Snapshot of the PUB-02 re-check taken when this job last ran. */
    accessState: text("access_state"),
    accessCheckedAt: timestamp("access_checked_at", {
      withTimezone: true,
      mode: "date",
    }),
    quotaRemaining: integer("quota_remaining"),
    /** [{ unitOrder, creationId, status }] — one per carousel child container. */
    childContainers: jsonb("child_containers")
      .notNull()
      .default(sql`'[]'::jsonb`),
    /** The CAROUSEL container id, or the single image container id. */
    parentContainerId: text("parent_container_id"),
    publishedMediaId: text("published_media_id"),
    permalink: text("permalink"),
    attempts: integer("attempts").default(0).notNull(),
    leaseOwner: text("lease_owner"),
    leaseUntil: timestamp("lease_until", { withTimezone: true, mode: "date" }),
    failureKind: text("failure_kind"),
    /** Sanitized. Never a token, delivery URL, object key or provider raw error. */
    lastError: text("last_error"),
    startedAt: timestamp("started_at", { withTimezone: true, mode: "date" }),
    finishedAt: timestamp("finished_at", { withTimezone: true, mode: "date" }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("instagram_publication_jobs_idempotency_unique").on(
      table.idempotencyKey,
    ),
    index("instagram_publication_jobs_topic_draft_idx").on(
      table.topicId,
      table.draftId,
    ),
    index("instagram_publication_jobs_status_lease_idx").on(
      table.status,
      table.leaseUntil,
    ),
    index("instagram_publication_jobs_package_idx").on(table.packageId),
    check(
      "instagram_publication_jobs_values_check",
      sql`${table.attempts} >= 0
        AND ${table.status} IN (
          'queued', 'preparing', 'creating-containers', 'containers-ready',
          'publishing', 'pending-confirmation', 'published', 'failed', 'suspended'
        )
        AND (${table.mediaType} IS NULL OR ${table.mediaType} IN ('image', 'carousel'))
        AND (${table.failureKind} IS NULL OR ${table.failureKind} IN (
          'retryable', 'permission', 'rate-limit', 'expired-container',
          'uncertain', 'invalidated'
        ))`,
    ),
    check(
      "instagram_publication_jobs_result_check",
      sql`(
        ${table.status} NOT IN ('published', 'failed', 'suspended')
        OR ${table.finishedAt} IS NOT NULL
      ) AND (
        ${table.status} NOT IN ('failed', 'suspended')
        OR ${table.lastError} IS NOT NULL
      )`,
    ),
    check(
      "instagram_publication_jobs_dates_check",
      sql`${table.updatedAt} >= ${table.createdAt}`,
    ),
  ],
);
