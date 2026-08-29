CREATE TABLE "story_knowledge_origins" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"topic_id" uuid NOT NULL,
	"story_id" uuid NOT NULL,
	"section_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "story_knowledge_origins" ADD CONSTRAINT "story_knowledge_origins_topic_id_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."topics"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "story_knowledge_origins" ADD CONSTRAINT "story_knowledge_origins_story_id_stories_id_fk" FOREIGN KEY ("story_id") REFERENCES "public"."stories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "story_knowledge_origins" ADD CONSTRAINT "story_knowledge_origins_section_id_knowledge_document_sections_id_fk" FOREIGN KEY ("section_id") REFERENCES "public"."knowledge_document_sections"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "story_knowledge_origins_topic_section_unique" ON "story_knowledge_origins" USING btree ("topic_id","section_id");--> statement-breakpoint
CREATE UNIQUE INDEX "story_knowledge_origins_topic_story_unique" ON "story_knowledge_origins" USING btree ("topic_id","story_id");--> statement-breakpoint
CREATE INDEX "story_knowledge_origins_story_idx" ON "story_knowledge_origins" USING btree ("story_id");