import { sql } from "drizzle-orm";
import { check, index, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { topics } from "./topics";
import type { DailyPlan, PlannerContext } from "@/app/modules/stories/daily-editorial-planner.types";

/** Append-only planner attempts; independent of evaluation scores and quotas. */
export const dailyEditorialPlans = pgTable("daily_editorial_plans", {
  id: uuid("id").defaultRandom().primaryKey(),
  topicId: uuid("topic_id").notNull().references(() => topics.id, { onDelete: "cascade" }),
  inputHash: text("input_hash").notNull(),
  context: jsonb("context").$type<PlannerContext>().notNull(),
  status: text("status").notNull().default("running"),
  result: jsonb("result").$type<DailyPlan>(),
  provider: text("provider"), model: text("model"),
  usage: jsonb("usage"), error: text("error"),
  startedAt: timestamp("started_at", { withTimezone: true }).defaultNow().notNull(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
}, t => [index("daily_editorial_plans_topic_started_idx").on(t.topicId,t.startedAt),
  check("daily_editorial_plans_status_check",sql`${t.status} IN ('running','completed','failed')`)]);
