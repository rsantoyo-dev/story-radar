CREATE TABLE "audit_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"workspace_id" text,
	"topic_id" text,
	"actor_type" text NOT NULL,
	"actor_id" text,
	"action" text NOT NULL,
	"entity_type" text,
	"entity_id" text,
	"outcome" text DEFAULT 'success' NOT NULL,
	"request_id" text,
	"details" jsonb DEFAULT '{}'::jsonb NOT NULL,
	CONSTRAINT "audit_events_actor_type_check" CHECK ("audit_events"."actor_type" IN ('user', 'operator', 'worker', 'stripe', 'system')),
	CONSTRAINT "audit_events_outcome_check" CHECK ("audit_events"."outcome" IN ('success', 'failure', 'denied', 'attempted')),
	CONSTRAINT "audit_events_action_format_check" CHECK ("audit_events"."action" ~ '^[a-z][a-z0-9_]*([.][a-z0-9_]+)+$')
);
--> statement-breakpoint
CREATE INDEX "audit_events_workspace_time_idx" ON "audit_events" USING btree ("workspace_id","occurred_at");--> statement-breakpoint
CREATE INDEX "audit_events_topic_time_idx" ON "audit_events" USING btree ("topic_id","occurred_at");--> statement-breakpoint
CREATE INDEX "audit_events_entity_idx" ON "audit_events" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "audit_events_action_time_idx" ON "audit_events" USING btree ("action","occurred_at");--> statement-breakpoint
CREATE INDEX "audit_events_actor_time_idx" ON "audit_events" USING btree ("actor_id","occurred_at");--> statement-breakpoint
-- History is append-only: no edits, deletions or truncation, whoever asks.
CREATE FUNCTION audit_refuse_change() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'audit_append_only: % is append-only; % is not allowed', TG_TABLE_NAME, TG_OP;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER audit_events_append_only BEFORE UPDATE OR DELETE ON "audit_events"
  FOR EACH ROW EXECUTE FUNCTION audit_refuse_change();
--> statement-breakpoint
CREATE TRIGGER audit_events_no_truncate BEFORE TRUNCATE ON "audit_events"
  FOR EACH STATEMENT EXECUTE FUNCTION audit_refuse_change();
