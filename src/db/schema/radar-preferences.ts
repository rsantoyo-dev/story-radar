import { sql } from "drizzle-orm";
import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const radarPreferences = pgTable("radar_preferences", {
  id: text("id").primaryKey(),
  favoredTerms: text("favored_terms")
    .array()
    .notNull()
    .default(sql`ARRAY[]::text[]`),
  unfavoredTerms: text("unfavored_terms")
    .array()
    .notNull()
    .default(sql`ARRAY[]::text[]`),
  updatedAt: timestamp("updated_at", {
    withTimezone: true,
    mode: "date",
  })
    .defaultNow()
    .notNull(),
});
