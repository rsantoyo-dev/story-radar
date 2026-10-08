import { NextResponse } from "next/server";

import { authorizeRadarCollector, requestAccess } from "@/app/api/radar/radar-api-auth";
import { CreditPackNotFoundError, startCreditCheckout } from "@/app/modules/billing/credit-purchases";
import { isStripeConfigured } from "@/app/modules/billing/stripe";
import { createLogger } from "@/app/modules/observability/logger";
import { withApiLog } from "@/app/modules/observability/api-request-log";

const log = createLogger("billing");

const NO_STORE = { "Cache-Control": "no-store" };

function appUrl(request: Request): string {
  return (process.env.RADAR_APP_URL?.trim() || process.env.BETTER_AUTH_URL?.trim() || new URL(request.url).origin).replace(/\/+$/u, "");
}

/** Starts a Stripe Checkout for one credit pack. Owners and admins only. */
async function route_POST(request: Request) {
  const unauthorized = await authorizeRadarCollector(request, "admin");
  if (unauthorized) return unauthorized;
  if (!isStripeConfigured()) {
    return NextResponse.json({ error: "Payments are not configured yet." }, { status: 503, headers: NO_STORE });
  }

  const body = await request.json().catch(() => null) as { priceId?: unknown } | null;
  const priceId = typeof body?.priceId === "string" ? body.priceId.trim() : "";
  if (!/^price_[A-Za-z0-9]{6,}$/u.test(priceId)) {
    return NextResponse.json({ error: "Choose a credit pack." }, { status: 400, headers: NO_STORE });
  }

  const access = requestAccess(request);
  try {
    const url = await startCreditCheckout({
      workspaceId: access.workspaceId,
      priceId,
      appUrl: appUrl(request),
      userId: access.kind === "member" ? access.user.id : undefined,
      email: access.kind === "member" ? access.user.email : undefined,
    });
    log.info("Credit checkout started", { priceId });
    return NextResponse.json({ url }, { headers: NO_STORE });
  } catch (error) {
    if (error instanceof CreditPackNotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 409, headers: NO_STORE });
    }
    log.error("Credit checkout could not start", { priceId, error });
    return NextResponse.json({ error: "The payment page could not be opened. Try again in a moment." }, { status: 502, headers: NO_STORE });
  }
}

export const POST = withApiLog(route_POST);
