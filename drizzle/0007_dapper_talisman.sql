CREATE TYPE "public"."story_content_enrichment_status" AS ENUM('pending', 'completed', 'failed', 'blocked');--> statement-breakpoint
CREATE TABLE "story_content_enrichments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"story_id" uuid NOT NULL,
	"status" "story_content_enrichment_status" DEFAULT 'pending' NOT NULL,
	"source_url" text NOT NULL,
	"resolved_url" text,
	"article_title" text,
	"byline" text,
	"content_text" text,
	"content_hash" text,
	"content_status" "story_content_status",
	"word_count" integer,
	"attempts" integer DEFAULT 0 NOT NULL,
	"error" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"fetched_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "story_content_enrichments_counts_check" CHECK ("story_content_enrichments"."attempts" >= 0
        AND ("story_content_enrichments"."word_count" IS NULL OR "story_content_enrichments"."word_count" >= 0)),
	CONSTRAINT "story_content_enrichments_dates_check" CHECK ("story_content_enrichments"."fetched_at" IS NULL OR "story_content_enrichments"."fetched_at" >= "story_content_enrichments"."started_at"),
	CONSTRAINT "story_content_enrichments_result_check" CHECK ((
          "story_content_enrichments"."status" = 'completed'
          AND "story_content_enrichments"."resolved_url" IS NOT NULL
          AND "story_content_enrichments"."content_text" IS NOT NULL
          AND "story_content_enrichments"."content_hash" IS NOT NULL
          AND "story_content_enrichments"."content_status" IS NOT NULL
          AND "story_content_enrichments"."word_count" IS NOT NULL
          AND "story_content_enrichments"."fetched_at" IS NOT NULL
          AND "story_content_enrichments"."error" IS NULL
        ) OR (
          "story_content_enrichments"."status" = 'pending'
          AND "story_content_enrichments"."fetched_at" IS NULL
          AND "story_content_enrichments"."error" IS NULL
        ) OR (
          "story_content_enrichments"."status" IN ('failed', 'blocked')
          AND "story_content_enrichments"."error" IS NOT NULL
        ))
);
--> statement-breakpoint
ALTER TABLE "story_content_enrichments" ADD CONSTRAINT "story_content_enrichments_story_id_stories_id_fk" FOREIGN KEY ("story_id") REFERENCES "public"."stories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "story_content_enrichments_story_id_unique" ON "story_content_enrichments" USING btree ("story_id");--> statement-breakpoint
CREATE INDEX "story_content_enrichments_status_idx" ON "story_content_enrichments" USING btree ("status");--> statement-breakpoint
CREATE INDEX "story_content_enrichments_updated_at_idx" ON "story_content_enrichments" USING btree ("updated_at");