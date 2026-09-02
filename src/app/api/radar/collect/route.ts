import { collectAndPersistStoryCandidates } from "@/app/modules/stories/collect-and-persist-story-candidates";
import { getEditorialProfile } from "@/app/modules/stories/editorial-profile.repository";
import { getStoryKeywordPreferences } from "@/app/modules/stories/story-preferences.repository";
import { getAiResearchSourceConfig } from "@/app/modules/sources/ai-research/ai-research.repository";
import { listTopicRssSourceConfigs } from "@/app/modules/topics/topic-catalog.repository";
import { NextResponse } from "next/server";

import { authorizeRadarCollector } from "../radar-api-auth";
import {
  requireActiveRequestTopic,
  topicRequestErrorResponse,
} from "../radar-topic";

export const maxDuration = 120;

export async function POST(request: Request) {
  const unauthorizedResponse = authorizeRadarCollector(request);

  if (unauthorizedResponse) {
    return unauthorizedResponse;
  }

  const searchParams = new URL(request.url).searchParams;
  const rawMaxAgeHours = searchParams.get("maxAgeHours");
  const maxAgeHours = parseMaxAgeHours(rawMaxAgeHours);

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
    const [sources, aiResearch, profile, preferences] = await Promise.all([
      listTopicRssSourceConfigs(topicId),
      getAiResearchSourceConfig(topicId),
      getEditorialProfile(topicId),
      getStoryKeywordPreferences(topicId),
    ]);

    if (!sources.some((source) => source.enabled) && !aiResearch.enabled) {
      return NextResponse.json(
        { error: "This topic does not have any active RSS or AI research sources" },
        { status: 422 },
      );
    }

    const { radar, persistence } = await collectAndPersistStoryCandidates({
      topicId,
      sources,
      preferences,
      aiResearch: { config: aiResearch, profile },
      ...(maxAgeHours !== undefined ? { maxAgeHours } : {}),
    });

    return NextResponse.json({
      generatedAt: radar.generatedAt,
      sources: radar.sources,
      counts: radar.counts,
      persistence,
    });
  } catch (error) {
    const topicError = topicRequestErrorResponse(error);
    if (topicError) return topicError;

    console.error("Failed to collect and persist Press Craftor stories", error);

    return NextResponse.json(
      {
        error: "The radar could not be collected and persisted",
      },
      {
        status: 500,
      },
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
