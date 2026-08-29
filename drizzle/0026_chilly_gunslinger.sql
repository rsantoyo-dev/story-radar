ALTER TABLE "story_knowledge_origins" DROP CONSTRAINT "story_knowledge_origins_section_id_knowledge_document_sections_id_fk";
--> statement-breakpoint
DROP INDEX "story_knowledge_origins_topic_story_unique";--> statement-breakpoint
ALTER TABLE "story_creative_briefs" ADD COLUMN "editorial_direction" text;--> statement-breakpoint
ALTER TABLE "story_knowledge_origins" ADD CONSTRAINT "story_knowledge_origins_section_id_knowledge_document_sections_id_fk" FOREIGN KEY ("section_id") REFERENCES "public"."knowledge_document_sections"("id") ON DELETE cascade ON UPDATE no action;