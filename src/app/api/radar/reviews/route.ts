import { getEditorialEvaluationPublicConfig } from "@/app/modules/stories/editorial-evaluation.config";
import {
  EditorialStoryReviewConflictError,
  reviewEditorialShortlist,
  type StoryReviewDecision,
} from "@/app/modules/stories/story-editorial.repository";
import { NextResponse } from "next/server";

import { authorizeRadarCollector } from "../radar-api-auth";
import {
  requireActiveRequestTopic,
  topicRequestErrorResponse,
} from "../radar-topic";

const MAX_STORIES_PER_REVIEW = 100;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function PATCH(request: Request) {
  const unauthorizedResponse = authorizeRadarCollector(request);

  if (unauthorizedResponse) {
    return unauthorizedResponse;
  }

  try {
    const review = parseReviewRequest((await request.json()) as unknown);
    const topicId = await requireActiveRequestTopic(request);
    const reviewedStories = await reviewEditorialShortlist(
      topicId,
      review.storyIds,
      review.decision,
      getEditorialEvaluationPublicConfig(),
    );

    return NextResponse.json({
      decision: review.decision,
      reviewedStories,
    });
  } catch (error) {
    const topicError = topicRequestErrorResponse(error);
    if (topicError) return topicError;

    if (error instanceof InvalidStoryReviewError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    if (error instanceof EditorialStoryReviewConflictError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }

    console.error("Failed to save editorial story review", error);

    return NextResponse.json(
      { error: "The editorial review could not be saved" },
      { status: 500 },
    );
  }
}

function parseReviewRequest(value: unknown): {
  storyIds: string[];
  decision: StoryReviewDecision;
} {
  if (!isRecord(value)) {
    throw new InvalidStoryReviewError("The request body must be an object");
  }

  if (value.decision !== "approved" && value.decision !== "rejected") {
    throw new InvalidStoryReviewError(
      'The decision must be either "approved" or "rejected"',
    );
  }

  if (
    !Array.isArray(value.storyIds) ||
    !value.storyIds.every((storyId) => typeof storyId === "string")
  ) {
    throw new InvalidStoryReviewError("storyIds must be an array of UUIDs");
  }

  const storyIds = [...new Set(value.storyIds)];

  if (storyIds.length === 0) {
    throw new InvalidStoryReviewError("Select at least one story");
  }

  if (storyIds.length > MAX_STORIES_PER_REVIEW) {
    throw new InvalidStoryReviewError(
      `No more than ${MAX_STORIES_PER_REVIEW} stories can be reviewed at once`,
    );
  }

  if (!storyIds.every((storyId) => UUID_PATTERN.test(storyId))) {
    throw new InvalidStoryReviewError("Every storyId must be a valid UUID");
  }

  return {
    storyIds,
    decision: value.decision,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

class InvalidStoryReviewError extends Error {}
