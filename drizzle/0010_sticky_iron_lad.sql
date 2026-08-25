CREATE TYPE "public"."creative_asset_batch_status" AS ENUM('queued', 'generating', 'partial', 'completed', 'failed', 'stale');--> statement-breakpoint
CREATE TYPE "public"."creative_asset_status" AS ENUM('queued', 'generating', 'generated', 'failed', 'approved', 'stale');--> statement-breakpoint
CREATE TABLE "creative_asset_batches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"draft_id" uuid NOT NULL,
	"draft_version" integer NOT NULL,
	"status" "creative_asset_batch_status" DEFAULT 'queued' NOT NULL,
	"provider" text NOT NULL,
	"model" text NOT NULL,
	"prompt_version" text NOT NULL,
	"width" integer NOT NULL,
	"height" integer NOT NULL,
	"total_assets" integer NOT NULL,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "creative_asset_batches_values_check" CHECK ("creative_asset_batches"."draft_version" > 0
        AND "creative_asset_batches"."width" BETWEEN 512 AND 2048
        AND "creative_asset_batches"."height" BETWEEN 512 AND 2048
        AND "creative_asset_batches"."total_assets" > 0),
	CONSTRAINT "creative_asset_batches_dates_check" CHECK ("creative_asset_batches"."completed_at" IS NULL OR "creative_asset_batches"."completed_at" >= "creative_asset_batches"."created_at")
);
--> statement-breakpoint
CREATE TABLE "creative_assets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"batch_id" uuid NOT NULL,
	"unit_order" integer NOT NULL,
	"unit_role" "creative_unit_role" NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"status" "creative_asset_status" DEFAULT 'queued' NOT NULL,
	"provider" text NOT NULL,
	"model" text NOT NULL,
	"prompt_version" text NOT NULL,
	"prompt" text NOT NULL,
	"expected_text" text NOT NULL,
	"unit_snapshot" jsonb NOT NULL,
	"request_id" text,
	"image_url" text,
	"content_type" text,
	"file_name" text,
	"file_size" integer,
	"width" integer,
	"height" integer,
	"seed" integer,
	"safety_flag" boolean,
	"error" text,
	"completed_at" timestamp with time zone,
	"approved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "creative_assets_values_check" CHECK ("creative_assets"."unit_order" > 0
        AND "creative_assets"."version" > 0
        AND ("creative_assets"."file_size" IS NULL OR "creative_assets"."file_size" >= 0)
        AND ("creative_assets"."width" IS NULL OR "creative_assets"."width" > 0)
        AND ("creative_assets"."height" IS NULL OR "creative_assets"."height" > 0)),
	CONSTRAINT "creative_assets_approval_check" CHECK (("creative_assets"."status" = 'approved' AND "creative_assets"."approved_at" IS NOT NULL)
        OR ("creative_assets"."status" <> 'approved' AND "creative_assets"."approved_at" IS NULL)),
	CONSTRAINT "creative_assets_dates_check" CHECK (("creative_assets"."completed_at" IS NULL OR "creative_assets"."completed_at" >= "creative_assets"."created_at")
        AND ("creative_assets"."approved_at" IS NULL OR "creative_assets"."approved_at" >= "creative_assets"."created_at"))
);
--> statement-breakpoint
ALTER TABLE "creative_asset_batches" ADD CONSTRAINT "creative_asset_batches_draft_id_creative_drafts_id_fk" FOREIGN KEY ("draft_id") REFERENCES "public"."creative_drafts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "creative_assets" ADD CONSTRAINT "creative_assets_batch_id_creative_asset_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."creative_asset_batches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "creative_asset_batches_generation_unique" ON "creative_asset_batches" USING btree ("draft_id","draft_version","provider","model","prompt_version");--> statement-breakpoint
CREATE INDEX "creative_asset_batches_draft_id_idx" ON "creative_asset_batches" USING btree ("draft_id");--> statement-breakpoint
CREATE INDEX "creative_asset_batches_status_idx" ON "creative_asset_batches" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "creative_assets_batch_unit_version_unique" ON "creative_assets" USING btree ("batch_id","unit_order","version");--> statement-breakpoint
CREATE UNIQUE INDEX "creative_assets_request_id_unique" ON "creative_assets" USING btree ("request_id");--> statement-breakpoint
CREATE INDEX "creative_assets_batch_id_idx" ON "creative_assets" USING btree ("batch_id");--> statement-breakpoint
CREATE INDEX "creative_assets_status_idx" ON "creative_assets" USING btree ("status");