-- Recipes stop being their own product vertical: "sequence" becomes a third
-- creative_format the AI can recommend (like meme/carousel) from any topic's
-- own content, so the whole structured-content model and the per-topic
-- content-mode switch are no longer needed.
ALTER TYPE "public"."creative_format" ADD VALUE 'sequence';--> statement-breakpoint
DROP TABLE IF EXISTS "brief_steps";--> statement-breakpoint
DROP TABLE IF EXISTS "brief_components";--> statement-breakpoint
DROP TABLE IF EXISTS "structured_briefs";--> statement-breakpoint
DROP TABLE IF EXISTS "structured_sources";--> statement-breakpoint
ALTER TABLE "topics" DROP COLUMN IF EXISTS "content_mode";--> statement-breakpoint
DROP TYPE IF EXISTS "public"."structured_source_extraction_method";--> statement-breakpoint
DROP TYPE IF EXISTS "public"."structured_source_kind";--> statement-breakpoint
DROP TYPE IF EXISTS "public"."topic_content_mode";
