import { NextResponse } from "next/server";

import { authorizeRadarCollector, requestAccess, requestIsOperator } from "@/app/api/radar/radar-api-auth";
import { activityDirectory, activitySummary } from "@/app/modules/observability/activity.repository";
import { withApiLog } from "@/app/modules/observability/api-request-log";

import { activityError, activityScope, NO_STORE } from "../activity-route-utils";

/** Counts for the last 24 hours, the people and brands to filter by, and what the caller may do. */
async function route_GET(request: Request) {
  const unauthorized = await authorizeRadarCollector(request, "admin");
  if (unauthorized) return unauthorized;
  const access = requestAccess(request);
  const scope = activityScope(request);
  try {
    const [summary, directory] = await Promise.all([activitySummary(scope), activityDirectory(scope)]);
    return NextResponse.json({
      summary,
      ...directory,
      scope: "all" in scope ? "all" : "workspace",
      canPurge: access.role === "owner" || access.staff,
      canSeeAllWorkspaces: requestIsOperator(request),
    }, { headers: NO_STORE });
  } catch (error) {
    return activityError(error, "activity summary");
  }
}

export const GET = withApiLog(route_GET);
