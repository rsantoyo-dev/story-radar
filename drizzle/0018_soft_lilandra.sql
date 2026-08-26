ALTER TABLE "creative_character_reference_images" DROP CONSTRAINT "creative_character_reference_images_values_check";--> statement-breakpoint
ALTER TABLE "creative_characters" ADD COLUMN "slot" integer;--> statement-breakpoint
CREATE UNIQUE INDEX "creative_characters_topic_slot_unique" ON "creative_characters" USING btree ("topic_id","slot");--> statement-breakpoint
ALTER TABLE "creative_character_reference_images" ADD CONSTRAINT "creative_character_reference_images_values_check" CHECK ("creative_character_reference_images"."order" > 0 AND "creative_character_reference_images"."file_size" > 0);--> statement-breakpoint
ALTER TABLE "creative_characters" ADD CONSTRAINT "creative_characters_slot_check" CHECK (("creative_characters"."slot" IS NULL OR "creative_characters"."slot" BETWEEN 1 AND 2)
        AND ("creative_characters"."is_active" = false OR "creative_characters"."slot" IS NOT NULL));