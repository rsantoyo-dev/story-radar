ALTER TABLE "instagram_publication_jobs" ADD COLUMN "channel" text DEFAULT 'instagram-direct' NOT NULL;--> statement-breakpoint
ALTER TABLE "instagram_publication_jobs" ADD COLUMN "page_id" text;--> statement-breakpoint
ALTER TABLE "instagram_publication_packages" ADD COLUMN "channel" text DEFAULT 'instagram-direct' NOT NULL;--> statement-breakpoint
ALTER TABLE "instagram_publication_packages" ADD COLUMN "page_id" text;--> statement-breakpoint
ALTER TABLE "instagram_publication_jobs" ADD CONSTRAINT "instagram_publication_jobs_channel_check" CHECK ("instagram_publication_jobs"."channel" IN ('instagram-direct', 'instagram-page', 'facebook-page')
        AND ("instagram_publication_jobs"."channel" = 'instagram-direct' OR "instagram_publication_jobs"."page_id" IS NOT NULL));--> statement-breakpoint
ALTER TABLE "instagram_publication_packages" ADD CONSTRAINT "instagram_publication_packages_channel_check" CHECK ("instagram_publication_packages"."channel" IN ('instagram-direct', 'instagram-page', 'facebook-page')
        AND ("instagram_publication_packages"."channel" = 'instagram-direct' OR "instagram_publication_packages"."page_id" IS NOT NULL));