ALTER TYPE "public"."creative_aspect_ratio" ADD VALUE '9:16' BEFORE '16:9';--> statement-breakpoint
ALTER TABLE "creative_units" ADD COLUMN "interactive_overlay" jsonb;