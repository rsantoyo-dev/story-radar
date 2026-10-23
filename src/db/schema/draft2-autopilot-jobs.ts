import { sql } from "drizzle-orm";
import { boolean, check, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { draft2Sessions } from "./draft2-sessions";
import { stories } from "./stories";
import { topics } from "./topics";
import type { AutopilotJobEntry } from "@/app/modules/draft2/draft2-autopilot.core";

/**
 * One run of the Draft 2 autopilot on the server (2026-10-22): the same
 * steps the editor's tab ran, driven by passes of a route's time that chain
 * themselves, are kicked by a read of the story, or are resumed by the
 * worker's cron. The row is what a pass claims (`lease_owner`, `lease_until`)
 * and what the editor reads: the step running now, every step run so far,
 * and why the job stopped. One running job per story.
 */
export const draft2AutopilotJobs = pgTable("draft2_autopilot_jobs", {
  id: uuid("id").primaryKey().defaultRandom(),
  topicId: uuid("topic_id").notNull().references(() => topics.id, { onDelete: "cascade" }),
  storyId: uuid("story_id").notNull().references(() => stories.id, { onDelete: "cascade" }),
  /** The session the job drives; null until the facts create one. */
  sessionId: uuid("session_id").references(() => draft2Sessions.id, { onDelete: "set null" }),
  status: text("status").notNull().default("running"),
  /** The step the job stops after (the caption by default). */
  until: text("until").notNull().default("caption"),
  currentStep: text("current_step"),
  steps: jsonb("steps").$type<AutopilotJobEntry[]>().notNull().default(sql`'[]'::jsonb`),
  /** Why the job stopped: blocked, failed, stopped, or done. */
  outcome: text("outcome"),
  passes: integer("passes").notNull().default(0),
  /** Who started it: the editor, or a schedule. */
  startedBy: text("started_by").notNull().default("editor"),
  /** Start over from the facts (a new session; the earlier one stays as history) instead of going on from where the story stands (2026-10-23). */
  fresh: boolean("fresh").notNull().default(false),
  /** Set by the editor; the pass running reads it between steps and stops. */
  stopRequestedAt: timestamp("stop_requested_at", { withTimezone: true, mode: "date" }),
  leaseOwner: text("lease_owner"),
  leaseUntil: timestamp("lease_until", { withTimezone: true, mode: "date" }),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  finishedAt: timestamp("finished_at", { withTimezone: true, mode: "date" }),
}, (table) => [
  uniqueIndex("draft2_autopilot_jobs_running_story_idx").on(table.storyId).where(sql`${table.status} = 'running'`),
  index("draft2_autopilot_jobs_topic_story_idx").on(table.topicId, table.storyId, table.createdAt),
  index("draft2_autopilot_jobs_status_lease_idx").on(table.status, table.leaseUntil),
  check("draft2_autopilot_jobs_values_check", sql`${table.status} IN ('running', 'blocked', 'done', 'failed', 'stopped')
    AND ${table.until} IN ('facts', 'inventory', 'focus', 'spine', 'mentions', 'opening', 'closing', 'deck', 'review', 'visual', 'images', 'caption')
    AND ${table.passes} >= 0
    AND (${table.status} = 'running' OR ${table.finishedAt} IS NOT NULL)
    AND (${table.status} IN ('running', 'done') OR ${table.outcome} IS NOT NULL)`),
]);

export type Draft2AutopilotJobRow = typeof draft2AutopilotJobs.$inferSelect;
