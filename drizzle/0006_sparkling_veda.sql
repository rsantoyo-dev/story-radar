CREATE TYPE "public"."story_review_decision" AS ENUM('approved', 'rejected');--> statement-breakpoint
ALTER TABLE "stories" ADD COLUMN "review_decision" "story_review_decision";--> statement-breakpoint
ALTER TABLE "stories" ADD COLUMN "reviewed_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "stories_review_decision_idx" ON "stories" USING btree ("review_decision");--> statement-breakpoint
ALTER TABLE "stories" ADD CONSTRAINT "stories_review_fields_check" CHECK (("stories"."review_decision" IS NULL AND "stories"."reviewed_at" IS NULL)
        OR ("stories"."review_decision" IS NOT NULL AND "stories"."reviewed_at" IS NOT NULL));--> statement-breakpoint
ALTER TABLE "stories" ADD CONSTRAINT "stories_review_status_check" CHECK ("stories"."review_decision" IS NULL
        OR ("stories"."review_decision" = 'approved' AND "stories"."processing_status" IN ('selected', 'published'))
        OR ("stories"."review_decision" = 'rejected' AND "stories"."processing_status" = 'rejected'));