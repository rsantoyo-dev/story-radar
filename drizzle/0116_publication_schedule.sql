ALTER TABLE "instagram_publication_jobs" DROP CONSTRAINT "instagram_publication_jobs_values_check";--> statement-breakpoint
ALTER TABLE "instagram_publication_jobs" ADD COLUMN "publish_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "instagram_publication_jobs_schedule_idx" ON "instagram_publication_jobs" USING btree ("status","publish_at");--> statement-breakpoint
ALTER TABLE "instagram_publication_jobs" ADD CONSTRAINT "instagram_publication_jobs_schedule_check" CHECK ("instagram_publication_jobs"."status" <> 'scheduled' OR "instagram_publication_jobs"."publish_at" IS NOT NULL);--> statement-breakpoint
ALTER TABLE "instagram_publication_jobs" ADD CONSTRAINT "instagram_publication_jobs_values_check" CHECK ("instagram_publication_jobs"."attempts" >= 0
        AND "instagram_publication_jobs"."status" IN (
          'scheduled', 'queued', 'preparing', 'creating-containers', 'containers-ready',
          'publishing', 'pending-confirmation', 'published', 'failed', 'suspended'
        )
        AND ("instagram_publication_jobs"."media_type" IS NULL OR "instagram_publication_jobs"."media_type" IN ('image', 'carousel'))
        AND ("instagram_publication_jobs"."failure_kind" IS NULL OR "instagram_publication_jobs"."failure_kind" IN (
          'retryable', 'permission', 'rate-limit', 'expired-container',
          'uncertain', 'invalidated'
        )));