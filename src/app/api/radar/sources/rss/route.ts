import { authorizeRadarCollector } from "@/app/api/radar/radar-api-auth";
import { jsonObject, noStoreJson, topicCatalogError } from "@/app/api/radar/topics/topic-route-utils";
import {
  attachRssSourceToTopic,
  createOrReuseRssSource,
  TopicCatalogValidationError,
  type AttachTopicSourceInput,
  type CreateRssSourceInput,
} from "@/app/modules/topics/topic-catalog.repository";
import { requireTopic, TopicContextError } from "@/app/modules/topics/topic-context";

export async function POST(request: Request) {
  const unauthorized = authorizeRadarCollector(request);
  if (unauthorized) return unauthorized;

  try {
    const body = await jsonObject(request);
    if (!body.source || typeof body.source !== "object" || Array.isArray(body.source)) {
      throw new TopicCatalogValidationError("A feed is required");
    }
    if (!Array.isArray(body.topicIds) || !body.topicIds.length ||
      body.topicIds.some((id) => typeof id !== "string" || !id.trim())) {
      throw new TopicCatalogValidationError("Select at least one topic");
    }
    const topicIds = [...new Set(body.topicIds as string[])];
    const link = body.link === undefined ? {} : body.link;
    if (!link || typeof link !== "object" || Array.isArray(link)) {
      throw new TopicCatalogValidationError("Feed link settings are invalid");
    }
    await Promise.all(topicIds.map((id) => requireTopic(id, { active: true })));
    const source = await createOrReuseRssSource(body.source as CreateRssSourceInput);
    for (const topicId of topicIds) {
      await attachRssSourceToTopic(topicId, source.id, link as AttachTopicSourceInput);
    }
    return noStoreJson({ sourceId: source.id, topicIds }, 201);
  } catch (error) {
    if (error instanceof TopicContextError) return noStoreJson({ error: error.message }, 404);
    return topicCatalogError(error, "add workspace RSS feed");
  }
}
