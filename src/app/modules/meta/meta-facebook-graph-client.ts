import "server-only";

/**
 * Thin wrapper over the Facebook Login for Business calls needed to connect a
 * topic's Facebook Page (PUB-09): exchange the OAuth code, extend the token,
 * list the Pages the user manages, and resolve a selected Page's linked
 * Instagram Business Account. Mirrors meta-graph-client.ts's idioms against
 * graph.facebook.com instead of graph.instagram.com — this is a genuinely
 * separate product in the Meta console with its own App credentials (see
 * meta-integration.config.ts), never a reuse of the Instagram Login flow's
 * client_id/secret. The PUB-10 Page publish calls are at the end of this
 * file.
 */

export const FACEBOOK_GRAPH_VERSION = "v21.0";

export {
  MetaGraphApiError,
  parseFacebookAccountsListResponse,
  parseFacebookLongLivedTokenResponse,
  parseFacebookPageInstagramLink,
  parseFacebookPermissionsResponse,
  parseFacebookTokenResponse,
  type FacebookAccountsPage,
  type FacebookAccountsPageEntry,
  type FacebookLongLivedToken,
  type FacebookPermissionGrant,
  type FacebookShortLivedToken,
} from "./meta-facebook-token-response";
import {
  MetaGraphApiError,
  parseFacebookAccountsListResponse,
  parseFacebookLongLivedTokenResponse,
  parseFacebookPageInstagramLink,
  parseFacebookPermissionsResponse,
  parseFacebookTokenResponse,
  type FacebookAccountsPage,
  type FacebookLongLivedToken,
  type FacebookPermissionGrant,
  type FacebookShortLivedToken,
} from "./meta-facebook-token-response";

export async function exchangeFacebookCodeForToken(input: {
  appId: string;
  appSecret: string;
  redirectUri: string;
  code: string;
}): Promise<FacebookShortLivedToken> {
  const url = new URL(`https://graph.facebook.com/${FACEBOOK_GRAPH_VERSION}/oauth/access_token`);
  url.searchParams.set("client_id", input.appId);
  url.searchParams.set("client_secret", input.appSecret);
  url.searchParams.set("redirect_uri", input.redirectUri);
  url.searchParams.set("code", input.code);
  return parseFacebookTokenResponse(await facebookGet<unknown>(url));
}

export async function exchangeForLongLivedFacebookToken(input: {
  appId: string;
  appSecret: string;
  shortLivedToken: string;
}): Promise<FacebookLongLivedToken> {
  const url = new URL(`https://graph.facebook.com/${FACEBOOK_GRAPH_VERSION}/oauth/access_token`);
  url.searchParams.set("grant_type", "fb_exchange_token");
  url.searchParams.set("client_id", input.appId);
  url.searchParams.set("client_secret", input.appSecret);
  url.searchParams.set("fb_exchange_token", input.shortLivedToken);
  return parseFacebookLongLivedTokenResponse(await facebookGet<unknown>(url));
}

/**
 * One page of the Pages this user manages (PUB-09: "listar páginas accesibles
 * con paginación"). Each entry already includes its own Page access token —
 * Facebook returns it directly in this response, unlike Instagram Login's
 * separate per-account token exchange.
 */
export async function listManagedFacebookPages(
  userAccessToken: string,
  options: { after?: string; limit?: number } = {},
): Promise<FacebookAccountsPage> {
  const limit = Math.min(Math.max(options.limit ?? 25, 1), 100);
  const url = new URL(`https://graph.facebook.com/${FACEBOOK_GRAPH_VERSION}/me/accounts`);
  url.searchParams.set("fields", "id,name,access_token,tasks");
  url.searchParams.set("limit", String(limit));
  if (options.after) url.searchParams.set("after", options.after);
  const response = await fetch(url, {
    method: "GET",
    cache: "no-store",
    redirect: "error",
    headers: { Authorization: `Bearer ${userAccessToken}` },
    signal: AbortSignal.timeout(20_000),
  });
  return parseFacebookAccountsListResponse(await handleFacebookResponse<unknown>(response));
}

