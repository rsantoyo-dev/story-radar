CREATE TABLE "ai_research_sources" (
	"topic_id" uuid PRIMARY KEY NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"instruction" text DEFAULT '' NOT NULL,
	"orientation" text DEFAULT 'informative' NOT NULL,
	"result_limit" integer DEFAULT 3 NOT NULL,
	"lookback_hours" integer DEFAULT 72 NOT NULL,
	"language" text DEFAULT 'en' NOT NULL,
	"region" text DEFAULT 'global' NOT NULL,
	"include_content" boolean DEFAULT true NOT NULL,
	"priority" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ai_research_sources_instruction_length_check" CHECK (char_length("ai_research_sources"."instruction") <= 2000),
	CONSTRAINT "ai_research_sources_orientation_check" CHECK ("ai_research_sources"."orientation" IN ('informative', 'trend', 'provocative')),
	CONSTRAINT "ai_research_sources_result_limit_check" CHECK ("ai_research_sources"."result_limit" BETWEEN 1 AND 10),
	CONSTRAINT "ai_research_sources_lookback_hours_check" CHECK ("ai_research_sources"."lookback_hours" BETWEEN 1 AND 8760),
	CONSTRAINT "ai_research_sources_language_not_blank_check" CHECK (char_length(btrim("ai_research_sources"."language")) > 0),
	CONSTRAINT "ai_research_sources_region_not_blank_check" CHECK (char_length(btrim("ai_research_sources"."region")) > 0),
	CONSTRAINT "ai_research_sources_priority_check" CHECK ("ai_research_sources"."priority" BETWEEN 0 AND 100)
);
--> statement-breakpoint
ALTER TABLE "story_sources" ADD COLUMN "research_score" integer;--> statement-breakpoint
ALTER TABLE "story_sources" ADD COLUMN "research_reasons" text[];--> statement-breakpoint
ALTER TABLE "ai_research_sources" ADD CONSTRAINT "ai_research_sources_topic_id_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."topics"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "story_sources" ADD CONSTRAINT "story_sources_research_score_check" CHECK ("story_sources"."research_score" IS NULL OR "story_sources"."research_score" BETWEEN 0 AND 100);