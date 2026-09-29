import { NextResponse } from "next/server";

import { authorizeRadarCollector } from "@/app/api/radar/radar-api-auth";
import { getDemoCreditAccount } from "@/app/modules/credits/demo-credit.repository";

export async function GET(request: Request) {
  const unauthorized = authorizeRadarCollector(request);
  if (unauthorized) return unauthorized;

  try {
    return NextResponse.json(await getDemoCreditAccount(), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error("Could not load demo credits", error);
    return NextResponse.json(
      { error: "Demo credits are unavailable. Check the credit migration." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
