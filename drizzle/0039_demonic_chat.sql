ALTER TABLE "topic_meta_connections" ADD COLUMN "granted_permissions" text[] DEFAULT ARRAY[]::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "topic_meta_connections" ADD COLUMN "last_verified_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "topic_meta_connections" ADD COLUMN "last_verification_error" text;