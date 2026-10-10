import { sql } from "drizzle-orm";
import { check, index, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { topics } from "./topics";
import { stories } from "./stories";
import type { Draft2Fact, Draft2FactsEvaluation, Draft2FactsRound, Draft2Threads, Draft2TraceEntry } from "@/app/modules/draft2/draft2-facts.types";

/**
 * One run of the Draft 2 pipeline for a story. Vercel functions keep nothing
 * between requests, so "the facts in memory" and the provider conversations
 * (the OpenAI response chain, Claude's cached transcript) live here, checkpointed
 * after every provider call so a later step can continue the same context.
 */
export const draft2Sessions = pgTable("draft2_sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  topicId: uuid("topic_id").notNull().references(() => topics.id, { onDelete: "cascade" }),
  storyId: uuid("story_id").notNull().references(() => stories.id, { onDelete: "cascade" }),
  step: text("step").notNull().default("facts"),
  status: text("status").notNull().default("running"),
  /** The latest facts list (verified when status is ready). */
  facts: jsonb("facts").$type<Draft2Fact[]>(),
  /** The reviewer's latest verdict on that list. */
  evaluation: jsonb("evaluation").$type<Draft2FactsEvaluation>(),
  rounds: jsonb("rounds").$type<Draft2FactsRound[]>().notNull().default(sql`'[]'::jsonb`),
  threads: jsonb("threads").$type<Draft2Threads>().notNull().default(sql`'{}'::jsonb`),
  trace: jsonb("trace").$type<Draft2TraceEntry[]>().notNull().default(sql`'[]'::jsonb`),
  error: text("error"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("draft2_sessions_story_idx").on(t.topicId, t.storyId, t.createdAt),
  check("draft2_sessions_status_check", sql`${t.status} IN ('running','ready','needs-review','failed')`),
]);

export type Draft2SessionRow = typeof draft2Sessions.$inferSelect;
