import { NextResponse } from "next/server";

import { authorizeRadarCollector, requestWorkspaceId } from "@/app/api/radar/radar-api-auth";
import { getSpendingReport, type SpendingPeriod } from "@/app/modules/credits/spending.repository";
import { withApiLog } from "@/app/modules/observability/api-request-log";

const PERIODS: readonly SpendingPeriod[] = ["reset", "7d", "30d", "all"];
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function route_GET(request: Request) {
  const unauthorized = await authorizeRadarCollector(request);
  if (unauthorized) return unauthorized;

  const params = new URL(request.url).searchParams;
  const period = PERIODS.find((value) => value === params.get("period")) ?? "reset";
  const topicParam = params.get("topicId");
  const topicId = topicParam && UUID_PATTERN.test(topicParam) ? topicParam : null;
  const offset = Number(params.get("offset") ?? 0);

  try {
    return NextResponse.json(await getSpendingReport({ workspaceId: requestWorkspaceId(request), period, topicId, offset: Number.isFinite(offset) ? offset : 0 }), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error("Could not load the spending report", error);
    return NextResponse.json({ error: "Spending is unavailable right now." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}

export const GET = withApiLog(route_GET);
