import { authorizeRadarCollector } from "@/app/api/radar/radar-api-auth";
import { noStoreJson } from "@/app/api/radar/topics/topic-route-utils";
import {
  getMetaOAuthRedirectUri,
  MetaIntegrationConfigError,
  requireMetaStateSecretFromEnv,
} from "@/app/modules/meta/meta-integration.config";
import { signMetaOAuthState } from "@/app/modules/meta/meta-oauth-state";
import {
  getEffectiveMetaAppCredentials,
  TopicMetaConnectionError,
} from "@/app/modules/meta/topic-meta-connections.repository";
import { requireTopic, TopicContextError } from "@/app/modules/topics/topic-context";

type Context = { params: Promise<{ topicId: string }> };

const INSTAGRAM_OAUTH_SCOPES = [
  "instagram_business_basic",
  "instagram_business_content_publish",
].join(",");

/**
 * Returns the Instagram Login dialog URL for this topic ("Instagram API with
 * Instagram Login" — the account authorizes directly, no Facebook Page
 * involved). The browser must navigate the top-level window to it (a full
 * redirect, not a fetch) — Instagram's callback then lands on our global
 * /api/radar/meta/callback route with no Authorization header we control,
 * which is why the topic is bound through the signed `state` param instead.
 */
export async function POST(request: Request, context: Context) {
  const unauthorized = authorizeRadarCollector(request);
  if (unauthorized) return unauthorized;

  try {
    const topicId = await topicIdFromContext(context);
    const { appId } = await getEffectiveMetaAppCredentials(topicId);
    const state = signMetaOAuthState(topicId, requireMetaStateSecretFromEnv());

    const url = new URL("https://www.instagram.com/oauth/authorize");
    url.searchParams.set("client_id", appId);
    url.searchParams.set("redirect_uri", getMetaOAuthRedirectUri());
    url.searchParams.set("state", state);
    url.searchParams.set("scope", INSTAGRAM_OAUTH_SCOPES);
    url.searchParams.set("response_type", "code");

    return noStoreJson({ authorizeUrl: url.toString() });
  } catch (error) {
    return metaConnectRouteError(error);
  }
}

async function topicIdFromContext(context: Context): Promise<string> {
  const { topicId } = await context.params;
  return (await requireTopic(topicId, { active: true })).id;
}

function metaConnectRouteError(error: unknown) {
  if (error instanceof TopicContextError) {
    return noStoreJson({ error: error.message }, 404);
  }
  if (
    error instanceof TopicMetaConnectionError ||
    error instanceof MetaIntegrationConfigError
  ) {
    return noStoreJson({ error: error.message }, 400);
  }
  console.error("Failed to start the Meta connection", error);
  return noStoreJson({ error: "Unable to start the Instagram connection" }, 500);
}
