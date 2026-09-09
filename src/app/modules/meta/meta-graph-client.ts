import "server-only";
import { parsePublishingQuota } from "./instagram-publishing-access";

/**
 * Thin wrapper over the "Instagram API with Instagram Login" calls needed to
 * connect a topic's Instagram Business/Creator account: exchange the OAuth
 * code, extend the token, and resolve the account's username. Unlike the
 * older "Instagram API with Facebook Login", this flow authorizes the
 * Instagram account directly — no Facebook Page is involved. Publishing
 * calls are a later phase.
 */

export const GRAPH_API_VERSION = "v21.0";

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
export {
  parseInstagramMediaListResponse,
  type InstagramMediaNode,
  type InstagramMediaChildNode,
  type InstagramMediaListPage,
} from "./instagram-media-response";
import {
  parseInstagramMediaListResponse,
  type InstagramMediaListPage,
} from "./instagram-media-response";
import { assertInstagramInsightsShape } from "./instagram-insights-response";

const INSTAGRAM_MEDIA_FIELDS = [
  "id",
  "media_type",
  "media_product_type",
  "permalink",
  "caption",
  "timestamp",
  "media_url",
  "thumbnail_url",
  "children{id,media_type,media_url,thumbnail_url}",
].join(",");

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
 * A 200 with an empty or malformed body is NOT a pass — the response shape is
 * validated before returning. Throws MetaGraphApiError on any failure, which
 * the caller classifies via meta-verification.ts. IG-05 owns real metrics.
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
  assertInstagramInsightsShape(await instagramGet<unknown>(url));
}

/**
 * One page of the connected account's published media, newest first (IG-02).
 * Needs instagram_business_basic. `after` continues from a previous page's
 * cursor; the result's `nextCursor` is set only while more pages remain.
 * Throws MetaGraphApiError on any HTTP failure.
 */
export async function listInstagramMedia(
  igUserId: string,
  accessToken: string,
  options: { after?: string; limit?: number } = {},
): Promise<InstagramMediaListPage> {
  const limit = Math.min(Math.max(options.limit ?? 25, 1), 50);
  const url = new URL(
    `https://graph.instagram.com/${GRAPH_API_VERSION}/${igUserId}/media`,
  );
  url.searchParams.set("fields", INSTAGRAM_MEDIA_FIELDS);
  url.searchParams.set("limit", String(limit));
  if (options.after) url.searchParams.set("after", options.after);
  url.searchParams.set("access_token", accessToken);

  return parseInstagramMediaListResponse(await instagramGet<unknown>(url));
}

/**
 * Current insights for one published media (IG-05):
 * `GET /{ig-media-id}/insights?metric=<list>&metric_type=total_value`. Returns
 * the raw payload — `parseInstagramMediaInsights` validates and shapes it, and
 * the caller drops any metric named in a 400 and retries. Throws
 * MetaGraphApiError on any HTTP failure (with `.graphError` for classification).
 */
