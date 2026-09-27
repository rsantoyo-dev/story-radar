CREATE TABLE "meta_publication_confirmations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"delivery_id" uuid NOT NULL,
	"platform" text NOT NULL,
	"account_id" text NOT NULL,
	"remote_id" text NOT NULL,
	"permalink" text,
	"confirmed_at" timestamp with time zone NOT NULL,
	CONSTRAINT "meta_publication_confirmations_platform_check" CHECK ("meta_publication_confirmations"."platform" IN ('instagram', 'facebook'))
);
--> statement-breakpoint
CREATE TABLE "meta_publication_deliveries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"workspace_id" text NOT NULL,
	"topic_id" uuid NOT NULL,
	"story_id" uuid NOT NULL,
	"editorial_line_id" uuid,
	"platform" text NOT NULL,
	"account_id" text NOT NULL,
	"connection_version" text NOT NULL,
	"package_id" uuid,
	"package_hash" text NOT NULL,
	"package_snapshot" jsonb,
	"legacy_instagram_job_id" uuid,
	"status" text DEFAULT 'queued' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"scheduled_at" timestamp with time zone,
	"confirmed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "meta_publication_deliveries_platform_check" CHECK ("meta_publication_deliveries"."platform" IN ('instagram', 'facebook')),
	CONSTRAINT "meta_publication_deliveries_attempts_check" CHECK ("meta_publication_deliveries"."attempts" >= 0)
);
--> statement-breakpoint
CREATE TABLE "meta_publication_orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" text NOT NULL,
	"topic_id" uuid NOT NULL,
	"story_id" uuid NOT NULL,
	"editorial_line_id" uuid,
	"idempotency_key" text NOT NULL,
	"action" text NOT NULL,
	"authorized_destinations" jsonb NOT NULL,
	"authorization" jsonb NOT NULL,
	"authorized_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "meta_publication_orders_action_check" CHECK ("meta_publication_orders"."action" IN ('publish-now', 'schedule')),
	CONSTRAINT "meta_publication_orders_destinations_check" CHECK (jsonb_typeof("meta_publication_orders"."authorized_destinations") = 'array' AND jsonb_array_length("meta_publication_orders"."authorized_destinations") > 0)
);
--> statement-breakpoint
ALTER TABLE "story_social_publications" DROP CONSTRAINT "story_social_publications_dates_check";--> statement-breakpoint
ALTER TABLE "meta_publication_confirmations" ADD CONSTRAINT "meta_publication_confirmations_delivery_id_meta_publication_deliveries_id_fk" FOREIGN KEY ("delivery_id") REFERENCES "public"."meta_publication_deliveries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meta_publication_deliveries" ADD CONSTRAINT "meta_publication_deliveries_order_id_meta_publication_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."meta_publication_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meta_publication_deliveries" ADD CONSTRAINT "meta_publication_deliveries_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meta_publication_deliveries" ADD CONSTRAINT "meta_publication_deliveries_topic_id_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."topics"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meta_publication_deliveries" ADD CONSTRAINT "meta_publication_deliveries_story_id_stories_id_fk" FOREIGN KEY ("story_id") REFERENCES "public"."stories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meta_publication_deliveries" ADD CONSTRAINT "meta_publication_deliveries_package_id_instagram_publication_packages_id_fk" FOREIGN KEY ("package_id") REFERENCES "public"."instagram_publication_packages"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meta_publication_deliveries" ADD CONSTRAINT "meta_publication_deliveries_legacy_instagram_job_id_instagram_publication_jobs_id_fk" FOREIGN KEY ("legacy_instagram_job_id") REFERENCES "public"."instagram_publication_jobs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meta_publication_orders" ADD CONSTRAINT "meta_publication_orders_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meta_publication_orders" ADD CONSTRAINT "meta_publication_orders_topic_id_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."topics"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meta_publication_orders" ADD CONSTRAINT "meta_publication_orders_story_id_stories_id_fk" FOREIGN KEY ("story_id") REFERENCES "public"."stories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "meta_publication_confirmations_delivery_unique" ON "meta_publication_confirmations" USING btree ("delivery_id");--> statement-breakpoint
CREATE UNIQUE INDEX "meta_publication_confirmations_remote_unique" ON "meta_publication_confirmations" USING btree ("platform","account_id","remote_id");--> statement-breakpoint
CREATE UNIQUE INDEX "meta_publication_deliveries_legacy_job_unique" ON "meta_publication_deliveries" USING btree ("legacy_instagram_job_id");--> statement-breakpoint
CREATE UNIQUE INDEX "meta_publication_deliveries_order_platform_unique" ON "meta_publication_deliveries" USING btree ("order_id","platform");--> statement-breakpoint
CREATE INDEX "meta_publication_deliveries_topic_story_idx" ON "meta_publication_deliveries" USING btree ("topic_id","story_id");--> statement-breakpoint
CREATE INDEX "meta_publication_deliveries_status_idx" ON "meta_publication_deliveries" USING btree ("status","scheduled_at");--> statement-breakpoint
CREATE UNIQUE INDEX "meta_publication_orders_idempotency_unique" ON "meta_publication_orders" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX "meta_publication_orders_topic_story_idx" ON "meta_publication_orders" USING btree ("topic_id","story_id");--> statement-breakpoint
-- Preserve the exact ID and timestamps of every existing Instagram job. Published
-- jobs become confirmations, never work to resend. Empty account IDs can exist
-- on an old failed preflight; they remain visibly tied to that original job.
INSERT INTO "meta_publication_orders" ("id", "workspace_id", "topic_id", "story_id", "idempotency_key", "action", "authorized_destinations", "authorization", "created_at")
SELECT j."id", t."workspace_id", j."topic_id", j."story_id", j."idempotency_key", 'publish-now',
  jsonb_build_array(jsonb_build_object('platform', 'instagram', 'accountId', COALESCE(j."ig_user_id", p."ig_user_id", 'unknown:' || j."id"::text))),
  jsonb_build_object('source', 'legacy-instagram-explicit-order', 'jobId', j."id"), j."created_at"
