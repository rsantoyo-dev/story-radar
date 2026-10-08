import { NextResponse } from "next/server";

import { requestAccess, requestIsOperator } from "@/app/api/radar/radar-api-auth";
import { createLogger } from "@/app/modules/observability/logger";
import type { ActivityScope } from "@/app/modules/observability/activity.repository";

const log = createLogger("activity");
export const NO_STORE = { "Cache-Control": "no-store" };

/** The caller's workspace; platform staff may ask for every workspace with `?scope=all`. */
export function activityScope(request: Request): ActivityScope {
  const all = new URL(request.url).searchParams.get("scope") === "all";
  return all && requestIsOperator(request) ? { all: true } : { workspaceId: requestAccess(request).workspaceId };
}

export function activityError(error: unknown, what: string): NextResponse {
  log.error(`Activity ${what} could not be read`, { error });
  return NextResponse.json({ error: `The ${what} are unavailable right now.` }, { status: 503, headers: NO_STORE });
}
