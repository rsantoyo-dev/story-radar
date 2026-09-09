CREATE TABLE "instagram_publication_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"topic_id" uuid NOT NULL,
	"story_id" uuid NOT NULL,
	"draft_id" uuid NOT NULL,
	"batch_id" uuid NOT NULL,
	"package_id" uuid NOT NULL,
	"idempotency_key" text NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"media_type" text,
	"ig_user_id" text,
	"connection_version" text NOT NULL,
	"api_version" text NOT NULL,
	"app_configuration_version" text,
	"access_state" text,
	"access_checked_at" timestamp with time zone,
	"quota_remaining" integer,
	"child_containers" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"parent_container_id" text,
	"published_media_id" text,
	"permalink" text,
	"attempts" integer DEFAULT 0 NOT NULL,
	"lease_owner" text,
	"lease_until" timestamp with time zone,
	"failure_kind" text,
	"last_error" text,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "instagram_publication_jobs_values_check" CHECK ("instagram_publication_jobs"."attempts" >= 0
        AND "instagram_publication_jobs"."status" IN (
          'queued', 'preparing', 'creating-containers', 'containers-ready',
          'publishing', 'pending-confirmation', 'published', 'failed', 'suspended'
        )
        AND ("instagram_publication_jobs"."media_type" IS NULL OR "instagram_publication_jobs"."media_type" IN ('image', 'carousel'))
        AND ("instagram_publication_jobs"."failure_kind" IS NULL OR "instagram_publication_jobs"."failure_kind" IN (
          'retryable', 'permission', 'rate-limit', 'expired-container',
          'uncertain', 'invalidated'
        ))),
	CONSTRAINT "instagram_publication_jobs_result_check" CHECK ((
        "instagram_publication_jobs"."status" NOT IN ('published', 'failed', 'suspended')
        OR "instagram_publication_jobs"."finished_at" IS NOT NULL
      ) AND (
        "instagram_publication_jobs"."status" NOT IN ('failed', 'suspended')
        OR "instagram_publication_jobs"."last_error" IS NOT NULL
      )),
	CONSTRAINT "instagram_publication_jobs_dates_check" CHECK ("instagram_publication_jobs"."updated_at" >= "instagram_publication_jobs"."created_at")
);
--> statement-breakpoint
ALTER TABLE "topic_instagram_media" ADD COLUMN "published_package_id" uuid;--> statement-breakpoint
ALTER TABLE "instagram_publication_jobs" ADD CONSTRAINT "instagram_publication_jobs_topic_id_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."topics"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "instagram_publication_jobs" ADD CONSTRAINT "instagram_publication_jobs_story_id_stories_id_fk" FOREIGN KEY ("story_id") REFERENCES "public"."stories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "instagram_publication_jobs" ADD CONSTRAINT "instagram_publication_jobs_draft_id_creative_drafts_id_fk" FOREIGN KEY ("draft_id") REFERENCES "public"."creative_drafts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "instagram_publication_jobs" ADD CONSTRAINT "instagram_publication_jobs_batch_id_creative_asset_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."creative_asset_batches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "instagram_publication_jobs" ADD CONSTRAINT "instagram_publication_jobs_package_id_instagram_publication_packages_id_fk" FOREIGN KEY ("package_id") REFERENCES "public"."instagram_publication_packages"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "instagram_publication_jobs_idempotency_unique" ON "instagram_publication_jobs" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX "instagram_publication_jobs_topic_draft_idx" ON "instagram_publication_jobs" USING btree ("topic_id","draft_id");--> statement-breakpoint
CREATE INDEX "instagram_publication_jobs_status_lease_idx" ON "instagram_publication_jobs" USING btree ("status","lease_until");--> statement-breakpoint
CREATE INDEX "instagram_publication_jobs_package_idx" ON "instagram_publication_jobs" USING btree ("package_id");--> statement-breakpoint
ALTER TABLE "topic_instagram_media" ADD CONSTRAINT "topic_instagram_media_published_package_id_instagram_publication_packages_id_fk" FOREIGN KEY ("published_package_id") REFERENCES "public"."instagram_publication_packages"("id") ON DELETE set null ON UPDATE no action;