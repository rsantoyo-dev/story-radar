CREATE TABLE "daily_preparation_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"topic_id" uuid NOT NULL,
	"line_id" uuid NOT NULL,
	"timezone" text NOT NULL,
	"status" text DEFAULT 'running' NOT NULL,
	"step" text DEFAULT 'collect' NOT NULL,
	"progress" jsonb NOT NULL,
	"error" text,
	"lease_owner" uuid,
	"lease_until" timestamp with time zone,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "daily_preparation_runs" ADD CONSTRAINT "daily_preparation_runs_topic_id_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."topics"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "daily_preparation_topic_started_idx" ON "daily_preparation_runs" USING btree ("topic_id","started_at");