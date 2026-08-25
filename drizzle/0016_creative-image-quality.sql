CREATE TYPE "public"."creative_image_quality" AS ENUM('auto', 'low', 'medium', 'high');--> statement-breakpoint
-- The database default deliberately captures historical batches, whose
-- requests were hard-coded to high quality before this setting existed.
ALTER TABLE "creative_asset_batches" ADD COLUMN "image_quality" "creative_image_quality" DEFAULT 'high' NOT NULL;--> statement-breakpoint
ALTER TABLE "creative_asset_batches" ALTER COLUMN "image_quality" SET DEFAULT 'low';--> statement-breakpoint
DROP INDEX "creative_asset_batches_generation_unique";--> statement-breakpoint
CREATE UNIQUE INDEX "creative_asset_batches_generation_unique" ON "creative_asset_batches" USING btree ("draft_id","draft_version","provider","model","prompt_version","image_quality");
