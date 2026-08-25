import { collectStoryCandidates } from "@/app/modules/stories/collect-story-candidates";
import { getStoryKeywordPreferences } from "@/app/modules/stories/story-preferences.repository";
import { listTopicRssSourceConfigs } from "@/app/modules/topics/topic-catalog.repository";
import { NextResponse } from "next/server";

import { authorizeRadarCollector } from "./radar-api-auth";
import {
  requireActiveRequestTopic,
  topicRequestErrorResponse,
} from "./radar-topic";

export async function GET(request: Request) {
  const unauthorized = authorizeRadarCollector(request);
  if (unauthorized) return unauthorized;

  const searchParams = new URL(request.url).searchParams;
  const rawMaxAgeHours = searchParams.get("maxAgeHours");
  const maxAgeHours = parseMaxAgeHours(rawMaxAgeHours);
  const includeText = searchParams.get("includeText") === "true";

  if (rawMaxAgeHours !== null && maxAgeHours === undefined) {
    return NextResponse.json(
      {
        error: 'Query parameter "maxAgeHours" must be a positive number',
      },
      {
        status: 400,
      },
    );
  }

  try {
    const topicId = await requireActiveRequestTopic(request);
    const radar = await collectStoryCandidates({
      sources: await listTopicRssSourceConfigs(topicId),
      preferences: await getStoryKeywordPreferences(topicId),
      ...(maxAgeHours !== undefined ? { maxAgeHours } : {}),
    });

    return NextResponse.json({
      ...radar,
      items: radar.items.map((item) => ({
        ...item,
        content: {
          ...(includeText && item.content.text
            ? { text: item.content.text }
            : {}),
          status: item.content.status,
        },
      })),
    });
  } catch (error) {
    const topicError = topicRequestErrorResponse(error);
    if (topicError) return topicError;

    console.error("Failed to collect topic story preview", error);
    return NextResponse.json(
      { error: "The topic radar could not be collected" },
      { status: 500 },
    );
  }
}

function parseMaxAgeHours(value: string | null): number | undefined {
  if (value === null || !value.trim()) {
    return undefined;
  }

  const maxAgeHours = Number(value);

  return Number.isFinite(maxAgeHours) && maxAgeHours > 0
    ? maxAgeHours
    : undefined;
}
