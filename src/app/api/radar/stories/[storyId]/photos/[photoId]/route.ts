import { authorizeRadarCollector } from "@/app/api/radar/radar-api-auth";
import { requireActiveRequestTopic, topicRequestErrorResponse } from "@/app/api/radar/radar-topic";
import { creativeRouteErrorResponse, noStoreJson } from "@/app/api/radar/creative-route-error";
import { findStoryPhoto, revokeStoryPhoto, setStoryPhotoFocus, setStoryPhotoRights } from "@/app/modules/stories/story-materials.repository";
import { readPrivateR2ImageFile } from "@/app/modules/stories/r2-storage";
import { parsePhotoFocus, parsePhotoRights, STORY_UUID } from "@/app/modules/stories/story-materials.types";
import { syncStoryPhotoFocus, syncStoryPhotoRights } from "@/app/modules/photo-bank/photo-bank";
export const runtime = "nodejs";
type Context = { params: Promise<{ storyId: string; photoId: string }> };
export async function GET(request: Request, context: Context) { return handle(request, context, false); }
export async function DELETE(request: Request, context: Context) { return handle(request, context, true); }
/**
 * Sets where the photo's subject is ({ focus: { x, y } }) or clears it ({ focus: null }), or declares its publication rights ({ publicationRights }).
 * Both are the photo's: they reach its photo-bank photo, and the rights every story's copy of it.
 */
export async function PATCH(request: Request, context: Context) {
  const unauthorized = await authorizeRadarCollector(request);
  if (unauthorized) return unauthorized;
  const { storyId, photoId } = await context.params;
  if (!STORY_UUID.test(storyId) || !STORY_UUID.test(photoId)) return noStoreJson({ error: "Invalid photo ID" }, 400);
  try {
    const topicId = await requireActiveRequestTopic(request);
    const body = await request.json().catch(() => undefined) as { focus?: unknown; publicationRights?: unknown } | undefined;
    if (body && "publicationRights" in body) {
      const rights = parsePhotoRights(body.publicationRights);
      const photo = await setStoryPhotoRights(topicId, storyId, photoId, rights);
      await syncStoryPhotoRights(photo, rights);
      return noStoreJson(photo);
    }
    if (!body || !("focus" in body)) return noStoreJson({ error: "focus or publicationRights is required" }, 400);
    const focus = parsePhotoFocus(body.focus);
    const photo = await setStoryPhotoFocus(topicId, storyId, photoId, focus);
    await syncStoryPhotoFocus(photo, focus);
    return noStoreJson(photo);
  } catch (error) { return topicRequestErrorResponse(error) ?? creativeRouteErrorResponse(error, "update story photo"); }
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
