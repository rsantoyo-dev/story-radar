-- A demo reset waits only for text calls that are still running. Older
-- reserved or uncertain calls never resolve on their own; in the demo their
-- unknown cost is absorbed (the balance already stops holding them after 24
-- hours), so they must not block every future reset.
CREATE OR REPLACE FUNCTION reset_demo_credits(p_key text, p_actor text, p_reason text) RETURNS integer AS $$
DECLARE
  v_balance bigint;
  v_running integer;
BEGIN
  IF p_key NOT LIKE 'demo_reset:%' OR nullif(btrim(p_actor), '') IS NULL OR nullif(btrim(p_reason), '') IS NULL THEN
    RAISE EXCEPTION 'A demo_reset: key, actor, and reason are required';
  END IF;
  PERFORM sync_demo_credit_text_usage();
  IF EXISTS (SELECT 1 FROM workspace_credit_entries WHERE idempotency_key = p_key) THEN
    SELECT coalesce(sum(amount_micros), 0) INTO v_balance FROM workspace_credit_entries WHERE workspace_id = 'default';
    RETURN v_balance::integer;
  END IF;
  SELECT count(*) INTO v_running
  FROM creative_text_calls c JOIN topics t ON t.id = c.topic_id
  WHERE t.workspace_id = 'default' AND c.status = 'reserved' AND c.charged_micros IS NULL
    AND c.created_at > now() - interval '15 minutes'
    AND c.pricing ? 'demoMarkupBasisPoints';
  IF v_running > 0 THEN
    RAISE EXCEPTION 'demo_reset_running: Wait for % running AI text calls to finish before resetting demo credits', v_running;
  END IF;
  SELECT coalesce(sum(amount_micros), 0) INTO v_balance FROM workspace_credit_entries WHERE workspace_id = 'default';
  INSERT INTO workspace_credit_entries (workspace_id, kind, amount_micros, idempotency_key, actor, reason)
  VALUES ('default', 'demo_reset', 10000000 - v_balance, p_key, p_actor, p_reason);
  RETURN 10000000;
END;
$$ LANGUAGE plpgsql;
