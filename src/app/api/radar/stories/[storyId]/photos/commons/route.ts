import { authorizeRadarCollector } from "@/app/api/radar/radar-api-auth";
import { requireActiveRequestTopic, topicRequestErrorResponse } from "@/app/api/radar/radar-topic";
import { creativeRouteErrorResponse, noStoreJson } from "@/app/api/radar/creative-route-error";
import { CommonsPersonError, importCommonsPersonPhoto, parseCommonsSubjectKind, searchCommonsPeople } from "@/app/modules/stories/commons-person-photos";
import { STORY_UUID } from "@/app/modules/stories/story-materials.types";

export const runtime = "nodejs";
export const maxDuration = 60;
type Context = { params: Promise<{ storyId: string }> };

/** GET ?q=name&kind=person|place → real people (exact name) or places with a reusable Commons photo. */
export async function GET(request: Request, context: Context) {
  const params = new URL(request.url).searchParams;
  return handle(request, context, (topicId, storyId) =>
    searchCommonsPeople(topicId, storyId, params.get("q"), parseCommonsSubjectKind(params.get("kind"))).then((people) => ({ people })));
}

/** POST {entityId} → imports that person's photo as a documentary-portrait-only story photo. */
export async function POST(request: Request, context: Context) {
  return handle(request, context, async (topicId, storyId) => {
    const body = (await request.json().catch(() => undefined)) as { entityId?: unknown; kind?: unknown } | undefined;
    return { photo: await importCommonsPersonPhoto(topicId, storyId, body?.entityId, parseCommonsSubjectKind(body?.kind)) };
  }, 201);
}

async function handle(request: Request, context: Context, run: (topicId: string, storyId: string) => Promise<unknown>, status = 200) {
  const unauthorized = await authorizeRadarCollector(request);
  if (unauthorized) return unauthorized;
  const { storyId } = await context.params;
  if (!STORY_UUID.test(storyId)) return noStoreJson({ error: "Invalid story ID" }, 400);
  try {
    const topicId = await requireActiveRequestTopic(request);
    return noStoreJson(await run(topicId, storyId), status);
  } catch (error) {
    if (error instanceof CommonsPersonError) return noStoreJson({ error: error.message }, 400);
    return topicRequestErrorResponse(error) ?? creativeRouteErrorResponse(error, "find a Wikimedia Commons portrait");
  }
}
