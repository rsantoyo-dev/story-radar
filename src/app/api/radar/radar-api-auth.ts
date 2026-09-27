import { NextResponse } from "next/server";
import { getAuth } from "@/app/modules/auth/auth";
import { WorkspaceAccessError, workspaceContextForSession } from "@/app/modules/auth/session-context";
import { decideRadarAuthorization } from "./radar-auth-decision";

/** Handler-level authorization. AUTH-05 will switch existing routes to this async API. */
export async function authorizeRadarRequest(request: Request) {
  const secret = process.env.RADAR_COLLECTOR_SECRET?.trim();
  const validBearer = Boolean(secret && request.headers.get("authorization") === `Bearer ${secret}`);
  let context: { actor: string; workspaceId: string; role: string } | null = null;
  if (!validBearer) {
    try {
      const session = await getAuth().api.getSession({ headers: request.headers });
      context = await workspaceContextForSession(session);
    } catch (error) {
      if (!(error instanceof WorkspaceAccessError) || error.status !== 401) {
        if (error instanceof WorkspaceAccessError) return NextResponse.json({ error: error.message }, { status: error.status });
        throw error;
      }
    }
  }
  const appUrl = process.env.RADAR_APP_URL;
  let appOrigin: string | null = null;
  try { if (appUrl) appOrigin = new URL(appUrl).origin; } catch { /* mutation denied below */ }
  const decision = decideRadarAuthorization({
    method: request.method, origin: request.headers.get("origin"),
    fetchSite: request.headers.get("sec-fetch-site"), appOrigin,
    validBearer, session: context,
  });
  if (decision.status !== 200) return NextResponse.json({
    error: decision.status === 401 ? "Unauthorized" : "Forbidden",
  }, { status: decision.status });
  return decision;
}

/** @deprecated Existing handlers retain this during the AUTH-05 transition. */
export function authorizeRadarCollector(
  request: Request,
): NextResponse | undefined {
  const configuredSecret = process.env.RADAR_COLLECTOR_SECRET?.trim();

  if (!configuredSecret) {
    return NextResponse.json(
      {
        error: "RADAR_COLLECTOR_SECRET is not configured",
      },
      {
        status: 503,
      },
    );
  }

  const authorization = request.headers.get("authorization");

  if (authorization !== `Bearer ${configuredSecret}`) {
    return NextResponse.json(
      {
        error: "Unauthorized",
      },
      {
        status: 401,
        headers: {
          "WWW-Authenticate": "Bearer",
        },
      },
    );
  }

  return undefined;
}
