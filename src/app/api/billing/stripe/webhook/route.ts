import { NextResponse } from "next/server";

import { applyStripeEvent } from "@/app/modules/billing/credit-purchases";
import { verifyStripeSignature } from "@/app/modules/billing/stripe.core";

/**
 * Stripe → Press Craftor events (Dashboard → Developers → Webhooks, or
 * `stripe listen --forward-to localhost:3000/api/billing/stripe/webhook`).
 * Public, but only a payload signed with STRIPE_WEBHOOK_SECRET is applied.
 * A 5xx makes Stripe retry; every handler is idempotent.
 */
export async function POST(request: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET?.trim();
  if (!secret) {
    console.error("Stripe webhook received but STRIPE_WEBHOOK_SECRET is not configured");
    return NextResponse.json({ error: "Webhook is not configured" }, { status: 503 });
  }

  const payload = await request.text();
  if (!verifyStripeSignature(payload, request.headers.get("stripe-signature"), secret)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  let event: { id?: string; type?: string; data?: { object?: unknown } };
  try {
    event = JSON.parse(payload) as typeof event;
  } catch {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  try {
    const result = await applyStripeEvent(event);
    if (result.handled) console.info(`Stripe ${event.type} ${event.id}: ${result.detail}`);
    return NextResponse.json({ received: true, ...result });
  } catch (error) {
    console.error(`Stripe ${event.type} ${event.id} failed`, error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "Event could not be applied" }, { status: 500 });
  }
}
