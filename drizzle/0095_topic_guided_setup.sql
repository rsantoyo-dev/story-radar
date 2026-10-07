ALTER TABLE "topics" ADD COLUMN "setup_identity_confirmed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "topics" ADD COLUMN "setup_completed_at" timestamp with time zone;--> statement-breakpoint
-- Brands that existed before the guided setup keep working as before.
UPDATE "topics" SET "setup_identity_confirmed_at" = now(), "setup_completed_at" = now() WHERE "workspace_id" = 'default';
