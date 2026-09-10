import {
  requireTopic,
  topicIdFromRequest,
} from "@/app/modules/topics/topic-context";
import { parseOverviewPeriod } from "@/app/modules/topics/topic-overview.logic";
import { getTopicOverview } from "@/app/modules/topics/topic-overview.repository";
import { NextResponse } from "next/server";

import { authorizeRadarCollector } from "../radar-api-auth";
import { topicRequestErrorResponse } from "../radar-topic";

/**
 * Read-only aggregate for the Topic Overview (FEAT-OVW-001).
 *
 * `GET /api/radar/overview?topicId=<uuid>&period=<7|30|90>`
 *
 * Authorizes the topic on the server, computes a single `[since, until)`
 * interval, and returns the typed {@link TopicOverviewDto}. It never mutates
 * anything and never calls a provider — mounting the Overview only reads the
 * app's own data.
 */
export async function GET(request: Request) {
  const unauthorizedResponse = authorizeRadarCollector(request);

  if (unauthorizedResponse) {
    return unauthorizedResponse;
  }

  try {
    const topic = await requireTopic(topicIdFromRequest(request));
    const period = parseOverviewPeriod(
      new URL(request.url).searchParams.get("period"),
    );

    return NextResponse.json(await getTopicOverview(topic, period), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    const topicError = topicRequestErrorResponse(error);
    if (topicError) return topicError;

    console.error("Failed to read the topic overview", error);

    return NextResponse.json(
      { error: "The topic overview could not be read" },
      { status: 500 },
    );
  }
}
