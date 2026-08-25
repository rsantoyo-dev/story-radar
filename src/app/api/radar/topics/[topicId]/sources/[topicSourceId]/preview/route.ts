import { authorizeRadarCollector } from "@/app/api/radar/radar-api-auth";
import { fetchRssFeed } from "@/app/modules/sources/rss/fetch-rss-feed";
import {
  listTopicRssSourceConfigs,
  TopicCatalogNotFoundError,
} from "@/app/modules/topics/topic-catalog.repository";
import { requireTopic, TopicContextError } from "@/app/modules/topics/topic-context";

import { noStoreJson, topicCatalogError } from "../../../../topic-route-utils";

type Context = {
  params: Promise<{ topicId: string; topicSourceId: string }>;
};

export const runtime = "nodejs";

export async function POST(request: Request, context: Context) {
  const unauthorized = authorizeRadarCollector(request);
  if (unauthorized) return unauthorized;

  try {
    const { topicId, topicSourceId } = await context.params;
    const source = (await listTopicRssSourceConfigs((await requireTopic(topicId)).id)).find(
      (candidate) => candidate.topicSourceId === topicSourceId,
    );

    if (!source) {
      throw new TopicCatalogNotFoundError("RSS source was not found in this topic");
    }

    const feed = await fetchRssFeed(source);
    return noStoreJson({
      source: {
        id: source.id,
        topicSourceId: source.topicSourceId,
        name: source.name,
      },
      fetchedAt: feed.fetchedAt,
      items: feed.items.slice(0, 10),
    });
  } catch (error) {
    if (error instanceof TopicContextError || error instanceof TopicCatalogNotFoundError) {
      return noStoreJson({ error: error.message }, 404);
    }

    return topicCatalogError(error, "preview the RSS source");
  }
}
