
CREATE TABLE "creative_draft_recoveries" (
	"id" uuid PRIMARY KEY NOT NULL,
	"topic_id" uuid NOT NULL,
	"story_id" uuid NOT NULL,
	"draft_id" uuid NOT NULL,
	"draft_version" integer NOT NULL,
	"lease_token" uuid DEFAULT gen_random_uuid() NOT NULL,
	"status" text DEFAULT 'running' NOT NULL,
	"input" jsonb NOT NULL,
	"result" jsonb,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "creative_draft_recoveries_status_check" CHECK ("creative_draft_recoveries"."status" IN ('running','ready','completed','failed'))
);
--> statement-breakpoint

CREATE TABLE "creative_text_calls" (
	"id" uuid PRIMARY KEY NOT NULL,
	"topic_id" uuid NOT NULL,
	"story_id" uuid NOT NULL,
	"run_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"model" text NOT NULL,
	"operation" text NOT NULL,
	"status" text DEFAULT 'reserved' NOT NULL,
	"reserved_micros" integer NOT NULL,
	"charged_micros" integer,
	"pricing" jsonb NOT NULL,
	"usage" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	CONSTRAINT "creative_text_calls_cost_check" CHECK ("creative_text_calls"."reserved_micros" >= 0 AND ("creative_text_calls"."charged_micros" IS NULL OR "creative_text_calls"."charged_micros" >= 0)),
	CONSTRAINT "creative_text_calls_status_check" CHECK ("creative_text_calls"."status" IN ('reserved','settled','uncertain'))
);
--> statement-breakpoint

CREATE TABLE "creative_text_outcomes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"topic_id" uuid NOT NULL,
	"story_id" uuid NOT NULL,
	"draft_id" uuid NOT NULL,
	"draft_version" integer NOT NULL,
	"accepted" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "creative_text_outcomes_accepted_check" CHECK ("creative_text_outcomes"."accepted" IN (0,1))
);
--> statement-breakpoint

ALTER TABLE "creative_draft_recoveries" ADD CONSTRAINT "creative_draft_recoveries_topic_id_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."topics"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint

ALTER TABLE "creative_draft_recoveries" ADD CONSTRAINT "creative_draft_recoveries_story_id_stories_id_fk" FOREIGN KEY ("story_id") REFERENCES "public"."stories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint

ALTER TABLE "creative_draft_recoveries" ADD CONSTRAINT "creative_draft_recoveries_draft_id_creative_drafts_id_fk" FOREIGN KEY ("draft_id") REFERENCES "public"."creative_drafts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint

ALTER TABLE "creative_text_calls" ADD CONSTRAINT "creative_text_calls_topic_id_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."topics"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint

ALTER TABLE "creative_text_calls" ADD CONSTRAINT "creative_text_calls_story_id_stories_id_fk" FOREIGN KEY ("story_id") REFERENCES "public"."stories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint

ALTER TABLE "creative_text_outcomes" ADD CONSTRAINT "creative_text_outcomes_topic_id_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."topics"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint

ALTER TABLE "creative_text_outcomes" ADD CONSTRAINT "creative_text_outcomes_story_id_stories_id_fk" FOREIGN KEY ("story_id") REFERENCES "public"."stories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint

ALTER TABLE "creative_text_outcomes" ADD CONSTRAINT "creative_text_outcomes_draft_id_creative_drafts_id_fk" FOREIGN KEY ("draft_id") REFERENCES "public"."creative_drafts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint

CREATE INDEX "creative_draft_recoveries_scope_idx" ON "creative_draft_recoveries" USING btree ("topic_id","draft_id");--> statement-breakpoint

CREATE UNIQUE INDEX "creative_draft_recoveries_active_idx" ON "creative_draft_recoveries" USING btree ("draft_id") WHERE "creative_draft_recoveries"."status" IN ('running','ready');--> statement-breakpoint

CREATE INDEX "creative_text_calls_scope_idx" ON "creative_text_calls" USING btree ("topic_id","story_id");--> statement-breakpoint

CREATE INDEX "creative_text_calls_run_idx" ON "creative_text_calls" USING btree ("run_id");--> statement-breakpoint

CREATE UNIQUE INDEX "creative_text_outcomes_version_idx" ON "creative_text_outcomes" USING btree ("draft_id","draft_version");