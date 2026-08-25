import {
  prepareSelectedStoryContent,
  StoryContentPreparationBlockedError,
  StoryContentPreparationFailedError,
} from "@/app/modules/stories/prepare-selected-story-content";
import {
  getSelectedStoryContent,
  SelectedStoryContentNotFoundError,
} from "@/app/modules/stories/story-content.repository";
import { authorizeRadarCollector } from "@/app/api/radar/radar-api-auth";
import {
  requireActiveRequestTopic,
  topicRequestErrorResponse,
} from "@/app/api/radar/radar-topic";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type StoryContentRouteContext = {
  params: Promise<{ storyId: string }>;
};

export async function GET(
  request: Request,
  context: StoryContentRouteContext,
) {
  const unauthorizedResponse = authorizeRadarCollector(request);

  if (unauthorizedResponse) {
    return unauthorizedResponse;
  }

  const storyId = await parseStoryId(context);

  if (!storyId) {
    return NextResponse.json(
      { error: "storyId must be a valid UUID" },
      { status: 400 },
    );
  }

  try {
    return noStoreJson(
      await getSelectedStoryContent(
        await requireActiveRequestTopic(request),
        storyId,
      ),
    );
  } catch (error) {
    const topicError = topicRequestErrorResponse(error);
    if (topicError) return topicError;

    if (error instanceof SelectedStoryContentNotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }

    console.error("Failed to read selected story content", error);

    return NextResponse.json(
      { error: "The selected story content could not be read" },
      { status: 500 },
    );
  }
}

export async function POST(
  request: Request,
  context: StoryContentRouteContext,
) {
  const unauthorizedResponse = authorizeRadarCollector(request);

  if (unauthorizedResponse) {
    return unauthorizedResponse;
  }

  const storyId = await parseStoryId(context);

  if (!storyId) {
    return NextResponse.json(
      { error: "storyId must be a valid UUID" },
      { status: 400 },
    );
  }

  try {
    return noStoreJson(
      await prepareSelectedStoryContent(
        await requireActiveRequestTopic(request),
        storyId,
      ),
    );
  } catch (error) {
    const topicError = topicRequestErrorResponse(error);
    if (topicError) return topicError;

    if (error instanceof SelectedStoryContentNotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }

    if (error instanceof StoryContentPreparationBlockedError) {
      return NextResponse.json({ error: error.message }, { status: 422 });
    }

    if (error instanceof StoryContentPreparationFailedError) {
      return NextResponse.json({ error: error.message }, { status: 502 });
    }

    console.error("Failed to prepare selected story content", error);

    return NextResponse.json(
      { error: "The selected story content could not be prepared" },
      { status: 500 },
    );
  }
}

async function parseStoryId(
  context: StoryContentRouteContext,
): Promise<string | undefined> {
  const { storyId } = await context.params;

  return UUID_PATTERN.test(storyId) ? storyId : undefined;
}

function noStoreJson(value: unknown): NextResponse {
  return NextResponse.json(value, {
    headers: {
      "Cache-Control": "no-store",
    },
  });
}
