import { authorizeRadarCollector, requireTopicForRequest } from "@/app/api/radar/radar-api-auth";
import { topicRequestErrorResponse } from "@/app/api/radar/radar-topic";
import { creativeRouteErrorResponse, noStoreJson } from "@/app/api/radar/creative-route-error";
import { topicIdFromRequest } from "@/app/modules/topics/topic-context";
import { changeBankPhoto, loadPhotoBank, readBankPhotoFile } from "@/app/modules/photo-bank/photo-bank";
import { parsePhotoChange } from "@/app/modules/photo-bank/photo-bank.types";
import { STORY_UUID } from "@/app/modules/stories/story-materials.types";

export const runtime = "nodejs";
type Context = { params: Promise<{ photoId: string }> };

/** GET → the photo's bytes, for the editor's preview; never its object key. */
export async function GET(request: Request, context: Context) {
  const unauthorized = await authorizeRadarCollector(request);
  if (unauthorized) return unauthorized;
  const { photoId } = await context.params;
  if (!STORY_UUID.test(photoId)) return noStoreJson({ error: "Invalid photo ID" }, 400);
  try {
    const topic = await requireTopicForRequest(request, topicIdFromRequest(request));
    const image = await readBankPhotoFile(topic.workspaceId, photoId);
    return new Response(image, { headers: { "Cache-Control": "private, no-store", "Content-Type": image.type, "X-Content-Type-Options": "nosniff" } });
  } catch (error) { return topicRequestErrorResponse(error) ?? creativeRouteErrorResponse(error, "read a photo bank photo"); }
}

/** PATCH { publicationRights } | { focus } | { retired } | { tag: { subjectId } | { kind, name } } | { untag: subjectId } → the bank as it now stands. */
export async function PATCH(request: Request, context: Context) {
  const unauthorized = await authorizeRadarCollector(request);
  if (unauthorized) return unauthorized;
  const { photoId } = await context.params;
  if (!STORY_UUID.test(photoId)) return noStoreJson({ error: "Invalid photo ID" }, 400);
  try {
    const topic = await requireTopicForRequest(request, topicIdFromRequest(request), { active: true });
    await changeBankPhoto(topic.workspaceId, photoId, parsePhotoChange(await request.json()));
    return noStoreJson(await loadPhotoBank(topic.workspaceId, { retired: new URL(request.url).searchParams.get("retired") === "true" }));
  } catch (error) { return topicRequestErrorResponse(error) ?? creativeRouteErrorResponse(error, "change a photo bank photo"); }
}
