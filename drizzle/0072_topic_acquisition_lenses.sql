CREATE TABLE "topic_acquisition_lenses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"topic_id" uuid NOT NULL,
	"line_id" uuid,
	"taxonomy_version" integer NOT NULL,
	"lenses" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "topic_acquisition_lenses_version_check" CHECK ("topic_acquisition_lenses"."taxonomy_version" >= 1),
	CONSTRAINT "topic_acquisition_lenses_lenses_check" CHECK (jsonb_typeof("topic_acquisition_lenses"."lenses") = 'array' AND jsonb_array_length("topic_acquisition_lenses"."lenses") > 0)
);
--> statement-breakpoint
ALTER TABLE "topic_acquisition_lenses" ADD CONSTRAINT "topic_acquisition_lenses_topic_id_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."topics"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "topic_acquisition_lenses" ADD CONSTRAINT "topic_acquisition_lenses_editorial_line_fk" FOREIGN KEY ("topic_id","line_id") REFERENCES "public"."editorial_lines"("topic_id","id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "topic_acquisition_lenses_topic_default_version_unique" ON "topic_acquisition_lenses" USING btree ("topic_id","taxonomy_version") WHERE "topic_acquisition_lenses"."line_id" IS NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX "topic_acquisition_lenses_topic_line_version_unique" ON "topic_acquisition_lenses" USING btree ("topic_id","line_id","taxonomy_version") WHERE "topic_acquisition_lenses"."line_id" IS NOT NULL;
--> statement-breakpoint
CREATE INDEX "topic_acquisition_lenses_topic_created_idx" ON "topic_acquisition_lenses" USING btree ("topic_id","created_at");
--> statement-breakpoint
ALTER TABLE "story_creative_briefs" ADD COLUMN "editorial_angle" jsonb;
--> statement-breakpoint
INSERT INTO "topic_acquisition_lenses" ("topic_id", "taxonomy_version", "lenses")
SELECT
	"id",
	1,
	'[
	  {"key":"practical-impact","label":"Practical impact","definition":"Information that can help the audience make, change, or prepare for a practical decision.","examples":["A change to a service people use","Advice with a clear next step"],"hookBias":"stake","enabled":true,"isFallback":false},
	  {"key":"notable-development","label":"Notable development","definition":"A new or unexpected development whose specific capability, result, or change merits attention.","examples":["A newly available capability","An unexpected research result"],"hookBias":"capability","enabled":true,"isFallback":false},
	  {"key":"risk-and-uncertainty","label":"Risk and uncertainty","definition":"A supported risk, limitation, safety concern, or uncertainty that benefits from careful explanation.","examples":["A documented safety concern","A policy change with uncertain effects"],"hookBias":"contrast","enabled":true,"isFallback":false},
	  {"key":"context-and-explainer","label":"Context and explainer","definition":"Background or explanation that helps a specialized or general audience understand an important subject.","examples":["How a process works","What a reported change means"],"enabled":true,"isFallback":true}
	]'::jsonb
FROM "topics";