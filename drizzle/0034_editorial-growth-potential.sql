ALTER TABLE "story_editorial_evaluations" ADD COLUMN "growth_score" integer;--> statement-breakpoint
ALTER TABLE "story_editorial_evaluations" ADD COLUMN "growth_new_audience" integer;--> statement-breakpoint
ALTER TABLE "story_editorial_evaluations" ADD COLUMN "growth_viral_potential" integer;--> statement-breakpoint
ALTER TABLE "story_editorial_evaluations" ADD COLUMN "growth_constructive_tension" integer;--> statement-breakpoint
ALTER TABLE "story_editorial_evaluations" ADD COLUMN "growth_explainability" integer;--> statement-breakpoint
ALTER TABLE "story_editorial_evaluations" ADD COLUMN "growth_reason" text;--> statement-breakpoint
CREATE INDEX "story_editorial_evaluations_growth_score_idx" ON "story_editorial_evaluations" USING btree ("growth_score");--> statement-breakpoint
ALTER TABLE "story_editorial_evaluations" ADD CONSTRAINT "story_editorial_evaluations_growth_scores_check" CHECK (("story_editorial_evaluations"."growth_score" IS NULL OR "story_editorial_evaluations"."growth_score" BETWEEN 0 AND 100)
        AND ("story_editorial_evaluations"."growth_new_audience" IS NULL OR "story_editorial_evaluations"."growth_new_audience" BETWEEN 0 AND 100)
        AND ("story_editorial_evaluations"."growth_viral_potential" IS NULL OR "story_editorial_evaluations"."growth_viral_potential" BETWEEN 0 AND 100)
        AND ("story_editorial_evaluations"."growth_constructive_tension" IS NULL OR "story_editorial_evaluations"."growth_constructive_tension" BETWEEN 0 AND 100)
        AND ("story_editorial_evaluations"."growth_explainability" IS NULL OR "story_editorial_evaluations"."growth_explainability" BETWEEN 0 AND 100));