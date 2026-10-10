CREATE TABLE "draft2_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"topic_id" uuid NOT NULL,
	"story_id" uuid NOT NULL,
	"step" text DEFAULT 'facts' NOT NULL,
	"status" text DEFAULT 'running' NOT NULL,
	"facts" jsonb,
	"evaluation" jsonb,
	"rounds" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"threads" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"trace" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "draft2_sessions_status_check" CHECK ("draft2_sessions"."status" IN ('running','ready','needs-review','failed'))
);
--> statement-breakpoint
ALTER TABLE "draft2_sessions" ADD CONSTRAINT "draft2_sessions_topic_id_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."topics"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "draft2_sessions" ADD CONSTRAINT "draft2_sessions_story_id_stories_id_fk" FOREIGN KEY ("story_id") REFERENCES "public"."stories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "draft2_sessions_story_idx" ON "draft2_sessions" USING btree ("topic_id","story_id","created_at");