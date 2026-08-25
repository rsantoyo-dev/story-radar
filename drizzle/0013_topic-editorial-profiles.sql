CREATE TABLE "topic_editorial_profiles" (
	"topic_id" uuid PRIMARY KEY NOT NULL,
	"audience" text NOT NULL,
	"mission" text NOT NULL,
	"content_pillars" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"exclusions" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"news_max_age_hours" integer DEFAULT 72 NOT NULL,
	"research_max_age_hours" integer DEFAULT 72 NOT NULL,
	"topic_fit_weight" integer DEFAULT 35 NOT NULL,
	"evidence_depth_weight" integer DEFAULT 20 NOT NULL,
	"novelty_timeliness_weight" integer DEFAULT 15 NOT NULL,
	"audience_value_weight" integer DEFAULT 20 NOT NULL,
	"social_potential_weight" integer DEFAULT 10 NOT NULL,
	"local_candidate_min_score" integer DEFAULT 25 NOT NULL,
	"profile_version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "topic_editorial_profiles_audience_not_blank_check" CHECK (char_length(btrim("topic_editorial_profiles"."audience")) > 0),
	CONSTRAINT "topic_editorial_profiles_mission_not_blank_check" CHECK (char_length(btrim("topic_editorial_profiles"."mission")) > 0),
	CONSTRAINT "topic_editorial_profiles_freshness_check" CHECK ("topic_editorial_profiles"."news_max_age_hours" BETWEEN 1 AND 8760
        AND "topic_editorial_profiles"."research_max_age_hours" BETWEEN 1 AND 8760),
	CONSTRAINT "topic_editorial_profiles_weights_check" CHECK ("topic_editorial_profiles"."topic_fit_weight" BETWEEN 0 AND 100
        AND "topic_editorial_profiles"."evidence_depth_weight" BETWEEN 0 AND 100
        AND "topic_editorial_profiles"."novelty_timeliness_weight" BETWEEN 0 AND 100
        AND "topic_editorial_profiles"."audience_value_weight" BETWEEN 0 AND 100
        AND "topic_editorial_profiles"."social_potential_weight" BETWEEN 0 AND 100
        AND (
          "topic_editorial_profiles"."topic_fit_weight"
          + "topic_editorial_profiles"."evidence_depth_weight"
          + "topic_editorial_profiles"."novelty_timeliness_weight"
          + "topic_editorial_profiles"."audience_value_weight"
          + "topic_editorial_profiles"."social_potential_weight"
        ) = 100),
	CONSTRAINT "topic_editorial_profiles_local_candidate_min_score_check" CHECK ("topic_editorial_profiles"."local_candidate_min_score" BETWEEN 0 AND 100),
	CONSTRAINT "topic_editorial_profiles_profile_version_check" CHECK ("topic_editorial_profiles"."profile_version" >= 1)
);
--> statement-breakpoint
ALTER TABLE "story_editorial_evaluations" ADD COLUMN "editorial_priority" integer;--> statement-breakpoint
ALTER TABLE "topic_editorial_profiles" ADD CONSTRAINT "topic_editorial_profiles_topic_id_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."topics"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "story_editorial_evaluations" ADD CONSTRAINT "story_editorial_evaluations_editorial_priority_check" CHECK ("story_editorial_evaluations"."editorial_priority" IS NULL
        OR "story_editorial_evaluations"."editorial_priority" BETWEEN 0 AND 100);