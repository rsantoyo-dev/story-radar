import { sql } from "drizzle-orm";
import {
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

import { topics } from "./topics";

/**
 * One Facebook Page connection per topic, additional to (never a replacement
 * for) that topic's direct Instagram Login connection in
 * topic-meta-connections.ts — see PUB-09. Kept as its own table rather than
 * reusing that table's vestigial pageId/pageName columns: those have never
 * been written by any code path, and PUB-09 requires the two connections'
 * identity, review and status to stay fully separate (a Page has its own
 * token, tasks/permissions, expiry and verification state that those two
 * columns have no room for).
 *
 * pageAccessTokenEncrypted and appSecretEncrypted are ciphertext (AES-256-GCM
 * via meta-token-crypto.ts, reused unchanged); the plaintext token can post to
 * the connected Page and must never reach the browser or a log line.
 */
export const topicFacebookConnections = pgTable("topic_facebook_connections", {
  topicId: uuid("topic_id")
    .primaryKey()
    .references(() => topics.id, { onDelete: "cascade" }),
  /**
   * Overrides the shared META_FACEBOOK_APP_ID for this topic's OAuth
   * handshake — the Facebook Login for Business product's own ID, distinct
   * from the Instagram product's ID that topic_meta_connections.appId holds.
   */
  appId: text("app_id"),
  appSecretEncrypted: text("app_secret_encrypted"),
  pageId: text("page_id"),
  pageName: text("page_name"),
  pageAccessTokenEncrypted: text("page_access_token_encrypted"),
  /**
   * Tasks Facebook reports the user holds on this Page (e.g. MANAGE,
   * CREATE_CONTENT), taken directly from /me/accounts — distinct from
   * grantedPermissions, which are the OAuth-level scopes granted at login.
   */
  pageTasks: text("page_tasks")
    .array()
    .notNull()
    .default(sql`ARRAY[]::text[]`),
  /** Set when the selected Page has a linked Instagram Business Account. */
  linkedIgUserId: text("linked_ig_user_id"),
  linkedIgUsername: text("linked_ig_username"),
  tokenExpiresAt: timestamp("token_expires_at", {
    withTimezone: true,
    mode: "date",
  }),
  connectedAt: timestamp("connected_at", { withTimezone: true, mode: "date" }),
  connectedBy: text("connected_by"),
  /**
   * A fresh random marker assigned on every (re)connect and on disconnect —
   * same optimistic-concurrency idiom as topic_meta_connections.connectionVersion.
   * Every async-completing write (verification success/failure) is guarded by
   * WHERE connectionVersion = <captured value>, so a stale write from before a
   * reconnect/disconnect silently no-ops instead of reviving a replaced or
   * cleared connection.
   */
  connectionVersion: text("connection_version").notNull().default(""),
  /** OAuth scopes actually granted at the last connect/reconnect. */
  grantedPermissions: text("granted_permissions")
    .array()
    .notNull()
    .default(sql`ARRAY[]::text[]`),
  /** Set only by a successful live verification call. */
  lastVerifiedAt: timestamp("last_verified_at", {
    withTimezone: true,
    mode: "date",
  }),
  /**
   * Human-readable reason the last verification attempt failed, or null after
   * a success. An auth-classified failure also sets tokenExpiresAt to now, so
   * this text alone never has to encode whether reconnect is required — same
   * convention as topic_meta_connections.lastVerificationError.
   */
  lastVerificationError: text("last_verification_error"),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
    .defaultNow()
    .notNull(),
});
