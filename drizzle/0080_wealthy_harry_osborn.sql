CREATE TABLE "topic_facebook_connections" (
	"topic_id" uuid PRIMARY KEY NOT NULL,
	"app_id" text,
	"app_secret_encrypted" text,
	"page_id" text,
	"page_name" text,
	"page_access_token_encrypted" text,
	"page_tasks" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"linked_ig_user_id" text,
	"linked_ig_username" text,
	"token_expires_at" timestamp with time zone,
	"connected_at" timestamp with time zone,
	"connected_by" text,
	"connection_version" text DEFAULT '' NOT NULL,
	"granted_permissions" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"last_verified_at" timestamp with time zone,
	"last_verification_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "meta_oauth_attempts" (
	"nonce" text PRIMARY KEY NOT NULL,
	"topic_id" uuid NOT NULL,
	"workspace_id" text NOT NULL,
	"mechanism" text NOT NULL,
	"issued_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	CONSTRAINT "meta_oauth_attempts_mechanism_check" CHECK ("meta_oauth_attempts"."mechanism" in ('instagram', 'facebook'))
);
--> statement-breakpoint
CREATE TABLE "meta_facebook_oauth_selections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"topic_id" uuid NOT NULL,
	"pages_encrypted" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "topic_facebook_connections" ADD CONSTRAINT "topic_facebook_connections_topic_id_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."topics"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meta_oauth_attempts" ADD CONSTRAINT "meta_oauth_attempts_topic_id_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."topics"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meta_facebook_oauth_selections" ADD CONSTRAINT "meta_facebook_oauth_selections_topic_id_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."topics"("id") ON DELETE cascade ON UPDATE no action;