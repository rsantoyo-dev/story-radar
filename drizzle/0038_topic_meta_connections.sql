CREATE TABLE "topic_meta_connections" (
	"topic_id" uuid PRIMARY KEY NOT NULL,
	"app_id" text,
	"app_secret_encrypted" text,
	"ig_user_id" text,
	"ig_username" text,
	"page_id" text,
	"page_name" text,
	"access_token_encrypted" text,
	"token_expires_at" timestamp with time zone,
	"connected_at" timestamp with time zone,
	"connected_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "topic_meta_connections" ADD CONSTRAINT "topic_meta_connections_topic_id_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."topics"("id") ON DELETE cascade ON UPDATE no action;