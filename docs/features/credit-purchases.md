# Credit purchases

**ID:** FEAT-BILL-002
**Status:** Credit packs through Stripe Checkout (test mode first); subscriptions, tax and enforcement pending
**Date:** October 7, 2026
**Product:** Press Craftor

## Outcome

A workspace owner or admin buys a pack of credits on the spending page, pays on Stripe's hosted Checkout page, and the credits land in the workspace's existing ledger ([FEAT-BILL-001](workspace-credits.md)) as soon as Stripe confirms the payment. A refund in Stripe takes the refunded share of the pack back. The app never sees card details.

## Packs are configuration

A pack is an **active one-time Price** in Stripe whose Price or Product metadata has `press_craftor_credits = <credits>` (whole number, at most 200,000). The app lists them from Stripe (cached five minutes), so adding a pack or changing a price needs no deploy. The credits and price are **snapshotted** in `billing_purchases` when the checkout starts; a later change in Stripe never changes what an earlier purchase granted. 1 credit = 10,000 micros = US$0.01 of metered value.

## Flow

```text
Owner/admin clicks "Buy" → POST /api/radar/billing/checkout {priceId}
  → the price must be a listed pack (the browser never sets credits)
  → Stripe Checkout Session (mode=payment, invoice, signed metadata: workspace, credits, price)
  → billing_purchases row (status open)
Stripe → POST /api/billing/stripe/webhook (signature verified)
  checkout.session.completed / async_payment_succeeded, paid
      → post_credit_purchase(): purchase → paid, one `purchase` ledger posting
  checkout.session.expired / async_payment_failed → purchase → expired
  charge.refunded → apply_credit_purchase_refund(): `purchase_reversal` for the refunded share
```

- **Idempotent.** The ledger posting key is `stripe_purchase:<purchase id>`; refunds use Stripe's cumulative `amount_refunded`, so repeated and out-of-order events converge. Both SQL functions lock the purchase row.
- **Resilient.** If the checkout route fails after Stripe created the session, the webhook creates the purchase from the signed metadata.
- **Customers.** The first purchase creates a Stripe customer; later ones reuse it (`billing_customers`, one per workspace and Stripe mode).
- **Refunds.** A refund may leave the balance negative when the credits were already spent; refunds are issued from the Stripe Dashboard for now.
- **Demo reset.** `reset_demo_credits` refuses for a workspace that has bought credits, since setting the balance to 1,000 would erase them.

## Setup

1. `STRIPE_SECRET_KEY` (test key first) in `.env.local` and Vercel.
2. Webhook endpoint `https://<app>/api/billing/stripe/webhook` with the five events above; its signing secret in `STRIPE_WEBHOOK_SECRET`. Locally: `stripe listen --forward-to localhost:3000/api/billing/stripe/webhook`.
3. Create the packs in Stripe with the metadata above.
4. Test with card `4242 4242 4242 4242`, any future date and CVC.

## Not yet

- Subscriptions with included monthly credits and the Stripe customer portal.
- Stripe Tax (GST/HST) and a public pricing, terms and refund page before live mode.
- Refusing paid work for an empty balance (FEAT-BILL-001 enforcement).
