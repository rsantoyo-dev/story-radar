ALTER TABLE "topic_instagram_media" ADD COLUMN "linked_draft_id" uuid;--> statement-breakpoint
ALTER TABLE "topic_instagram_media" ADD COLUMN "linked_batch_id" uuid;--> statement-breakpoint
ALTER TABLE "topic_instagram_media" ADD COLUMN "linked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "topic_instagram_media" ADD COLUMN "linked_by" text;--> statement-breakpoint
ALTER TABLE "topic_instagram_media" ADD CONSTRAINT "topic_instagram_media_linked_draft_id_creative_drafts_id_fk" FOREIGN KEY ("linked_draft_id") REFERENCES "public"."creative_drafts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "topic_instagram_media" ADD CONSTRAINT "topic_instagram_media_linked_batch_id_creative_asset_batches_id_fk" FOREIGN KEY ("linked_batch_id") REFERENCES "public"."creative_asset_batches"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "topic_instagram_media" ADD CONSTRAINT "topic_instagram_media_linked_by_length_check" CHECK ("topic_instagram_media"."linked_by" IS NULL OR char_length("topic_instagram_media"."linked_by") <= 200);