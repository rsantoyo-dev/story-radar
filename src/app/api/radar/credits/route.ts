import { NextResponse } from "next/server";

import { authorizeRadarCollector, requestIsOperator, requestWorkspaceId } from "@/app/api/radar/radar-api-auth";
import { getDemoCreditAccount } from "@/app/modules/credits/demo-credit.repository";

export async function GET(request: Request) {
  const unauthorized = await authorizeRadarCollector(request);
  if (unauthorized) return unauthorized;

  try {
    // The platform operator may reset the demo balance; a workspace never resets its own credits.
    return NextResponse.json({ ...await getDemoCreditAccount(requestWorkspaceId(request)), canReset: requestIsOperator(request) }, {
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
