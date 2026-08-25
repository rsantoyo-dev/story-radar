CREATE TYPE "public"."collection_run_status" AS ENUM('completed', 'partial', 'failed');--> statement-breakpoint
CREATE TYPE "public"."collection_source_status" AS ENUM('successful', 'failed');--> statement-breakpoint
CREATE TYPE "public"."story_content_status" AS ENUM('excerpt', 'full', 'likely-full', 'missing');--> statement-breakpoint
CREATE TYPE "public"."story_processing_status" AS ENUM('new', 'needs-enrichment', 'ready', 'selected', 'rejected', 'published', 'failed');--> statement-breakpoint
CREATE TABLE "collection_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"status" "collection_run_status" NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"finished_at" timestamp with time zone NOT NULL,
	"requested_sources" integer NOT NULL,
	"successful_sources" integer NOT NULL,
	"failed_sources" integer NOT NULL,
	"fetched_items" integer NOT NULL,
	"included_items" integer NOT NULL,
	"filtered_out_items" integer NOT NULL,
	"duplicates_removed" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "collection_runs_sources_check" CHECK ("collection_runs"."requested_sources" >= 0
        AND "collection_runs"."successful_sources" >= 0
        AND "collection_runs"."failed_sources" >= 0
        AND "collection_runs"."requested_sources" = "collection_runs"."successful_sources" + "collection_runs"."failed_sources"),
	CONSTRAINT "collection_runs_items_check" CHECK ("collection_runs"."fetched_items" >= 0
        AND "collection_runs"."included_items" >= 0
        AND "collection_runs"."filtered_out_items" >= 0
        AND "collection_runs"."duplicates_removed" >= 0
        AND "collection_runs"."fetched_items" = "collection_runs"."included_items" + "collection_runs"."filtered_out_items" + "collection_runs"."duplicates_removed"),
	CONSTRAINT "collection_runs_dates_check" CHECK ("collection_runs"."finished_at" >= "collection_runs"."started_at")
);
--> statement-breakpoint
CREATE TABLE "collection_source_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"collection_run_id" uuid NOT NULL,
	"source_id" text NOT NULL,
	"source_name" text NOT NULL,
	"status" "collection_source_status" NOT NULL,
	"fetched_items" integer NOT NULL,
	"included_items" integer NOT NULL,
	"filtered_out_items" integer NOT NULL,
	"duplicates_removed" integer NOT NULL,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "collection_source_runs_items_check" CHECK ("collection_source_runs"."fetched_items" >= 0
        AND "collection_source_runs"."included_items" >= 0
        AND "collection_source_runs"."filtered_out_items" >= 0
        AND "collection_source_runs"."duplicates_removed" >= 0
        AND "collection_source_runs"."fetched_items" = "collection_source_runs"."included_items" + "collection_source_runs"."filtered_out_items" + "collection_source_runs"."duplicates_removed")
);
--> statement-breakpoint
CREATE TABLE "stories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"canonical_url" text NOT NULL,
	"original_url" text NOT NULL,
	"title" text NOT NULL,
	"content_text" text,
	"content_status" "story_content_status" NOT NULL,
	"language" text NOT NULL,
	"region" text NOT NULL,
	"tags" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"published_at" timestamp with time zone,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"relevance_score" integer DEFAULT 0 NOT NULL,
	"processing_status" "story_processing_status" DEFAULT 'new' NOT NULL,
	CONSTRAINT "stories_relevance_score_check" CHECK ("stories"."relevance_score" BETWEEN 0 AND 100),
	CONSTRAINT "stories_seen_dates_check" CHECK ("stories"."last_seen_at" >= "stories"."first_seen_at")
);
--> statement-breakpoint
CREATE TABLE "story_sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"story_id" uuid NOT NULL,
	"source_id" text NOT NULL,
	"source_name" text NOT NULL,
	"external_id" text NOT NULL,
	"source_url" text NOT NULL,
	"fetched_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "collection_source_runs" ADD CONSTRAINT "collection_source_runs_collection_run_id_collection_runs_id_fk" FOREIGN KEY ("collection_run_id") REFERENCES "public"."collection_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "story_sources" ADD CONSTRAINT "story_sources_story_id_stories_id_fk" FOREIGN KEY ("story_id") REFERENCES "public"."stories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "collection_runs_started_at_idx" ON "collection_runs" USING btree ("started_at");--> statement-breakpoint
CREATE UNIQUE INDEX "collection_source_runs_run_source_unique" ON "collection_source_runs" USING btree ("collection_run_id","source_id");--> statement-breakpoint
CREATE INDEX "collection_source_runs_collection_run_id_idx" ON "collection_source_runs" USING btree ("collection_run_id");--> statement-breakpoint
CREATE INDEX "collection_source_runs_source_id_idx" ON "collection_source_runs" USING btree ("source_id");--> statement-breakpoint
CREATE UNIQUE INDEX "stories_canonical_url_unique" ON "stories" USING btree ("canonical_url");--> statement-breakpoint
CREATE INDEX "stories_published_at_idx" ON "stories" USING btree ("published_at");--> statement-breakpoint
CREATE INDEX "stories_processing_status_idx" ON "stories" USING btree ("processing_status");--> statement-breakpoint
CREATE INDEX "stories_relevance_score_idx" ON "stories" USING btree ("relevance_score");--> statement-breakpoint
CREATE UNIQUE INDEX "story_sources_source_external_id_unique" ON "story_sources" USING btree ("source_id","external_id");--> statement-breakpoint
CREATE INDEX "story_sources_story_id_idx" ON "story_sources" USING btree ("story_id");--> statement-breakpoint
CREATE INDEX "story_sources_source_id_idx" ON "story_sources" USING btree ("source_id");