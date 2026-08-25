CREATE TYPE "public"."creative_ai_run_status" AS ENUM('running', 'completed', 'failed');--> statement-breakpoint
CREATE TYPE "public"."creative_ai_task" AS ENUM('brief', 'draft');--> statement-breakpoint
CREATE TYPE "public"."creative_aspect_ratio" AS ENUM('1:1', '4:5');--> statement-breakpoint
CREATE TYPE "public"."creative_asset_request_type" AS ENUM('generated-image', 'typography-only');--> statement-breakpoint
CREATE TYPE "public"."creative_content_sufficiency" AS ENUM('sufficient', 'limited', 'insufficient');--> statement-breakpoint
CREATE TYPE "public"."creative_draft_status" AS ENUM('draft', 'approved');--> statement-breakpoint
CREATE TYPE "public"."creative_format" AS ENUM('meme', 'carousel');--> statement-breakpoint
CREATE TYPE "public"."creative_tone" AS ENUM('informative', 'curious', 'playful', 'inspiring', 'cautious', 'urgent', 'somber');--> statement-breakpoint
CREATE TYPE "public"."creative_unit_role" AS ENUM('cover', 'content', 'conclusion', 'call-to-action');--> statement-breakpoint
CREATE TYPE "public"."creative_unit_type" AS ENUM('meme-frame', 'carousel-slide');--> statement-breakpoint
CREATE TABLE "creative_ai_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"story_id" uuid NOT NULL,
	"brief_id" uuid,
	"draft_id" uuid,
	"task" "creative_ai_task" NOT NULL,
	"provider" text NOT NULL,
	"model" text NOT NULL,
	"prompt_version" text NOT NULL,
	"input_hash" text NOT NULL,
	"status" "creative_ai_run_status" DEFAULT 'running' NOT NULL,
	"prompt_tokens" integer DEFAULT 0 NOT NULL,
	"output_tokens" integer DEFAULT 0 NOT NULL,
	"thoughts_tokens" integer DEFAULT 0 NOT NULL,
	"total_tokens" integer DEFAULT 0 NOT NULL,
	"error" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	CONSTRAINT "creative_ai_runs_tokens_check" CHECK ("creative_ai_runs"."prompt_tokens" >= 0
        AND "creative_ai_runs"."output_tokens" >= 0
        AND "creative_ai_runs"."thoughts_tokens" >= 0
        AND "creative_ai_runs"."total_tokens" >= 0),
	CONSTRAINT "creative_ai_runs_dates_check" CHECK ("creative_ai_runs"."finished_at" IS NULL OR "creative_ai_runs"."finished_at" >= "creative_ai_runs"."started_at")
);
--> statement-breakpoint
CREATE TABLE "creative_drafts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"story_id" uuid NOT NULL,
	"brief_id" uuid NOT NULL,
	"format" "creative_format" NOT NULL,
	"status" "creative_draft_status" DEFAULT 'draft' NOT NULL,
	"concept" text NOT NULL,
	"caption" text NOT NULL,
	"call_to_action" text,
	"hashtags" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"alt_text" text NOT NULL,
	"provider" text NOT NULL,
	"model" text NOT NULL,
	"model_version" text,
	"prompt_version" text NOT NULL,
	"input_hash" text NOT NULL,
	"ai_snapshot" jsonb NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"prompt_tokens" integer DEFAULT 0 NOT NULL,
	"output_tokens" integer DEFAULT 0 NOT NULL,
	"thoughts_tokens" integer DEFAULT 0 NOT NULL,
	"total_tokens" integer DEFAULT 0 NOT NULL,
	"approved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "creative_drafts_version_check" CHECK ("creative_drafts"."version" > 0),
	CONSTRAINT "creative_drafts_approval_check" CHECK (("creative_drafts"."status" = 'draft' AND "creative_drafts"."approved_at" IS NULL)
        OR ("creative_drafts"."status" = 'approved' AND "creative_drafts"."approved_at" IS NOT NULL)),
	CONSTRAINT "creative_drafts_tokens_check" CHECK ("creative_drafts"."prompt_tokens" >= 0
        AND "creative_drafts"."output_tokens" >= 0
        AND "creative_drafts"."thoughts_tokens" >= 0
        AND "creative_drafts"."total_tokens" >= 0)
);
--> statement-breakpoint
CREATE TABLE "creative_profiles" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"language" text NOT NULL,
	"region" text NOT NULL,
	"platform" text NOT NULL,
	"audience" text NOT NULL,
	"brand_personality" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"formality" integer NOT NULL,
	"humor" integer NOT NULL,
	"energy" integer NOT NULL,
	"optimism" integer NOT NULL,
	"provocation" integer NOT NULL,
	"allow_emojis" boolean DEFAULT true NOT NULL,
	"max_emojis" integer DEFAULT 2 NOT NULL,
	"call_to_action_style" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "creative_profiles_dimensions_check" CHECK ("creative_profiles"."formality" BETWEEN 0 AND 100
        AND "creative_profiles"."humor" BETWEEN 0 AND 100
        AND "creative_profiles"."energy" BETWEEN 0 AND 100
        AND "creative_profiles"."optimism" BETWEEN 0 AND 100
        AND "creative_profiles"."provocation" BETWEEN 0 AND 100),
	CONSTRAINT "creative_profiles_max_emojis_check" CHECK ("creative_profiles"."max_emojis" BETWEEN 0 AND 10)
);
--> statement-breakpoint
CREATE TABLE "creative_units" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"draft_id" uuid NOT NULL,
	"order" integer NOT NULL,
	"type" "creative_unit_type" NOT NULL,
	"role" "creative_unit_role" NOT NULL,
	"headline" text NOT NULL,
	"body" text,
	"visual_direction" text NOT NULL,
	"fact_ids" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"asset_request" "creative_asset_request_type" NOT NULL,
	"aspect_ratio" "creative_aspect_ratio" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "creative_units_order_check" CHECK ("creative_units"."order" > 0)
);
--> statement-breakpoint
CREATE TABLE "story_creative_briefs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"story_id" uuid NOT NULL,
	"profile_id" text NOT NULL,
	"profile_snapshot" jsonb NOT NULL,
	"provider" text NOT NULL,
	"model" text NOT NULL,
	"model_version" text,
	"prompt_version" text NOT NULL,
	"input_hash" text NOT NULL,
	"recommended_format" "creative_format" NOT NULL,
	"fallback_format" "creative_format" NOT NULL,
	"format_scores" jsonb NOT NULL,
	"confidence" integer NOT NULL,
	"target_audience" text NOT NULL,
	"key_message" text NOT NULL,
	"angle" text NOT NULL,
	"hook" text NOT NULL,
	"tone_primary" "creative_tone" NOT NULL,
	"tone_energy" integer NOT NULL,
	"tone_humor" integer NOT NULL,
	"tone_reason" text NOT NULL,
	"content_sufficiency" "creative_content_sufficiency" NOT NULL,
	"key_facts" jsonb NOT NULL,
	"risk_flags" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"suggested_concepts" jsonb NOT NULL,
	"prompt_tokens" integer DEFAULT 0 NOT NULL,
	"output_tokens" integer DEFAULT 0 NOT NULL,
	"thoughts_tokens" integer DEFAULT 0 NOT NULL,
	"total_tokens" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "story_creative_briefs_scores_check" CHECK ("story_creative_briefs"."confidence" BETWEEN 0 AND 100
        AND "story_creative_briefs"."tone_energy" BETWEEN 0 AND 100
        AND "story_creative_briefs"."tone_humor" BETWEEN 0 AND 100),
	CONSTRAINT "story_creative_briefs_formats_check" CHECK ("story_creative_briefs"."recommended_format" <> "story_creative_briefs"."fallback_format"),
	CONSTRAINT "story_creative_briefs_tokens_check" CHECK ("story_creative_briefs"."prompt_tokens" >= 0
        AND "story_creative_briefs"."output_tokens" >= 0
        AND "story_creative_briefs"."thoughts_tokens" >= 0
        AND "story_creative_briefs"."total_tokens" >= 0)
);
--> statement-breakpoint
ALTER TABLE "creative_ai_runs" ADD CONSTRAINT "creative_ai_runs_story_id_stories_id_fk" FOREIGN KEY ("story_id") REFERENCES "public"."stories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "creative_ai_runs" ADD CONSTRAINT "creative_ai_runs_brief_id_story_creative_briefs_id_fk" FOREIGN KEY ("brief_id") REFERENCES "public"."story_creative_briefs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "creative_ai_runs" ADD CONSTRAINT "creative_ai_runs_draft_id_creative_drafts_id_fk" FOREIGN KEY ("draft_id") REFERENCES "public"."creative_drafts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "creative_drafts" ADD CONSTRAINT "creative_drafts_story_id_stories_id_fk" FOREIGN KEY ("story_id") REFERENCES "public"."stories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "creative_drafts" ADD CONSTRAINT "creative_drafts_brief_id_story_creative_briefs_id_fk" FOREIGN KEY ("brief_id") REFERENCES "public"."story_creative_briefs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "creative_units" ADD CONSTRAINT "creative_units_draft_id_creative_drafts_id_fk" FOREIGN KEY ("draft_id") REFERENCES "public"."creative_drafts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "story_creative_briefs" ADD CONSTRAINT "story_creative_briefs_story_id_stories_id_fk" FOREIGN KEY ("story_id") REFERENCES "public"."stories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "story_creative_briefs" ADD CONSTRAINT "story_creative_briefs_profile_id_creative_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."creative_profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "creative_ai_runs_story_id_idx" ON "creative_ai_runs" USING btree ("story_id");--> statement-breakpoint
CREATE INDEX "creative_ai_runs_started_at_idx" ON "creative_ai_runs" USING btree ("started_at");--> statement-breakpoint
CREATE INDEX "creative_ai_runs_status_idx" ON "creative_ai_runs" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "creative_drafts_cache_unique" ON "creative_drafts" USING btree ("brief_id","format","input_hash");--> statement-breakpoint
CREATE INDEX "creative_drafts_story_id_idx" ON "creative_drafts" USING btree ("story_id");--> statement-breakpoint
CREATE INDEX "creative_drafts_brief_id_idx" ON "creative_drafts" USING btree ("brief_id");--> statement-breakpoint
CREATE INDEX "creative_drafts_status_idx" ON "creative_drafts" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "creative_units_draft_order_unique" ON "creative_units" USING btree ("draft_id","order");--> statement-breakpoint
CREATE INDEX "creative_units_draft_id_idx" ON "creative_units" USING btree ("draft_id");--> statement-breakpoint
CREATE UNIQUE INDEX "story_creative_briefs_cache_unique" ON "story_creative_briefs" USING btree ("story_id","provider","model","prompt_version","input_hash");--> statement-breakpoint
CREATE INDEX "story_creative_briefs_story_id_idx" ON "story_creative_briefs" USING btree ("story_id");--> statement-breakpoint
CREATE INDEX "story_creative_briefs_created_at_idx" ON "story_creative_briefs" USING btree ("created_at");