-- Generalizes the recipe-only structured-content tables into a
-- domain-agnostic shape (recipes stays the only consumer today, but a
-- future non-culinary "structured guide" can reuse this storage without
-- another migration). Only dev/test rows exist so far — no data migration
-- needed, this drops and recreates rather than renaming in place.
DROP TABLE IF EXISTS "recipe_steps";
DROP TABLE IF EXISTS "recipe_ingredients";
DROP TABLE IF EXISTS "recipe_briefs";
DROP TABLE IF EXISTS "recipe_sources";
DROP TYPE IF EXISTS "public"."recipe_source_extraction_method";
DROP TYPE IF EXISTS "public"."recipe_source_kind";
--> statement-breakpoint
CREATE TYPE "public"."structured_source_kind" AS ENUM('own', 'imported', 'ai-proposed');--> statement-breakpoint
CREATE TYPE "public"."structured_source_extraction_method" AS ENUM('direct', 'reader', 'manual');--> statement-breakpoint
CREATE TABLE "structured_sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"topic_id" uuid NOT NULL,
	"story_id" uuid NOT NULL,
	"kind" "structured_source_kind" NOT NULL,
	"raw_text" text,
	"source_url" text,
	"author" text,
	"extraction_method" "structured_source_extraction_method",
	"captured_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "structured_sources_content_check" CHECK ("structured_sources"."raw_text" IS NOT NULL OR "structured_sources"."source_url" IS NOT NULL),
	CONSTRAINT "structured_sources_source_url_check" CHECK ("structured_sources"."source_url" IS NULL OR "structured_sources"."source_url" ~* '^https?://'),
	CONSTRAINT "structured_sources_kind_url_check" CHECK (("structured_sources"."kind" <> 'imported' OR "structured_sources"."source_url" IS NOT NULL)
        AND ("structured_sources"."kind" <> 'ai-proposed' OR "structured_sources"."source_url" IS NULL)),
	CONSTRAINT "structured_sources_extraction_method_check" CHECK ("structured_sources"."kind" = 'imported' OR "structured_sources"."extraction_method" IS NULL)
);
--> statement-breakpoint
CREATE TABLE "structured_briefs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"topic_id" uuid NOT NULL,
	"story_id" uuid NOT NULL,
	"title" text NOT NULL,
	"unit_label" text,
	"unit_count" integer,
	"notes" text,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "structured_briefs_title_not_blank_check" CHECK (char_length(btrim("structured_briefs"."title")) > 0),
	CONSTRAINT "structured_briefs_unit_count_check" CHECK ("structured_briefs"."unit_count" IS NULL OR "structured_briefs"."unit_count" > 0),
	CONSTRAINT "structured_briefs_version_check" CHECK ("structured_briefs"."version" > 0)
);
--> statement-breakpoint
CREATE TABLE "brief_components" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"brief_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"name" text NOT NULL,
	"quantity" numeric(10, 2),
	"unit" text,
	"group_label" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "brief_components_name_not_blank_check" CHECK (char_length(btrim("brief_components"."name")) > 0),
	CONSTRAINT "brief_components_position_check" CHECK ("brief_components"."position" > 0),
	CONSTRAINT "brief_components_quantity_check" CHECK ("brief_components"."quantity" IS NULL OR "brief_components"."quantity" > 0)
);
--> statement-breakpoint
CREATE TABLE "brief_steps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"brief_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"instruction" text NOT NULL,
	"related_component_ids" uuid[] DEFAULT ARRAY[]::uuid[] NOT NULL,
	"declared_minutes" integer,
	"outcome_signals" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "brief_steps_instruction_not_blank_check" CHECK (char_length(btrim("brief_steps"."instruction")) > 0),
	CONSTRAINT "brief_steps_position_check" CHECK ("brief_steps"."position" > 0),
	CONSTRAINT "brief_steps_declared_minutes_check" CHECK ("brief_steps"."declared_minutes" IS NULL OR "brief_steps"."declared_minutes" > 0)
);
--> statement-breakpoint
ALTER TABLE "structured_sources" ADD CONSTRAINT "structured_sources_topic_id_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."topics"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "structured_sources" ADD CONSTRAINT "structured_sources_story_id_stories_id_fk" FOREIGN KEY ("story_id") REFERENCES "public"."stories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "structured_briefs" ADD CONSTRAINT "structured_briefs_topic_id_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."topics"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "structured_briefs" ADD CONSTRAINT "structured_briefs_story_id_stories_id_fk" FOREIGN KEY ("story_id") REFERENCES "public"."stories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brief_components" ADD CONSTRAINT "brief_components_brief_id_structured_briefs_id_fk" FOREIGN KEY ("brief_id") REFERENCES "public"."structured_briefs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brief_steps" ADD CONSTRAINT "brief_steps_brief_id_structured_briefs_id_fk" FOREIGN KEY ("brief_id") REFERENCES "public"."structured_briefs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "structured_sources_story_unique" ON "structured_sources" USING btree ("story_id");--> statement-breakpoint
CREATE INDEX "structured_sources_topic_id_idx" ON "structured_sources" USING btree ("topic_id");--> statement-breakpoint
CREATE UNIQUE INDEX "structured_briefs_story_unique" ON "structured_briefs" USING btree ("story_id");--> statement-breakpoint
CREATE INDEX "structured_briefs_topic_id_idx" ON "structured_briefs" USING btree ("topic_id");--> statement-breakpoint
CREATE UNIQUE INDEX "brief_components_brief_position_unique" ON "brief_components" USING btree ("brief_id","position");--> statement-breakpoint
CREATE INDEX "brief_components_brief_id_idx" ON "brief_components" USING btree ("brief_id");--> statement-breakpoint
CREATE UNIQUE INDEX "brief_steps_brief_position_unique" ON "brief_steps" USING btree ("brief_id","position");--> statement-breakpoint
CREATE INDEX "brief_steps_brief_id_idx" ON "brief_steps" USING btree ("brief_id");
