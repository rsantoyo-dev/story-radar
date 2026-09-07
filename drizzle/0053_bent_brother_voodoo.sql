ALTER TABLE "creative_asset_edit_requests" ALTER COLUMN "brand_reference_ids" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "creative_asset_edit_requests" ALTER COLUMN "brand_reference_ids" DROP NOT NULL;--> statement-breakpoint
UPDATE "creative_asset_edit_requests" SET "brand_reference_ids" = NULL WHERE "brand_reference_ids" = ARRAY[]::text[];