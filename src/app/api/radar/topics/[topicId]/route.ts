import { authorizeRadarCollector } from "@/app/api/radar/radar-api-auth";
import {
  DEFAULT_WORKSPACE_ID,
  getDefaultTopic,
  listTopics,
  TopicCatalogNotFoundError,
  updateTopic,
  deleteTopic,
  type UpdateTopicInput,
} from "@/app/modules/topics/topic-catalog.repository";
import { TopicContextError, requireTopic } from "@/app/modules/topics/topic-context";

import {
  jsonObject,
  noStoreJson,
  topicCatalogError,
} from "../topic-route-utils";
import { recordAuditEventLater } from "@/app/modules/observability/audit";

type Context = { params: Promise<{ topicId: string }> };

export async function PATCH(request: Request, context: Context) {
  const unauthorized = await authorizeRadarCollector(request);
  if (unauthorized) return unauthorized;

  try {
    const topicId = await topicIdFromContext(context);
    const topic = await updateTopic(
      topicId,
      (await jsonObject(request)) as UpdateTopicInput,
    );

    recordAuditEventLater({ action: "topic.updated", entityType: "topic", entityId: topicId, topicId, details: { name: topic.name } });
    return noStoreJson({ topic });
  } catch (error) {
    return topicRouteError(error, "update the topic");
  }
}

export async function DELETE(request: Request, context: Context) {
  // Deleting a brand removes its work: admins and owners.
  const unauthorized = await authorizeRadarCollector(request, "admin");
  if (unauthorized) return unauthorized;

  try {
    const topic = await requireTopic((await context.params).topicId);
    const topicId = topic.id;

    if (topic.workspaceId === DEFAULT_WORKSPACE_ID && topicId === (await getDefaultTopic()).id) {
      return noStoreJson(
        { error: "The seeded Tech topic cannot be deleted" },
        409,
      );
    }

    if ((await listTopics(topic.workspaceId)).length <= 1) {
      return noStoreJson({ error: "At least one topic is required" }, 409);
    }

    await deleteTopic(topicId, topic.workspaceId);
    recordAuditEventLater({ action: "topic.deleted", entityType: "topic", entityId: topicId, topicId, details: { name: topic.name } });
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
