CREATE TABLE "creative_asset_edit_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"topic_id" uuid NOT NULL,
	"draft_id" uuid NOT NULL,
	"unit_order" integer NOT NULL,
	"base_asset_id" uuid,
	"base_version" integer NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"edit_type" text DEFAULT 'generative' NOT NULL,
	"instruction" text,
	"use_image_as_base" boolean DEFAULT true NOT NULL,
	"brand_reference_ids" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"composition_recipe" jsonb,
	"status" text DEFAULT 'saved' NOT NULL,
	"applied_asset_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "creative_asset_edit_requests_values_check" CHECK ("creative_asset_edit_requests"."unit_order" > 0
        AND "creative_asset_edit_requests"."base_version" > 0
        AND "creative_asset_edit_requests"."revision" > 0
        AND "creative_asset_edit_requests"."edit_type" IN ('generative', 'composition')
        AND "creative_asset_edit_requests"."status" IN ('saved', 'running', 'applied', 'failed')
        AND ("creative_asset_edit_requests"."instruction" IS NULL OR char_length("creative_asset_edit_requests"."instruction") <= 2000)),
	CONSTRAINT "creative_asset_edit_requests_dates_check" CHECK ("creative_asset_edit_requests"."updated_at" >= "creative_asset_edit_requests"."created_at")
);
--> statement-breakpoint
ALTER TABLE "creative_asset_edit_requests" ADD CONSTRAINT "creative_asset_edit_requests_topic_id_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."topics"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "creative_asset_edit_requests" ADD CONSTRAINT "creative_asset_edit_requests_draft_id_creative_drafts_id_fk" FOREIGN KEY ("draft_id") REFERENCES "public"."creative_drafts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "creative_asset_edit_requests" ADD CONSTRAINT "creative_asset_edit_requests_base_asset_id_creative_assets_id_fk" FOREIGN KEY ("base_asset_id") REFERENCES "public"."creative_assets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "creative_asset_edit_requests" ADD CONSTRAINT "creative_asset_edit_requests_applied_asset_id_creative_assets_id_fk" FOREIGN KEY ("applied_asset_id") REFERENCES "public"."creative_assets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "creative_asset_edit_requests_draft_unit_unique" ON "creative_asset_edit_requests" USING btree ("draft_id","unit_order");--> statement-breakpoint
CREATE INDEX "creative_asset_edit_requests_draft_id_idx" ON "creative_asset_edit_requests" USING btree ("draft_id");--> statement-breakpoint
CREATE INDEX "creative_asset_edit_requests_topic_id_idx" ON "creative_asset_edit_requests" USING btree ("topic_id");