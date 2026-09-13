CREATE TABLE "daily_editorial_plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"topic_id" uuid NOT NULL,
	"input_hash" text NOT NULL,
	"context" jsonb NOT NULL,
	"status" text DEFAULT 'running' NOT NULL,
	"result" jsonb,
	"provider" text,
	"model" text,
	"usage" jsonb,
	"error" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	CONSTRAINT "daily_editorial_plans_status_check" CHECK ("daily_editorial_plans"."status" IN ('running','completed','failed'))
);
--> statement-breakpoint
ALTER TABLE "daily_editorial_plans" ADD CONSTRAINT "daily_editorial_plans_topic_id_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."topics"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "daily_editorial_plans_topic_started_idx" ON "daily_editorial_plans" USING btree ("topic_id","started_at");