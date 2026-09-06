import "server-only";

/**
 * Thin wrapper over the "Instagram API with Instagram Login" calls needed to
 * connect a topic's Instagram Business/Creator account: exchange the OAuth
 * code, extend the token, and resolve the account's username. Unlike the
 * older "Instagram API with Facebook Login", this flow authorizes the
 * Instagram account directly — no Facebook Page is involved. Publishing
 * calls are a later phase.
 */

const GRAPH_API_VERSION = "v21.0";

export {
  MetaGraphApiError,
  parseInstagramShortLivedTokenResponse,
  type InstagramShortLivedToken,
} from "./meta-token-response";
import {
  MetaGraphApiError,
  parseInstagramShortLivedTokenResponse,
  type InstagramShortLivedToken,
} from "./meta-token-response";

export type InstagramLongLivedToken = {
  accessToken: string;
  expiresIn: number;
};

export async function exchangeInstagramCodeForToken(input: {
  appId: string;
  appSecret: string;
  redirectUri: string;
  code: string;
}): Promise<InstagramShortLivedToken> {
  const body = new URLSearchParams({
    client_id: input.appId,
    client_secret: input.appSecret,
    grant_type: "authorization_code",
    redirect_uri: input.redirectUri,
    code: input.code,
  });

  const payload = await instagramPost<unknown>(
    "https://api.instagram.com/oauth/access_token",
    body,
  );
  return parseInstagramShortLivedTokenResponse(payload);
}

export async function exchangeForLongLivedInstagramToken(input: {
  appSecret: string;
  shortLivedToken: string;
}): Promise<InstagramLongLivedToken> {
  const url = new URL("https://graph.instagram.com/access_token");
  url.searchParams.set("grant_type", "ig_exchange_token");
  url.searchParams.set("client_secret", input.appSecret);
  url.searchParams.set("access_token", input.shortLivedToken);

  const payload = await instagramGet<{
    access_token: string;
    expires_in: number;
  }>(url);
  return { accessToken: payload.access_token, expiresIn: payload.expires_in };
}

/**
 * Instagram long-lived tokens (60-day validity) are refreshable once at
 * least 24h old and not yet expired; a successful refresh extends validity
 * another 60 days. See meta-token-refresh-policy.ts for the eligibility
 * check that gates when this is called.
 */
export async function refreshLongLivedInstagramToken(
  accessToken: string,
): Promise<InstagramLongLivedToken> {
  const url = new URL("https://graph.instagram.com/refresh_access_token");
  url.searchParams.set("grant_type", "ig_refresh_token");
  url.searchParams.set("access_token", accessToken);

  const payload = await instagramGet<{
    access_token: string;
    expires_in: number;
  }>(url);
  return { accessToken: payload.access_token, expiresIn: payload.expires_in };
}

/**
 * The minimal account-level (not media-level) insights read available under
 * "Instagram API with Instagram Login": needs no published post yet, and
 * only requires instagram_business_basic + instagram_business_manage_insights.
 * The response is discarded — only whether it throws matters here; IG-05
 * owns real metric consumption. Throws MetaGraphApiError on any failure,
 * which the caller classifies via meta-verification.ts.
 */
export async function verifyInstagramInsightsAccess(
  igUserId: string,
  accessToken: string,
): Promise<void> {
  const url = new URL(
    `https://graph.instagram.com/${GRAPH_API_VERSION}/${igUserId}/insights`,
  );
  url.searchParams.set("metric", "reach");
  url.searchParams.set("period", "day");
  url.searchParams.set("metric_type", "total_value");
  url.searchParams.set("access_token", accessToken);
  await instagramGet<unknown>(url);
}

export async function fetchInstagramUsername(
  igUserId: string,
  accessToken: string,
): Promise<string | undefined> {
  const url = new URL(
    `https://graph.instagram.com/${GRAPH_API_VERSION}/${igUserId}`,
  );
  url.searchParams.set("fields", "username");
  url.searchParams.set("access_token", accessToken);

  const payload = await instagramGet<{ username?: string }>(url);
  return payload.username;
}

async function instagramGet<T>(url: URL): Promise<T> {
  return handleInstagramResponse<T>(await fetch(url, { method: "GET" }));
}

async function instagramPost<T>(
  url: string,
  body: URLSearchParams,
): Promise<T> {
  return handleInstagramResponse<T>(
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    }),
  );
}

async function handleInstagramResponse<T>(response: Response): Promise<T> {
  const body = (await response.json().catch(() => undefined)) as
    | { error?: { message?: string }; error_message?: string }
    | T
    | undefined;

  if (!response.ok) {
    const errorBody = body as
      | { error?: { message?: string }; error_message?: string }
      | undefined;
    const message =
      errorBody?.error?.message ??
      errorBody?.error_message ??
      `Instagram API request failed (${response.status})`;
    throw new MetaGraphApiError(message, response.status, body);
  }

  return body as T;
}
