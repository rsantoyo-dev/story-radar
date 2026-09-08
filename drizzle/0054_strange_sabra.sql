ALTER TABLE "stories" ADD COLUMN "title_embedding" jsonb;--> statement-breakpoint
ALTER TABLE "stories" ADD COLUMN "title_embedding_model" text;--> statement-breakpoint
ALTER TABLE "topic_stories" ADD COLUMN "duplicate_of_story_id" uuid;--> statement-breakpoint
ALTER TABLE "topic_stories" ADD COLUMN "duplicate_detected_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "topic_stories" ADD COLUMN "duplicate_similarity" integer;--> statement-breakpoint
ALTER TABLE "topic_stories" ADD CONSTRAINT "topic_stories_duplicate_of_story_id_stories_id_fk" FOREIGN KEY ("duplicate_of_story_id") REFERENCES "public"."stories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "topic_stories_topic_duplicate_idx" ON "topic_stories" USING btree ("topic_id","duplicate_of_story_id");--> statement-breakpoint
ALTER TABLE "topic_stories" ADD CONSTRAINT "topic_stories_duplicate_similarity_check" CHECK ("topic_stories"."duplicate_similarity" IS NULL
        OR "topic_stories"."duplicate_similarity" BETWEEN 0 AND 100);