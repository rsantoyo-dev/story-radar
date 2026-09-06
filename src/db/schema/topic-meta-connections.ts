import { sql } from "drizzle-orm";
import {
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

import { topics } from "./topics";

/**
 * One Instagram connection per topic ("Instagram API with Instagram Login" —
 * the account authorizes directly, no Facebook Page involved). An admin can
 * connect a different Instagram Business/Creator account — and, if needed, a
 * different Instagram App — to each topic, the same way each topic owns its
 * own creative profile.
 *
 * accessTokenEncrypted and appSecretEncrypted are ciphertext (AES-256-GCM via
 * meta-token-crypto.ts); the plaintext token can publish to the connected
 * Instagram account and must never reach the browser or a log line.
 *
 * pageId/pageName are unused by this flow and kept only so an older Facebook
 * Login-based connection (if ever added back) would not need a new column.
 */
export const topicMetaConnections = pgTable("topic_meta_connections", {
  topicId: uuid("topic_id")
    .primaryKey()
    .references(() => topics.id, { onDelete: "cascade" }),
  /**
   * Overrides the shared META_APP_ID for this topic's OAuth handshake — the
   * Instagram App's own ID (App Dashboard → Instagram product settings),
   * distinct from the parent Meta App's ID.
   */
  appId: text("app_id"),
  appSecretEncrypted: text("app_secret_encrypted"),
  igUserId: text("ig_user_id"),
  igUsername: text("ig_username"),
  pageId: text("page_id"),
  pageName: text("page_name"),
  accessTokenEncrypted: text("access_token_encrypted"),
  tokenExpiresAt: timestamp("token_expires_at", {
    withTimezone: true,
    mode: "date",
  }),
  connectedAt: timestamp("connected_at", { withTimezone: true, mode: "date" }),
  connectedBy: text("connected_by"),
  /**
   * A fresh random marker assigned on every (re)connect (see
   * saveTopicMetaConnection). Reconnecting the same Instagram account keeps
   * the same igUserId, so igUserId alone cannot distinguish "the connection a
   * refresh/verification started against" from "the one that replaced it
   * moments later" — this can. A stale write whose captured version no
   * longer matches the stored one is dropped rather than applied.
   */
  connectionVersion: text("connection_version").notNull().default(""),
  /**
   * OAuth scopes Instagram actually granted at the last connect/reconnect
   * (see meta-connection-state.ts's INSTAGRAM_INSIGHTS_SCOPE). Reset on every
   * reconnect since a new authorization supersedes the old grant.
   */
  grantedPermissions: text("granted_permissions")
    .array()
    .notNull()
    .default(sql`ARRAY[]::text[]`),
  /** Set only by a successful live verification call (see the verify route). */
  lastVerifiedAt: timestamp("last_verified_at", {
    withTimezone: true,
    mode: "date",
  }),
  /**
   * Human-readable reason the last verification attempt failed, or null after
   * a success. An auth-classified failure also sets tokenExpiresAt to now, so
   * this text alone never has to encode whether reconnect is required.
   */
  lastVerificationError: text("last_verification_error"),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
    .defaultNow()
    .notNull(),
});
