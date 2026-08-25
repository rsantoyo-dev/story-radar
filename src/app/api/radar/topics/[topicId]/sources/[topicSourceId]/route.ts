import { authorizeRadarCollector } from "@/app/api/radar/radar-api-auth";
import {
  detachRssSourceFromTopic,
  listTopicRssSourceConfigs,
  TopicCatalogNotFoundError,
  TopicCatalogValidationError,
  updateRssSource,
  updateTopicSource,
  type UpdateRssSourceInput,
  type UpdateTopicSourceInput,
} from "@/app/modules/topics/topic-catalog.repository";
import { requireTopic, TopicContextError } from "@/app/modules/topics/topic-context";

import {
  jsonObject,
  noStoreJson,
  topicCatalogError,
} from "../../../topic-route-utils";

type Context = { params: Promise<{ topicId: string; topicSourceId: string }> };

export async function PATCH(request: Request, context: Context) {
  const unauthorized = authorizeRadarCollector(request);
  if (unauthorized) return unauthorized;

  try {
    const { topicId, topicSourceId } = await sourceContext(context);
    const current = await getTopicSource(topicId, topicSourceId);
    const body = await jsonObject(request);

    if (body.source !== undefined) {
      if (typeof body.source !== "object" || body.source === null || Array.isArray(body.source)) {
        throw new TopicCatalogValidationError("source must be an object");
      }
      await updateRssSource(current.id, body.source as UpdateRssSourceInput);
    }

    if (body.link !== undefined) {
      if (typeof body.link !== "object" || body.link === null || Array.isArray(body.link)) {
        throw new TopicCatalogValidationError("link must be an object");
      }
      await updateTopicSource(topicSourceId, body.link as UpdateTopicSourceInput);
    }

    const source = await getTopicSource(topicId, topicSourceId);
    return noStoreJson({ source });
  } catch (error) {
    return sourceRouteError(error, "update the RSS source");
  }
}

export async function DELETE(request: Request, context: Context) {
  const unauthorized = authorizeRadarCollector(request);
  if (unauthorized) return unauthorized;

  try {
    const { topicId, topicSourceId } = await sourceContext(context);
    await getTopicSource(topicId, topicSourceId);
    await detachRssSourceFromTopic(topicSourceId);

    return noStoreJson({ detached: true });
  } catch (error) {
    return sourceRouteError(error, "remove the RSS source from this topic");
  }
}

async function sourceContext(context: Context) {
  const { topicId, topicSourceId } = await context.params;

  return {
    topicId: (await requireTopic(topicId)).id,
    topicSourceId,
  };
}

async function getTopicSource(topicId: string, topicSourceId: string) {
  const source = (await listTopicRssSourceConfigs(topicId)).find(
    (candidate) => candidate.topicSourceId === topicSourceId,
  );

  if (!source) {
    throw new TopicCatalogNotFoundError("RSS source was not found in this topic");
  }

  return source;
}

function sourceRouteError(error: unknown, action: string) {
  if (error instanceof TopicContextError || error instanceof TopicCatalogNotFoundError) {
    return noStoreJson({ error: error.message }, 404);
  }

  return topicCatalogError(error, action);
}
