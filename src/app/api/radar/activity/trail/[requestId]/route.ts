import { NextResponse } from "next/server";

import { authorizeRadarCollector } from "@/app/api/radar/radar-api-auth";
import { requestTrail } from "@/app/modules/observability/activity.repository";
import { withApiLog } from "@/app/modules/observability/api-request-log";

import { activityError, activityScope, NO_STORE } from "../../activity-route-utils";

type Context = { params: Promise<{ requestId: string }> };

/** Everything one request did: the request, its audit events and the data changed while it ran. */
async function route_GET(request: Request, context: Context) {
  const unauthorized = await authorizeRadarCollector(request, "admin");
  if (unauthorized) return unauthorized;
  const { requestId } = await context.params;
  const id = decodeURIComponent(requestId);
  if (!/^[A-Za-z0-9:._-]{1,128}$/u.test(id)) {
    return NextResponse.json({ error: "Invalid request id." }, { status: 400, headers: NO_STORE });
  }
  try {
    return NextResponse.json(await requestTrail(activityScope(request), id), { headers: NO_STORE });
  } catch (error) {
    return activityError(error, "request trail");
  }
}

export const GET = withApiLog(route_GET);
