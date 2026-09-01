CREATE TABLE "creative_brand_assets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"topic_id" uuid NOT NULL,
	"object_key" text NOT NULL,
	"sha256" text NOT NULL,
	"content_type" text DEFAULT 'image/png' NOT NULL,
	"file_name" text NOT NULL,
	"file_size" integer NOT NULL,
	"width" integer NOT NULL,
	"height" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "creative_brand_assets_values_check" CHECK ("creative_brand_assets"."content_type" = 'image/png'
        AND "creative_brand_assets"."sha256" ~ '^[0-9a-f]{64}$'
        AND "creative_brand_assets"."file_size" BETWEEN 1 AND 5242880
        AND "creative_brand_assets"."width" BETWEEN 16 AND 4096
        AND "creative_brand_assets"."height" BETWEEN 16 AND 4096
        AND "creative_brand_assets"."width" <= "creative_brand_assets"."height" * 20
        AND "creative_brand_assets"."height" <= "creative_brand_assets"."width" * 20)
);
--> statement-breakpoint
DROP INDEX "creative_asset_batches_generation_unique";--> statement-breakpoint
ALTER TABLE "creative_asset_batches" ADD COLUMN "brand_input_hash" text DEFAULT 'none' NOT NULL;--> statement-breakpoint
ALTER TABLE "creative_assets" ADD COLUMN "brand_overlay_snapshot" jsonb;--> statement-breakpoint
ALTER TABLE "creative_profiles" ADD COLUMN "brand_asset_id" uuid;--> statement-breakpoint
ALTER TABLE "creative_profiles" ADD COLUMN "brand_overlay" jsonb DEFAULT '{"enabled":false,"scope":"first-unit","placement":"top-left","sizePercent":18,"insetPercent":5,"backdropMode":"solid","backdropColor":"#F6F0E4","backdropOpacity":95}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "creative_brand_assets" ADD CONSTRAINT "creative_brand_assets_topic_id_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."topics"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "creative_brand_assets_object_key_unique" ON "creative_brand_assets" USING btree ("object_key");--> statement-breakpoint
CREATE INDEX "creative_brand_assets_topic_id_idx" ON "creative_brand_assets" USING btree ("topic_id");--> statement-breakpoint
ALTER TABLE "creative_profiles" ADD CONSTRAINT "creative_profiles_brand_asset_id_creative_brand_assets_id_fk" FOREIGN KEY ("brand_asset_id") REFERENCES "public"."creative_brand_assets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "creative_asset_batches_generation_unique" ON "creative_asset_batches" USING btree ("draft_id","draft_version","provider","model","prompt_version","image_quality","brand_input_hash");
