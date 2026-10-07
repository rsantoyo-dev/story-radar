import { NextResponse } from "next/server";

import { authorizeRadarCollector } from "@/app/api/radar/radar-api-auth";
import {
  requireActiveRequestTopic,
  topicRequestErrorResponse,
} from "@/app/api/radar/radar-topic";
import {
  OwnedContentSelectionConflictError,
  selectOwnedContentStory,
} from "@/app/modules/stories/select-owned-content";

export const runtime = "nodejs";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type Context = { params: Promise<{ storyId: string }> };

export async function POST(request: Request, context: Context) {
  const unauthorized = await authorizeRadarCollector(request);
  if (unauthorized) return unauthorized;

  const { storyId } = await context.params;
  if (!UUID_PATTERN.test(storyId)) {
    return noStoreJson({ error: "storyId must be a valid UUID" }, 400);
  }

  let expectedDuplicateStoryId: string | null;
  try {
    const body: unknown = await request.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      throw new Error("A selection confirmation is required");
    }
    const value = body as Record<string, unknown>;
    if (value.confirmSelection !== true ||
        !Object.hasOwn(value, "expectedDuplicateStoryId") ||
        (value.expectedDuplicateStoryId !== null &&
          (typeof value.expectedDuplicateStoryId !== "string" || !UUID_PATTERN.test(value.expectedDuplicateStoryId))) ||
        Object.keys(value).some((key) => !["confirmSelection", "expectedDuplicateStoryId"].includes(key))) {
      throw new Error("Confirm selection and provide the duplicate Story ID you reviewed, or null");
    }
    expectedDuplicateStoryId = value.expectedDuplicateStoryId as string | null;
  } catch {
    return noStoreJson({ error: "Confirm selection and provide the duplicate Story ID you reviewed, or null" }, 400);
  }

  try {
    await selectOwnedContentStory(
      await requireActiveRequestTopic(request),
      storyId,
      expectedDuplicateStoryId,
    );
    return noStoreJson({ storyId, selected: true, duplicateOverridden: expectedDuplicateStoryId !== null });
  } catch (error) {
    const topicError = topicRequestErrorResponse(error);
    if (topicError) return topicError;
    if (error instanceof OwnedContentSelectionConflictError) {
      return noStoreJson({ error: error.message }, 409);
    }
    console.error("Failed to select original content", error);
    return noStoreJson({ error: "The original-content Story could not be selected" }, 500);
  }
}

function noStoreJson(value: unknown, status = 200): NextResponse {
  return NextResponse.json(value, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}
