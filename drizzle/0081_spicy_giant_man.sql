CREATE TABLE "workspace_credit_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" text NOT NULL,
	"kind" text NOT NULL,
	"amount_micros" integer NOT NULL,
	"idempotency_key" text NOT NULL,
	"actor" text NOT NULL,
	"reason" text,
	"source_text_call_id" uuid,
	"reference_cost_micros" integer,
	"markup_basis_points" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workspace_credit_entries_kind_check" CHECK ("workspace_credit_entries"."kind" IN ('demo_grant', 'signup_grant', 'usage_debit', 'refund', 'demo_reset')),
	CONSTRAINT "workspace_credit_entries_amount_check" CHECK (("workspace_credit_entries"."kind" = 'usage_debit' AND "workspace_credit_entries"."amount_micros" < 0)
        OR ("workspace_credit_entries"."kind" IN ('demo_grant', 'signup_grant', 'refund') AND "workspace_credit_entries"."amount_micros" > 0)
        OR ("workspace_credit_entries"."kind" = 'demo_reset')),
	CONSTRAINT "workspace_credit_entries_source_check" CHECK (("workspace_credit_entries"."kind" = 'usage_debit' AND "workspace_credit_entries"."source_text_call_id" IS NOT NULL AND "workspace_credit_entries"."reference_cost_micros" IS NOT NULL AND "workspace_credit_entries"."reference_cost_micros" > 0 AND "workspace_credit_entries"."markup_basis_points" IS NOT NULL AND "workspace_credit_entries"."markup_basis_points" >= 0)
        OR ("workspace_credit_entries"."kind" <> 'usage_debit' AND "workspace_credit_entries"."source_text_call_id" IS NULL AND "workspace_credit_entries"."reference_cost_micros" IS NULL AND "workspace_credit_entries"."markup_basis_points" IS NULL))
);
--> statement-breakpoint
ALTER TABLE "workspace_credit_entries" ADD CONSTRAINT "workspace_credit_entries_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_credit_entries" ADD CONSTRAINT "workspace_credit_entries_source_text_call_id_creative_text_calls_id_fk" FOREIGN KEY ("source_text_call_id") REFERENCES "public"."creative_text_calls"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "workspace_credit_entries_idempotency_idx" ON "workspace_credit_entries" USING btree ("idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX "workspace_credit_entries_text_call_idx" ON "workspace_credit_entries" USING btree ("source_text_call_id");--> statement-breakpoint
CREATE INDEX "workspace_credit_entries_workspace_time_idx" ON "workspace_credit_entries" USING btree ("workspace_id","created_at");--> statement-breakpoint
INSERT INTO workspace_credit_entries (workspace_id, kind, amount_micros, idempotency_key, actor, reason)
SELECT 'default', 'demo_grant', 10000000, 'demo_grant:default', 'system:demo', 'Opening balance: 1,000 demo credits'
WHERE EXISTS (SELECT 1 FROM workspaces WHERE id = 'default')
ON CONFLICT (idempotency_key) DO NOTHING;--> statement-breakpoint
CREATE FUNCTION sync_demo_credit_text_usage() RETURNS void AS $$
BEGIN
  PERFORM id FROM workspaces WHERE id = 'default' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Default workspace is missing'; END IF;

  INSERT INTO workspace_credit_entries (workspace_id, kind, amount_micros, idempotency_key, actor, reason)
  VALUES ('default', 'demo_grant', 10000000, 'demo_grant:default', 'system:demo', 'Opening balance: 1,000 demo credits')
  ON CONFLICT (idempotency_key) DO NOTHING;

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
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint
CREATE FUNCTION reset_demo_credits(p_key text, p_actor text, p_reason text) RETURNS integer AS $$
DECLARE
  v_balance bigint;
  v_pending integer;
BEGIN
  IF p_key NOT LIKE 'demo_reset:%' OR nullif(btrim(p_actor), '') IS NULL OR nullif(btrim(p_reason), '') IS NULL THEN
    RAISE EXCEPTION 'A demo_reset: key, actor, and reason are required';
  END IF;
  PERFORM sync_demo_credit_text_usage();
  IF EXISTS (SELECT 1 FROM workspace_credit_entries WHERE idempotency_key = p_key) THEN
    SELECT coalesce(sum(amount_micros), 0) INTO v_balance FROM workspace_credit_entries WHERE workspace_id = 'default';
    RETURN v_balance::integer;
  END IF;
  SELECT count(*) INTO v_pending
  FROM creative_text_calls c JOIN topics t ON t.id = c.topic_id
  WHERE t.workspace_id = 'default' AND c.status IN ('reserved', 'uncertain')
    AND c.pricing ? 'demoMarkupBasisPoints';
  IF v_pending > 0 THEN RAISE EXCEPTION 'Resolve % pending metered text calls before resetting demo credits', v_pending; END IF;
  SELECT coalesce(sum(amount_micros), 0) INTO v_balance FROM workspace_credit_entries WHERE workspace_id = 'default';
  INSERT INTO workspace_credit_entries (workspace_id, kind, amount_micros, idempotency_key, actor, reason)
  VALUES ('default', 'demo_reset', 10000000 - v_balance, p_key, p_actor, p_reason);
  RETURN 10000000;
END;
$$ LANGUAGE plpgsql;
