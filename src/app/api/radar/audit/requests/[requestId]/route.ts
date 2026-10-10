import { NextResponse } from "next/server";

import { authorizeRadarCollector, requestAccess } from "@/app/api/radar/radar-api-auth";
import { REQUEST_ID } from "@/app/modules/observability/activity.core";
import { readRequestTrace } from "@/app/modules/observability/request-trace";

const NO_STORE = { "Cache-Control": "no-store" };

type Context = { params: Promise<{ requestId: string }> };

/**
 * One API request replayed for debugging (owners and admins): its audit
 * events and logged problems, plus the record changes and AI calls matched to
 * its time window. Platform staff may pass `scope=all` for any workspace.
 */
export async function GET(request: Request, context: Context) {
  const unauthorized = await authorizeRadarCollector(request, "admin");
  if (unauthorized) return unauthorized;
  const requestId = decodeURIComponent((await context.params).requestId);
  if (!REQUEST_ID.test(requestId)) return NextResponse.json({ error: "Unknown request id." }, { status: 400, headers: NO_STORE });
  const access = requestAccess(request);
  const allWorkspaces = access.staff && new URL(request.url).searchParams.get("scope") === "all";

  try {
    const trace = await readRequestTrace({ requestId, workspaceId: access.workspaceId, allWorkspaces });
    if (!trace) return NextResponse.json({ error: "No activity was recorded for this request in your workspace." }, { status: 404, headers: NO_STORE });
    return NextResponse.json(trace, { headers: NO_STORE });
  } catch (error) {
    console.error("Request trace could not be read", error);
    return NextResponse.json({ error: "The request trace is unavailable right now." }, { status: 503, headers: NO_STORE });
  }
}
