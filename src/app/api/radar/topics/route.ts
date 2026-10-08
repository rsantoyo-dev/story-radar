import { authorizeRadarCollector, requestWorkspaceId } from "@/app/api/radar/radar-api-auth";
import {
  createTopic,
  listTopics,
  type CreateTopicInput,
} from "@/app/modules/topics/topic-catalog.repository";

import { jsonObject, noStoreJson, topicCatalogError } from "./topic-route-utils";
import { recordAuditEventLater } from "@/app/modules/observability/audit";
import { withApiLog } from "@/app/modules/observability/api-request-log";

async function route_GET(request: Request) {
  const unauthorized = await authorizeRadarCollector(request);
  if (unauthorized) return unauthorized;

  try {
    return noStoreJson({ topics: await listTopics(requestWorkspaceId(request)) });
  } catch (error) {
    return topicCatalogError(error, "load topics");
  }
}

async function route_POST(request: Request) {
  // A new brand is a workspace decision: admins and owners.
  const unauthorized = await authorizeRadarCollector(request, "admin");
  if (unauthorized) return unauthorized;

  try {
    const input = await jsonObject(request);
    const topic = await createTopic(input as CreateTopicInput, requestWorkspaceId(request));
    recordAuditEventLater({ action: "topic.created", entityType: "topic", entityId: topic.id, topicId: topic.id, details: { name: topic.name } });

    return noStoreJson({ topic }, 201);
  } catch (error) {
    return topicCatalogError(error, "create the topic");
  }
}

export const GET = withApiLog(route_GET);
export const POST = withApiLog(route_POST);