export async function fetchInstagramMediaInsights(
  mediaId: string,
  accessToken: string,
  metrics: readonly string[],
): Promise<unknown> {
  const url = new URL(
    `https://graph.instagram.com/${GRAPH_API_VERSION}/${mediaId}/insights`,
  );
  url.searchParams.set("metric", metrics.join(","));
  url.searchParams.set("metric_type", "total_value");
  url.searchParams.set("access_token", accessToken);
  return instagramGet<unknown>(url);
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

/** Read-only PUB-02 probe. Never creates a container or calls media_publish. */
export async function fetchInstagramPublishingQuota(igUserId: string, accessToken: string) {
  if (!/^[0-9]+$/.test(igUserId)) throw new MetaGraphApiError("Invalid Instagram account identity", 400);
  const url = new URL(`https://graph.instagram.com/${GRAPH_API_VERSION}/${igUserId}/content_publishing_limit`);
  url.searchParams.set("fields", "quota_usage,config");
  const response = await fetch(url, {
    method: "GET", cache: "no-store", redirect: "error",
    headers: { Authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(15_000),
  });
  return parsePublishingQuota(await handleInstagramResponse<unknown>(response));
}

// --- PUB-04 publish calls -------------------------------------------------
// The only writes in this file. Token goes in the Authorization header (like
// the quota probe), never the query string, so it cannot end up in a redirect
// Location or a proxy log. Every call is bounded by a timeout and throws
// MetaGraphApiError (with `.graphError` for classification) on any failure.

const IG_MEDIA_ID = /^[0-9]+$/;

async function instagramGraphPost<T>(
  path: string,
  accessToken: string,
  params: Record<string, string>,
): Promise<T> {
  const response = await fetch(
    `https://graph.instagram.com/${GRAPH_API_VERSION}/${path}`,
    {
      method: "POST",
      cache: "no-store",
      redirect: "error",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams(params),
      signal: AbortSignal.timeout(30_000),
    },
  );
  return handleInstagramResponse<T>(response);
}

async function instagramGraphGet<T>(
  path: string,
  accessToken: string,
  fields: string,
): Promise<T> {
  const url = new URL(`https://graph.instagram.com/${GRAPH_API_VERSION}/${path}`);
  url.searchParams.set("fields", fields);
  const response = await fetch(url, {
    method: "GET",
    cache: "no-store",
    redirect: "error",
    headers: { Authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(20_000),
  });
  return handleInstagramResponse<T>(response);
}

function requireCreationId(payload: { id?: unknown }, what: string): string {
  if (typeof payload.id !== "string" || !IG_MEDIA_ID.test(payload.id)) {
    throw new MetaGraphApiError(`Instagram did not return a ${what} id`, 502, payload);
  }
  return payload.id;
}

/**
 * Creates one media container. For a carousel child pass `isCarouselItem: true`
 * and no caption; for a single-image post pass the caption here. `imageUrl`
 * must be a public URL Instagram's servers can fetch (our `/api/deliver/<token>`
 * route). Returns the container's creation id.
 */
export async function createInstagramMediaContainer(
  igUserId: string,
  accessToken: string,
  input: { imageUrl: string; isCarouselItem?: boolean; caption?: string },
): Promise<string> {
  if (!IG_MEDIA_ID.test(igUserId)) {
    throw new MetaGraphApiError("Invalid Instagram account identity", 400);
  }
  const params: Record<string, string> = { image_url: input.imageUrl };
  if (input.isCarouselItem) params.is_carousel_item = "true";
  if (input.caption !== undefined) params.caption = input.caption;
  const payload = await instagramGraphPost<{ id?: unknown }>(
    `${igUserId}/media`,
    accessToken,
    params,
  );
  return requireCreationId(payload, "media container");
}

/**
 * Creates the parent CAROUSEL container from already-created child creation
 * ids (2–10, in order). The caption belongs on this container.
 */
export async function createInstagramCarouselContainer(
  igUserId: string,
  accessToken: string,
  input: { childrenIds: string[]; caption: string },
): Promise<string> {
  if (!IG_MEDIA_ID.test(igUserId)) {
    throw new MetaGraphApiError("Invalid Instagram account identity", 400);
  }
  const payload = await instagramGraphPost<{ id?: unknown }>(
    `${igUserId}/media`,
    accessToken,
    {
      media_type: "CAROUSEL",
      children: input.childrenIds.join(","),
      caption: input.caption,
    },
  );
  return requireCreationId(payload, "carousel container");
}

export type InstagramContainerStatus =
  | "EXPIRED"
  | "ERROR"
  | "FINISHED"
  | "IN_PROGRESS"
  | "PUBLISHED";

/** Polls a container's processing state before it can be published. */
export async function getInstagramContainerStatus(
  containerId: string,
  accessToken: string,
): Promise<InstagramContainerStatus> {
  if (!IG_MEDIA_ID.test(containerId)) {
    throw new MetaGraphApiError("Invalid Instagram container id", 400);
  }
  const payload = await instagramGraphGet<{ status_code?: unknown }>(
    containerId,
    accessToken,
    "status_code",
  );
  const code = payload.status_code;
  if (
    code === "EXPIRED" ||
    code === "ERROR" ||
    code === "FINISHED" ||
    code === "IN_PROGRESS" ||
    code === "PUBLISHED"
  ) {
    return code;
  }
  throw new MetaGraphApiError(
    "Instagram returned an unknown container status",
    502,
    payload,
  );
}

/** Publishes a FINISHED container. Returns the published media id. */
export async function publishInstagramContainer(
  igUserId: string,
  accessToken: string,
  creationId: string,
): Promise<string> {
  if (!IG_MEDIA_ID.test(igUserId)) {
    throw new MetaGraphApiError("Invalid Instagram account identity", 400);
  }
  if (!IG_MEDIA_ID.test(creationId)) {
    throw new MetaGraphApiError("Invalid Instagram container id", 400);
  }
  const payload = await instagramGraphPost<{ id?: unknown }>(
    `${igUserId}/media_publish`,
    accessToken,
    { creation_id: creationId },
  );
  return requireCreationId(payload, "published media");
}

/** Best-effort permalink + timestamp for a freshly published media. */
export async function fetchInstagramMediaPermalink(
  mediaId: string,
  accessToken: string,
): Promise<{ permalink?: string; timestamp?: string }> {
  if (!IG_MEDIA_ID.test(mediaId)) {
    throw new MetaGraphApiError("Invalid Instagram media id", 400);
  }
  const payload = await instagramGraphGet<{
    permalink?: unknown;
    timestamp?: unknown;
  }>(mediaId, accessToken, "permalink,timestamp");
  return {
    permalink: typeof payload.permalink === "string" ? payload.permalink : undefined,
    timestamp: typeof payload.timestamp === "string" ? payload.timestamp : undefined,
  };
}
