import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import {
  editorialEvaluationDecisionEnum,
  editorialEvaluationRunStatusEnum,
} from "./enums";
import { stories } from "./stories";
import { topics } from "./topics";

export const editorialEvaluationRuns = pgTable(
  "editorial_evaluation_runs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    topicId: uuid("topic_id")
      .notNull()
      .references(() => topics.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(),
    model: text("model").notNull(),
    modelVersion: text("model_version"),
    promptVersion: text("prompt_version").notNull(),
    status: editorialEvaluationRunStatusEnum("status")
      .default("running")
      .notNull(),
    requestedStories: integer("requested_stories").notNull(),
    evaluatedStories: integer("evaluated_stories").default(0).notNull(),
    cachedStories: integer("cached_stories").default(0).notNull(),
    promptTokens: integer("prompt_tokens").default(0).notNull(),
    outputTokens: integer("output_tokens").default(0).notNull(),
    thoughtsTokens: integer("thoughts_tokens").default(0).notNull(),
    totalTokens: integer("total_tokens").default(0).notNull(),
    error: text("error"),
    startedAt: timestamp("started_at", {
      withTimezone: true,
      mode: "date",
    })
      .defaultNow()
      .notNull(),
    finishedAt: timestamp("finished_at", {
      withTimezone: true,
      mode: "date",
    }),
  },
  (table) => [
    index("editorial_evaluation_runs_topic_started_at_idx").on(
      table.topicId,
      table.startedAt,
    ),
    index("editorial_evaluation_runs_started_at_idx").on(table.startedAt),
    index("editorial_evaluation_runs_status_idx").on(table.status),
    check(
      "editorial_evaluation_runs_counts_check",
      sql`${table.requestedStories} >= 0
        AND ${table.evaluatedStories} >= 0
        AND ${table.cachedStories} >= 0
        AND ${table.evaluatedStories} <= ${table.requestedStories}`,
    ),
    check(
      "editorial_evaluation_runs_tokens_check",
      sql`${table.promptTokens} >= 0
        AND ${table.outputTokens} >= 0
        AND ${table.thoughtsTokens} >= 0
        AND ${table.totalTokens} >= 0`,
    ),
    check(
      "editorial_evaluation_runs_dates_check",
      sql`${table.finishedAt} IS NULL OR ${table.finishedAt} >= ${table.startedAt}`,
    ),
  ],
);

export const storyEditorialEvaluations = pgTable(
  "story_editorial_evaluations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    runId: uuid("run_id")
      .notNull()
      .references(() => editorialEvaluationRuns.id, { onDelete: "cascade" }),
    storyId: uuid("story_id")
      .notNull()
      .references(() => stories.id, { onDelete: "cascade" }),
    topicId: uuid("topic_id")
      .notNull()
      .references(() => topics.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(),
    model: text("model").notNull(),
    promptVersion: text("prompt_version").notNull(),
    inputHash: text("input_hash").notNull(),
    editorialScore: integer("editorial_score").notNull(),
    // Legacy evaluations predate the generic priority score, so this stays
    // nullable and consumers can fall back to editorialScore while rows age
    // out or are re-evaluated.
    editorialPriority: integer("editorial_priority"),
    canadaRelevance: integer("canada_relevance").notNull(),
    aiRelevance: integer("ai_relevance").notNull(),
    socialPotential: integer("social_potential").notNull(),
    novelty: integer("novelty").notNull(),
    decision: editorialEvaluationDecisionEnum("decision").notNull(),
    reason: text("reason").notNull(),
    suggestedAngles: text("suggested_angles")
      .array()
      .notNull()
      .default(sql`ARRAY[]::text[]`),
    riskFlags: text("risk_flags")
      .array()
      .notNull()
      .default(sql`ARRAY[]::text[]`),
    evaluatedAt: timestamp("evaluated_at", {
      withTimezone: true,
      mode: "date",
    })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("story_editorial_evaluations_topic_cache_unique").on(
      table.topicId,
      table.storyId,
      table.provider,
      table.model,
      table.promptVersion,
      table.inputHash,
    ),
    index("story_editorial_evaluations_story_id_idx").on(table.storyId),
    index("story_editorial_evaluations_topic_story_id_idx").on(
      table.topicId,
      table.storyId,
    ),
    index("story_editorial_evaluations_run_id_idx").on(table.runId),
    index("story_editorial_evaluations_decision_idx").on(table.decision),
    index("story_editorial_evaluations_score_idx").on(table.editorialScore),
    index("story_editorial_evaluations_evaluated_at_idx").on(
      table.evaluatedAt,
    ),
    check(
      "story_editorial_evaluations_scores_check",
      sql`${table.editorialScore} BETWEEN 0 AND 100
        AND ${table.canadaRelevance} BETWEEN 0 AND 100
        AND ${table.aiRelevance} BETWEEN 0 AND 100
        AND ${table.socialPotential} BETWEEN 0 AND 100
        AND ${table.novelty} BETWEEN 0 AND 100`,
    ),
    check(
      "story_editorial_evaluations_editorial_priority_check",
      sql`${table.editorialPriority} IS NULL
        OR ${table.editorialPriority} BETWEEN 0 AND 100`,
    ),
  ],
);
