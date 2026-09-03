CREATE TABLE "owned_content_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"topic_id" uuid NOT NULL,
	"story_id" uuid NOT NULL,
	"title" text NOT NULL,
	"content" text NOT NULL,
	"content_type" text DEFAULT 'campaign' NOT NULL,
	"language" text DEFAULT 'en' NOT NULL,
	"region" text DEFAULT 'global' NOT NULL,
	"source_url" text,
	"published_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "owned_content_entries_type_check" CHECK ("owned_content_entries"."content_type" IN ('campaign', 'launch', 'promotion', 'product', 'announcement', 'educational')),
	CONSTRAINT "owned_content_entries_title_not_blank_check" CHECK (char_length(btrim("owned_content_entries"."title")) > 0),
	CONSTRAINT "owned_content_entries_content_not_blank_check" CHECK (char_length(btrim("owned_content_entries"."content")) > 0)
);
--> statement-breakpoint
ALTER TABLE "owned_content_entries" ADD CONSTRAINT "owned_content_entries_topic_id_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."topics"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "owned_content_entries" ADD CONSTRAINT "owned_content_entries_story_id_stories_id_fk" FOREIGN KEY ("story_id") REFERENCES "public"."stories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "owned_content_entries_story_id_unique" ON "owned_content_entries" USING btree ("story_id");--> statement-breakpoint
CREATE INDEX "owned_content_entries_topic_published_idx" ON "owned_content_entries" USING btree ("topic_id","published_at");