import { sql } from "drizzle-orm";
import {
  check,
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

import { topics } from "./topics";

/**
 * Topic-owned instructions and scoring policy for editorial evaluation.
 *
 * There is intentionally at most one row per topic. Callers should use the
 * profile repository rather than assuming that a row exists: topics created
 * before this table (and topics that have not been customized) resolve to a
 * compatible in-memory default profile.
 */
export const topicEditorialProfiles = pgTable(
  "topic_editorial_profiles",
  {
    topicId: uuid("topic_id")
      .primaryKey()
      .references(() => topics.id, { onDelete: "cascade" }),
    audience: text("audience").notNull(),
    mission: text("mission").notNull(),
    contentPillars: text("content_pillars")
      .array()
      .notNull()
      .default(sql`ARRAY[]::text[]`),
    exclusions: text("exclusions")
      .array()
      .notNull()
      .default(sql`ARRAY[]::text[]`),
    newsMaxAgeHours: integer("news_max_age_hours").default(72).notNull(),
    researchMaxAgeHours: integer("research_max_age_hours")
      .default(72)
      .notNull(),
    topicFitWeight: integer("topic_fit_weight").default(35).notNull(),
    evidenceDepthWeight: integer("evidence_depth_weight")
      .default(20)
      .notNull(),
    noveltyTimelinessWeight: integer("novelty_timeliness_weight")
      .default(15)
      .notNull(),
    audienceValueWeight: integer("audience_value_weight")
      .default(20)
      .notNull(),
    socialPotentialWeight: integer("social_potential_weight")
      .default(10)
      .notNull(),
    localCandidateMinScore: integer("local_candidate_min_score")
      .default(25)
      .notNull(),
    // This is a monotonically increasing revision used by consumers to
    // invalidate profile-dependent caches after a saved edit.
    profileVersion: integer("profile_version").default(1).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    check(
      "topic_editorial_profiles_audience_not_blank_check",
      sql`char_length(btrim(${table.audience})) > 0`,
    ),
    check(
      "topic_editorial_profiles_mission_not_blank_check",
      sql`char_length(btrim(${table.mission})) > 0`,
    ),
    check(
      "topic_editorial_profiles_freshness_check",
      sql`${table.newsMaxAgeHours} BETWEEN 1 AND 8760
        AND ${table.researchMaxAgeHours} BETWEEN 1 AND 8760`,
    ),
    check(
      "topic_editorial_profiles_weights_check",
      sql`${table.topicFitWeight} BETWEEN 0 AND 100
        AND ${table.evidenceDepthWeight} BETWEEN 0 AND 100
        AND ${table.noveltyTimelinessWeight} BETWEEN 0 AND 100
        AND ${table.audienceValueWeight} BETWEEN 0 AND 100
        AND ${table.socialPotentialWeight} BETWEEN 0 AND 100
        AND (
          ${table.topicFitWeight}
          + ${table.evidenceDepthWeight}
          + ${table.noveltyTimelinessWeight}
          + ${table.audienceValueWeight}
          + ${table.socialPotentialWeight}
        ) = 100`,
    ),
    check(
      "topic_editorial_profiles_local_candidate_min_score_check",
      sql`${table.localCandidateMinScore} BETWEEN 0 AND 100`,
    ),
    check(
      "topic_editorial_profiles_profile_version_check",
      sql`${table.profileVersion} >= 1`,
    ),
  ],
);

export type TopicEditorialProfile = typeof topicEditorialProfiles.$inferSelect;
export type NewTopicEditorialProfile =
  typeof topicEditorialProfiles.$inferInsert;
