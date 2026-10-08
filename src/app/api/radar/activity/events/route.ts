import { NextResponse } from "next/server";

import { authorizeRadarCollector } from "@/app/api/radar/radar-api-auth";
import { parseActivityFilters } from "@/app/modules/observability/activity.core";
import { listAuditEvents } from "@/app/modules/observability/activity.repository";
import { withApiLog } from "@/app/modules/observability/api-request-log";

import { activityError, activityScope, NO_STORE } from "../activity-route-utils";

/** The audit trail (actions), filtered (owners and admins). Never deleted. */
async function route_GET(request: Request) {
  const unauthorized = await authorizeRadarCollector(request, "admin");
  if (unauthorized) return unauthorized;
  try {
    const result = await listAuditEvents(activityScope(request), parseActivityFilters(new URL(request.url).searchParams));
    return NextResponse.json(result, { headers: NO_STORE });
  } catch (error) {
    return activityError(error, "audit events");
  }
}

export const GET = withApiLog(route_GET);
