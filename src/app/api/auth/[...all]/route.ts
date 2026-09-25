import { toNextJsHandler } from "better-auth/next-js";

import { auth } from "@/app/modules/auth/auth";

/**
 * Better Auth owns every route under /api/auth: Google sign-in, its callback,
 * session reads, sign-out. It is deliberately not behind
 * authorizeRadarCollector; the library validates OAuth state, origins and
 * rate limits for its own endpoints.
 */
export const runtime = "nodejs";

export const { GET, POST } = toNextJsHandler(auth);
