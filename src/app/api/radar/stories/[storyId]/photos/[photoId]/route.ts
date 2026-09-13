import { authorizeRadarCollector } from "@/app/api/radar/radar-api-auth";
import { requireActiveRequestTopic, topicRequestErrorResponse } from "@/app/api/radar/radar-topic";
import { creativeRouteErrorResponse, noStoreJson } from "@/app/api/radar/creative-route-error";
import { findStoryPhoto, revokeStoryPhoto } from "@/app/modules/stories/story-materials.repository";
import { readPrivateR2ImageFile } from "@/app/modules/stories/r2-storage";
import { STORY_UUID } from "@/app/modules/stories/story-materials.types";
export const runtime = "nodejs";
type Context = { params: Promise<{ storyId: string; photoId: string }> };
export async function GET(request: Request, context: Context) { return handle(request, context, false); }
export async function DELETE(request: Request, context: Context) { return handle(request, context, true); }
async function handle(request: Request, context: Context, revoke: boolean) {
  const unauthorized = authorizeRadarCollector(request);
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
