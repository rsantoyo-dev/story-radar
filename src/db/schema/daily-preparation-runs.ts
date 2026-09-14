import { index, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { topics } from "./topics";
import type { DailyPreparationProgress } from "@/app/modules/stories/daily-preparation.types";
export const dailyPreparationRuns = pgTable("daily_preparation_runs", {
  id: uuid("id").defaultRandom().primaryKey(),
  topicId: uuid("topic_id").notNull().references(()=>topics.id,{onDelete:"cascade"}),
  lineId: uuid("line_id").notNull(),
  timezone: text("timezone").notNull(),
  status: text("status").notNull().default("running"),
  step: text("step").notNull().default("collect"),
  progress: jsonb("progress").$type<DailyPreparationProgress>().notNull(),
  error: text("error"),
  leaseOwner: uuid("lease_owner"),
  leaseUntil: timestamp("lease_until",{withTimezone:true}),
  startedAt: timestamp("started_at",{withTimezone:true}).defaultNow().notNull(),
  updatedAt: timestamp("updated_at",{withTimezone:true}).defaultNow().notNull(),
}, t=>[index("daily_preparation_topic_started_idx").on(t.topicId,t.startedAt)]);
