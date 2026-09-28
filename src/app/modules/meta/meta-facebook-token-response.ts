/**
 * Parsing for the Facebook Login for Business flow's responses. Split out of
 * meta-facebook-graph-client.ts (which needs "server-only" since it makes
 * real HTTP calls with secrets) so this pure parsing logic stays directly
 * unit-testable — the same split meta-token-response.ts already uses for the
 * Instagram Login flow. Reuses that file's MetaGraphApiError: the envelope
 * Facebook and Instagram Login errors arrive in is the same
 * {error:{message,...}} shape, only the parsed success bodies differ.
 */

import { MetaGraphApiError } from "./meta-token-response";

export { MetaGraphApiError };

/** The code exchange and the long-lived exchange share this exact response shape. */
export type FacebookTokenExchange = {
  accessToken: string;
  /** Absent when Facebook issues a token that does not expire. */
  expiresIn?: number;
};
export type FacebookShortLivedToken = FacebookTokenExchange;
export type FacebookLongLivedToken = FacebookTokenExchange;

export function parseFacebookTokenResponse(payload: unknown): FacebookTokenExchange {
  if (!payload || typeof payload !== "object") {
    throw new MetaGraphApiError(
      "Facebook token exchange response was not an object",
      200,
      payload,
    );
  }
  const body = payload as { access_token?: unknown; expires_in?: unknown };
  if (typeof body.access_token !== "string" || !body.access_token) {
    throw new MetaGraphApiError(
      "Facebook token exchange response was missing access_token",
      200,
      redactAccessToken(body),
    );
  }
  return {
    accessToken: body.access_token,
    ...(typeof body.expires_in === "number" ? { expiresIn: body.expires_in } : {}),
  };
}

/**
 * Parses the long-lived exchange. expires_in is optional: Facebook omits it
 * when the resulting token does not expire (e.g. when the user already held
 * a non-expiring token for this app), so its absence means "no expiry".
 */
export function parseFacebookLongLivedTokenResponse(payload: unknown): FacebookLongLivedToken {
  return parseFacebookTokenResponse(payload);
}

export type FacebookAccountsPageEntry = {
  pageId: string;
  pageName: string;
  pageAccessToken: string;
  /** e.g. "MANAGE", "CREATE_CONTENT" — the tasks Facebook reports the user holds on this Page. */
  tasks: string[];
};
export type FacebookAccountsPage = {
  entries: FacebookAccountsPageEntry[];
  nextCursor?: string;
};

/** Parses one page of GET /me/accounts — each entry already carries its own Page access token. */
export function parseFacebookAccountsListResponse(payload: unknown): FacebookAccountsPage {
  if (!payload || typeof payload !== "object") {
    throw new MetaGraphApiError(
      "Facebook accounts list response was not an object",
      200,
      payload,
    );
  }
  const body = payload as {
    data?: unknown;
    paging?: { cursors?: { after?: unknown } };
  };
  if (!Array.isArray(body.data)) {
    throw new MetaGraphApiError(
      "Facebook accounts list response was missing data",
      200,
      payload,
    );
  }
  const entries = body.data.map((raw, index) => parseAccountsEntry(raw, index));
  const after = body.paging?.cursors?.after;
  return {
    entries,
    ...(typeof after === "string" && after ? { nextCursor: after } : {}),
  };
}

function parseAccountsEntry(raw: unknown, index: number): FacebookAccountsPageEntry {
  if (!raw || typeof raw !== "object") {
    throw new MetaGraphApiError(
      `Facebook accounts list entry ${index} was not an object`,
      200,
      raw,
    );
  }
  const entry = raw as {
    id?: unknown;
    name?: unknown;
    access_token?: unknown;
    tasks?: unknown;
  };
  if (
    typeof entry.id !== "string" ||
    !entry.id ||
    typeof entry.name !== "string" ||
    typeof entry.access_token !== "string" ||
    !entry.access_token
  ) {
    throw new MetaGraphApiError(
      `Facebook accounts list entry ${index} was missing id, name, or access_token`,
      200,
      redactAccessToken(entry),
    );
  }
  const tasks = Array.isArray(entry.tasks)
    ? entry.tasks.filter((task): task is string => typeof task === "string")
    : [];
  return { pageId: entry.id, pageName: entry.name, pageAccessToken: entry.access_token, tasks };
}

export type FacebookPermissionGrant = { permission: string; status: string };

/** Parses GET /me/permissions: which scopes the user actually granted or declined. */
export function parseFacebookPermissionsResponse(payload: unknown): FacebookPermissionGrant[] {
  if (!payload || typeof payload !== "object") return [];
  const data = (payload as { data?: unknown }).data;
  if (!Array.isArray(data)) return [];
  return data.flatMap((entry) => {
    const item = entry as { permission?: unknown; status?: unknown };
    return typeof item?.permission === "string" && typeof item.status === "string"
      ? [{ permission: item.permission, status: item.status }]
      : [];
  });
}

/** Parses GET /{page-id}?fields=instagram_business_account. Absence is not an error — most Pages have no linked account. */
export function parseFacebookPageInstagramLink(payload: unknown): { igUserId?: string } {
  if (!payload || typeof payload !== "object") return {};
  const body = payload as { instagram_business_account?: { id?: unknown } };
  const igUserId = body.instagram_business_account?.id;
  return typeof igUserId === "string" && igUserId ? { igUserId } : {};
}

/**
 * A malformed-response error is a diagnostic aid, not a real Graph error, but
 * the entry it inspects can still carry a genuine access_token. Never let
 * that secret reach a log line through error.graphError — blank it first,
 * same convention as meta-token-response.ts's redactAccessToken.
 */
function redactAccessToken(entry: { access_token?: unknown } | undefined): unknown {
  if (!entry || typeof entry.access_token !== "string") return entry;
  return { ...entry, access_token: "[redacted]" };
}
