CREATE TABLE "creative_brand_analysis_quota" (
	"id" text PRIMARY KEY NOT NULL,
	"topic_id" uuid NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "creative_brand_references" ADD COLUMN "original_snapshot" jsonb;--> statement-breakpoint
ALTER TABLE "creative_brand_references" ADD COLUMN "revisions" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "creative_brand_analysis_quota" ADD CONSTRAINT "creative_brand_analysis_quota_topic_id_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."topics"("id") ON DELETE cascade ON UPDATE no action;