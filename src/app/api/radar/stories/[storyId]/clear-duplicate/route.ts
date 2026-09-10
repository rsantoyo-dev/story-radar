import { authorizeRadarCollector } from "@/app/api/radar/radar-api-auth";
import {
  requireActiveRequestTopic,
  topicRequestErrorResponse,
} from "@/app/api/radar/radar-topic";
import {
  clearTopicStoryDuplicateFlag,
  DuplicateFlagClearConflictError,
} from "@/app/modules/stories/story-duplicates.repository";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type Context = { params: Promise<{ storyId: string }> };

/**
 * Explicit human override for a false-positive "same news event" match.
 * Title-based detection can conflate distinct sections of one source
 * document (e.g. adjacent book chapters) that share boilerplate headings.
 * Clearing the flag returns the story to the AI evaluation candidate pool.
 */
export async function POST(request: Request, context: Context) {
  const unauthorized = authorizeRadarCollector(request);
  if (unauthorized) return unauthorized;

  const storyId = await parseStoryId(context);
  if (!storyId) {
    return noStoreJson({ error: "storyId must be a valid UUID" }, 400);
  }

  try {
    const topicId = await requireActiveRequestTopic(request);
    await clearTopicStoryDuplicateFlag(topicId, storyId);

    return noStoreJson({ storyId, cleared: true });
  } catch (error) {
    const topicError = topicRequestErrorResponse(error);
    if (topicError) return topicError;

    if (error instanceof DuplicateFlagClearConflictError) {
      return noStoreJson({ error: error.message }, 409);
    }

    console.error("Failed to clear duplicate flag", error);
    return noStoreJson(
      { error: "The duplicate flag could not be cleared" },
      500,
    );
  }
}

async function parseStoryId(context: Context): Promise<string | undefined> {
  const { storyId } = await context.params;
  return UUID_PATTERN.test(storyId) ? storyId : undefined;
}

function noStoreJson(value: unknown, status = 200): NextResponse {
  return NextResponse.json(value, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}
