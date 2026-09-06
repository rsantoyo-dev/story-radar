import { NextResponse } from "next/server";

import { authorizeRadarCollector } from "@/app/api/radar/radar-api-auth";
import {
  requireActiveRequestTopic,
  topicRequestErrorResponse,
} from "@/app/api/radar/radar-topic";
import { getStoryInstagramResults } from "@/app/modules/meta/story-instagram-results";

export const runtime = "nodejs";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type Context = { params: Promise<{ storyId: string }> };

/**
 * IG-06 — the Instagram publications linked to one editorial story, with their
 * metrics and resolved creative version, for the panel inside Creative Studio.
 * Read-only; storyId from the path, topicId from `?topicId=`.
 */
export async function GET(request: Request, context: Context) {
  const unauthorized = authorizeRadarCollector(request);
  if (unauthorized) return unauthorized;

  const storyId = await parseStoryId(context);
  if (!storyId) {
    return NextResponse.json(
      { error: "storyId must be a valid UUID" },
      { status: 400 },
    );
  }

  try {
    return noStoreJson(
      await getStoryInstagramResults(
        await requireActiveRequestTopic(request),
        storyId,
      ),
    );
  } catch (error) {
    const topicError = topicRequestErrorResponse(error);
    if (topicError) return topicError;

    console.error("Failed to read story Instagram results", error);
    return NextResponse.json(
      { error: "Unable to read Instagram results for this story" },
      { status: 500 },
    );
  }
}

async function parseStoryId(context: Context): Promise<string | undefined> {
  const { storyId } = await context.params;
  return UUID_PATTERN.test(storyId) ? storyId : undefined;
}

function noStoreJson(value: unknown): NextResponse {
  return NextResponse.json(value, { headers: { "Cache-Control": "no-store" } });
}
