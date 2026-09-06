/**
 * Parsing for Instagram's short-lived token exchange response. Split out of
 * meta-graph-client.ts (which needs "server-only" since it makes real HTTP
 * calls with secrets) so this pure parsing logic stays directly unit-
 * testable, the same split already used by meta-token-crypto.ts and
 * meta-oauth-state.ts in this module.
 */

export class MetaGraphApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly graphError?: unknown,
  ) {
    super(message);
  }
}

export type InstagramShortLivedToken = {
  accessToken: string;
  /** The connected Instagram Business/Creator account's own ID. */
  userId: string;
  /** OAuth scopes Instagram actually granted, not just what was requested. */
  grantedPermissions: string[];
};

/**
 * Handles both the flat shape this app observes in production
 * ({access_token, user_id, permissions}) and Meta's documented
 * {data:[{...}]}-wrapped shape defensively, since docs and observed
 * production behavior have disagreed on this before.
 */
export function parseInstagramShortLivedTokenResponse(
  payload: unknown,
): InstagramShortLivedToken {
  const entry = extractShortLivedEntry(payload);
  const accessToken = entry?.access_token;
  const userId = entry?.user_id;
  if (typeof accessToken !== "string" || !accessToken || userId === undefined) {
    throw new MetaGraphApiError(
      "Instagram token exchange response was missing access_token or user_id",
      200,
      redactAccessToken(entry, payload),
    );
  }
  return {
    accessToken,
    userId: String(userId),
    grantedPermissions: parsePermissionsField(entry?.permissions),
  };
}

/**
 * A malformed-response error is a diagnostic aid, not a real Graph error, but
 * the entry it inspects can still carry a genuine access_token (e.g. a
 * response with a token and no user_id). Never let that secret reach a log
 * line through error.graphError — blank it before attaching.
 */
function redactAccessToken(
  entry: { access_token?: unknown } | undefined,
  fallback: unknown,
): unknown {
  if (!entry || typeof entry.access_token !== "string") return fallback;
  return { ...entry, access_token: "[redacted]" };
}

function extractShortLivedEntry(payload: unknown):
  | { access_token?: unknown; user_id?: unknown; permissions?: unknown }
  | undefined {
  if (!payload || typeof payload !== "object") return undefined;
  const body = payload as Record<string, unknown>;
  if (Array.isArray(body.data) && body.data[0] && typeof body.data[0] === "object") {
    return body.data[0] as Record<string, unknown>;
  }
  return body;
}

function parsePermissionsField(value: unknown): string[] {
  if (typeof value !== "string" || !value.trim()) return [];
  return value
    .split(",")
    .map((permission) => permission.trim())
    .filter(Boolean);
}
