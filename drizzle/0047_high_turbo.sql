CREATE TABLE "creative_brand_references" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"topic_id" uuid NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"object_key" text NOT NULL,
	"sha256" text NOT NULL,
	"content_type" text DEFAULT 'image/webp' NOT NULL,
	"original_content_type" text NOT NULL,
	"file_name" text NOT NULL,
	"file_size" integer NOT NULL,
	"width" integer NOT NULL,
	"height" integer NOT NULL,
	"name" text NOT NULL,
	"kind" text DEFAULT 'other' NOT NULL,
	"provenance" text,
	"provider_transmission_allowed" boolean DEFAULT false NOT NULL,
	"usage_note" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "creative_brand_references_values_check" CHECK ("creative_brand_references"."content_type" = 'image/webp'
        AND "creative_brand_references"."sha256" ~ '^[0-9a-f]{64}$'
        AND "creative_brand_references"."file_size" BETWEEN 1 AND 15728640
        AND "creative_brand_references"."width" BETWEEN 64 AND 8192
        AND "creative_brand_references"."height" BETWEEN 64 AND 8192
        AND "creative_brand_references"."width" <= "creative_brand_references"."height" * 30
        AND "creative_brand_references"."height" <= "creative_brand_references"."width" * 30
        AND "creative_brand_references"."version" > 0
        AND char_length("creative_brand_references"."name") BETWEEN 1 AND 120
        AND "creative_brand_references"."kind" IN ('finished-post', 'poster', 'sticker-sheet', 'signage', 'other')
        AND ("creative_brand_references"."provenance" IS NULL OR char_length("creative_brand_references"."provenance") <= 500)
        AND ("creative_brand_references"."usage_note" IS NULL OR char_length("creative_brand_references"."usage_note") <= 1000))
);
--> statement-breakpoint
ALTER TABLE "creative_brand_references" ADD CONSTRAINT "creative_brand_references_topic_id_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."topics"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "creative_brand_references_object_key_unique" ON "creative_brand_references" USING btree ("object_key");--> statement-breakpoint
CREATE INDEX "creative_brand_references_topic_id_idx" ON "creative_brand_references" USING btree ("topic_id");--> statement-breakpoint
CREATE INDEX "creative_brand_references_topic_active_idx" ON "creative_brand_references" USING btree ("topic_id","is_active");