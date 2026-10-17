import { authorizeRadarCollector, requireTopicForRequest } from "@/app/api/radar/radar-api-auth";
import { topicRequestErrorResponse } from "@/app/api/radar/radar-topic";
import { creativeRouteErrorResponse, noStoreJson } from "@/app/api/radar/creative-route-error";
import { topicIdFromRequest } from "@/app/modules/topics/topic-context";
import { changeBankSubject, loadPhotoBank } from "@/app/modules/photo-bank/photo-bank";
import { parseSubjectChange } from "@/app/modules/photo-bank/photo-bank.types";
import { STORY_UUID } from "@/app/modules/stories/story-materials.types";

export const runtime = "nodejs";
type Context = { params: Promise<{ subjectId: string }> };

/** PATCH { name } | { consent } → the bank as it now stands. A new name keeps the old one as an alias. */
export async function PATCH(request: Request, context: Context) {
  const unauthorized = await authorizeRadarCollector(request);
  if (unauthorized) return unauthorized;
  const { subjectId } = await context.params;
  if (!STORY_UUID.test(subjectId)) return noStoreJson({ error: "Invalid place or person ID" }, 400);
  try {
    const topic = await requireTopicForRequest(request, topicIdFromRequest(request), { active: true });
    await changeBankSubject(topic.workspaceId, subjectId, parseSubjectChange(await request.json()));
    return noStoreJson(await loadPhotoBank(topic.workspaceId, { retired: new URL(request.url).searchParams.get("retired") === "true" }));
  } catch (error) { return topicRequestErrorResponse(error) ?? creativeRouteErrorResponse(error, "change a photo bank place or person"); }
}
