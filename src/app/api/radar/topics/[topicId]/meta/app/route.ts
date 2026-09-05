import { authorizeRadarCollector } from "@/app/api/radar/radar-api-auth";
import {
  jsonObject,
  noStoreJson,
} from "@/app/api/radar/topics/topic-route-utils";
import {
  clearTopicMetaAppOverride,
  getTopicMetaConnectionStatus,
  saveTopicMetaAppOverride,
} from "@/app/modules/meta/topic-meta-connections.repository";
import { requireTopic, TopicContextError } from "@/app/modules/topics/topic-context";

type Context = { params: Promise<{ topicId: string }> };

/**
 * Optional per-topic Meta App override. Most topics share the app configured
 * in META_APP_ID/META_APP_SECRET; this exists for the (expected to be rare)
 * topic whose Instagram account must be authorized through its own app.
 */
export async function PUT(request: Request, context: Context) {
  const unauthorized = authorizeRadarCollector(request);
  if (unauthorized) return unauthorized;

  try {
    const topicId = await topicIdFromContext(context);
    const body = await jsonObject(request);
    const appId = requireNonEmptyString(body.appId, "appId");
    const appSecret = requireNonEmptyString(body.appSecret, "appSecret");
    await saveTopicMetaAppOverride(topicId, { appId, appSecret });
    return noStoreJson(await getTopicMetaConnectionStatus(topicId));
  } catch (error) {
    return metaAppRouteError(error, "save the Meta App override");
  }
}

export async function DELETE(request: Request, context: Context) {
  const unauthorized = authorizeRadarCollector(request);
  if (unauthorized) return unauthorized;

  try {
    const topicId = await topicIdFromContext(context);
    await clearTopicMetaAppOverride(topicId);
    return noStoreJson(await getTopicMetaConnectionStatus(topicId));
  } catch (error) {
    return metaAppRouteError(error, "clear the Meta App override");
  }
}

async function topicIdFromContext(context: Context): Promise<string> {
  const { topicId } = await context.params;
  return (await requireTopic(topicId, { active: true })).id;
}

class MetaAppInputError extends Error {}

function requireNonEmptyString(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new MetaAppInputError(`${field} must be a non-empty string`);
  }
  return value.trim();
}

function metaAppRouteError(error: unknown, action: string) {
  if (error instanceof TopicContextError) {
    return noStoreJson({ error: error.message }, 404);
  }
  if (error instanceof MetaAppInputError) {
    return noStoreJson({ error: error.message }, 400);
  }
  console.error(`Failed to ${action}`, error);
  return noStoreJson({ error: `Unable to ${action}` }, 500);
}
