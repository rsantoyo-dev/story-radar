CREATE TABLE "db_change_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
	"table_name" text NOT NULL,
	"operation" text NOT NULL,
	"row_key" text NOT NULL,
	"workspace_id" text,
	"topic_id" text,
	"old_values" jsonb,
	"new_values" jsonb,
	"changed_columns" text[],
	"db_user" text DEFAULT current_user NOT NULL,
	"transaction_id" bigint DEFAULT txid_current() NOT NULL,
	CONSTRAINT "db_change_log_operation_check" CHECK ("db_change_log"."operation" IN ('INSERT', 'UPDATE', 'DELETE'))
);
--> statement-breakpoint
CREATE INDEX "db_change_log_row_idx" ON "db_change_log" USING btree ("table_name","row_key","occurred_at");--> statement-breakpoint
CREATE INDEX "db_change_log_time_idx" ON "db_change_log" USING btree ("occurred_at");--> statement-breakpoint
CREATE INDEX "db_change_log_workspace_time_idx" ON "db_change_log" USING btree ("workspace_id","occurred_at");--> statement-breakpoint
CREATE INDEX "db_change_log_transaction_idx" ON "db_change_log" USING btree ("transaction_id");--> statement-breakpoint
CREATE TRIGGER db_change_log_append_only BEFORE UPDATE OR DELETE ON "db_change_log"
  FOR EACH ROW EXECUTE FUNCTION audit_refuse_change();
--> statement-breakpoint
CREATE TRIGGER db_change_log_no_truncate BEFORE TRUNCATE ON "db_change_log"
  FOR EACH STATEMENT EXECUTE FUNCTION audit_refuse_change();
