import { authorizeRadarCollector } from "@/app/api/radar/radar-api-auth";
import {
  requireActiveRequestTopic,
  topicRequestErrorResponse,
} from "@/app/api/radar/radar-topic";
import { getEditorialEvaluationPublicConfig } from "@/app/modules/stories/editorial-evaluation.config";
import {
  EditorialStoryPromotionConflictError,
  promoteEditorialReviewCandidate,
} from "@/app/modules/stories/story-editorial.repository";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type Context = { params: Promise<{ storyId: string }> };

/**
 * Explicit human override for an AI review candidate. It is intentionally a
 * separate route from shortlist approval so the UI can label the action and
 * preserve the evaluator's original Review decision.
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
    await promoteEditorialReviewCandidate(
      topicId,
      storyId,
      getEditorialEvaluationPublicConfig(),
    );

    return noStoreJson({ storyId, promoted: true });
  } catch (error) {
    const topicError = topicRequestErrorResponse(error);
    if (topicError) return topicError;

    if (error instanceof EditorialStoryPromotionConflictError) {
      return noStoreJson({ error: error.message }, 409);
    }

    console.error("Failed to promote editorial review candidate", error);
    return noStoreJson(
      { error: "The story could not be promoted" },
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
