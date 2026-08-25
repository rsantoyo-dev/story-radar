CREATE TYPE "public"."social_publication_platform" AS ENUM('instagram', 'linkedin', 'tiktok', 'facebook', 'x', 'youtube', 'newsletter');--> statement-breakpoint
CREATE TYPE "public"."social_publication_status" AS ENUM('draft', 'scheduled', 'published');--> statement-breakpoint
CREATE TABLE "story_social_publications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"topic_id" uuid NOT NULL,
	"story_id" uuid NOT NULL,
	"platform" "social_publication_platform" NOT NULL,
	"status" "social_publication_status" DEFAULT 'draft' NOT NULL,
	"scheduled_at" timestamp with time zone,
	"published_at" timestamp with time zone,
	"post_url" text,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "story_social_publications_dates_check" CHECK ("story_social_publications"."published_at" IS NULL
        OR "story_social_publications"."scheduled_at" IS NULL
        OR "story_social_publications"."published_at" >= "story_social_publications"."scheduled_at"),
	CONSTRAINT "story_social_publications_post_url_check" CHECK ("story_social_publications"."post_url" IS NULL OR "story_social_publications"."post_url" ~* '^https?://'),
	CONSTRAINT "story_social_publications_note_length_check" CHECK ("story_social_publications"."note" IS NULL OR char_length("story_social_publications"."note") <= 2000)
);
--> statement-breakpoint
ALTER TABLE "story_social_publications" ADD CONSTRAINT "story_social_publications_topic_id_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."topics"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "story_social_publications" ADD CONSTRAINT "story_social_publications_story_id_stories_id_fk" FOREIGN KEY ("story_id") REFERENCES "public"."stories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "story_social_publications_topic_story_platform_unique" ON "story_social_publications" USING btree ("topic_id","story_id","platform");--> statement-breakpoint
CREATE INDEX "story_social_publications_topic_status_idx" ON "story_social_publications" USING btree ("topic_id","status");--> statement-breakpoint
CREATE INDEX "story_social_publications_story_id_idx" ON "story_social_publications" USING btree ("story_id");