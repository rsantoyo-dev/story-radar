import { NextResponse } from "next/server";

import { authorizeRadarCollector, requestAccess } from "@/app/api/radar/radar-api-auth";
import { parseActivityFilters } from "@/app/modules/observability/activity.core";
import { listRequestLogs, purgeRequestLogs } from "@/app/modules/observability/activity.repository";
import { withApiLog } from "@/app/modules/observability/api-request-log";
import { recordAuditEvent } from "@/app/modules/observability/audit";

import { activityError, activityScope, NO_STORE } from "../activity-route-utils";

/** API requests with their responses, filtered (owners and admins). */
async function route_GET(request: Request) {
  const unauthorized = await authorizeRadarCollector(request, "admin");
  if (unauthorized) return unauthorized;
  try {
    const result = await listRequestLogs(activityScope(request), parseActivityFilters(new URL(request.url).searchParams));
    return NextResponse.json(result, { headers: NO_STORE });
  } catch (error) {
    return activityError(error, "API requests");
  }
}

/**
 * Deletes the request logs matching the same filters (owners, or platform
 * staff). The purge itself is recorded in the audit trail, which is never
 * deleted.
 */
async function route_DELETE(request: Request) {
  const unauthorized = await authorizeRadarCollector(request, "admin");
  if (unauthorized) return unauthorized;
  const access = requestAccess(request);
  if (access.role !== "owner" && !access.staff) {
    return NextResponse.json({ error: "Only the workspace owner can delete request logs." }, { status: 403, headers: NO_STORE });
  }
  if (request.headers.get("x-confirm") !== "DELETE") {
    return NextResponse.json({ error: 'Header "X-Confirm: DELETE" is required.' }, { status: 400, headers: NO_STORE });
  }
  const params = new URL(request.url).searchParams;
  const filters = parseActivityFilters(params, { limit: 1 });
  const scope = activityScope(request);
  if ("all" in scope && !filters.to && !filters.before) {
    return NextResponse.json({ error: "Across workspaces, a purge needs an end date (to or before)." }, { status: 400, headers: NO_STORE });
  }
  try {
    const deleted = await purgeRequestLogs(scope, filters);
    await recordAuditEvent({
      action: "activity.request_logs.purged", entityType: "api_request_log",
      details: { deleted, scope: "all" in scope ? "all" : "workspace", filters: Object.fromEntries(params) },
    });
    return NextResponse.json({ deleted }, { headers: NO_STORE });
  } catch (error) {
    return activityError(error, "API requests");
  }
}

export const GET = withApiLog(route_GET);
export const DELETE = withApiLog(route_DELETE);
