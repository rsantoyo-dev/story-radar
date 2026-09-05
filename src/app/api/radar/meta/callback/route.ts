import { NextResponse } from "next/server";

import {
  getMetaOAuthRedirectUri,
  metaConnectReturnUrl,
  requireMetaStateSecretFromEnv,
} from "@/app/modules/meta/meta-integration.config";
import {
  exchangeForLongLivedInstagramToken,
  exchangeInstagramCodeForToken,
  fetchInstagramUsername,
  MetaGraphApiError,
} from "@/app/modules/meta/meta-graph-client";
import { verifyMetaOAuthState } from "@/app/modules/meta/meta-oauth-state";
import {
  getEffectiveMetaAppCredentials,
  saveTopicMetaConnection,
} from "@/app/modules/meta/topic-meta-connections.repository";

export const runtime = "nodejs";

/**
 * Instagram redirects the browser here directly after its login dialog —
 * this request carries no Authorization header we control, so the topic and
 * the request's authenticity both come from the signed `state` param (see
 * meta-oauth-state.ts), not from authorizeRadarCollector. Instagram API with
 * Instagram Login authorizes the Instagram account directly: no Facebook
 * Page is involved.
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
    topicId = state
      ? verifyMetaOAuthState(state, requireMetaStateSecretFromEnv())
      : undefined;
    if (!topicId) {
      return NextResponse.redirect(
        genericFailureRedirect("The connection request expired or was invalid; try connecting again."),
      );
    }
    if (dialogError) {
      throw new Error(dialogError);
    }
    if (!code) {
      throw new Error("Instagram did not return an authorization code");
    }

    const { appId, appSecret } = await getEffectiveMetaAppCredentials(topicId);
    const shortLived = await exchangeInstagramCodeForToken({
      appId,
      appSecret,
      redirectUri: getMetaOAuthRedirectUri(),
      code,
    });
    const longLived = await exchangeForLongLivedInstagramToken({
      appSecret,
      shortLivedToken: shortLived.accessToken,
    });
    const username = await fetchInstagramUsername(
      shortLived.userId,
      longLived.accessToken,
    ).catch(() => undefined);

    await saveTopicMetaConnection(topicId, {
      igUserId: shortLived.userId,
      ...(username ? { igUsername: username } : {}),
      accessToken: longLived.accessToken,
      tokenExpiresAt: new Date(Date.now() + longLived.expiresIn * 1_000),
    });

    return NextResponse.redirect(
      metaConnectReturnUrl(topicId, { connected: true }),
    );
  } catch (error) {
    const message =
      error instanceof MetaGraphApiError
        ? error.message
        : error instanceof Error
          ? error.message
          : "The Instagram connection failed";
    console.error("Instagram OAuth callback failed", error);
    return NextResponse.redirect(
      topicId
        ? metaConnectReturnUrl(topicId, { error: message })
        : genericFailureRedirect(message),
    );
  }
}

function genericFailureRedirect(message: string): string {
  const appUrl = process.env.RADAR_APP_URL?.trim()?.replace(/\/+$/u, "");
  const url = new URL(appUrl || "http://localhost:3000");
  url.searchParams.set("metaError", message);
  return url.toString();
}
