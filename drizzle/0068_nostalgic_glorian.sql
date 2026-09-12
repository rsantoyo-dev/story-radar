ALTER TABLE "creative_profiles" ADD COLUMN "require_cover_title" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "story_creative_briefs" ADD COLUMN "content_title" text;