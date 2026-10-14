ALTER TABLE "story_reference_photos" ADD COLUMN "publication_rights" text DEFAULT 'reference' NOT NULL;--> statement-breakpoint
ALTER TABLE "story_reference_photos" ADD CONSTRAINT "story_reference_photo_rights_check" CHECK ("story_reference_photos"."publication_rights" IN ('own', 'licensed', 'reference'));--> statement-breakpoint
-- Photos imported from Wikimedia Commons come with their free license and credit: licensed. Every other photo saved before the declaration stays reference only until the editor declares it.
UPDATE "story_reference_photos" SET "publication_rights" = 'licensed' WHERE "provenance" LIKE '%via Wikimedia Commons%';
