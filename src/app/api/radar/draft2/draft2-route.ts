import { authorizeRadarCollector } from "@/app/api/radar/radar-api-auth";
import { requireActiveRequestTopic, topicRequestErrorResponse } from "@/app/api/radar/radar-topic";
import { creativeRouteErrorResponse, noStoreJson } from "@/app/api/radar/creative-route-error";
import { Draft2BusyError, Draft2InputError, Draft2ResponseError } from "@/app/modules/draft2/draft2-facts.types";
import { latestDraft2Session } from "@/app/modules/draft2/draft2-session.repository";
import { SelectedStoryContentNotFoundError } from "@/app/modules/stories/story-content.repository";

/** What every Draft 2 route shares: id validation, the latest session read and the step error mapping. */
export const DRAFT2_UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** The latest Draft 2 session of a story, every step's columns, so the canvas shows what was already done. */
export async function latestDraft2SessionResponse(request: Request): Promise<Response> {
  const denied = await authorizeRadarCollector(request);
  if (denied) return denied;
  const storyId = new URL(request.url).searchParams.get("storyId") ?? "";
  if (!DRAFT2_UUID_PATTERN.test(storyId)) return noStoreJson({ error: "storyId must be a valid UUID" }, 400);
  try {
    const topicId = await requireActiveRequestTopic(request);
    return noStoreJson({ session: (await latestDraft2Session(topicId, storyId)) ?? null });
  } catch (error) {
    return topicRequestErrorResponse(error) ?? creativeRouteErrorResponse(error, "read the Draft 2 session");
  }
}

/** A step's failure as a response: a step that cannot start 422, a run in progress 409, a malformed model answer 502, provider errors as the studio maps them. */
export function draft2ErrorResponse(error: unknown, operation: string): Response {
  const topicError = topicRequestErrorResponse(error);
  if (topicError) return topicError;
  if (error instanceof SelectedStoryContentNotFoundError) return noStoreJson({ error: error.message }, 404);
  if (error instanceof Draft2InputError) return noStoreJson({ error: error.message }, 422);
  if (error instanceof Draft2BusyError) return noStoreJson({ error: error.message }, 409);
  if (error instanceof Draft2ResponseError) return noStoreJson({ error: error.message }, 502);
  return creativeRouteErrorResponse(error, operation);
}
