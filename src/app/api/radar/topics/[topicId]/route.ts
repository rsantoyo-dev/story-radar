import { authorizeRadarCollector } from "@/app/api/radar/radar-api-auth";
import {
  getDefaultTopic,
  listTopics,
  TopicCatalogNotFoundError,
  updateTopic,
  deleteTopic,
  type UpdateTopicInput,
} from "@/app/modules/topics/topic-catalog.repository";
import { requireTopic, TopicContextError } from "@/app/modules/topics/topic-context";

import {
  jsonObject,
  noStoreJson,
  topicCatalogError,
} from "../topic-route-utils";

type Context = { params: Promise<{ topicId: string }> };

export async function PATCH(request: Request, context: Context) {
  const unauthorized = authorizeRadarCollector(request);
  if (unauthorized) return unauthorized;

  try {
    const topicId = await topicIdFromContext(context);
    const topic = await updateTopic(
      topicId,
      (await jsonObject(request)) as UpdateTopicInput,
    );

    return noStoreJson({ topic });
  } catch (error) {
    return topicRouteError(error, "update the topic");
  }
}

export async function DELETE(request: Request, context: Context) {
  const unauthorized = authorizeRadarCollector(request);
  if (unauthorized) return unauthorized;

  try {
    const topicId = await topicIdFromContext(context);
    const defaultTopic = await getDefaultTopic();

    if (topicId === defaultTopic.id) {
      return noStoreJson(
        { error: "The seeded Tech topic cannot be deleted" },
        409,
      );
    }

    if ((await listTopics()).length <= 1) {
      return noStoreJson({ error: "At least one topic is required" }, 409);
    }

    await deleteTopic(topicId);
    return noStoreJson({ deleted: true });
  } catch (error) {
    return topicRouteError(error, "delete the topic");
  }
}

async function topicIdFromContext(context: Context): Promise<string> {
  const { topicId } = await context.params;
  return (await requireTopic(topicId)).id;
}

function topicRouteError(error: unknown, action: string) {
  if (error instanceof TopicContextError || error instanceof TopicCatalogNotFoundError) {
    return noStoreJson({ error: error.message }, 404);
  }

  return topicCatalogError(error, action);
}
