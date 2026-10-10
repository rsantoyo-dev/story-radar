import { authorizeRadarCollector } from "@/app/api/radar/radar-api-auth";
import { requireActiveRequestTopic } from "@/app/api/radar/radar-topic";
import { noStoreJson } from "@/app/api/radar/creative-route-error";
import { editDraft2Images, runDraft2Images } from "@/app/modules/draft2/draft2-images";
import { DRAFT2_UUID_PATTERN, draft2ErrorResponse } from "../draft2-route";

export const runtime = "nodejs";
// fal makes the images in its queue; a request submits, polls, finishes and reviews them, and pauses well inside this.
export const maxDuration = 300;

/**
 * Makes the images of the session's chosen visual script and returns the
 * session: finished, or paused while fal is still making some
 * (images.status "paused"); `continue: true` picks a paused, stopped or
 * newly queued run up.
 */
export async function POST(request: Request) {
  const denied = await authorizeRadarCollector(request);
  if (denied) return denied;
  const body = await request.json().catch(() => null) as { storyId?: unknown; sessionId?: unknown; continue?: unknown } | null;
  const storyId = typeof body?.storyId === "string" ? body.storyId : "";
  const sessionId = typeof body?.sessionId === "string" ? body.sessionId : "";
  if (!DRAFT2_UUID_PATTERN.test(storyId) || !DRAFT2_UUID_PATTERN.test(sessionId)) return noStoreJson({ error: "storyId and sessionId must be valid UUIDs" }, 400);
  try {
    const topicId = await requireActiveRequestTopic(request);
    return noStoreJson({ session: await runDraft2Images({ topicId, storyId, sessionId, resume: body?.continue === true }) });
  } catch (error) {
    return draft2ErrorResponse(error, "make the Draft 2 images");
  }
}

/** One editor decision: another image of a slide, or the version a slide shows. No provider call. */
export async function PATCH(request: Request) {
  const denied = await authorizeRadarCollector(request);
  if (denied) return denied;
  const body = await request.json().catch(() => null) as { sessionId?: unknown } | null;
  const sessionId = typeof body?.sessionId === "string" ? body.sessionId : "";
  if (!DRAFT2_UUID_PATTERN.test(sessionId)) return noStoreJson({ error: "sessionId must be a valid UUID" }, 400);
  try {
    const topicId = await requireActiveRequestTopic(request);
    return noStoreJson({ session: await editDraft2Images({ topicId, sessionId, input: body }) });
  } catch (error) {
    return draft2ErrorResponse(error, "save the image decision");
  }
}
