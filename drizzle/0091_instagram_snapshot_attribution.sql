ALTER TABLE "instagram_media_metric_snapshots" ADD COLUMN "linked_story_id" uuid;--> statement-breakpoint
ALTER TABLE "instagram_media_metric_snapshots" ADD COLUMN "linked_draft_id" uuid;--> statement-breakpoint
ALTER TABLE "instagram_media_metric_snapshots" ADD COLUMN "linked_draft_version" integer;--> statement-breakpoint
ALTER TABLE "instagram_media_metric_snapshots" ADD COLUMN "linked_batch_id" uuid;--> statement-breakpoint
ALTER TABLE "instagram_media_metric_snapshots" ADD COLUMN "published_package_id" uuid;--> statement-breakpoint
ALTER TABLE "instagram_media_metric_snapshots" ADD COLUMN "published_at" timestamp with time zone;