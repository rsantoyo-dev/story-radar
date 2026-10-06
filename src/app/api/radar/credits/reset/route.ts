import { NextResponse } from "next/server";

import { authorizeRadarCollector } from "@/app/api/radar/radar-api-auth";
import { DemoCreditResetBlockedError, resetDemoCredits } from "@/app/modules/credits/spending.repository";

const KEY_PATTERN = /^demo_reset:[A-Za-z0-9-]{8,64}$/;

/**
 * Restores the demo balance to 1,000 credits. Past activity stays in the
 * ledger; only the current period restarts. The client sends one key per
 * click so a retried request cannot post a second reset.
 */
export async function POST(request: Request) {
  const unauthorized = authorizeRadarCollector(request);
  if (unauthorized) return unauthorized;

  const body = await request.json().catch(() => null) as { key?: unknown; reason?: unknown } | null;
  const key = typeof body?.key === "string" ? body.key.trim() : "";
  if (!KEY_PATTERN.test(key)) {
    return NextResponse.json({ error: "A reset key is required." }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }
  const reason = typeof body?.reason === "string" && body.reason.trim() ? body.reason.trim().slice(0, 200) : "Reset from the dashboard";

  try {
    const balanceMicros = await resetDemoCredits(key, reason);
    return NextResponse.json({ balanceMicros }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof DemoCreditResetBlockedError) {
      return NextResponse.json({ error: error.message }, { status: 409, headers: { "Cache-Control": "no-store" } });
    }
    console.error("Could not reset demo credits", error);
    return NextResponse.json({ error: "The demo balance could not be reset." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
