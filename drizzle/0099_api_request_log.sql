CREATE TABLE "api_request_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"request_id" text,
	"workspace_id" text,
	"topic_id" text,
	"actor_type" text,
	"actor_id" text,
	"method" text NOT NULL,
	"path" text NOT NULL,
	"query" text,
	"status" integer NOT NULL,
	"duration_ms" integer NOT NULL,
	"request_body" text,
	"response_body" text,
	"response_bytes" integer,
	"error" text,
	"ip" text,
	"user_agent" text
);
--> statement-breakpoint
CREATE INDEX "api_request_log_workspace_time_idx" ON "api_request_log" USING btree ("workspace_id","occurred_at");--> statement-breakpoint
CREATE INDEX "api_request_log_time_idx" ON "api_request_log" USING btree ("occurred_at");--> statement-breakpoint
CREATE INDEX "api_request_log_request_idx" ON "api_request_log" USING btree ("request_id");--> statement-breakpoint
CREATE INDEX "api_request_log_actor_time_idx" ON "api_request_log" USING btree ("actor_id","occurred_at");--> statement-breakpoint
CREATE INDEX "api_request_log_status_time_idx" ON "api_request_log" USING btree ("status","occurred_at");
