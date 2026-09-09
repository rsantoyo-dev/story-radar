CREATE TABLE "instagram_delivery_files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"package_id" uuid NOT NULL,
	"unit_order" integer NOT NULL,
	"asset_version" integer NOT NULL,
	"token" text NOT NULL,
	"object_key" text NOT NULL,
	"content_type" text NOT NULL,
	"byte_size" integer NOT NULL,
	"sha256" text NOT NULL,
	"source_sha256" text NOT NULL,
	"width" integer NOT NULL,
	"height" integer NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "instagram_delivery_files_values_check" CHECK ("instagram_delivery_files"."unit_order" > 0
        AND "instagram_delivery_files"."byte_size" > 0
        AND "instagram_delivery_files"."width" > 0
        AND "instagram_delivery_files"."height" > 0)
);
--> statement-breakpoint
CREATE TABLE "instagram_publication_packages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"topic_id" uuid NOT NULL,
	"story_id" uuid NOT NULL,
	"draft_id" uuid NOT NULL,
	"draft_version" integer NOT NULL,
	"batch_id" uuid NOT NULL,
	"candidate_snapshot_hash" text NOT NULL,
	"package_hash" text NOT NULL,
	"media_type" text NOT NULL,
	"caption" text NOT NULL,
	"hashtags" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"ig_user_id" text,
	"ig_username" text,
	"connection_version" text NOT NULL,
	"script_snapshot" jsonb NOT NULL,
	"policy_snapshot" jsonb,
	"transforms" jsonb NOT NULL,
	"status" text DEFAULT 'frozen' NOT NULL,
	"publishing_access_pending" boolean DEFAULT false NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "instagram_publication_packages_values_check" CHECK ("instagram_publication_packages"."draft_version" > 0
        AND "instagram_publication_packages"."media_type" IN ('image', 'carousel')
        AND "instagram_publication_packages"."status" IN ('frozen', 'stale', 'consumed')),
	CONSTRAINT "instagram_publication_packages_dates_check" CHECK ("instagram_publication_packages"."updated_at" >= "instagram_publication_packages"."created_at"
        AND "instagram_publication_packages"."expires_at" > "instagram_publication_packages"."created_at")
);
--> statement-breakpoint
ALTER TABLE "instagram_delivery_files" ADD CONSTRAINT "instagram_delivery_files_package_id_instagram_publication_packages_id_fk" FOREIGN KEY ("package_id") REFERENCES "public"."instagram_publication_packages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "instagram_publication_packages" ADD CONSTRAINT "instagram_publication_packages_topic_id_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."topics"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "instagram_publication_packages" ADD CONSTRAINT "instagram_publication_packages_story_id_stories_id_fk" FOREIGN KEY ("story_id") REFERENCES "public"."stories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "instagram_publication_packages" ADD CONSTRAINT "instagram_publication_packages_draft_id_creative_drafts_id_fk" FOREIGN KEY ("draft_id") REFERENCES "public"."creative_drafts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "instagram_publication_packages" ADD CONSTRAINT "instagram_publication_packages_batch_id_creative_asset_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."creative_asset_batches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "instagram_delivery_files_token_unique" ON "instagram_delivery_files" USING btree ("token");--> statement-breakpoint
CREATE INDEX "instagram_delivery_files_package_idx" ON "instagram_delivery_files" USING btree ("package_id");--> statement-breakpoint
CREATE INDEX "instagram_delivery_files_expiry_idx" ON "instagram_delivery_files" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "instagram_publication_packages_draft_candidate_unique" ON "instagram_publication_packages" USING btree ("draft_id","candidate_snapshot_hash");--> statement-breakpoint
CREATE INDEX "instagram_publication_packages_topic_draft_idx" ON "instagram_publication_packages" USING btree ("topic_id","draft_id");--> statement-breakpoint
CREATE INDEX "instagram_publication_packages_status_expiry_idx" ON "instagram_publication_packages" USING btree ("status","expires_at");