import { timingSafeEqual } from "node:crypto";

/** Dedicated server credential, separate from the editor's browser credential. */
export function authorizePublicationWorker(request: Request, configuredSecret: string | undefined): 200 | 401 | 503 {
  const secret = configuredSecret?.trim();
  if (!secret) return 503;
  const actual = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  return actual.length === expected.length && timingSafeEqual(actual, expected) ? 200 : 401;
}
