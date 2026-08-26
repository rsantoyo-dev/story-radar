CREATE TYPE "public"."creative_asset_generation_mode" AS ENUM('text-to-image', 'reference-guided');--> statement-breakpoint
ALTER TABLE "creative_assets" ADD COLUMN "generation_mode" "creative_asset_generation_mode" DEFAULT 'text-to-image' NOT NULL;--> statement-breakpoint
ALTER TABLE "creative_assets" ADD COLUMN "provider_endpoint" text DEFAULT 'openai/gpt-image-2' NOT NULL;--> statement-breakpoint
ALTER TABLE "creative_assets" ADD COLUMN "reference_snapshot" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "creative_assets" ADD COLUMN "reference_input_hash" text DEFAULT '' NOT NULL;