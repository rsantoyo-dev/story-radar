import { sql } from "drizzle-orm";
import { pgTable, uuid, text, integer, jsonb, timestamp, index, check, uniqueIndex } from "drizzle-orm/pg-core";
import { topics } from "./topics";
import { stories } from "./stories";
import { creativeDrafts } from "./creative-content";
export const creativeTextCalls = pgTable("creative_text_calls", {
    id: uuid("id").primaryKey(), topicId: uuid("topic_id").notNull().references(() => topics.id),
    storyId: uuid("story_id").notNull().references(() => stories.id), runId: uuid("run_id").notNull(),
    provider: text("provider").notNull(), model: text("model").notNull(), operation: text("operation").notNull(),
    status: text("status").notNull().default("reserved"), reservedMicros: integer("reserved_micros").notNull(),
    chargedMicros: integer("charged_micros"), pricing: jsonb("pricing").notNull(), usage: jsonb("usage"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
}, t => [index("creative_text_calls_scope_idx").on(t.topicId, t.storyId), index("creative_text_calls_run_idx").on(t.runId),
    check("creative_text_calls_cost_check", sql `${t.reservedMicros} >= 0 AND (${t.chargedMicros} IS NULL OR ${t.chargedMicros} >= 0)`),
    check("creative_text_calls_status_check", sql `${t.status} IN ('reserved','settled','uncertain')`)]);
export const creativeDraftRecoveries = pgTable("creative_draft_recoveries", {
    id: uuid("id").primaryKey(), topicId: uuid("topic_id").notNull().references(() => topics.id),
    storyId: uuid("story_id").notNull().references(() => stories.id), draftId: uuid("draft_id").notNull().references(() => creativeDrafts.id),
    draftVersion: integer("draft_version").notNull(), leaseToken: uuid("lease_token").notNull().defaultRandom(), status: text("status").notNull().default("running"),
    input: jsonb("input").notNull(), result: jsonb("result"), error: text("error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, t => [index("creative_draft_recoveries_scope_idx").on(t.topicId, t.draftId),
    uniqueIndex("creative_draft_recoveries_active_idx").on(t.draftId).where(sql `${t.status} IN ('running','ready')`),
    check("creative_draft_recoveries_status_check", sql `${t.status} IN ('running','ready','completed','failed')`)]);
export const creativeTextOutcomes = pgTable("creative_text_outcomes", {
    id: uuid("id").primaryKey().defaultRandom(), topicId: uuid("topic_id").notNull().references(() => topics.id),
    storyId: uuid("story_id").notNull().references(() => stories.id), draftId: uuid("draft_id").notNull().references(() => creativeDrafts.id),
    draftVersion: integer("draft_version").notNull(), accepted: integer("accepted").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, t => [uniqueIndex("creative_text_outcomes_version_idx").on(t.draftId, t.draftVersion),
    check("creative_text_outcomes_accepted_check", sql `${t.accepted} IN (0,1)`)]);