--> statement-breakpoint
-- Secret columns are never copied; very long text and documents are cut.
CREATE FUNCTION change_log_redact(p_row jsonb) RETURNS jsonb AS $$
  SELECT coalesce(jsonb_object_agg(key, CASE
    WHEN key ~ '(secret|password|token_hash|token_encrypted|access_token|refresh_token|id_token)' THEN to_jsonb('[redacted]'::text)
    WHEN jsonb_typeof(value) = 'string' AND length(value #>> '{}') > 2000 THEN to_jsonb(left(value #>> '{}', 2000) || '… [cut]')
    WHEN jsonb_typeof(value) IN ('object', 'array') AND length(value::text) > 8000 THEN to_jsonb('[' || jsonb_typeof(value) || ', ' || length(value::text) || ' characters]')
    ELSE value END), '{}'::jsonb)
  FROM jsonb_each(p_row)
$$ LANGUAGE sql IMMUTABLE;
--> statement-breakpoint
-- AFTER trigger. TG_ARGV[0]: primary-key columns (comma-separated);
-- TG_ARGV[1]: columns to leave out (busy bookkeeping or bulky snapshots).
-- `updated_at` is always left out; an update that changes nothing else is not recorded.
CREATE FUNCTION capture_row_change() RETURNS trigger AS $$
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
--> statement-breakpoint
CREATE TRIGGER "workspaces_change_capture" AFTER INSERT OR UPDATE OR DELETE ON "workspaces"
  FOR EACH ROW EXECUTE FUNCTION capture_row_change('id', '');
--> statement-breakpoint
CREATE TRIGGER "workspace_members_change_capture" AFTER INSERT OR UPDATE OR DELETE ON "workspace_members"
  FOR EACH ROW EXECUTE FUNCTION capture_row_change('workspace_id,user_id', '');
--> statement-breakpoint
CREATE TRIGGER "workspace_invitations_change_capture" AFTER INSERT OR UPDATE OR DELETE ON "workspace_invitations"
  FOR EACH ROW EXECUTE FUNCTION capture_row_change('id', '');
--> statement-breakpoint
CREATE TRIGGER "platform_staff_change_capture" AFTER INSERT OR UPDATE OR DELETE ON "platform_staff"
  FOR EACH ROW EXECUTE FUNCTION capture_row_change('user_id', '');
--> statement-breakpoint
CREATE TRIGGER "users_change_capture" AFTER INSERT OR UPDATE OR DELETE ON "users"
  FOR EACH ROW EXECUTE FUNCTION capture_row_change('id', '');
--> statement-breakpoint
CREATE TRIGGER "workspace_credit_entries_change_capture" AFTER UPDATE OR DELETE ON "workspace_credit_entries"
  FOR EACH ROW EXECUTE FUNCTION capture_row_change('id', '');
--> statement-breakpoint
CREATE TRIGGER "billing_purchases_change_capture" AFTER INSERT OR UPDATE OR DELETE ON "billing_purchases"
  FOR EACH ROW EXECUTE FUNCTION capture_row_change('id', '');
--> statement-breakpoint
CREATE TRIGGER "billing_customers_change_capture" AFTER INSERT OR UPDATE OR DELETE ON "billing_customers"
  FOR EACH ROW EXECUTE FUNCTION capture_row_change('workspace_id,livemode', '');
--> statement-breakpoint
CREATE TRIGGER "topics_change_capture" AFTER INSERT OR UPDATE OR DELETE ON "topics"
  FOR EACH ROW EXECUTE FUNCTION capture_row_change('id', '');
--> statement-breakpoint
CREATE TRIGGER "topic_meta_connections_change_capture" AFTER INSERT OR UPDATE OR DELETE ON "topic_meta_connections"
  FOR EACH ROW EXECUTE FUNCTION capture_row_change('topic_id', 'last_verified_at,last_media_sync_at,last_media_sync_cursor,last_media_sync_summary');
--> statement-breakpoint
CREATE TRIGGER "topic_facebook_connections_change_capture" AFTER INSERT OR UPDATE OR DELETE ON "topic_facebook_connections"
  FOR EACH ROW EXECUTE FUNCTION capture_row_change('topic_id', 'last_verified_at');
--> statement-breakpoint
CREATE TRIGGER "instagram_publication_packages_change_capture" AFTER INSERT OR UPDATE OR DELETE ON "instagram_publication_packages"
  FOR EACH ROW EXECUTE FUNCTION capture_row_change('id', 'script_snapshot,policy_snapshot,transforms');
--> statement-breakpoint
CREATE TRIGGER "instagram_publication_jobs_change_capture" AFTER INSERT OR UPDATE OR DELETE ON "instagram_publication_jobs"
  FOR EACH ROW EXECUTE FUNCTION capture_row_change('id', 'lease_owner,lease_until,quota_remaining,access_checked_at,child_containers');
--> statement-breakpoint
CREATE TRIGGER "story_social_publications_change_capture" AFTER INSERT OR UPDATE OR DELETE ON "story_social_publications"
  FOR EACH ROW EXECUTE FUNCTION capture_row_change('id', '');
--> statement-breakpoint
CREATE TRIGGER "editorial_lines_change_capture" AFTER INSERT OR UPDATE OR DELETE ON "editorial_lines"
  FOR EACH ROW EXECUTE FUNCTION capture_row_change('id', '');
--> statement-breakpoint
CREATE TRIGGER "topic_editorial_profiles_change_capture" AFTER INSERT OR UPDATE OR DELETE ON "topic_editorial_profiles"
  FOR EACH ROW EXECUTE FUNCTION capture_row_change('topic_id', '');
--> statement-breakpoint
CREATE TRIGGER "creative_profiles_change_capture" AFTER INSERT OR UPDATE OR DELETE ON "creative_profiles"
  FOR EACH ROW EXECUTE FUNCTION capture_row_change('id', '');
--> statement-breakpoint
CREATE TRIGGER "rss_sources_change_capture" AFTER INSERT OR UPDATE OR DELETE ON "rss_sources"
  FOR EACH ROW EXECUTE FUNCTION capture_row_change('id', '');
--> statement-breakpoint
CREATE TRIGGER "topic_sources_change_capture" AFTER INSERT OR UPDATE OR DELETE ON "topic_sources"
  FOR EACH ROW EXECUTE FUNCTION capture_row_change('id', '');
--> statement-breakpoint
CREATE TRIGGER "topic_auto_collection_settings_change_capture" AFTER INSERT OR UPDATE OR DELETE ON "topic_auto_collection_settings"
  FOR EACH ROW EXECUTE FUNCTION capture_row_change('topic_id', 'last_run_at,next_run_at');
--> statement-breakpoint
CREATE TRIGGER "creative_drafts_change_capture" AFTER INSERT OR UPDATE OR DELETE ON "creative_drafts"
  FOR EACH ROW EXECUTE FUNCTION capture_row_change('id', 'ai_snapshot,concept,narrative_rationale,input_hash,prompt_tokens,output_tokens,thoughts_tokens,total_tokens');
--> statement-breakpoint
CREATE TRIGGER "creative_assets_change_capture" AFTER INSERT OR UPDATE OR DELETE ON "creative_assets"
  FOR EACH ROW EXECUTE FUNCTION capture_row_change('id', 'prompt,expected_text,unit_snapshot,reference_snapshot,brand_overlay_snapshot,carousel_chrome_snapshot,reference_input_hash');
