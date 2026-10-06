CREATE TABLE "instagram_media_metric_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"media_id" uuid NOT NULL,
	"topic_id" uuid NOT NULL,
	"ig_user_id" text NOT NULL,
	"external_id" text NOT NULL,
	"captured_at" timestamp with time zone NOT NULL,
	"age_hours" integer NOT NULL,
	"metrics" jsonb NOT NULL,
	"api_version" text NOT NULL,
	CONSTRAINT "instagram_media_metric_snapshots_age_check" CHECK ("instagram_media_metric_snapshots"."age_hours" >= 0)
);
--> statement-breakpoint
ALTER TABLE "instagram_media_metric_snapshots" ADD CONSTRAINT "instagram_media_metric_snapshots_media_id_topic_instagram_media_id_fk" FOREIGN KEY ("media_id") REFERENCES "public"."topic_instagram_media"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "instagram_media_metric_snapshots_media_captured_idx" ON "instagram_media_metric_snapshots" USING btree ("media_id","captured_at");--> statement-breakpoint
CREATE INDEX "instagram_media_metric_snapshots_topic_captured_idx" ON "instagram_media_metric_snapshots" USING btree ("topic_id","captured_at");