/** Which scopes the user actually granted or declined — used to explain an empty Page list. */
export async function fetchFacebookGrantedPermissions(
  userAccessToken: string,
): Promise<FacebookPermissionGrant[]> {
  return parseFacebookPermissionsResponse(
    await facebookGraphGet<unknown>("me/permissions", userAccessToken, "permission,status"),
  );
}

/**
 * What a user token actually covers, per scope and per target — e.g. which
 * Page ids pages_show_list was granted for. Uses the app access token
 * ("appId|appSecret"), so it never needs a second user round-trip. Only used
 * to explain an empty Page list; returns scope names and ids, never tokens.
 */
export async function fetchFacebookGranularScopes(input: {
  userAccessToken: string;
  appId: string;
  appSecret: string;
}): Promise<{ scope: string; targetIds: string[] }[]> {
  const url = new URL(`https://graph.facebook.com/${FACEBOOK_GRAPH_VERSION}/debug_token`);
  url.searchParams.set("input_token", input.userAccessToken);
  const response = await fetch(url, {
    method: "GET",
    cache: "no-store",
    redirect: "error",
    headers: { Authorization: `Bearer ${input.appId}|${input.appSecret}` },
    signal: AbortSignal.timeout(20_000),
  });
  const payload = await handleFacebookResponse<{
    data?: { granular_scopes?: { scope?: unknown; target_ids?: unknown }[] };
  }>(response);
  return (payload.data?.granular_scopes ?? []).flatMap((entry) =>
    typeof entry.scope === "string"
      ? [{
          scope: entry.scope,
          targetIds: Array.isArray(entry.target_ids)
            ? entry.target_ids.filter((id): id is string => typeof id === "string")
            : [],
        }]
      : [],
  );
}

/** Discovers a linked Instagram Business Account off a Page, using the Page's own access token. */
export async function getFacebookPageInstagramLink(
  pageId: string,
  pageAccessToken: string,
): Promise<{ igUserId?: string }> {
  return parseFacebookPageInstagramLink(
    await facebookGraphGet<unknown>(pageId, pageAccessToken, "instagram_business_account"),
  );
}

/** Username for a Page's linked Instagram Business Account, using the Page's own token. */
export async function fetchLinkedInstagramUsername(
  igUserId: string,
  pageAccessToken: string,
): Promise<string | undefined> {
  const payload = await facebookGraphGet<{ username?: unknown }>(igUserId, pageAccessToken, "username");
  return typeof payload.username === "string" ? payload.username : undefined;
}

/**
 * Live re-check that a stored Page token still works for its Page. Used by
 * the Facebook verify route and the confirm step's best-effort auto-verify.
 * Read-only: never creates or posts anything, same as Instagram's PUB-02
 * quota probe. `tasks` is not a field on the Page node (it only exists on
 * /me/accounts entries), so tasks stay as recorded at connect time.
 */
export async function verifyFacebookPageAccess(
  pageId: string,
  pageAccessToken: string,
): Promise<{ pageName?: string }> {
  const payload = await facebookGraphGet<{ id?: unknown; name?: unknown }>(pageId, pageAccessToken, "id,name");
  if (payload.id !== pageId) {
    throw new MetaGraphApiError("Facebook returned a different Page for this token", 502, payload);
  }
  return typeof payload.name === "string" ? { pageName: payload.name } : {};
}

// --- PUB-10 Facebook Page publish calls -----------------------------------
// A multi-image Page post is built from photos uploaded with published=false,
// then attached to ONE feed post. Nothing appears on the Page until that post
// is created, so an interrupted run never leaves loose photos published.

const FACEBOOK_NUMERIC_ID = /^[0-9]+$/;
/** Page post ids are "<pageId>_<postId>"; a bare numeric id is also accepted. */
const FACEBOOK_POST_ID = /^[0-9]+(?:_[0-9]+)?$/;

function requireFacebookId(payload: { id?: unknown }, pattern: RegExp, what: string): string {
  if (typeof payload.id !== "string" || !pattern.test(payload.id)) {
    throw new MetaGraphApiError(`Facebook did not return a ${what} id`, 502, payload);
  }
  return payload.id;
}

