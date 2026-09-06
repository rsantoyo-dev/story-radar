import { authorizeRadarCollector } from "@/app/api/radar/radar-api-auth";
import { noStoreJson } from "@/app/api/radar/topics/topic-route-utils";
import {
  MetaGraphApiError,
  verifyInstagramInsightsAccess,
} from "@/app/modules/meta/meta-graph-client";
import {
  classifyMetaGraphError,
  describeMetaVerificationError,
} from "@/app/modules/meta/meta-verification";
import {
  getDecryptedTopicMetaAccessToken,
  getTopicMetaConnectionStatus,
  recordMetaVerificationFailure,
  recordMetaVerificationSuccess,
} from "@/app/modules/meta/topic-meta-connections.repository";
import { requireTopic, TopicContextError } from "@/app/modules/topics/topic-context";

type Context = { params: Promise<{ topicId: string }> };

/**
 * Proves the connected account's Instagram insights access works right now,
 * rather than trusting what OAuth claimed to grant at connect time — Meta
 * can accept a scope request without the app actually having Advanced
 * Access for it. A verification failure is a legitimate result read from the
 * returned status, not a route error, so this never returns non-2xx for it.
 */
export async function POST(request: Request, context: Context) {
  const unauthorized = authorizeRadarCollector(request);
  if (unauthorized) return unauthorized;

  try {
    const topicId = await topicIdFromContext(context);
    const account = await getDecryptedTopicMetaAccessToken(topicId);
    if (!account) {
      return noStoreJson(
        { error: "This topic has no connected Instagram account" },
        400,
      );
    }

    try {
      await verifyInstagramInsightsAccess(account.igUserId, account.accessToken);
      await recordMetaVerificationSuccess(
        topicId,
        account.connectionVersion,
        new Date(),
      );
    } catch (error) {
      const graphError =
        error instanceof MetaGraphApiError ? error.graphError : undefined;
      console.error(
        `Instagram insights verification failed for topic ${topicId}`,
        error,
      );
      await recordMetaVerificationFailure(topicId, account.connectionVersion, {
        message: describeMetaVerificationError(
          graphError,
          error instanceof Error
            ? error.message
            : "Instagram insights verification failed",
        ),
        forceReconnect: classifyMetaGraphError(graphError) === "auth",
      });
    }

    return noStoreJson(await getTopicMetaConnectionStatus(topicId));
  } catch (error) {
    return metaVerifyRouteError(error);
  }
}

async function topicIdFromContext(context: Context): Promise<string> {
  const { topicId } = await context.params;
  return (await requireTopic(topicId, { active: true })).id;
}

function metaVerifyRouteError(error: unknown) {
  if (error instanceof TopicContextError) {
    return noStoreJson({ error: error.message }, 404);
  }
  console.error("Failed to verify the Instagram connection", error);
  return noStoreJson({ error: "Unable to verify the Instagram connection" }, 500);
}
