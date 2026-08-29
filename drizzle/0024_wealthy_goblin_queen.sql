CREATE TABLE "knowledge_document_ingestion_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"document_id" uuid NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"stage" text DEFAULT 'queued' NOT NULL,
	"pages_processed" integer DEFAULT 0 NOT NULL,
	"pages_total" integer,
	"error" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "knowledge_document_ingestion_runs_status_check" CHECK ("knowledge_document_ingestion_runs"."status" IN ('queued', 'processing', 'completed', 'failed')),
	CONSTRAINT "knowledge_document_ingestion_runs_stage_check" CHECK ("knowledge_document_ingestion_runs"."stage" IN ('queued', 'fetching', 'extracting', 'persisting', 'completed', 'failed')),
	CONSTRAINT "knowledge_document_ingestion_runs_progress_check" CHECK ("knowledge_document_ingestion_runs"."pages_processed" >= 0
        AND ("knowledge_document_ingestion_runs"."pages_total" IS NULL OR "knowledge_document_ingestion_runs"."pages_total" > 0)
        AND ("knowledge_document_ingestion_runs"."pages_total" IS NULL OR "knowledge_document_ingestion_runs"."pages_processed" <= "knowledge_document_ingestion_runs"."pages_total")),
	CONSTRAINT "knowledge_document_ingestion_runs_result_check" CHECK (("knowledge_document_ingestion_runs"."status" = 'completed' AND "knowledge_document_ingestion_runs"."finished_at" IS NOT NULL AND "knowledge_document_ingestion_runs"."error" IS NULL)
        OR ("knowledge_document_ingestion_runs"."status" = 'failed' AND "knowledge_document_ingestion_runs"."finished_at" IS NOT NULL AND "knowledge_document_ingestion_runs"."error" IS NOT NULL)
        OR ("knowledge_document_ingestion_runs"."status" IN ('queued', 'processing') AND "knowledge_document_ingestion_runs"."finished_at" IS NULL AND "knowledge_document_ingestion_runs"."error" IS NULL))
);
--> statement-breakpoint
CREATE TABLE "knowledge_document_sections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"document_version_id" uuid NOT NULL,
	"ordinal" integer NOT NULL,
	"heading" text NOT NULL,
	"page_start" integer NOT NULL,
	"page_end" integer NOT NULL,
	"text" text NOT NULL,
	"text_hash" text NOT NULL,
	"character_count" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "knowledge_document_sections_values_check" CHECK ("knowledge_document_sections"."ordinal" >= 0
        AND "knowledge_document_sections"."page_start" > 0
        AND "knowledge_document_sections"."page_end" >= "knowledge_document_sections"."page_start"
        AND "knowledge_document_sections"."character_count" > 0
        AND char_length(btrim("knowledge_document_sections"."heading")) > 0
        AND char_length(btrim("knowledge_document_sections"."text")) > 0)
);
--> statement-breakpoint
CREATE TABLE "knowledge_document_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"document_id" uuid NOT NULL,
	"content_hash" text NOT NULL,
	"title" text NOT NULL,
	"author" text,
	"subject" text,
	"edition" text,
	"page_count" integer NOT NULL,
	"section_count" integer NOT NULL,
	"source_last_modified" text,
	"extracted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "knowledge_document_versions_counts_check" CHECK ("knowledge_document_versions"."page_count" > 0 AND "knowledge_document_versions"."section_count" > 0)
);
--> statement-breakpoint
CREATE TABLE "knowledge_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" text NOT NULL,
	"canonical_url" text NOT NULL,
	"source_url" text NOT NULL,
	"document_type" text DEFAULT 'guideline' NOT NULL,
	"mime_type" text DEFAULT 'application/pdf' NOT NULL,
	"language" text DEFAULT 'unknown' NOT NULL,
	"publisher" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "knowledge_documents_workspace_id_id_unique" UNIQUE("workspace_id","id"),
	CONSTRAINT "knowledge_documents_url_protocol_check" CHECK ("knowledge_documents"."canonical_url" ~* '^https?://' AND "knowledge_documents"."source_url" ~* '^https?://'),
	CONSTRAINT "knowledge_documents_type_check" CHECK ("knowledge_documents"."document_type" IN ('guideline', 'report', 'study', 'manual', 'other')),
	CONSTRAINT "knowledge_documents_mime_check" CHECK ("knowledge_documents"."mime_type" = 'application/pdf')
);
--> statement-breakpoint
CREATE TABLE "topic_knowledge_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" text NOT NULL,
	"topic_id" uuid NOT NULL,
	"document_id" uuid NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"tags" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"priority" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "topic_knowledge_documents_priority_check" CHECK ("topic_knowledge_documents"."priority" BETWEEN 0 AND 100)
);
--> statement-breakpoint
ALTER TABLE "knowledge_document_ingestion_runs" ADD CONSTRAINT "knowledge_document_ingestion_runs_document_id_knowledge_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."knowledge_documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_document_sections" ADD CONSTRAINT "knowledge_document_sections_document_version_id_knowledge_document_versions_id_fk" FOREIGN KEY ("document_version_id") REFERENCES "public"."knowledge_document_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_document_versions" ADD CONSTRAINT "knowledge_document_versions_document_id_knowledge_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."knowledge_documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_documents" ADD CONSTRAINT "knowledge_documents_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "topic_knowledge_documents" ADD CONSTRAINT "topic_knowledge_documents_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "topic_knowledge_documents" ADD CONSTRAINT "topic_knowledge_documents_workspace_topic_fk" FOREIGN KEY ("workspace_id","topic_id") REFERENCES "public"."topics"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "topic_knowledge_documents" ADD CONSTRAINT "topic_knowledge_documents_workspace_document_fk" FOREIGN KEY ("workspace_id","document_id") REFERENCES "public"."knowledge_documents"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "knowledge_document_ingestion_runs_document_started_idx" ON "knowledge_document_ingestion_runs" USING btree ("document_id","started_at");--> statement-breakpoint
CREATE INDEX "knowledge_document_ingestion_runs_status_idx" ON "knowledge_document_ingestion_runs" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "knowledge_document_sections_version_ordinal_unique" ON "knowledge_document_sections" USING btree ("document_version_id","ordinal");--> statement-breakpoint
CREATE INDEX "knowledge_document_sections_version_pages_idx" ON "knowledge_document_sections" USING btree ("document_version_id","page_start");--> statement-breakpoint
CREATE UNIQUE INDEX "knowledge_document_versions_document_hash_unique" ON "knowledge_document_versions" USING btree ("document_id","content_hash");--> statement-breakpoint
CREATE INDEX "knowledge_document_versions_document_extracted_idx" ON "knowledge_document_versions" USING btree ("document_id","extracted_at");--> statement-breakpoint
CREATE UNIQUE INDEX "knowledge_documents_workspace_url_unique" ON "knowledge_documents" USING btree ("workspace_id","canonical_url");--> statement-breakpoint
CREATE INDEX "knowledge_documents_workspace_updated_idx" ON "knowledge_documents" USING btree ("workspace_id","updated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "topic_knowledge_documents_topic_document_unique" ON "topic_knowledge_documents" USING btree ("topic_id","document_id");--> statement-breakpoint
CREATE INDEX "topic_knowledge_documents_topic_enabled_idx" ON "topic_knowledge_documents" USING btree ("topic_id","enabled");