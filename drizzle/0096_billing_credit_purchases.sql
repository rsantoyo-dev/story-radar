CREATE TABLE "billing_customers" (
	"workspace_id" text NOT NULL,
	"livemode" boolean NOT NULL,
	"stripe_customer_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "billing_customers_workspace_id_livemode_pk" PRIMARY KEY("workspace_id","livemode")
);
--> statement-breakpoint
CREATE TABLE "billing_purchases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" text NOT NULL,
	"livemode" boolean NOT NULL,
	"stripe_checkout_session_id" text NOT NULL,
	"stripe_payment_intent_id" text,
	"stripe_price_id" text NOT NULL,
	"credits" integer NOT NULL,
	"amount_total" integer NOT NULL,
	"amount_refunded" integer DEFAULT 0 NOT NULL,
	"currency" text NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"created_by_user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"paid_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "billing_purchases_credits_check" CHECK ("billing_purchases"."credits" > 0),
	CONSTRAINT "billing_purchases_amounts_check" CHECK ("billing_purchases"."amount_total" >= 0 AND "billing_purchases"."amount_refunded" >= 0 AND "billing_purchases"."amount_refunded" <= "billing_purchases"."amount_total"),
	CONSTRAINT "billing_purchases_status_check" CHECK ("billing_purchases"."status" IN ('open', 'paid', 'expired', 'partially_refunded', 'refunded'))
);
--> statement-breakpoint
ALTER TABLE "workspace_credit_entries" DROP CONSTRAINT "workspace_credit_entries_kind_check";--> statement-breakpoint
ALTER TABLE "workspace_credit_entries" DROP CONSTRAINT "workspace_credit_entries_amount_check";--> statement-breakpoint
ALTER TABLE "workspace_credit_entries" ADD COLUMN "source_purchase_id" uuid;--> statement-breakpoint
ALTER TABLE "billing_customers" ADD CONSTRAINT "billing_customers_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_purchases" ADD CONSTRAINT "billing_purchases_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_purchases" ADD CONSTRAINT "billing_purchases_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "billing_customers_stripe_customer_idx" ON "billing_customers" USING btree ("stripe_customer_id");--> statement-breakpoint
CREATE UNIQUE INDEX "billing_purchases_checkout_session_idx" ON "billing_purchases" USING btree ("stripe_checkout_session_id");--> statement-breakpoint
CREATE UNIQUE INDEX "billing_purchases_payment_intent_idx" ON "billing_purchases" USING btree ("stripe_payment_intent_id");--> statement-breakpoint
CREATE INDEX "billing_purchases_workspace_time_idx" ON "billing_purchases" USING btree ("workspace_id","created_at");--> statement-breakpoint
ALTER TABLE "workspace_credit_entries" ADD CONSTRAINT "workspace_credit_entries_source_purchase_id_billing_purchases_id_fk" FOREIGN KEY ("source_purchase_id") REFERENCES "public"."billing_purchases"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_credit_entries" ADD CONSTRAINT "workspace_credit_entries_kind_check" CHECK ("workspace_credit_entries"."kind" IN ('demo_grant', 'signup_grant', 'usage_debit', 'refund', 'demo_reset', 'purchase', 'purchase_reversal'));--> statement-breakpoint
ALTER TABLE "workspace_credit_entries" ADD CONSTRAINT "workspace_credit_entries_amount_check" CHECK (("workspace_credit_entries"."kind" IN ('usage_debit', 'purchase_reversal') AND "workspace_credit_entries"."amount_micros" < 0) OR ("workspace_credit_entries"."kind" IN ('demo_grant', 'signup_grant', 'refund', 'purchase') AND "workspace_credit_entries"."amount_micros" > 0) OR ("workspace_credit_entries"."kind" = 'demo_reset'));--> statement-breakpoint
ALTER TABLE "workspace_credit_entries" ADD CONSTRAINT "workspace_credit_entries_purchase_check" CHECK (("workspace_credit_entries"."kind" IN ('purchase', 'purchase_reversal')) = ("workspace_credit_entries"."source_purchase_id" IS NOT NULL));--> statement-breakpoint
-- A paid checkout grants its snapshotted credits once (1 credit = 10,000 micros).
-- Returns the credits granted by this call: 0 when the purchase was already paid.
CREATE FUNCTION post_credit_purchase(p_session text, p_payment_intent text, p_amount_total integer, p_currency text) RETURNS integer AS $$
DECLARE
  v_purchase billing_purchases%ROWTYPE;
