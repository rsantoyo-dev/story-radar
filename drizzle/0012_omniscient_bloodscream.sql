CREATE TABLE "topic_stories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"topic_id" uuid NOT NULL,
	"story_id" uuid NOT NULL,
	"relevance_score" integer DEFAULT 0 NOT NULL,
	"relevance_reasons" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"processing_status" "story_processing_status" DEFAULT 'new' NOT NULL,
	"review_decision" "story_review_decision",
	"reviewed_at" timestamp with time zone,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "topic_stories_relevance_score_check" CHECK ("topic_stories"."relevance_score" BETWEEN 0 AND 100),
	CONSTRAINT "topic_stories_seen_dates_check" CHECK ("topic_stories"."last_seen_at" >= "topic_stories"."first_seen_at"),
	CONSTRAINT "topic_stories_review_fields_check" CHECK (("topic_stories"."review_decision" IS NULL AND "topic_stories"."reviewed_at" IS NULL)
        OR ("topic_stories"."review_decision" IS NOT NULL AND "topic_stories"."reviewed_at" IS NOT NULL)),
	CONSTRAINT "topic_stories_review_status_check" CHECK ("topic_stories"."review_decision" IS NULL
        OR ("topic_stories"."review_decision" = 'approved' AND "topic_stories"."processing_status" IN ('selected', 'published'))
        OR ("topic_stories"."review_decision" = 'rejected' AND "topic_stories"."processing_status" = 'rejected'))
);
--> statement-breakpoint
-- PostgreSQL requires this unique index to exist before the backfill below
-- can use it as an ON CONFLICT target.
CREATE UNIQUE INDEX "topic_stories_topic_story_unique" ON "topic_stories" USING btree ("topic_id","story_id");--> statement-breakpoint
-- Add nullable columns first so existing installations can be backfilled.
ALTER TABLE "collection_runs" ADD COLUMN "topic_id" uuid;--> statement-breakpoint
ALTER TABLE "creative_ai_runs" ADD COLUMN "topic_id" uuid;--> statement-breakpoint
ALTER TABLE "creative_drafts" ADD COLUMN "topic_id" uuid;--> statement-breakpoint
ALTER TABLE "creative_profiles" ADD COLUMN "topic_id" uuid;--> statement-breakpoint
ALTER TABLE "story_creative_briefs" ADD COLUMN "topic_id" uuid;--> statement-breakpoint
ALTER TABLE "editorial_evaluation_runs" ADD COLUMN "topic_id" uuid;--> statement-breakpoint
ALTER TABLE "story_editorial_evaluations" ADD COLUMN "topic_id" uuid;--> statement-breakpoint
-- The existing radar is the seeded Tech topic. Preserve all of its state.
WITH default_topic AS (
  SELECT id
  FROM "topics"
  WHERE "workspace_id" = 'default' AND "slug" = 'tech'
  LIMIT 1
)
INSERT INTO "topic_stories" (
  "topic_id", "story_id", "relevance_score", "relevance_reasons",
  "processing_status", "review_decision", "reviewed_at", "first_seen_at", "last_seen_at"
)
SELECT
  default_topic.id, story.id, story.relevance_score, story.relevance_reasons,
  story.processing_status, story.review_decision, story.reviewed_at,
  story.first_seen_at, story.last_seen_at
FROM "stories" AS story
CROSS JOIN default_topic
ON CONFLICT ("topic_id", "story_id") DO NOTHING;--> statement-breakpoint
WITH default_topic AS (
  SELECT id
  FROM "topics"
  WHERE "workspace_id" = 'default' AND "slug" = 'tech'
  LIMIT 1
)
UPDATE "collection_runs" SET "topic_id" = default_topic.id FROM default_topic
WHERE "collection_runs"."topic_id" IS NULL;--> statement-breakpoint
WITH default_topic AS (
  SELECT id
  FROM "topics"
  WHERE "workspace_id" = 'default' AND "slug" = 'tech'
  LIMIT 1
)
UPDATE "creative_ai_runs" SET "topic_id" = default_topic.id FROM default_topic
WHERE "creative_ai_runs"."topic_id" IS NULL;--> statement-breakpoint
WITH default_topic AS (
  SELECT id
  FROM "topics"
  WHERE "workspace_id" = 'default' AND "slug" = 'tech'
  LIMIT 1
)
UPDATE "creative_drafts" SET "topic_id" = default_topic.id FROM default_topic
WHERE "creative_drafts"."topic_id" IS NULL;--> statement-breakpoint
WITH default_topic AS (
  SELECT id
  FROM "topics"
  WHERE "workspace_id" = 'default' AND "slug" = 'tech'
  LIMIT 1
)
UPDATE "creative_profiles" SET "topic_id" = default_topic.id FROM default_topic
WHERE "creative_profiles"."topic_id" IS NULL;--> statement-breakpoint
WITH default_topic AS (
  SELECT id
  FROM "topics"
  WHERE "workspace_id" = 'default' AND "slug" = 'tech'
  LIMIT 1
)
UPDATE "story_creative_briefs" SET "topic_id" = default_topic.id FROM default_topic
WHERE "story_creative_briefs"."topic_id" IS NULL;--> statement-breakpoint
WITH default_topic AS (
  SELECT id
  FROM "topics"
  WHERE "workspace_id" = 'default' AND "slug" = 'tech'
  LIMIT 1
)
UPDATE "editorial_evaluation_runs" SET "topic_id" = default_topic.id FROM default_topic
WHERE "editorial_evaluation_runs"."topic_id" IS NULL;--> statement-breakpoint
WITH default_topic AS (
  SELECT id
  FROM "topics"
  WHERE "workspace_id" = 'default' AND "slug" = 'tech'
  LIMIT 1
)
UPDATE "story_editorial_evaluations" SET "topic_id" = default_topic.id FROM default_topic
WHERE "story_editorial_evaluations"."topic_id" IS NULL;--> statement-breakpoint
-- Preserve the legacy singleton preferences as Tech preferences.
WITH default_topic AS (
  SELECT id
  FROM "topics"
  WHERE "workspace_id" = 'default' AND "slug" = 'tech'
  LIMIT 1
)
INSERT INTO "radar_preferences" (
  "id", "favored_terms", "unfavored_terms", "updated_at"
)
SELECT
  'topic:' || default_topic.id::text,
  preferences.favored_terms,
  preferences.unfavored_terms,
  preferences.updated_at
