CREATE TABLE "creative_character_reference_images" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"character_id" uuid NOT NULL,
	"object_key" text NOT NULL,
	"content_type" text NOT NULL,
	"file_name" text NOT NULL,
	"file_size" integer NOT NULL,
	"order" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "creative_character_reference_images_values_check" CHECK ("creative_character_reference_images"."order" > 0 AND "creative_character_reference_images"."file_size" > 0)
);
--> statement-breakpoint
CREATE TABLE "creative_characters" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"topic_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "creative_unit_characters" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"unit_id" uuid NOT NULL,
	"character_id" uuid NOT NULL,
	"character_snapshot" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "creative_character_reference_images" ADD CONSTRAINT "creative_character_reference_images_character_id_creative_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."creative_characters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "creative_characters" ADD CONSTRAINT "creative_characters_topic_id_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."topics"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "creative_unit_characters" ADD CONSTRAINT "creative_unit_characters_unit_id_creative_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."creative_units"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "creative_unit_characters" ADD CONSTRAINT "creative_unit_characters_character_id_creative_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."creative_characters"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "creative_character_reference_images_character_order_unique" ON "creative_character_reference_images" USING btree ("character_id","order");--> statement-breakpoint
CREATE INDEX "creative_character_reference_images_character_id_idx" ON "creative_character_reference_images" USING btree ("character_id");--> statement-breakpoint
CREATE INDEX "creative_characters_topic_id_idx" ON "creative_characters" USING btree ("topic_id");--> statement-breakpoint
CREATE INDEX "creative_characters_topic_active_idx" ON "creative_characters" USING btree ("topic_id","is_active");--> statement-breakpoint
CREATE UNIQUE INDEX "creative_unit_characters_unit_character_unique" ON "creative_unit_characters" USING btree ("unit_id","character_id");--> statement-breakpoint
CREATE INDEX "creative_unit_characters_unit_id_idx" ON "creative_unit_characters" USING btree ("unit_id");--> statement-breakpoint
CREATE INDEX "creative_unit_characters_character_id_idx" ON "creative_unit_characters" USING btree ("character_id");