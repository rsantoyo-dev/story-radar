import { sql } from "drizzle-orm";
import {
  check,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

import { topics } from "./topics";

/**
 * Persisted, single-use record of a signed OAuth state (see
 * meta-oauth-state.ts) — closes the gap where the state's nonce was signed
 * but never actually checked for replay (TTL was the only guard). One row per
 * OAuth dialog redirect, for both the existing Instagram Login flow and the
 * new Facebook Login for Business flow (PUB-09): the callback consumes its
 * row exactly once, so a repeated or expired callback (double-click, browser
 * back-button replay) fails instead of silently reprocessing.
 */
export const metaOauthAttempts = pgTable(
  "meta_oauth_attempts",
  {
    nonce: text("nonce").primaryKey(),
    topicId: uuid("topic_id")
      .notNull()
      .references(() => topics.id, { onDelete: "cascade" }),
    /** Captured at issue time; no session/user identity exists yet (AUTH-04/05/06). */
    workspaceId: text("workspace_id").notNull(),
    mechanism: text("mechanism").notNull(),
    issuedAt: timestamp("issued_at", { withTimezone: true, mode: "date" }).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true, mode: "date" }).notNull(),
    /** Set by the one callback request that successfully consumes this attempt. */
    consumedAt: timestamp("consumed_at", { withTimezone: true, mode: "date" }),
  },
  (table) => [
    check(
      "meta_oauth_attempts_mechanism_check",
      sql`${table.mechanism} in ('instagram', 'facebook')`,
    ),
  ],
);
