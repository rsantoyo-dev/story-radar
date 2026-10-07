-- Credits per workspace. The seeded `default` workspace keeps its demo
-- grant and history; every other workspace receives the signup grant once
-- (AUTH-08: US$1 = 100 credits). Debits post to the workspace that owns the
-- topic that spent them.
CREATE OR REPLACE FUNCTION sync_demo_credit_text_usage() RETURNS void AS $$
BEGIN
  -- One sync at a time across workspaces (replaces the lock on the default row).
  PERFORM pg_advisory_xact_lock(hashtext('workspace_credit_entries:sync'));
  PERFORM id FROM workspaces WHERE id = 'default';
  IF NOT FOUND THEN RAISE EXCEPTION 'Default workspace is missing'; END IF;

  INSERT INTO workspace_credit_entries (workspace_id, kind, amount_micros, idempotency_key, actor, reason)
  VALUES ('default', 'demo_grant', 10000000, 'demo_grant:default', 'system:demo', 'Opening balance: 1,000 demo credits')
  ON CONFLICT (idempotency_key) DO NOTHING;

  INSERT INTO workspace_credit_entries (workspace_id, kind, amount_micros, idempotency_key, actor, reason)
  SELECT w.id, 'signup_grant', 1000000, 'signup_grant:' || w.id, 'system:signup', 'Signup grant: 100 credits'
  FROM workspaces w
  WHERE w.id <> 'default'
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
  WHERE c.status = 'settled'
    AND c.charged_micros > 0 AND c.pricing ? 'demoMarkupBasisPoints'
    AND (c.pricing->>'demoMarkupBasisPoints') ~ '^[0-9]+$'
    AND (c.pricing->>'demoMarkupBasisPoints')::integer BETWEEN 0 AND 50000
  ON CONFLICT DO NOTHING;

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
  WHERE u.cost_micros > 0 AND u.pricing ? 'demoMarkupBasisPoints'
    AND (u.pricing->>'demoMarkupBasisPoints') ~ '^[0-9]+$'
    AND (u.pricing->>'demoMarkupBasisPoints')::integer BETWEEN 0 AND 50000
  ON CONFLICT DO NOTHING;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
-- The reset takes the workspace; a three-argument call keeps resetting `default`.
DROP FUNCTION IF EXISTS reset_demo_credits(text, text, text);
--> statement-breakpoint
CREATE FUNCTION reset_demo_credits(p_key text, p_actor text, p_reason text, p_workspace text DEFAULT 'default') RETURNS integer AS $$
DECLARE
  v_balance bigint;
  v_running integer;
BEGIN
  IF p_key NOT LIKE 'demo_reset:%' OR nullif(btrim(p_actor), '') IS NULL OR nullif(btrim(p_reason), '') IS NULL THEN
    RAISE EXCEPTION 'A demo_reset: key, actor, and reason are required';
  END IF;
  PERFORM id FROM workspaces WHERE id = p_workspace;
  IF NOT FOUND THEN RAISE EXCEPTION 'Workspace % does not exist', p_workspace; END IF;
  PERFORM sync_demo_credit_text_usage();
  IF EXISTS (SELECT 1 FROM workspace_credit_entries WHERE idempotency_key = p_key) THEN
    SELECT coalesce(sum(amount_micros), 0) INTO v_balance FROM workspace_credit_entries WHERE workspace_id = p_workspace;
    RETURN v_balance::integer;
  END IF;
  SELECT count(*) INTO v_running
  FROM creative_text_calls c JOIN topics t ON t.id = c.topic_id
  WHERE t.workspace_id = p_workspace AND c.status = 'reserved' AND c.charged_micros IS NULL
    AND c.created_at > now() - interval '15 minutes'
    AND c.pricing ? 'demoMarkupBasisPoints';
  IF v_running > 0 THEN
    RAISE EXCEPTION 'demo_reset_running: Wait for % running AI text calls to finish before resetting demo credits', v_running;
  END IF;
  SELECT coalesce(sum(amount_micros), 0) INTO v_balance FROM workspace_credit_entries WHERE workspace_id = p_workspace;
  INSERT INTO workspace_credit_entries (workspace_id, kind, amount_micros, idempotency_key, actor, reason)
  VALUES (p_workspace, 'demo_reset', 10000000 - v_balance, p_key, p_actor, p_reason);
  RETURN 10000000;
END;
$$ LANGUAGE plpgsql;
