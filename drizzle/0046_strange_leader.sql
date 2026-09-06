ALTER TABLE "topic_instagram_media" ADD COLUMN "metrics" jsonb;--> statement-breakpoint
ALTER TABLE "topic_instagram_media" ADD COLUMN "metrics_queried_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "topic_instagram_media" ADD COLUMN "metrics_api_version" text;--> statement-breakpoint
ALTER TABLE "topic_instagram_media" ADD COLUMN "metrics_error" text;--> statement-breakpoint
ALTER TABLE "topic_instagram_media" ADD COLUMN "metrics_errored_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "topic_instagram_media" ADD CONSTRAINT "topic_instagram_media_metrics_error_length_check" CHECK ("topic_instagram_media"."metrics_error" IS NULL OR char_length("topic_instagram_media"."metrics_error") <= 500);