ALTER TABLE "instagram_publication_jobs" ADD COLUMN "comment_status" text;--> statement-breakpoint
ALTER TABLE "instagram_publication_jobs" ADD COLUMN "comment_id" text;--> statement-breakpoint
ALTER TABLE "instagram_publication_jobs" ADD COLUMN "comment_error" text;--> statement-breakpoint
ALTER TABLE "instagram_publication_jobs" ADD COLUMN "comment_attempts" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "instagram_publication_jobs" ADD COLUMN "commented_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "instagram_publication_packages" ADD COLUMN "first_comment" text;--> statement-breakpoint
ALTER TABLE "instagram_publication_jobs" ADD CONSTRAINT "instagram_publication_jobs_comment_check" CHECK (("instagram_publication_jobs"."comment_status" IS NULL OR "instagram_publication_jobs"."comment_status" IN ('pending', 'posting', 'posted', 'failed'))
        AND ("instagram_publication_jobs"."comment_status" IS DISTINCT FROM 'posted' OR "instagram_publication_jobs"."comment_id" IS NOT NULL)
        AND ("instagram_publication_jobs"."comment_status" IS DISTINCT FROM 'failed' OR "instagram_publication_jobs"."comment_error" IS NOT NULL)
        AND "instagram_publication_jobs"."comment_attempts" >= 0);