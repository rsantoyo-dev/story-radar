import { NextResponse } from "next/server";

import { authorizeRadarCollector, requestAccess } from "@/app/api/radar/radar-api-auth";
import { hasRole } from "@/app/modules/auth/access.core";
import { listCreditPacks, listWorkspacePurchases } from "@/app/modules/billing/credit-purchases";
import { isStripeConfigured, stripeLivemode } from "@/app/modules/billing/stripe";

const NO_STORE = { "Cache-Control": "no-store" };

/** The credit packs for sale and the workspace's recent purchases. Owners and admins may buy. */
export async function GET(request: Request) {
  const unauthorized = await authorizeRadarCollector(request);
  if (unauthorized) return unauthorized;
  const access = requestAccess(request);
  const canBuy = hasRole(access.role, "admin") || access.staff;

  if (!isStripeConfigured()) {
    return NextResponse.json({ configured: false, livemode: false, canBuy, packs: [], purchases: [] }, { headers: NO_STORE });
  }
  try {
    const [packs, purchases] = await Promise.all([listCreditPacks(), listWorkspacePurchases(access.workspaceId)]);
    return NextResponse.json({ configured: true, livemode: stripeLivemode(), canBuy, packs, purchases }, { headers: NO_STORE });
  } catch (error) {
    console.error("Could not load credit packs", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "Credit packs are unavailable right now." }, { status: 503, headers: NO_STORE });
  }
}
