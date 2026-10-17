import { authorizeRadarCollector, requireTopicForRequest } from "@/app/api/radar/radar-api-auth";
import { topicRequestErrorResponse } from "@/app/api/radar/radar-topic";
import { creativeRouteErrorResponse, noStoreJson } from "@/app/api/radar/creative-route-error";
import { topicIdFromRequest } from "@/app/modules/topics/topic-context";
import { loadPhotoBank, syncPhotoBankQuietly, uploadBankPhoto } from "@/app/modules/photo-bank/photo-bank";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * The workspace's photo bank, read through one of its brands (?topicId=):
 * GET → its places and people and its photos, after bringing in the story
 * photos it does not have yet (?retired=true includes the retired photos);
 * POST (multipart) → a photo added to the bank itself, with what it shows.
 */
export async function GET(request: Request) {
  const unauthorized = await authorizeRadarCollector(request);
  if (unauthorized) return unauthorized;
  try {
    const topic = await requireTopicForRequest(request, topicIdFromRequest(request), { active: true });
    await syncPhotoBankQuietly(topic.workspaceId);
    const retired = new URL(request.url).searchParams.get("retired") === "true";
    return noStoreJson(await loadPhotoBank(topic.workspaceId, { retired }));
  } catch (error) { return topicRequestErrorResponse(error) ?? creativeRouteErrorResponse(error, "read the photo bank"); }
}

export async function POST(request: Request) {
  const unauthorized = await authorizeRadarCollector(request);
  if (unauthorized) return unauthorized;
  if (Number(request.headers.get("content-length")) > 16 * 1024 * 1024) return noStoreJson({ error: "Upload exceeds 16 MB" }, 413);
  try {
    const topic = await requireTopicForRequest(request, topicIdFromRequest(request), { active: true });
    return noStoreJson(await uploadBankPhoto(topic.workspaceId, await request.formData()), 201);
  } catch (error) { return topicRequestErrorResponse(error) ?? creativeRouteErrorResponse(error, "add a photo to the photo bank"); }
}
