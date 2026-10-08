import { NextResponse } from "next/server";

import { applyStripeEvent } from "@/app/modules/billing/credit-purchases";
import { verifyStripeSignature } from "@/app/modules/billing/stripe.core";
import { annotateLogContext, createLogger, enterRequestLogContext } from "@/app/modules/observability/logger";
import { withApiLog } from "@/app/modules/observability/api-request-log";

const log = createLogger("stripe-webhook");

/**
 * Stripe → Press Craftor events (Dashboard → Developers → Webhooks, or
 * `stripe listen --forward-to localhost:3000/api/billing/stripe/webhook`).
 * Public, but only a payload signed with STRIPE_WEBHOOK_SECRET is applied.
 * A 5xx makes Stripe retry; every handler is idempotent.
 */
async function route_POST(request: Request) {
  enterRequestLogContext(request);
  annotateLogContext({ actor: "stripe" });
  const secret = process.env.STRIPE_WEBHOOK_SECRET?.trim();
  if (!secret) {
    log.error("Webhook received but STRIPE_WEBHOOK_SECRET is not configured");
    return NextResponse.json({ error: "Webhook is not configured" }, { status: 503 });
  }

  const payload = await request.text();
  if (!verifyStripeSignature(payload, request.headers.get("stripe-signature"), secret)) {
    log.warn("Webhook refused: invalid signature");
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
    log[result.handled ? "info" : "debug"]("Stripe event processed", { eventId: event.id, eventType: event.type, ...result });
    return NextResponse.json({ received: true, ...result });
  } catch (error) {
    log.error("Stripe event failed; Stripe will retry", { eventId: event.id, eventType: event.type, error });
    return NextResponse.json({ error: "Event could not be applied" }, { status: 500 });
  }
}

export const POST = withApiLog(route_POST);
