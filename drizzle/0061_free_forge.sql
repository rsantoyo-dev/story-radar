CREATE TYPE "public"."recipe_difficulty" AS ENUM('easy', 'medium', 'hard');--> statement-breakpoint
CREATE TYPE "public"."recipe_source_kind" AS ENUM('own', 'imported', 'ai-proposed');--> statement-breakpoint
CREATE TYPE "public"."topic_content_mode" AS ENUM('news', 'recipes');--> statement-breakpoint
CREATE TABLE "recipe_briefs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"topic_id" uuid NOT NULL,
	"story_id" uuid NOT NULL,
	"dish_name" text NOT NULL,
	"servings" integer,
	"notes" text,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "recipe_briefs_dish_name_not_blank_check" CHECK (char_length(btrim("recipe_briefs"."dish_name")) > 0),
	CONSTRAINT "recipe_briefs_servings_check" CHECK ("recipe_briefs"."servings" IS NULL OR "recipe_briefs"."servings" > 0),
	CONSTRAINT "recipe_briefs_version_check" CHECK ("recipe_briefs"."version" > 0)
);
--> statement-breakpoint
CREATE TABLE "recipe_ingredients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"recipe_brief_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"name" text NOT NULL,
	"quantity" numeric(10, 2),
	"unit" text,
	"group_label" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "recipe_ingredients_name_not_blank_check" CHECK (char_length(btrim("recipe_ingredients"."name")) > 0),
	CONSTRAINT "recipe_ingredients_position_check" CHECK ("recipe_ingredients"."position" > 0),
	CONSTRAINT "recipe_ingredients_quantity_check" CHECK ("recipe_ingredients"."quantity" IS NULL OR "recipe_ingredients"."quantity" > 0)
);
--> statement-breakpoint
CREATE TABLE "recipe_profiles" (
	"topic_id" uuid PRIMARY KEY NOT NULL,
	"preferred_difficulty" "recipe_difficulty" DEFAULT 'medium' NOT NULL,
	"primary_language" text DEFAULT 'es' NOT NULL,
	"secondary_language_enabled" boolean DEFAULT false NOT NULL,
	"secondary_language_accents" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"emphasize_swipe_through" boolean DEFAULT true NOT NULL,
	"cover_hook_guidance" text,
	"profile_version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "recipe_profiles_primary_language_not_blank_check" CHECK (char_length(btrim("recipe_profiles"."primary_language")) > 0),
	CONSTRAINT "recipe_profiles_profile_version_check" CHECK ("recipe_profiles"."profile_version" > 0)
);
--> statement-breakpoint
CREATE TABLE "recipe_sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"topic_id" uuid NOT NULL,
	"story_id" uuid NOT NULL,
	"kind" "recipe_source_kind" NOT NULL,
	"raw_text" text,
	"source_url" text,
	"author" text,
	"captured_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "recipe_sources_content_check" CHECK ("recipe_sources"."raw_text" IS NOT NULL OR "recipe_sources"."source_url" IS NOT NULL),
	CONSTRAINT "recipe_sources_source_url_check" CHECK ("recipe_sources"."source_url" IS NULL OR "recipe_sources"."source_url" ~* '^https?://'),
	CONSTRAINT "recipe_sources_kind_url_check" CHECK (("recipe_sources"."kind" <> 'imported' OR "recipe_sources"."source_url" IS NOT NULL)
        AND ("recipe_sources"."kind" <> 'ai-proposed' OR "recipe_sources"."source_url" IS NULL))
);
--> statement-breakpoint
CREATE TABLE "recipe_steps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"recipe_brief_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"instruction" text NOT NULL,
	"related_ingredient_ids" uuid[] DEFAULT ARRAY[]::uuid[] NOT NULL,
	"declared_minutes" integer,
	"doneness_signals" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "recipe_steps_instruction_not_blank_check" CHECK (char_length(btrim("recipe_steps"."instruction")) > 0),
	CONSTRAINT "recipe_steps_position_check" CHECK ("recipe_steps"."position" > 0),
	CONSTRAINT "recipe_steps_declared_minutes_check" CHECK ("recipe_steps"."declared_minutes" IS NULL OR "recipe_steps"."declared_minutes" > 0)
);
--> statement-breakpoint
ALTER TABLE "topics" ADD COLUMN "content_mode" "topic_content_mode" DEFAULT 'news' NOT NULL;--> statement-breakpoint
ALTER TABLE "recipe_briefs" ADD CONSTRAINT "recipe_briefs_topic_id_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."topics"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_briefs" ADD CONSTRAINT "recipe_briefs_story_id_stories_id_fk" FOREIGN KEY ("story_id") REFERENCES "public"."stories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_ingredients" ADD CONSTRAINT "recipe_ingredients_recipe_brief_id_recipe_briefs_id_fk" FOREIGN KEY ("recipe_brief_id") REFERENCES "public"."recipe_briefs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_profiles" ADD CONSTRAINT "recipe_profiles_topic_id_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."topics"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_sources" ADD CONSTRAINT "recipe_sources_topic_id_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."topics"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_sources" ADD CONSTRAINT "recipe_sources_story_id_stories_id_fk" FOREIGN KEY ("story_id") REFERENCES "public"."stories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_steps" ADD CONSTRAINT "recipe_steps_recipe_brief_id_recipe_briefs_id_fk" FOREIGN KEY ("recipe_brief_id") REFERENCES "public"."recipe_briefs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "recipe_briefs_story_unique" ON "recipe_briefs" USING btree ("story_id");--> statement-breakpoint
CREATE INDEX "recipe_briefs_topic_id_idx" ON "recipe_briefs" USING btree ("topic_id");--> statement-breakpoint
CREATE UNIQUE INDEX "recipe_ingredients_brief_position_unique" ON "recipe_ingredients" USING btree ("recipe_brief_id","position");--> statement-breakpoint
CREATE INDEX "recipe_ingredients_brief_id_idx" ON "recipe_ingredients" USING btree ("recipe_brief_id");--> statement-breakpoint
CREATE UNIQUE INDEX "recipe_sources_story_unique" ON "recipe_sources" USING btree ("story_id");--> statement-breakpoint
CREATE INDEX "recipe_sources_topic_id_idx" ON "recipe_sources" USING btree ("topic_id");--> statement-breakpoint
CREATE UNIQUE INDEX "recipe_steps_brief_position_unique" ON "recipe_steps" USING btree ("recipe_brief_id","position");--> statement-breakpoint
CREATE INDEX "recipe_steps_brief_id_idx" ON "recipe_steps" USING btree ("recipe_brief_id");