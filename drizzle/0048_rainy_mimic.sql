ALTER TABLE "creative_brand_references" DROP CONSTRAINT "creative_brand_references_values_check";--> statement-breakpoint
ALTER TABLE "creative_brand_references" ADD COLUMN "contribution" jsonb;--> statement-breakpoint
ALTER TABLE "creative_brand_references" ADD COLUMN "config_version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "creative_brand_references" ADD COLUMN "activated_for_journey" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "creative_brand_references" ADD COLUMN "analysis" jsonb;--> statement-breakpoint
ALTER TABLE "creative_brand_references" ADD COLUMN "analysis_hash" text;--> statement-breakpoint
ALTER TABLE "creative_brand_references" ADD COLUMN "analysis_model" text;--> statement-breakpoint
ALTER TABLE "creative_brand_references" ADD COLUMN "analysis_prompt_version" text;--> statement-breakpoint
ALTER TABLE "creative_brand_references" ADD COLUMN "analysis_run_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "creative_brand_references" ADD CONSTRAINT "creative_brand_references_values_check" CHECK ("creative_brand_references"."content_type" = 'image/webp'
        AND "creative_brand_references"."sha256" ~ '^[0-9a-f]{64}$'
        AND "creative_brand_references"."file_size" BETWEEN 1 AND 15728640
        AND "creative_brand_references"."width" BETWEEN 64 AND 8192
        AND "creative_brand_references"."height" BETWEEN 64 AND 8192
        AND "creative_brand_references"."width" <= "creative_brand_references"."height" * 30
        AND "creative_brand_references"."height" <= "creative_brand_references"."width" * 30
        AND "creative_brand_references"."version" > 0
        AND "creative_brand_references"."config_version" > 0
        AND char_length("creative_brand_references"."name") BETWEEN 1 AND 120
        AND "creative_brand_references"."kind" IN ('finished-post', 'poster', 'sticker-sheet', 'signage', 'other')
        AND ("creative_brand_references"."provenance" IS NULL OR char_length("creative_brand_references"."provenance") <= 500)
        AND ("creative_brand_references"."usage_note" IS NULL OR char_length("creative_brand_references"."usage_note") <= 1000)
        AND ("creative_brand_references"."activated_for_journey" = false OR "creative_brand_references"."provider_transmission_allowed" = true)
        AND ("creative_brand_references"."analysis_prompt_version" IS NULL OR char_length("creative_brand_references"."analysis_prompt_version") <= 60));