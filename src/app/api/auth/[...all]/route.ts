import { toNextJsHandler } from "better-auth/next-js";

import { auth } from "@/app/modules/auth/auth";
import { withApiLog } from "@/app/modules/observability/api-request-log";

/**
 * Better Auth owns every route under /api/auth: Google sign-in, its callback,
 * session reads, sign-out. It is deliberately not behind
 * authorizeRadarCollector; the library validates OAuth state, origins and
 * rate limits for its own endpoints.
 */
export const runtime = "nodejs";

const handlers = toNextJsHandler(auth);

// Logged like every route (status, timing); bodies and secrets of sign-in are never stored.
export const GET = withApiLog(handlers.GET);
export const POST = withApiLog(handlers.POST);
