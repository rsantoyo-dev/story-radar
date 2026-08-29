ALTER TABLE "knowledge_document_sections" DROP CONSTRAINT "knowledge_document_sections_values_check";--> statement-breakpoint
ALTER TABLE "knowledge_document_sections" ADD COLUMN "printed_page_start" integer;--> statement-breakpoint
ALTER TABLE "knowledge_document_sections" ADD COLUMN "printed_page_end" integer;--> statement-breakpoint
ALTER TABLE "knowledge_document_sections" ADD CONSTRAINT "knowledge_document_sections_values_check" CHECK ("knowledge_document_sections"."ordinal" >= 0
        AND "knowledge_document_sections"."page_start" > 0
        AND "knowledge_document_sections"."page_end" >= "knowledge_document_sections"."page_start"
        AND (("knowledge_document_sections"."printed_page_start" IS NULL AND "knowledge_document_sections"."printed_page_end" IS NULL)
          OR ("knowledge_document_sections"."printed_page_start" > 0
            AND "knowledge_document_sections"."printed_page_end" >= "knowledge_document_sections"."printed_page_start"))
        AND "knowledge_document_sections"."character_count" > 0
        AND char_length(btrim("knowledge_document_sections"."heading")) > 0
        AND char_length(btrim("knowledge_document_sections"."text")) > 0);