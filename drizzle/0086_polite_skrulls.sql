CREATE TABLE "ai_usage_charges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"topic_id" uuid NOT NULL,
	"story_id" uuid,
	"kind" text NOT NULL,
	"provider" text NOT NULL,
	"model" text NOT NULL,
	"operation" text NOT NULL,
	"units" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"cost_micros" integer,
	"estimated" boolean DEFAULT true NOT NULL,
	"pricing" jsonb NOT NULL,
	"idempotency_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ai_usage_charges_kind_check" CHECK ("ai_usage_charges"."kind" IN ('image', 'text', 'search', 'map', 'embedding', 'reader')),
	CONSTRAINT "ai_usage_charges_cost_check" CHECK ("ai_usage_charges"."cost_micros" IS NULL OR "ai_usage_charges"."cost_micros" >= 0)
);
--> statement-breakpoint
ALTER TABLE "workspace_credit_entries" DROP CONSTRAINT "workspace_credit_entries_source_check";--> statement-breakpoint
ALTER TABLE "workspace_credit_entries" ADD COLUMN "source_usage_charge_id" uuid;--> statement-breakpoint
ALTER TABLE "ai_usage_charges" ADD CONSTRAINT "ai_usage_charges_topic_id_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."topics"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_usage_charges" ADD CONSTRAINT "ai_usage_charges_story_id_stories_id_fk" FOREIGN KEY ("story_id") REFERENCES "public"."stories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ai_usage_charges_idempotency_idx" ON "ai_usage_charges" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX "ai_usage_charges_topic_time_idx" ON "ai_usage_charges" USING btree ("topic_id","created_at");--> statement-breakpoint
ALTER TABLE "workspace_credit_entries" ADD CONSTRAINT "workspace_credit_entries_source_usage_charge_id_ai_usage_charges_id_fk" FOREIGN KEY ("source_usage_charge_id") REFERENCES "public"."ai_usage_charges"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "workspace_credit_entries_usage_charge_idx" ON "workspace_credit_entries" USING btree ("source_usage_charge_id");--> statement-breakpoint
ALTER TABLE "workspace_credit_entries" ADD CONSTRAINT "workspace_credit_entries_source_check" CHECK (("workspace_credit_entries"."kind" = 'usage_debit' AND (("workspace_credit_entries"."source_text_call_id" IS NOT NULL) <> ("workspace_credit_entries"."source_usage_charge_id" IS NOT NULL)) AND "workspace_credit_entries"."reference_cost_micros" IS NOT NULL AND "workspace_credit_entries"."reference_cost_micros" > 0 AND "workspace_credit_entries"."markup_basis_points" IS NOT NULL AND "workspace_credit_entries"."markup_basis_points" >= 0)
        OR ("workspace_credit_entries"."kind" <> 'usage_debit' AND "workspace_credit_entries"."source_text_call_id" IS NULL AND "workspace_credit_entries"."source_usage_charge_id" IS NULL AND "workspace_credit_entries"."reference_cost_micros" IS NULL AND "workspace_credit_entries"."markup_basis_points" IS NULL));--> statement-breakpoint
CREATE OR REPLACE FUNCTION sync_demo_credit_text_usage() RETURNS void AS $$
BEGIN
  PERFORM id FROM workspaces WHERE id = 'default' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Default workspace is missing'; END IF;

  INSERT INTO workspace_credit_entries (workspace_id, kind, amount_micros, idempotency_key, actor, reason)
  VALUES ('default', 'demo_grant', 10000000, 'demo_grant:default', 'system:demo', 'Opening balance: 1,000 demo credits')
  ON CONFLICT (idempotency_key) DO NOTHING;

  -- Creative text calls (unchanged).
  INSERT INTO workspace_credit_entries
    (workspace_id, kind, amount_micros, idempotency_key, actor, reason,
     source_text_call_id, reference_cost_micros, markup_basis_points, created_at)
  SELECT t.workspace_id, 'usage_debit',
    -ceil(c.charged_micros::numeric * (10000 + (c.pricing->>'demoMarkupBasisPoints')::integer) / 10000)::integer,
    'creative_text:' || c.id::text, 'system:creative-text', c.operation,
    c.id, c.charged_micros, (c.pricing->>'demoMarkupBasisPoints')::integer,
    coalesce(c.finished_at, now())
  FROM creative_text_calls c
  JOIN topics t ON t.id = c.topic_id
  WHERE t.workspace_id = 'default' AND c.status = 'settled'
    AND c.charged_micros > 0 AND c.pricing ? 'demoMarkupBasisPoints'
    AND (c.pricing->>'demoMarkupBasisPoints') ~ '^[0-9]+$'
    AND (c.pricing->>'demoMarkupBasisPoints')::integer BETWEEN 0 AND 50000
  ON CONFLICT DO NOTHING;

  -- Every other priced provider spend (images, searches, maps, embeddings, evaluation text).
  INSERT INTO workspace_credit_entries
    (workspace_id, kind, amount_micros, idempotency_key, actor, reason,
     source_usage_charge_id, reference_cost_micros, markup_basis_points, created_at)
  SELECT t.workspace_id, 'usage_debit',
    -ceil(u.cost_micros::numeric * (10000 + (u.pricing->>'demoMarkupBasisPoints')::integer) / 10000)::integer,
    'usage:' || u.id::text, 'system:usage', u.operation,
    u.id, u.cost_micros, (u.pricing->>'demoMarkupBasisPoints')::integer,
    u.created_at
  FROM ai_usage_charges u
  JOIN topics t ON t.id = u.topic_id
  WHERE t.workspace_id = 'default'
    AND u.cost_micros > 0 AND u.pricing ? 'demoMarkupBasisPoints'
    AND (u.pricing->>'demoMarkupBasisPoints') ~ '^[0-9]+$'
    AND (u.pricing->>'demoMarkupBasisPoints')::integer BETWEEN 0 AND 50000
  ON CONFLICT DO NOTHING;
END;
$$ LANGUAGE plpgsql;