/** Uploads one image to the Page without publishing it. Returns the photo id. */
export async function uploadUnpublishedPagePhoto(
  pageId: string,
  pageAccessToken: string,
  imageUrl: string,
): Promise<string> {
  if (!FACEBOOK_NUMERIC_ID.test(pageId)) throw new MetaGraphApiError("Invalid Facebook Page identity", 400);
  const payload = await facebookGraphPost<{ id?: unknown }>(`${pageId}/photos`, pageAccessToken, {
    url: imageUrl,
    published: "false",
  });
  return requireFacebookId(payload, FACEBOOK_NUMERIC_ID, "photo");
}

/** Creates the single Page feed post carrying the already-uploaded photos, in order. */
export async function publishPagePhotoPost(
  pageId: string,
  pageAccessToken: string,
  input: { message: string; photoIds: string[] },
): Promise<string> {
  if (!FACEBOOK_NUMERIC_ID.test(pageId)) throw new MetaGraphApiError("Invalid Facebook Page identity", 400);
  if (!input.photoIds.length || input.photoIds.some((id) => !FACEBOOK_NUMERIC_ID.test(id))) {
    throw new MetaGraphApiError("Invalid Facebook photo ids", 400);
  }
  const params: Record<string, string> = { message: input.message };
  input.photoIds.forEach((id, index) => {
    params[`attached_media[${index}]`] = JSON.stringify({ media_fbid: id });
  });
  const payload = await facebookGraphPost<{ id?: unknown }>(`${pageId}/feed`, pageAccessToken, params);
  return requireFacebookId(payload, FACEBOOK_POST_ID, "post");
}

/** Best-effort permalink + creation time for a freshly published Page post. */
export async function fetchPagePostPermalink(
  postId: string,
  pageAccessToken: string,
): Promise<{ permalink?: string; timestamp?: string }> {
  if (!FACEBOOK_POST_ID.test(postId)) throw new MetaGraphApiError("Invalid Facebook post id", 400);
  const payload = await facebookGraphGet<{ permalink_url?: unknown; created_time?: unknown }>(
    postId,
    pageAccessToken,
    "permalink_url,created_time",
  );
  return {
    permalink: typeof payload.permalink_url === "string" ? payload.permalink_url : undefined,
    timestamp: typeof payload.created_time === "string" ? payload.created_time : undefined,
  };
}

async function facebookGraphPost<T>(
  path: string,
  accessToken: string,
  params: Record<string, string>,
): Promise<T> {
  const response = await fetch(`https://graph.facebook.com/${FACEBOOK_GRAPH_VERSION}/${path}`, {
    method: "POST",
    cache: "no-store",
    redirect: "error",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams(params),
    signal: AbortSignal.timeout(30_000),
  });
  return handleFacebookResponse<T>(response);
}

async function facebookGet<T>(url: URL): Promise<T> {
  return handleFacebookResponse<T>(
    await fetch(url, {
      method: "GET",
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(20_000),
    }),
  );
}

async function facebookGraphGet<T>(
  pageOrUserId: string,
  accessToken: string,
  fields: string,
): Promise<T> {
  const url = new URL(`https://graph.facebook.com/${FACEBOOK_GRAPH_VERSION}/${pageOrUserId}`);
  url.searchParams.set("fields", fields);
  const response = await fetch(url, {
    method: "GET",
    cache: "no-store",
    redirect: "error",
    headers: { Authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(20_000),
  });
  return handleFacebookResponse<T>(response);
}

async function handleFacebookResponse<T>(response: Response): Promise<T> {
  const body = (await response.json().catch(() => undefined)) as
    | { error?: { message?: string } }
    | T
    | undefined;

  if (!response.ok) {
    const errorBody = body as { error?: { message?: string } } | undefined;
    const message = errorBody?.error?.message ?? `Facebook API request failed (${response.status})`;
    throw new MetaGraphApiError(message, response.status, body);
  }

  return body as T;
}