FROM "instagram_publication_jobs" j
JOIN "topics" t ON t."id" = j."topic_id"
JOIN "instagram_publication_packages" p ON p."id" = j."package_id";--> statement-breakpoint
INSERT INTO "meta_publication_deliveries" ("id", "order_id", "workspace_id", "topic_id", "story_id", "platform", "account_id", "connection_version", "package_id", "package_hash", "package_snapshot", "legacy_instagram_job_id", "status", "attempts", "confirmed_at", "created_at", "updated_at")
SELECT j."id", j."id", t."workspace_id", j."topic_id", j."story_id", 'instagram',
  COALESCE(j."ig_user_id", p."ig_user_id", 'unknown:' || j."id"::text), j."connection_version", p."id", p."package_hash",
  jsonb_build_object('source', 'legacy-instagram', 'draftId', p."draft_id", 'draftVersion', p."draft_version", 'batchId', p."batch_id", 'caption', p."caption", 'hashtags', p."hashtags", 'script', p."script_snapshot", 'policy', p."policy_snapshot", 'transforms', p."transforms", 'candidateSnapshotHash', p."candidate_snapshot_hash"),
  j."id", j."status", j."attempts", CASE WHEN j."published_media_id" IS NOT NULL THEN COALESCE(j."finished_at", j."updated_at") END, j."created_at", j."updated_at"
FROM "instagram_publication_jobs" j
JOIN "topics" t ON t."id" = j."topic_id"
JOIN "instagram_publication_packages" p ON p."id" = j."package_id";--> statement-breakpoint
INSERT INTO "meta_publication_confirmations" ("delivery_id", "platform", "account_id", "remote_id", "permalink", "confirmed_at")
SELECT d."id", 'instagram', d."account_id", j."published_media_id", j."permalink", COALESCE(j."finished_at", j."updated_at")
FROM "instagram_publication_jobs" j
JOIN "meta_publication_deliveries" d ON d."legacy_instagram_job_id" = j."id"
WHERE j."published_media_id" IS NOT NULL;
