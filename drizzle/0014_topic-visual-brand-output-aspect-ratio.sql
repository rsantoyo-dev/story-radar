ALTER TYPE "public"."creative_aspect_ratio" ADD VALUE '16:9';--> statement-breakpoint
-- Add the draft value first, then derive each legacy batch from its draft.
-- Keeping the columns nullable until after the backfill makes this migration
-- safe for installations that already have creative history.
ALTER TABLE "creative_drafts" ADD COLUMN "output_aspect_ratio" "creative_aspect_ratio";--> statement-breakpoint
UPDATE "creative_drafts"
SET "output_aspect_ratio" = CASE
  WHEN "format" = 'meme' THEN '1:1'::"creative_aspect_ratio"
  ELSE '4:5'::"creative_aspect_ratio"
END
WHERE "output_aspect_ratio" IS NULL;--> statement-breakpoint
ALTER TABLE "creative_asset_batches" ADD COLUMN "output_aspect_ratio" "creative_aspect_ratio";--> statement-breakpoint
UPDATE "creative_asset_batches" AS batch
SET "output_aspect_ratio" = draft."output_aspect_ratio"
FROM "creative_drafts" AS draft
WHERE batch."draft_id" = draft."id"
  AND batch."output_aspect_ratio" IS NULL;--> statement-breakpoint
ALTER TABLE "creative_drafts" ALTER COLUMN "output_aspect_ratio" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "creative_asset_batches" ALTER COLUMN "output_aspect_ratio" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "creative_profiles" ADD COLUMN "visual_guidance" text DEFAULT 'Create a clear, modern editorial visual direction appropriate to the topic and audience. Use a focused composition, high legibility, inclusive imagery, and generous negative space. Respect the selected output format and avoid watermarks, unapproved logos, or misleading visual claims.' NOT NULL;
