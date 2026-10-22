CREATE TABLE "draft2_autopilot_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"topic_id" uuid NOT NULL,
	"story_id" uuid NOT NULL,
	"session_id" uuid,
	"status" text DEFAULT 'running' NOT NULL,
	"until" text DEFAULT 'caption' NOT NULL,
	"current_step" text,
	"steps" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"outcome" text,
	"passes" integer DEFAULT 0 NOT NULL,
	"started_by" text DEFAULT 'editor' NOT NULL,
	"stop_requested_at" timestamp with time zone,
	"lease_owner" text,
	"lease_until" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	CONSTRAINT "draft2_autopilot_jobs_values_check" CHECK ("draft2_autopilot_jobs"."status" IN ('running', 'blocked', 'done', 'failed', 'stopped')
    AND "draft2_autopilot_jobs"."until" IN ('facts', 'inventory', 'focus', 'spine', 'mentions', 'opening', 'closing', 'deck', 'review', 'visual', 'images', 'caption')
    AND "draft2_autopilot_jobs"."passes" >= 0
    AND ("draft2_autopilot_jobs"."status" = 'running' OR "draft2_autopilot_jobs"."finished_at" IS NOT NULL)
    AND ("draft2_autopilot_jobs"."status" IN ('running', 'done') OR "draft2_autopilot_jobs"."outcome" IS NOT NULL))
);
--> statement-breakpoint
ALTER TABLE "draft2_autopilot_jobs" ADD CONSTRAINT "draft2_autopilot_jobs_topic_id_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."topics"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "draft2_autopilot_jobs" ADD CONSTRAINT "draft2_autopilot_jobs_story_id_stories_id_fk" FOREIGN KEY ("story_id") REFERENCES "public"."stories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "draft2_autopilot_jobs" ADD CONSTRAINT "draft2_autopilot_jobs_session_id_draft2_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."draft2_sessions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "draft2_autopilot_jobs_running_story_idx" ON "draft2_autopilot_jobs" USING btree ("story_id") WHERE "draft2_autopilot_jobs"."status" = 'running';--> statement-breakpoint
CREATE INDEX "draft2_autopilot_jobs_topic_story_idx" ON "draft2_autopilot_jobs" USING btree ("topic_id","story_id","created_at");--> statement-breakpoint
CREATE INDEX "draft2_autopilot_jobs_status_lease_idx" ON "draft2_autopilot_jobs" USING btree ("status","lease_until");