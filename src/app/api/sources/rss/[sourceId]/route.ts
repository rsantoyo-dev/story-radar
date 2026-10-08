import { fetchRssFeed } from "@/app/modules/sources/rss/fetch-rss-feed";
import { authorizeRadarCollector } from "@/app/api/radar/radar-api-auth";
import {
  requireActiveRequestTopic,
  topicRequestErrorResponse,
} from "@/app/api/radar/radar-topic";
import { listTopicRssSourceConfigs } from "@/app/modules/topics/topic-catalog.repository";
import { NextResponse } from "next/server";
import { withApiLog } from "@/app/modules/observability/api-request-log";

type RouteContext = {
  params: Promise<{
    sourceId: string;
  }>;
};

async function route_GET(
  request: Request,
  context: RouteContext,
) {
  const unauthorized = await authorizeRadarCollector(request);
  if (unauthorized) return unauthorized;

  const { sourceId } = await context.params;

  try {
    const source = (await listTopicRssSourceConfigs(
      await requireActiveRequestTopic(request),
    )).find((candidate) => candidate.id === sourceId && candidate.enabled);

    if (!source) {
      return NextResponse.json(
        { error: `RSS source "${sourceId}" was not found` },
        { status: 404 },
      );
    }

    const feed = await fetchRssFeed(source);

    return NextResponse.json(feed);
  } catch (error) {
    const topicError = topicRequestErrorResponse(error);
    if (topicError) return topicError;

    console.error(`Failed to fetch RSS source "${sourceId}"`, error);

    return NextResponse.json(
      {
        error: `Unable to fetch RSS source "${sourceId}"`,
      },
      {
        status: 502,
      },
    );
  }
}

export const GET = withApiLog(route_GET);
