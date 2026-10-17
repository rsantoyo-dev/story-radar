CREATE TABLE "photo_bank_photos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text NOT NULL,
	"provenance" text NOT NULL,
	"provider_transmission_allowed" boolean DEFAULT false NOT NULL,
	"publication_rights" text DEFAULT 'reference' NOT NULL,
	"source" text NOT NULL,
	"object_key" text NOT NULL,
	"sha256" text NOT NULL,
	"file_name" text NOT NULL,
	"content_type" text DEFAULT 'image/webp' NOT NULL,
	"file_size" integer NOT NULL,
	"focus_x" real,
	"focus_y" real,
	"origin_topic_id" uuid,
	"origin_story_id" uuid,
	"retired_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "photo_bank_photos_rights_check" CHECK ("photo_bank_photos"."publication_rights" IN ('own', 'licensed', 'reference')),
	CONSTRAINT "photo_bank_photos_source_check" CHECK ("photo_bank_photos"."source" IN ('upload', 'commons')),
	CONSTRAINT "photo_bank_photos_focus_check" CHECK (("photo_bank_photos"."focus_x" IS NULL AND "photo_bank_photos"."focus_y" IS NULL) OR ("photo_bank_photos"."focus_x" BETWEEN 0 AND 1 AND "photo_bank_photos"."focus_y" BETWEEN 0 AND 1))
);
--> statement-breakpoint
CREATE TABLE "photo_bank_subjects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" text NOT NULL,
	"kind" text NOT NULL,
	"name" text NOT NULL,
	"aliases" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"google_place_id" text,
	"wikidata_id" text,
	"address" text,
	"latitude" real,
	"longitude" real,
	"consent_at" timestamp with time zone,
	"confirmed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "photo_bank_subjects_kind_check" CHECK ("photo_bank_subjects"."kind" IN ('place', 'person')),
	CONSTRAINT "photo_bank_subjects_name_check" CHECK (char_length(btrim("photo_bank_subjects"."name")) > 0)
);
--> statement-breakpoint
CREATE TABLE "photo_bank_tags" (
	"photo_id" uuid NOT NULL,
	"subject_id" uuid NOT NULL,
	"origin_topic_id" uuid,
	"origin_story_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "photo_bank_tags_photo_id_subject_id_pk" PRIMARY KEY("photo_id","subject_id")
);
--> statement-breakpoint
ALTER TABLE "story_reference_photos" ADD COLUMN "bank_photo_id" uuid;--> statement-breakpoint
ALTER TABLE "photo_bank_photos" ADD CONSTRAINT "photo_bank_photos_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "photo_bank_photos" ADD CONSTRAINT "photo_bank_photos_origin_topic_id_topics_id_fk" FOREIGN KEY ("origin_topic_id") REFERENCES "public"."topics"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "photo_bank_photos" ADD CONSTRAINT "photo_bank_photos_origin_story_id_stories_id_fk" FOREIGN KEY ("origin_story_id") REFERENCES "public"."stories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "photo_bank_subjects" ADD CONSTRAINT "photo_bank_subjects_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "photo_bank_tags" ADD CONSTRAINT "photo_bank_tags_photo_id_photo_bank_photos_id_fk" FOREIGN KEY ("photo_id") REFERENCES "public"."photo_bank_photos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "photo_bank_tags" ADD CONSTRAINT "photo_bank_tags_subject_id_photo_bank_subjects_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."photo_bank_subjects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "photo_bank_tags" ADD CONSTRAINT "photo_bank_tags_origin_topic_id_topics_id_fk" FOREIGN KEY ("origin_topic_id") REFERENCES "public"."topics"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "photo_bank_tags" ADD CONSTRAINT "photo_bank_tags_origin_story_id_stories_id_fk" FOREIGN KEY ("origin_story_id") REFERENCES "public"."stories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "photo_bank_photos_workspace_sha_unique" ON "photo_bank_photos" USING btree ("workspace_id","sha256");--> statement-breakpoint
CREATE UNIQUE INDEX "photo_bank_photos_object_unique" ON "photo_bank_photos" USING btree ("object_key");--> statement-breakpoint
CREATE UNIQUE INDEX "photo_bank_subjects_google_unique" ON "photo_bank_subjects" USING btree ("workspace_id","google_place_id") WHERE "photo_bank_subjects"."google_place_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "photo_bank_subjects_wikidata_unique" ON "photo_bank_subjects" USING btree ("workspace_id","kind","wikidata_id") WHERE "photo_bank_subjects"."wikidata_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "photo_bank_tags_subject_idx" ON "photo_bank_tags" USING btree ("subject_id");--> statement-breakpoint
ALTER TABLE "story_reference_photos" ADD CONSTRAINT "story_reference_photos_bank_photo_id_photo_bank_photos_id_fk" FOREIGN KEY ("bank_photo_id") REFERENCES "public"."photo_bank_photos"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "story_reference_bank_photo_idx" ON "story_reference_photos" USING btree ("bank_photo_id");