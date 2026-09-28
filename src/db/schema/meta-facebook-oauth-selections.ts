import {
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

import { topics } from "./topics";

/**
 * The Facebook Pages a user was offered to choose from after completing the
 * Facebook Login for Business dialog, held server-side just long enough for
 * the editor to pick one (PUB-09: "comprobar los activos elegidos en
 * servidor al confirmar; no aceptar un page ID... arbitrario del navegador").
 * pagesEncrypted is an AES-256-GCM blob (meta-token-crypto.ts, reused
 * unchanged) of the full picker list, including each Page's own access
 * token — the browser only ever sees this row's id and the public page
 * name/id/linked-Instagram fields the confirm endpoint reads back out of it.
 * Single-use: consumed_at is set the moment a Page is confirmed, so the same
 * selection can never be replayed to attach a different Page later.
 */
export const metaFacebookOauthSelections = pgTable("meta_facebook_oauth_selections", {
  id: uuid("id").defaultRandom().primaryKey(),
  topicId: uuid("topic_id")
    .notNull()
    .references(() => topics.id, { onDelete: "cascade" }),
  pagesEncrypted: text("pages_encrypted").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
    .defaultNow()
    .notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true, mode: "date" }).notNull(),
  consumedAt: timestamp("consumed_at", { withTimezone: true, mode: "date" }),
});
