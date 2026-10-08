import { authorizeRadarCollector } from "@/app/api/radar/radar-api-auth";
import { noStoreJson } from "@/app/api/radar/topics/topic-route-utils";
import { FACEBOOK_GRAPH_VERSION } from "@/app/modules/meta/meta-facebook-graph-client";
import {
  getMetaFacebookLoginConfigId,
  getMetaFacebookOAuthRedirectUri,
  getMetaIntegrationHealth,
  requireMetaStateSecretFromEnv,
} from "@/app/modules/meta/meta-integration.config";
import { recordMetaOAuthAttempt } from "@/app/modules/meta/meta-oauth-attempts.repository";
import { signMetaOAuthState } from "@/app/modules/meta/meta-oauth-state";
import { getEffectiveMetaFacebookAppCredentials } from "@/app/modules/meta/topic-facebook-connections.repository";

import { facebookRouteError, topicFromContext, type TopicRouteContext } from "../facebook-route-utils";
import { withApiLog } from "@/app/modules/observability/api-request-log";

/**
 * Used only when no Login Configuration id is set; a config_id defines the
 * permissions instead. business_management is required to reach a Page the
 * user administers through a business portfolio rather than a direct role.
 */
const FACEBOOK_PAGE_SCOPES = ["pages_show_list", "pages_read_engagement", "pages_manage_posts", "business_management"].join(",");

/**
 * Returns the Facebook Login for Business dialog URL for this topic (PUB-09).
 * A separate product and a separate callback from the Instagram Login flow:
 * the signed state carries mechanism "facebook", so the Instagram callback
 * rejects it and vice versa. The browser navigates top-level to this URL.
 */
async function route_POST(request: Request, context: TopicRouteContext) {
  const unauthorized = await authorizeRadarCollector(request);
  if (unauthorized) return unauthorized;

  try {
    const topic = await topicFromContext(context);
    const mismatch = getMetaIntegrationHealth(request).problems.find(
      (problem) => problem.code === "app-url-mismatch",
    );
    if (mismatch) {
      return noStoreJson({ error: mismatch.message, code: mismatch.code }, 400);
    }
    const { appId } = await getEffectiveMetaFacebookAppCredentials(topic.id);
    const signed = signMetaOAuthState(
      { topicId: topic.id, mechanism: "facebook" },
      requireMetaStateSecretFromEnv(),
    );
    await recordMetaOAuthAttempt({
      nonce: signed.nonce,
      topicId: topic.id,
      workspaceId: topic.workspaceId,
      mechanism: "facebook",
      issuedAt: signed.issuedAt,
      expiresAt: signed.expiresAt,
    });

    const url = new URL(`https://www.facebook.com/${FACEBOOK_GRAPH_VERSION}/dialog/oauth`);
    url.searchParams.set("client_id", appId);
    url.searchParams.set("redirect_uri", getMetaFacebookOAuthRedirectUri());
    url.searchParams.set("state", signed.state);
    url.searchParams.set("response_type", "code");
    // Re-asks for anything previously declined, so a reconnect can fix a
    // missing Page grant instead of silently reusing the old, empty one.
    url.searchParams.set("auth_type", "rerequest");
    const configId = getMetaFacebookLoginConfigId();
    if (configId) {
      url.searchParams.set("config_id", configId);
    } else {
      url.searchParams.set("scope", FACEBOOK_PAGE_SCOPES);
    }

    return noStoreJson({ authorizeUrl: url.toString() });
  } catch (error) {
    return facebookRouteError(error, "start the Facebook connection");
  }
}

export const POST = withApiLog(route_POST);
