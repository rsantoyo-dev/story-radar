import { StoryContentRecoveryInputError } from "@/app/modules/stories/story-content-recovery-input";
import { ArticleExtractionError } from "@/app/modules/stories/extract-article-content";
import { ArticleFetchError, ArticleAccessBlockedError } from "@/app/modules/stories/fetch-article-html";
import {
  prepareStoryContent,
  recoverStoryContent,
  StoryContentPreparationBlockedError,
  StoryContentPreparationFailedError,
} from "@/app/modules/stories/prepare-selected-story-content";
import {
  getStoryContent,
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
      await getStoryContent(
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

    console.error("Failed to read story content", error);

    return NextResponse.json(
      { error: "The story content could not be read" },
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
      await prepareStoryContent(
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

    console.error("Failed to prepare story content", error);

    return NextResponse.json(
      { error: "The story content could not be prepared" },
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


export async function PUT(request: Request, context: StoryContentRouteContext) {
  const unauthorized = authorizeRadarCollector(request);
  if (unauthorized) return unauthorized;
  const storyId = await parseStoryId(context);
  if (!storyId) return NextResponse.json({ error: "Invalid story ID" }, { status: 400 });
  try {
    const topicId = await requireActiveRequestTopic(request);
    const body = await request.text();
    if (body.length > 120_000) return NextResponse.json({ error: "Article input is too large" }, { status: 413 });
    return noStoreJson(await recoverStoryContent(topicId, storyId, JSON.parse(body)));
  } catch (error) {
    const topicError = topicRequestErrorResponse(error);
    if (topicError) return topicError;
    if (error instanceof SelectedStoryContentNotFoundError) return NextResponse.json({ error: error.message }, { status: 404 });
    if (error instanceof SyntaxError || error instanceof StoryContentRecoveryInputError) return NextResponse.json({ error: error.message }, { status: 400 });
    if (error instanceof ArticleFetchError || error instanceof ArticleAccessBlockedError || error instanceof ArticleExtractionError) return NextResponse.json({ error: error.message }, { status: 422 });
    console.error("Article recovery failed");
    return NextResponse.json({ error: "The article could not be saved" }, { status: 500 });
  }
}

export async function PATCH(request: Request, context: StoryContentRouteContext) {
  const unauthorized = authorizeRadarCollector(request);
  if (unauthorized) return unauthorized;
  const storyId = await parseStoryId(context);
  if (!storyId) return NextResponse.json({ error: "Invalid story ID" }, { status: 400 });
  try {
    const { findArticleAlternatives } = await import("@/app/modules/stories/find-article-alternatives");
    return noStoreJson(await findArticleAlternatives(await requireActiveRequestTopic(request), storyId));
  } catch (error) {
    const topicError = topicRequestErrorResponse(error);
    if (topicError) return topicError;
    if (error instanceof SelectedStoryContentNotFoundError) return NextResponse.json({ error: error.message }, { status: 404 });
    return NextResponse.json({ error: "Alternative source search failed" }, { status: 500 });
  }
}
