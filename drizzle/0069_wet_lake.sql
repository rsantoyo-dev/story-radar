CREATE TABLE "story_content_revisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"topic_id" uuid NOT NULL,
	"story_id" uuid NOT NULL,
	"revision" integer NOT NULL,
	"title" text NOT NULL,
	"content" text NOT NULL,
	"original" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "story_reference_photos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"topic_id" uuid NOT NULL,
	"story_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text NOT NULL,
	"provenance" text NOT NULL,
	"provider_transmission_allowed" boolean DEFAULT false NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"object_key" text NOT NULL,
	"sha256" text NOT NULL,
	"file_name" text NOT NULL,
	"content_type" text DEFAULT 'image/webp' NOT NULL,
	"file_size" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "creative_units" ADD COLUMN "story_references" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "story_content_revisions" ADD CONSTRAINT "story_content_revisions_topic_id_story_id_topic_stories_topic_id_story_id_fk" FOREIGN KEY ("topic_id","story_id") REFERENCES "public"."topic_stories"("topic_id","story_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "story_reference_photos" ADD CONSTRAINT "story_reference_photos_topic_id_story_id_topic_stories_topic_id_story_id_fk" FOREIGN KEY ("topic_id","story_id") REFERENCES "public"."topic_stories"("topic_id","story_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "story_content_revision_unique" ON "story_content_revisions" USING btree ("topic_id","story_id","revision");--> statement-breakpoint
CREATE UNIQUE INDEX "story_reference_object_unique" ON "story_reference_photos" USING btree ("object_key");