CREATE TYPE "public"."editorial_evaluation_decision" AS ENUM('reject', 'review', 'shortlist');--> statement-breakpoint
CREATE TYPE "public"."editorial_evaluation_run_status" AS ENUM('running', 'completed', 'failed');--> statement-breakpoint
CREATE TABLE "editorial_evaluation_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" text NOT NULL,
	"model" text NOT NULL,
	"model_version" text,
	"prompt_version" text NOT NULL,
	"status" "editorial_evaluation_run_status" DEFAULT 'running' NOT NULL,
	"requested_stories" integer NOT NULL,
	"evaluated_stories" integer DEFAULT 0 NOT NULL,
	"cached_stories" integer DEFAULT 0 NOT NULL,
	"prompt_tokens" integer DEFAULT 0 NOT NULL,
	"output_tokens" integer DEFAULT 0 NOT NULL,
	"thoughts_tokens" integer DEFAULT 0 NOT NULL,
	"total_tokens" integer DEFAULT 0 NOT NULL,
	"error" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	CONSTRAINT "editorial_evaluation_runs_counts_check" CHECK ("editorial_evaluation_runs"."requested_stories" >= 0
        AND "editorial_evaluation_runs"."evaluated_stories" >= 0
        AND "editorial_evaluation_runs"."cached_stories" >= 0
        AND "editorial_evaluation_runs"."evaluated_stories" <= "editorial_evaluation_runs"."requested_stories"),
	CONSTRAINT "editorial_evaluation_runs_tokens_check" CHECK ("editorial_evaluation_runs"."prompt_tokens" >= 0
        AND "editorial_evaluation_runs"."output_tokens" >= 0
        AND "editorial_evaluation_runs"."thoughts_tokens" >= 0
        AND "editorial_evaluation_runs"."total_tokens" >= 0),
	CONSTRAINT "editorial_evaluation_runs_dates_check" CHECK ("editorial_evaluation_runs"."finished_at" IS NULL OR "editorial_evaluation_runs"."finished_at" >= "editorial_evaluation_runs"."started_at")
);
--> statement-breakpoint
CREATE TABLE "story_editorial_evaluations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" uuid NOT NULL,
	"story_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"model" text NOT NULL,
	"prompt_version" text NOT NULL,
	"input_hash" text NOT NULL,
	"editorial_score" integer NOT NULL,
	"canada_relevance" integer NOT NULL,
	"ai_relevance" integer NOT NULL,
	"social_potential" integer NOT NULL,
	"novelty" integer NOT NULL,
	"decision" "editorial_evaluation_decision" NOT NULL,
	"reason" text NOT NULL,
	"suggested_angles" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"risk_flags" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"evaluated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "story_editorial_evaluations_scores_check" CHECK ("story_editorial_evaluations"."editorial_score" BETWEEN 0 AND 100
        AND "story_editorial_evaluations"."canada_relevance" BETWEEN 0 AND 100
        AND "story_editorial_evaluations"."ai_relevance" BETWEEN 0 AND 100
        AND "story_editorial_evaluations"."social_potential" BETWEEN 0 AND 100
        AND "story_editorial_evaluations"."novelty" BETWEEN 0 AND 100)
);
--> statement-breakpoint
ALTER TABLE "story_editorial_evaluations" ADD CONSTRAINT "story_editorial_evaluations_run_id_editorial_evaluation_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."editorial_evaluation_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "story_editorial_evaluations" ADD CONSTRAINT "story_editorial_evaluations_story_id_stories_id_fk" FOREIGN KEY ("story_id") REFERENCES "public"."stories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "editorial_evaluation_runs_started_at_idx" ON "editorial_evaluation_runs" USING btree ("started_at");--> statement-breakpoint
CREATE INDEX "editorial_evaluation_runs_status_idx" ON "editorial_evaluation_runs" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "story_editorial_evaluations_cache_unique" ON "story_editorial_evaluations" USING btree ("story_id","provider","model","prompt_version","input_hash");--> statement-breakpoint
CREATE INDEX "story_editorial_evaluations_story_id_idx" ON "story_editorial_evaluations" USING btree ("story_id");--> statement-breakpoint
CREATE INDEX "story_editorial_evaluations_run_id_idx" ON "story_editorial_evaluations" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX "story_editorial_evaluations_decision_idx" ON "story_editorial_evaluations" USING btree ("decision");--> statement-breakpoint
CREATE INDEX "story_editorial_evaluations_score_idx" ON "story_editorial_evaluations" USING btree ("editorial_score");--> statement-breakpoint
CREATE INDEX "story_editorial_evaluations_evaluated_at_idx" ON "story_editorial_evaluations" USING btree ("evaluated_at");