FROM "radar_preferences" AS preferences
CROSS JOIN default_topic
WHERE preferences.id = 'default'
ON CONFLICT ("id") DO NOTHING;--> statement-breakpoint
ALTER TABLE "collection_runs" ALTER COLUMN "topic_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "creative_ai_runs" ALTER COLUMN "topic_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "creative_drafts" ALTER COLUMN "topic_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "creative_profiles" ALTER COLUMN "topic_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "story_creative_briefs" ALTER COLUMN "topic_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "editorial_evaluation_runs" ALTER COLUMN "topic_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "story_editorial_evaluations" ALTER COLUMN "topic_id" SET NOT NULL;--> statement-breakpoint
DROP INDEX "story_creative_briefs_cache_unique";--> statement-breakpoint
DROP INDEX "story_editorial_evaluations_cache_unique";--> statement-breakpoint
ALTER TABLE "topic_stories" ADD CONSTRAINT "topic_stories_topic_id_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."topics"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "topic_stories" ADD CONSTRAINT "topic_stories_story_id_stories_id_fk" FOREIGN KEY ("story_id") REFERENCES "public"."stories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collection_runs" ADD CONSTRAINT "collection_runs_topic_id_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."topics"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "creative_ai_runs" ADD CONSTRAINT "creative_ai_runs_topic_id_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."topics"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "creative_drafts" ADD CONSTRAINT "creative_drafts_topic_id_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."topics"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "creative_profiles" ADD CONSTRAINT "creative_profiles_topic_id_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."topics"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "story_creative_briefs" ADD CONSTRAINT "story_creative_briefs_topic_id_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."topics"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "editorial_evaluation_runs" ADD CONSTRAINT "editorial_evaluation_runs_topic_id_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."topics"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "story_editorial_evaluations" ADD CONSTRAINT "story_editorial_evaluations_topic_id_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."topics"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "topic_stories_topic_status_idx" ON "topic_stories" USING btree ("topic_id","processing_status");--> statement-breakpoint
CREATE INDEX "topic_stories_topic_review_idx" ON "topic_stories" USING btree ("topic_id","review_decision");--> statement-breakpoint
CREATE INDEX "topic_stories_topic_relevance_idx" ON "topic_stories" USING btree ("topic_id","relevance_score");--> statement-breakpoint
CREATE INDEX "topic_stories_topic_retention_idx" ON "topic_stories" USING btree ("topic_id","processing_status","last_seen_at");--> statement-breakpoint
CREATE INDEX "collection_runs_topic_started_at_idx" ON "collection_runs" USING btree ("topic_id","started_at");--> statement-breakpoint
CREATE INDEX "creative_ai_runs_topic_started_at_idx" ON "creative_ai_runs" USING btree ("topic_id","started_at");--> statement-breakpoint
CREATE INDEX "creative_drafts_topic_id_idx" ON "creative_drafts" USING btree ("topic_id");--> statement-breakpoint
CREATE UNIQUE INDEX "creative_profiles_topic_id_unique" ON "creative_profiles" USING btree ("topic_id");--> statement-breakpoint
CREATE UNIQUE INDEX "story_creative_briefs_topic_cache_unique" ON "story_creative_briefs" USING btree ("topic_id","story_id","provider","model","prompt_version","input_hash");--> statement-breakpoint
CREATE INDEX "story_creative_briefs_topic_story_id_idx" ON "story_creative_briefs" USING btree ("topic_id","story_id");--> statement-breakpoint
CREATE INDEX "editorial_evaluation_runs_topic_started_at_idx" ON "editorial_evaluation_runs" USING btree ("topic_id","started_at");--> statement-breakpoint
CREATE UNIQUE INDEX "story_editorial_evaluations_topic_cache_unique" ON "story_editorial_evaluations" USING btree ("topic_id","story_id","provider","model","prompt_version","input_hash");--> statement-breakpoint
CREATE INDEX "story_editorial_evaluations_topic_story_id_idx" ON "story_editorial_evaluations" USING btree ("topic_id","story_id");
