import { authorizeRadarCollector } from "@/app/api/radar/radar-api-auth";
import { noStoreJson } from "@/app/api/radar/topics/topic-route-utils";
import {
  disconnectTopicMeta,
  getTopicMetaConnectionStatus,
} from "@/app/modules/meta/topic-meta-connections.repository";
import { requireTopic, TopicContextError } from "@/app/modules/topics/topic-context";

type Context = { params: Promise<{ topicId: string }> };

export async function GET(request: Request, context: Context) {
  const unauthorized = authorizeRadarCollector(request);
  if (unauthorized) return unauthorized;

  try {
    const topicId = await topicIdFromContext(context);
    return noStoreJson(await getTopicMetaConnectionStatus(topicId));
  } catch (error) {
    return metaRouteError(error, "read the Instagram connection");
  }
}

export async function DELETE(request: Request, context: Context) {
  const unauthorized = authorizeRadarCollector(request);
  if (unauthorized) return unauthorized;

  try {
    const topicId = await topicIdFromContext(context);
    await disconnectTopicMeta(topicId);
    return noStoreJson(await getTopicMetaConnectionStatus(topicId));
  } catch (error) {
    return metaRouteError(error, "disconnect the Instagram account");
  }
}

async function topicIdFromContext(context: Context): Promise<string> {
  const { topicId } = await context.params;
  return (await requireTopic(topicId, { active: true })).id;
}

function metaRouteError(error: unknown, action: string) {
  if (error instanceof TopicContextError) {
    return noStoreJson({ error: error.message }, 404);
  }
  console.error(`Failed to ${action}`, error);
  return noStoreJson({ error: `Unable to ${action}` }, 500);
}
