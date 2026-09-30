CREATE TABLE "topic_auto_collection_settings" (
	"topic_id" uuid PRIMARY KEY NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"line_id" uuid NOT NULL,
	"interval_hours" integer DEFAULT 4 NOT NULL,
	"timezone" text DEFAULT 'America/Toronto' NOT NULL,
	"active_from_hour" integer DEFAULT 6 NOT NULL,
	"active_to_hour" integer DEFAULT 22 NOT NULL,
	"scoop_enabled" boolean DEFAULT true NOT NULL,
	"scoop_min_growth" integer DEFAULT 85 NOT NULL,
	"scoop_min_editorial" integer DEFAULT 80 NOT NULL,
	"scoop_max_age_hours" integer DEFAULT 6 NOT NULL,
	"auto_prepare_scoops" boolean DEFAULT true NOT NULL,
	"last_run_at" timestamp with time zone,
	"next_run_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "topic_auto_collection_settings_values_check" CHECK ("topic_auto_collection_settings"."interval_hours" BETWEEN 1 AND 24
        AND "topic_auto_collection_settings"."active_from_hour" BETWEEN 0 AND 23 AND "topic_auto_collection_settings"."active_to_hour" BETWEEN 1 AND 24
        AND "topic_auto_collection_settings"."scoop_min_growth" BETWEEN 1 AND 100 AND "topic_auto_collection_settings"."scoop_min_editorial" BETWEEN 1 AND 100
        AND "topic_auto_collection_settings"."scoop_max_age_hours" BETWEEN 1 AND 72)
);
--> statement-breakpoint
CREATE TABLE "topic_scoops" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"topic_id" uuid NOT NULL,
	"story_id" uuid NOT NULL,
	"preparation_run_id" uuid,
	"growth_score" integer NOT NULL,
	"editorial_score" integer NOT NULL,
	"story_published_at" timestamp with time zone,
	"reasons" jsonb NOT NULL,
	"status" text DEFAULT 'detected' NOT NULL,
	"blocked_step" text,
	"message" text,
	"detected_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"seen_at" timestamp with time zone,
	CONSTRAINT "topic_scoops_status_check" CHECK ("topic_scoops"."status" IN ('detected', 'preparing', 'ready', 'blocked', 'dismissed'))
);
--> statement-breakpoint
ALTER TABLE "topic_auto_collection_settings" ADD CONSTRAINT "topic_auto_collection_settings_topic_id_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."topics"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "topic_scoops" ADD CONSTRAINT "topic_scoops_topic_id_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."topics"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "topic_scoops_topic_story_unique" ON "topic_scoops" USING btree ("topic_id","story_id");--> statement-breakpoint
CREATE INDEX "topic_scoops_topic_detected_idx" ON "topic_scoops" USING btree ("topic_id","detected_at");