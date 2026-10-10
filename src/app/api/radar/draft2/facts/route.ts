import { authorizeRadarCollector } from "@/app/api/radar/radar-api-auth";
import { requireActiveRequestTopic, topicRequestErrorResponse } from "@/app/api/radar/radar-topic";
import { creativeRouteErrorResponse, noStoreJson } from "@/app/api/radar/creative-route-error";
import { Draft2BusyError, Draft2InputError, runDraft2Facts } from "@/app/modules/draft2/draft2-facts";
import { Draft2ResponseError } from "@/app/modules/draft2/draft2-facts.types";
import { latestDraft2Session } from "@/app/modules/draft2/draft2-session.repository";
import { SelectedStoryContentNotFoundError } from "@/app/modules/stories/story-content.repository";

export const runtime = "nodejs";
// Up to three extractions and three reviews; the step stops starting rounds well inside this.
export const maxDuration = 300;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** The latest Draft 2 session of a story, so the canvas shows what was already done. */
export async function GET(request: Request) {
  const denied = await authorizeRadarCollector(request);
  if (denied) return denied;
  const storyId = new URL(request.url).searchParams.get("storyId") ?? "";
  if (!UUID_PATTERN.test(storyId)) return noStoreJson({ error: "storyId must be a valid UUID" }, 400);
  try {
    const topicId = await requireActiveRequestTopic(request);
    return noStoreJson({ session: (await latestDraft2Session(topicId, storyId)) ?? null });
  } catch (error) {
    return topicRequestErrorResponse(error) ?? creativeRouteErrorResponse(error, "read the Draft 2 session");
  }
}

/** Runs the Facts step for the story and returns the finished session. */
export async function POST(request: Request) {
  const denied = await authorizeRadarCollector(request);
  if (denied) return denied;
  const body = await request.json().catch(() => null) as { storyId?: unknown } | null;
  const storyId = typeof body?.storyId === "string" ? body.storyId : "";
  if (!UUID_PATTERN.test(storyId)) return noStoreJson({ error: "storyId must be a valid UUID" }, 400);
  try {
    const topicId = await requireActiveRequestTopic(request);
    return noStoreJson({ session: await runDraft2Facts({ topicId, storyId }) });
  } catch (error) {
    const topicError = topicRequestErrorResponse(error);
    if (topicError) return topicError;
    if (error instanceof SelectedStoryContentNotFoundError) return noStoreJson({ error: error.message }, 404);
    if (error instanceof Draft2InputError) return noStoreJson({ error: error.message }, 422);
    if (error instanceof Draft2BusyError) return noStoreJson({ error: error.message }, 409);
    if (error instanceof Draft2ResponseError) return noStoreJson({ error: error.message }, 502);
    return creativeRouteErrorResponse(error, "run the Draft 2 facts step");
  }
}