BEGIN
  SELECT * INTO v_purchase FROM billing_purchases WHERE stripe_checkout_session_id = p_session FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'purchase_not_found: no purchase for checkout session %', p_session; END IF;
  IF v_purchase.status <> 'open' AND v_purchase.status <> 'expired' THEN RETURN 0; END IF;
  UPDATE billing_purchases
  SET status = 'paid', stripe_payment_intent_id = coalesce(p_payment_intent, stripe_payment_intent_id),
    amount_total = coalesce(p_amount_total, amount_total), currency = coalesce(lower(p_currency), currency),
    paid_at = now(), updated_at = now()
  WHERE id = v_purchase.id;
  INSERT INTO workspace_credit_entries (workspace_id, kind, amount_micros, idempotency_key, actor, reason, source_purchase_id)
  VALUES (v_purchase.workspace_id, 'purchase', v_purchase.credits * 10000, 'stripe_purchase:' || v_purchase.id::text,
    'system:stripe', 'Bought ' || v_purchase.credits || ' credits', v_purchase.id)
  ON CONFLICT (idempotency_key) DO NOTHING;
  RETURN v_purchase.credits;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
-- A refund takes back the refunded share of a pack's credits, rounded in the
-- customer's favour. `p_amount_refunded` is Stripe's cumulative refunded
-- amount, so repeated and out-of-order events converge on the same total.
-- Returns the micros taken back by this call, or -1 when no purchase matches.
-- The balance may go negative when the credits were already spent.
CREATE FUNCTION apply_credit_purchase_refund(p_payment_intent text, p_amount_refunded integer) RETURNS integer AS $$
DECLARE
  v_purchase billing_purchases%ROWTYPE;
  v_refunded integer;
  v_target bigint;
  v_taken bigint;
BEGIN
  SELECT * INTO v_purchase FROM billing_purchases WHERE stripe_payment_intent_id = p_payment_intent FOR UPDATE;
  IF NOT FOUND THEN RETURN -1; END IF;
  IF v_purchase.amount_total <= 0 OR p_amount_refunded IS NULL OR p_amount_refunded <= v_purchase.amount_refunded THEN RETURN 0; END IF;
  v_refunded := least(p_amount_refunded, v_purchase.amount_total);
  v_target := floor(v_purchase.credits::numeric * 10000 * v_refunded / v_purchase.amount_total);
  SELECT coalesce(-sum(amount_micros), 0) INTO v_taken FROM workspace_credit_entries
  WHERE source_purchase_id = v_purchase.id AND kind = 'purchase_reversal';
  UPDATE billing_purchases
  SET amount_refunded = v_refunded,
    status = CASE WHEN v_refunded >= amount_total THEN 'refunded' ELSE 'partially_refunded' END,
    updated_at = now()
  WHERE id = v_purchase.id;
  IF v_target <= v_taken THEN RETURN 0; END IF;
  INSERT INTO workspace_credit_entries (workspace_id, kind, amount_micros, idempotency_key, actor, reason, source_purchase_id)
  VALUES (v_purchase.workspace_id, 'purchase_reversal', -(v_target - v_taken)::integer,
    'stripe_refund:' || v_purchase.id::text || ':' || v_refunded, 'system:stripe',
    'Refund of ' || v_purchase.credits || '-credit pack', v_purchase.id)
  ON CONFLICT (idempotency_key) DO NOTHING;
  RETURN (v_target - v_taken)::integer;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
-- A demo reset sets the balance to 1,000 credits, which would erase bought
-- credits, so it refuses for a workspace that has ever bought any.
CREATE OR REPLACE FUNCTION reset_demo_credits(p_key text, p_actor text, p_reason text, p_workspace text DEFAULT 'default') RETURNS integer AS $$
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
  IF EXISTS (SELECT 1 FROM workspace_credit_entries WHERE workspace_id = p_workspace AND kind = 'purchase') THEN
    RAISE EXCEPTION 'demo_reset_purchased: This workspace has bought credits; a demo reset would remove them';
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
