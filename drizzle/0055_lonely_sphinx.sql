CREATE TABLE "editorial_collection_runs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"topic_id" uuid NOT NULL,
	"line_id" uuid,
	"context" jsonb,
	"status" text DEFAULT 'running' NOT NULL,
	"result" jsonb,
	"error" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	CONSTRAINT "editorial_collection_runs_topic_id_unique" UNIQUE("topic_id","id")
);
--> statement-breakpoint
CREATE TABLE "editorial_line_revisions" (
	"line_id" uuid NOT NULL,
	"revision" integer NOT NULL,
	"config" jsonb NOT NULL,
	"archived" boolean NOT NULL,
	CONSTRAINT "editorial_line_revisions_line_id_revision_pk" PRIMARY KEY("line_id","revision")
);
--> statement-breakpoint
CREATE TABLE "editorial_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"topic_id" uuid NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"archived" boolean DEFAULT false NOT NULL,
	"config" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "editorial_lines_topic_id_unique" UNIQUE("topic_id","id")
);
--> statement-breakpoint
CREATE TABLE "editorial_story_contexts" (
	"topic_id" uuid NOT NULL,
	"story_id" uuid NOT NULL,
	"run_id" uuid NOT NULL,
	"context" jsonb NOT NULL,
	"reasons" text[] NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "editorial_story_contexts_topic_id_story_id_run_id_pk" PRIMARY KEY("topic_id","story_id","run_id")
);
--> statement-breakpoint
ALTER TABLE "editorial_collection_runs" ADD CONSTRAINT "editorial_collection_runs_topic_id_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."topics"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "editorial_collection_runs" ADD CONSTRAINT "editorial_collection_runs_topic_id_line_id_editorial_lines_topic_id_id_fk" FOREIGN KEY ("topic_id","line_id") REFERENCES "public"."editorial_lines"("topic_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "editorial_line_revisions" ADD CONSTRAINT "editorial_line_revisions_line_id_editorial_lines_id_fk" FOREIGN KEY ("line_id") REFERENCES "public"."editorial_lines"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "editorial_lines" ADD CONSTRAINT "editorial_lines_topic_id_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."topics"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "editorial_story_contexts" ADD CONSTRAINT "editorial_story_contexts_story_fk" FOREIGN KEY ("topic_id","story_id") REFERENCES "public"."topic_stories"("topic_id","story_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "editorial_story_contexts" ADD CONSTRAINT "editorial_story_contexts_run_fk" FOREIGN KEY ("topic_id","run_id") REFERENCES "public"."editorial_collection_runs"("topic_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "editorial_collection_runs_budget_idx" ON "editorial_collection_runs" USING btree ("topic_id","started_at");