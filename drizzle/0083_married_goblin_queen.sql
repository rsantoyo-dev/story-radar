CREATE TABLE "story_editor_facts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"topic_id" uuid NOT NULL,
	"story_id" uuid NOT NULL,
	"statement" text NOT NULL,
	"source_url" text,
	"note" text,
	"created_by" text,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"retracted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "creative_drafts" ADD COLUMN "approval_acknowledgement" jsonb;--> statement-breakpoint
ALTER TABLE "story_editor_facts" ADD CONSTRAINT "story_editor_facts_topic_id_story_id_topic_stories_topic_id_story_id_fk" FOREIGN KEY ("topic_id","story_id") REFERENCES "public"."topic_stories"("topic_id","story_id") ON DELETE cascade ON UPDATE no action;