ALTER TABLE "creative_asset_edit_requests" DROP CONSTRAINT "creative_asset_edit_requests_values_check";--> statement-breakpoint
ALTER TABLE "creative_asset_edit_requests" ADD COLUMN "applied_revision" integer;--> statement-breakpoint
ALTER TABLE "creative_asset_edit_requests" ADD COLUMN "applied_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "creative_asset_edit_requests" ADD COLUMN "blocked_reason" text;--> statement-breakpoint
ALTER TABLE "creative_asset_edit_requests" ADD COLUMN "last_error" text;--> statement-breakpoint
ALTER TABLE "creative_asset_edit_requests" ADD CONSTRAINT "creative_asset_edit_requests_values_check" CHECK ("creative_asset_edit_requests"."unit_order" > 0
        AND "creative_asset_edit_requests"."base_version" > 0
        AND "creative_asset_edit_requests"."revision" > 0
        AND "creative_asset_edit_requests"."edit_type" IN ('generative', 'composition')
        AND "creative_asset_edit_requests"."status" IN ('saved', 'running', 'applied', 'failed')
        AND ("creative_asset_edit_requests"."instruction" IS NULL OR char_length("creative_asset_edit_requests"."instruction") <= 2000)
        AND ("creative_asset_edit_requests"."applied_revision" IS NULL OR "creative_asset_edit_requests"."applied_revision" > 0));