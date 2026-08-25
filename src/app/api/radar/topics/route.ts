import { authorizeRadarCollector } from "@/app/api/radar/radar-api-auth";
import {
  createTopic,
  listTopics,
  type CreateTopicInput,
} from "@/app/modules/topics/topic-catalog.repository";

import { jsonObject, noStoreJson, topicCatalogError } from "./topic-route-utils";

export async function GET(request: Request) {
  const unauthorized = authorizeRadarCollector(request);
  if (unauthorized) return unauthorized;

  try {
    return noStoreJson({ topics: await listTopics() });
  } catch (error) {
    return topicCatalogError(error, "load topics");
  }
}

export async function POST(request: Request) {
  const unauthorized = authorizeRadarCollector(request);
  if (unauthorized) return unauthorized;

  try {
    const input = await jsonObject(request);
    const topic = await createTopic(input as CreateTopicInput);

    return noStoreJson({ topic }, 201);
  } catch (error) {
    return topicCatalogError(error, "create the topic");
  }
}
