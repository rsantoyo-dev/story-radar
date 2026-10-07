import { timingSafeEqual } from "node:crypto";

import { annotateLogContext, createLogger, enterRequestLogContext } from "@/app/modules/observability/logger";

const log = createLogger("worker-auth");

/** Dedicated server credential, separate from the editor's browser credential. */
export function authorizePublicationWorker(request: Request, configuredSecret: string | undefined): 200 | 401 | 503 {
  enterRequestLogContext(request);
  annotateLogContext({ actor: "worker" });
  const secret = configuredSecret?.trim();
  if (!secret) {
    log.error("Worker request refused: its secret is not configured");
    return 503;
  }
  const actual = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  const authorized = actual.length === expected.length && timingSafeEqual(actual, expected);
  if (!authorized) log.warn("Worker request refused: wrong credential");
  return authorized ? 200 : 401;
}
