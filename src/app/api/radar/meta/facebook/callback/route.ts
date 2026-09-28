import { NextResponse } from "next/server";

import {
  exchangeFacebookCodeForToken,
  exchangeForLongLivedFacebookToken,
  fetchFacebookGrantedPermissions,
  fetchFacebookGranularScopes,
  fetchLinkedInstagramUsername,
  getFacebookPageInstagramLink,
  listManagedFacebookPages,
  MetaGraphApiError,
  type FacebookAccountsPageEntry,
  type FacebookPermissionGrant,
} from "@/app/modules/meta/meta-facebook-graph-client";
import {
  createPendingFacebookSelection,
  type StoredFacebookPage,
} from "@/app/modules/meta/meta-facebook-oauth-selections.repository";
import {
  getMetaFacebookOAuthRedirectUri,
  metaFacebookConnectReturnUrl,
  requireMetaStateSecretFromEnv,
} from "@/app/modules/meta/meta-integration.config";
import { consumeMetaOAuthAttempt } from "@/app/modules/meta/meta-oauth-attempts.repository";
import { verifyMetaOAuthState } from "@/app/modules/meta/meta-oauth-state";
import { getEffectiveMetaFacebookAppCredentials } from "@/app/modules/meta/topic-facebook-connections.repository";

export const runtime = "nodejs";

/** Bounds how many /me/accounts pages are read (25 each) before offering the picker. */
const MAX_ACCOUNT_PAGES = 4;

/**
 * Facebook redirects the browser here after the Facebook Login for Business
 * dialog (PUB-09). Like the Instagram callback, the topic and authenticity
 * come only from the signed, single-use `state`. Unlike it, nothing is
 * connected yet: the Pages the user manages are stored server-side and the
 * editor is sent back to choose one explicitly.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const state = url.searchParams.get("state");
  const code = url.searchParams.get("code");
  const dialogError = url.searchParams.get("error_description")
    ?? url.searchParams.get("error_message")
    ?? url.searchParams.get("error");

  let topicId: string | undefined;
  try {
    const payload = state
      ? verifyMetaOAuthState(state, requireMetaStateSecretFromEnv())
      : undefined;
    if (!payload || payload.mechanism !== "facebook") {
      return NextResponse.redirect(
        genericFailureRedirect("The Facebook connection request expired or was invalid; try connecting again."),
      );
    }
    topicId = payload.topicId;
    const consumed = await consumeMetaOAuthAttempt({
      nonce: payload.nonce,
      topicId,
      mechanism: "facebook",
      now: new Date(),
    });
    if (!consumed) {
      return NextResponse.redirect(
        metaFacebookConnectReturnUrl(topicId, {
          error: "This connection attempt already completed or expired; try connecting again.",
        }),
      );
    }
    if (dialogError) throw new Error(dialogError);
    if (!code) throw new Error("Facebook did not return an authorization code");

    const { appId, appSecret } = await getEffectiveMetaFacebookAppCredentials(topicId);
    const shortLived = await exchangeFacebookCodeForToken({
      appId,
      appSecret,
      redirectUri: getMetaFacebookOAuthRedirectUri(),
      code,
    });
    // Page tokens obtained with a long-lived user token do not expire, so the
    // stored Page connection needs no refresh job.
    const longLived = await exchangeForLongLivedFacebookToken({
      appId,
      appSecret,
      shortLivedToken: shortLived.accessToken,
    });

    const entries: FacebookAccountsPageEntry[] = [];
    let after: string | undefined;
    for (let page = 0; page < MAX_ACCOUNT_PAGES; page++) {
      const result = await listManagedFacebookPages(longLived.accessToken, { after });
      entries.push(...result.entries);
      after = result.nextCursor;
      if (!after) break;
    }
    if (!entries.length) {
      const [grants, granular] = await Promise.all([
        fetchFacebookGrantedPermissions(longLived.accessToken).catch(() => []),
        fetchFacebookGranularScopes({ userAccessToken: longLived.accessToken, appId, appSecret }).catch(() => undefined),
      ]);
      return NextResponse.redirect(
        metaFacebookConnectReturnUrl(topicId, { error: noPagesMessage(grants, granular) }),
      );
    }

    const pages: StoredFacebookPage[] = await Promise.all(
      entries.map(async (entry) => {
        const link = await getFacebookPageInstagramLink(entry.pageId, entry.pageAccessToken).catch(() => ({ igUserId: undefined }));
        const linkedIgUsername = link.igUserId
          ? await fetchLinkedInstagramUsername(link.igUserId, entry.pageAccessToken).catch(() => undefined)
          : undefined;
        return {
          pageId: entry.pageId,
          pageName: entry.pageName,
          pageAccessToken: entry.pageAccessToken,
          tasks: entry.tasks,
          ...(link.igUserId ? { linkedIgUserId: link.igUserId } : {}),
          ...(linkedIgUsername ? { linkedIgUsername } : {}),
        };
      }),
    );
    const selection = await createPendingFacebookSelection(topicId, pages);
    return NextResponse.redirect(metaFacebookConnectReturnUrl(topicId, { selectionId: selection.id }));
  } catch (error) {
    const message =
      error instanceof MetaGraphApiError || error instanceof Error
        ? error.message
        : "The Facebook connection failed";
    console.error("Facebook OAuth callback failed", error instanceof MetaGraphApiError ? error.message : error);
    return NextResponse.redirect(
      topicId
        ? metaFacebookConnectReturnUrl(topicId, { error: message })
        : genericFailureRedirect(message),
    );
  }
}

/**
 * An empty Page list has two different causes with two different fixes: the
 * list permission itself was not granted, or it was granted but no Page was
 * shared in the dialog's Page step. Say which, from what Facebook reports.
 */
function noPagesMessage(
  grants: FacebookPermissionGrant[],
  granular: { scope: string; targetIds: string[] }[] | undefined,
): string {
  const listGrant = grants.find((grant) => grant.permission === "pages_show_list");
  if (!listGrant || listGrant.status !== "granted") {
    return "Facebook did not grant permission to list your Pages (pages_show_list). Connect Meta again and allow access to Pages.";
  }
  // Scope names and Page ids only — never token material. Facebook omits
  // target ids when the user granted "all current and future Pages".
  const detail = granular
    ? ` Facebook reports: ${granular.map((entry) => `${entry.scope}→${entry.targetIds.length ? entry.targetIds.join("+") : "all Pages"}`).join(", ") || "no granular scopes"}.`
    : "";
  // A Page reached only through a business portfolio is not listed without
  // business_management, even when the Page permissions themselves are granted.
  const businessGrant = grants.find((grant) => grant.permission === "business_management");
  if (!businessGrant || businessGrant.status !== "granted") {
    return `Facebook listed no Page for this account. If your access to the Page comes through a business portfolio, the Facebook Login configuration also needs the business_management permission.${detail}`;
  }
  return `Facebook listed no Page for this account, even with business portfolio access. Check that your profile is assigned to the Page in its business portfolio.${detail}`;
}

function genericFailureRedirect(message: string): string {
  const appUrl = process.env.RADAR_APP_URL?.trim()?.replace(/\/+$/u, "");
  const url = new URL(appUrl || "http://localhost:3000");
  url.searchParams.set("metaError", message);
  return url.toString();
}
