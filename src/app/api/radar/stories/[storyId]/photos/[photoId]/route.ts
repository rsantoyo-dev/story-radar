import { authorizeRadarCollector } from "@/app/api/radar/radar-api-auth";
import { requireActiveRequestTopic, topicRequestErrorResponse } from "@/app/api/radar/radar-topic";
import { creativeRouteErrorResponse, noStoreJson } from "@/app/api/radar/creative-route-error";
import { findStoryPhoto, revokeStoryPhoto, setStoryPhotoFocus } from "@/app/modules/stories/story-materials.repository";
import { readPrivateR2ImageFile } from "@/app/modules/stories/r2-storage";
import { parsePhotoFocus, STORY_UUID } from "@/app/modules/stories/story-materials.types";
import { withApiLog } from "@/app/modules/observability/api-request-log";
export const runtime = "nodejs";
type Context = { params: Promise<{ storyId: string; photoId: string }> };
async function route_GET(request: Request, context: Context) { return handle(request, context, false); }
async function route_DELETE(request: Request, context: Context) { return handle(request, context, true); }
/** Sets where the photo's subject is ({ focus: { x, y } }), or clears it ({ focus: null }). */
async function route_PATCH(request: Request, context: Context) {
  const unauthorized = await authorizeRadarCollector(request);
  if (unauthorized) return unauthorized;
  const { storyId, photoId } = await context.params;
  if (!STORY_UUID.test(storyId) || !STORY_UUID.test(photoId)) return noStoreJson({ error: "Invalid photo ID" }, 400);
  try {
    const topicId = await requireActiveRequestTopic(request);
    const body = await request.json().catch(() => undefined) as { focus?: unknown } | undefined;
    if (!body || !("focus" in body)) return noStoreJson({ error: "focus is required" }, 400);
    return noStoreJson(await setStoryPhotoFocus(topicId, storyId, photoId, parsePhotoFocus(body.focus)));
  } catch (error) { return topicRequestErrorResponse(error) ?? creativeRouteErrorResponse(error, "frame story photo"); }
}
async function handle(request: Request, context: Context, revoke: boolean) {
  const unauthorized = await authorizeRadarCollector(request);
  if (unauthorized) return unauthorized;
  const { storyId, photoId } = await context.params;
  if (!STORY_UUID.test(storyId) || !STORY_UUID.test(photoId)) return noStoreJson({ error: "Invalid photo ID" }, 400);
  try {
    const topicId = await requireActiveRequestTopic(request);
    if (revoke) return noStoreJson(await revokeStoryPhoto(topicId, storyId, photoId));
    const row = await findStoryPhoto(topicId, storyId, photoId);
    if (!row) return noStoreJson({ error: "Photo not found" }, 404);
    const image = await readPrivateR2ImageFile(row);
    return new Response(image, { headers: { "Cache-Control": "private, no-store", "Content-Type": image.type, "X-Content-Type-Options": "nosniff" } });
  } catch (error) { return topicRequestErrorResponse(error) ?? creativeRouteErrorResponse(error, "read story photo"); }
}

export const GET = withApiLog(route_GET);
export const DELETE = withApiLog(route_DELETE);
export const PATCH = withApiLog(route_PATCH);
