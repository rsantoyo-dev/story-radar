import { authorizeRadarCollector } from "@/app/api/radar/radar-api-auth";
import {
  attachRssSourceToTopic,
  createOrReuseRssSource,
  listTopicRssSourceConfigs,
  TopicCatalogNotFoundError,
  TopicCatalogValidationError,
  type AttachTopicSourceInput,
  type CreateRssSourceInput,
} from "@/app/modules/topics/topic-catalog.repository";
import { requireTopic, TopicContextError } from "@/app/modules/topics/topic-context";

import {
  jsonObject,
  noStoreJson,
  topicCatalogError,
} from "../../topic-route-utils";

type Context = { params: Promise<{ topicId: string }> };

export async function GET(request: Request, context: Context) {
  const unauthorized = authorizeRadarCollector(request);
  if (unauthorized) return unauthorized;

  try {
    const topicId = await topicIdFromContext(context);
    return noStoreJson({ sources: await listTopicRssSourceConfigs(topicId) });
  } catch (error) {
    return sourceRouteError(error, "load RSS sources");
  }
}

export async function POST(request: Request, context: Context) {
  const unauthorized = authorizeRadarCollector(request);
  if (unauthorized) return unauthorized;

  try {
    const topicId = await topicIdFromContext(context);
    const body = await jsonObject(request);
    const link = parseLinkInput(body);
    const sourceId = typeof body.sourceId === "string" && body.sourceId.trim()
      ? body.sourceId.trim()
      : await createSourceFromBody(body);

    await attachRssSourceToTopic(topicId, sourceId, link);
    const sources = await listTopicRssSourceConfigs(topicId);
    const source = sources.find((candidate) => candidate.id === sourceId);

    if (!source) {
      throw new Error("RSS source was created but could not be loaded");
    }

    return noStoreJson({ source }, 201);
  } catch (error) {
    return sourceRouteError(error, "add the RSS source");
  }
}

async function topicIdFromContext(context: Context): Promise<string> {
  const { topicId } = await context.params;
  return (await requireTopic(topicId)).id;
}

async function createSourceFromBody(body: Record<string, unknown>): Promise<string> {
  const value = body.source;

  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new TopicCatalogValidationError(
      "sourceId or a source object is required",
    );
  }

  return (await createOrReuseRssSource(value as CreateRssSourceInput)).id;
}

function parseLinkInput(body: Record<string, unknown>): AttachTopicSourceInput {
  const value = body.link;

  if (value === undefined) {
    return {};
  }

  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new TopicCatalogValidationError("link must be an object");
  }

  return value as AttachTopicSourceInput;
}

function sourceRouteError(error: unknown, action: string) {
  if (
    error instanceof TopicContextError ||
    error instanceof TopicCatalogNotFoundError
  ) {
    return noStoreJson({ error: error.message }, 404);
  }

  return topicCatalogError(error, action);
}
