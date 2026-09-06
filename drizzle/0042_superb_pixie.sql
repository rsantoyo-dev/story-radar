CREATE TABLE "topic_instagram_media" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"topic_id" uuid NOT NULL,
	"ig_user_id" text NOT NULL,
	"external_id" text NOT NULL,
	"media_type" text NOT NULL,
	"media_product_type" text,
	"permalink" text,
	"caption" text,
	"media_url" text,
	"thumbnail_url" text,
	"published_at" timestamp with time zone NOT NULL,
	"access_state" text DEFAULT 'accessible' NOT NULL,
	"raw" jsonb NOT NULL,
	"imported_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "topic_instagram_media_access_state_check" CHECK ("topic_instagram_media"."access_state" IN ('accessible', 'inaccessible'))
);
--> statement-breakpoint
CREATE TABLE "topic_instagram_media_children" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"media_id" uuid NOT NULL,
	"external_id" text NOT NULL,
	"media_type" text NOT NULL,
	"media_url" text,
	"thumbnail_url" text,
	"order" integer NOT NULL,
	CONSTRAINT "topic_instagram_media_children_order_check" CHECK ("topic_instagram_media_children"."order" > 0)
);
--> statement-breakpoint
ALTER TABLE "topic_meta_connections" ADD COLUMN "last_media_sync_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "topic_meta_connections" ADD COLUMN "last_media_sync_cursor" text;--> statement-breakpoint
ALTER TABLE "topic_meta_connections" ADD COLUMN "last_media_sync_summary" jsonb;--> statement-breakpoint
ALTER TABLE "topic_instagram_media" ADD CONSTRAINT "topic_instagram_media_topic_id_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."topics"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "topic_instagram_media_children" ADD CONSTRAINT "topic_instagram_media_children_media_id_topic_instagram_media_id_fk" FOREIGN KEY ("media_id") REFERENCES "public"."topic_instagram_media"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "topic_instagram_media_topic_external_unique" ON "topic_instagram_media" USING btree ("topic_id","external_id");--> statement-breakpoint
CREATE INDEX "topic_instagram_media_topic_account_published_idx" ON "topic_instagram_media" USING btree ("topic_id","ig_user_id","published_at");--> statement-breakpoint
CREATE UNIQUE INDEX "topic_instagram_media_children_media_external_unique" ON "topic_instagram_media_children" USING btree ("media_id","external_id");--> statement-breakpoint
CREATE INDEX "topic_instagram_media_children_media_id_idx" ON "topic_instagram_media_children" USING btree ("media_id");