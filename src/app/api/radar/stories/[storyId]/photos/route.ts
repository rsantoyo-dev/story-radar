import { authorizeRadarCollector } from "@/app/api/radar/radar-api-auth";
import { requireActiveRequestTopic, topicRequestErrorResponse } from "@/app/api/radar/radar-topic";
import { creativeRouteErrorResponse, noStoreJson } from "@/app/api/radar/creative-route-error";
import { listStoryPhotos } from "@/app/modules/stories/story-materials.repository";
import { uploadStoryPhoto } from "@/app/modules/stories/manage-story-photos";
import { STORY_UUID } from "@/app/modules/stories/story-materials.types";
export const runtime = "nodejs";
type Context = { params: Promise<{ storyId: string }> };
export async function GET(request: Request, context: Context) { return handle(request, context, false); }
export async function POST(request: Request, context: Context) { return handle(request, context, true); }
async function handle(request: Request, context: Context, upload: boolean) {
  const unauthorized = authorizeRadarCollector(request);
  if (unauthorized) return unauthorized;
  const { storyId } = await context.params;
  if (!STORY_UUID.test(storyId)) return noStoreJson({ error: "Invalid story ID" }, 400);
  if (upload && Number(request.headers.get("content-length")) > 16 * 1024 * 1024) return noStoreJson({ error: "Upload exceeds 16 MB" }, 413);
  try {
    const topicId = await requireActiveRequestTopic(request);
    return noStoreJson(upload ? await uploadStoryPhoto(topicId, storyId, await request.formData()) : await listStoryPhotos(topicId, storyId));
  } catch (error) { return topicRequestErrorResponse(error) ?? creativeRouteErrorResponse(error, "manage story photos"); }
}
