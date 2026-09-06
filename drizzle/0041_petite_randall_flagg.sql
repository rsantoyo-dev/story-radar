ALTER TABLE "creative_drafts" ADD COLUMN "visual_fidelity_override" text;--> statement-breakpoint
ALTER TABLE "creative_drafts" ADD COLUMN "visual_fidelity_override_reason" text;--> statement-breakpoint
ALTER TABLE "creative_drafts" ADD COLUMN "visual_fidelity_override_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "creative_drafts" ADD COLUMN "visual_fidelity_override_by" text;--> statement-breakpoint
ALTER TABLE "creative_profiles" ADD COLUMN "visual_fidelity_mode" text DEFAULT 'illustration-editorial' NOT NULL;--> statement-breakpoint
ALTER TABLE "creative_profiles" ADD COLUMN "geo_scope" jsonb DEFAULT '{"municipality":"","region":"","country":"","validatedLocationId":null}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "creative_profiles" ADD COLUMN "visual_policy_version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "creative_drafts" ADD CONSTRAINT "creative_drafts_visual_fidelity_override_check" CHECK ((
        "creative_drafts"."visual_fidelity_override" IS NULL
        AND "creative_drafts"."visual_fidelity_override_reason" IS NULL
        AND "creative_drafts"."visual_fidelity_override_at" IS NULL
      ) OR (
        "creative_drafts"."visual_fidelity_override"
          IN ('illustration-editorial', 'verified-references', 'photo-required')
        AND char_length(btrim("creative_drafts"."visual_fidelity_override_reason")) > 0
        AND "creative_drafts"."visual_fidelity_override_at" IS NOT NULL
      ));--> statement-breakpoint
ALTER TABLE "creative_profiles" ADD CONSTRAINT "creative_profiles_visual_fidelity_mode_check" CHECK ("creative_profiles"."visual_fidelity_mode" IN ('illustration-editorial', 'verified-references', 'photo-required'));--> statement-breakpoint
ALTER TABLE "creative_profiles" ADD CONSTRAINT "creative_profiles_visual_policy_version_check" CHECK ("creative_profiles"."visual_policy_version" >= 1);