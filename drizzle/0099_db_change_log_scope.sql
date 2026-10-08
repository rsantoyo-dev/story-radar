ALTER TABLE "db_change_log" ADD COLUMN "workspace_id" text;--> statement-breakpoint
ALTER TABLE "db_change_log" ADD COLUMN "topic_id" text;--> statement-breakpoint
CREATE INDEX "db_change_log_workspace_time_idx" ON "db_change_log" USING btree ("workspace_id","occurred_at");--> statement-breakpoint
-- Restores the change from the observability session (17ac5d7): each captured change
-- records its workspace and topic. 0098 was already applied without them, so the
-- columns and the updated trigger function arrive here.
CREATE OR REPLACE FUNCTION capture_row_change() RETURNS trigger AS $$
DECLARE
  v_ignored text[] := array_append(coalesce(string_to_array(nullif(TG_ARGV[1], ''), ','), '{}'::text[]), 'updated_at');
  v_old jsonb;
  v_new jsonb;
  v_row jsonb;
  v_key text;
  v_changed text[];
  v_topic text;
  v_workspace text;
BEGIN
  IF TG_OP <> 'INSERT' THEN v_old := to_jsonb(OLD) - v_ignored; END IF;
  IF TG_OP <> 'DELETE' THEN v_new := to_jsonb(NEW) - v_ignored; END IF;
  v_row := coalesce(v_new, v_old);
  SELECT string_agg(coalesce(v_row ->> column_name, ''), ':') INTO v_key
  FROM unnest(string_to_array(TG_ARGV[0], ',')) AS column_name;
  -- Whose change it is: the row's own workspace, or its topic's (an asset reaches it through its draft).
  v_topic := CASE WHEN TG_TABLE_NAME = 'topics' THEN v_row ->> 'id' ELSE v_row ->> 'topic_id' END;
  IF v_topic IS NULL AND v_row ? 'batch_id' AND TG_TABLE_NAME = 'creative_assets' THEN
    SELECT d.topic_id::text INTO v_topic FROM creative_asset_batches b JOIN creative_drafts d ON d.id = b.draft_id
    WHERE b.id = (v_row ->> 'batch_id')::uuid;
  END IF;
  v_workspace := v_row ->> 'workspace_id';
  IF v_workspace IS NULL AND v_topic IS NOT NULL THEN
    SELECT t.workspace_id INTO v_workspace FROM topics t WHERE t.id = v_topic::uuid;
  END IF;
  IF TG_OP = 'UPDATE' THEN
    SELECT array_agg(n.key ORDER BY n.key) INTO v_changed
    FROM jsonb_each(v_new) AS n WHERE n.value IS DISTINCT FROM v_old -> n.key;
    IF v_changed IS NULL THEN RETURN NULL; END IF;
    SELECT jsonb_object_agg(c, v_old -> c), jsonb_object_agg(c, v_new -> c) INTO v_old, v_new FROM unnest(v_changed) AS c;
  END IF;
  INSERT INTO db_change_log (table_name, operation, row_key, workspace_id, topic_id, old_values, new_values, changed_columns)
  VALUES (TG_TABLE_NAME, TG_OP, coalesce(v_key, ''), v_workspace, v_topic,
    CASE WHEN v_old IS NULL THEN NULL ELSE change_log_redact(v_old) END,
    CASE WHEN v_new IS NULL THEN NULL ELSE change_log_redact(v_new) END,
    v_changed);
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;
