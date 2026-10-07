import { authorizeRadarCollector } from "@/app/api/radar/radar-api-auth";
import { requireActiveRequestTopic, topicRequestErrorResponse } from "@/app/api/radar/radar-topic";
import { creativeRouteErrorResponse, noStoreJson } from "@/app/api/radar/creative-route-error";
import { STORY_UUID } from "@/app/modules/stories/story-materials.types";
import {
  addStoryEditorFact,
  listStoryEditorFacts,
  parseEditorFactInput,
  retractStoryEditorFact,
  StoryEditorFactValidationError,
} from "@/app/modules/stories/story-editor-facts.repository";

export const runtime = "nodejs";
type Context = { params: Promise<{ storyId: string }> };

/**
 * Editor-provided evidence for a story: list (GET), add (POST {statement,
 * sourceUrl?, note?}) and retract (DELETE {id}). A retracted fact is kept for
 * history and stops supporting new saves, reviews and approvals.
 */
export async function GET(request: Request, context: Context) {
  return handle(request, context, async (topicId, storyId) => ({ facts: await listStoryEditorFacts(topicId, storyId) }));
}

export async function POST(request: Request, context: Context) {
  return handle(request, context, async (topicId, storyId) => {
    const input = parseEditorFactInput(await request.json().catch(() => undefined));
    return { fact: await addStoryEditorFact(topicId, storyId, input) };
  }, 201);
}

export async function DELETE(request: Request, context: Context) {
  return handle(request, context, async (topicId, storyId) => {
    const body = (await request.json().catch(() => undefined)) as { id?: unknown } | undefined;
    if (typeof body?.id !== "string" || !STORY_UUID.test(body.id)) {
      throw new StoryEditorFactValidationError("A valid fact id is required.");
    }
    if (!(await retractStoryEditorFact(topicId, storyId, body.id))) {
      throw new StoryEditorFactValidationError("This fact was already removed.");
    }
    return { facts: await listStoryEditorFacts(topicId, storyId) };
  });
}

async function handle(
  request: Request,
  context: Context,
  run: (topicId: string, storyId: string) => Promise<unknown>,
  status = 200,
) {
  const unauthorized = await authorizeRadarCollector(request);
  if (unauthorized) return unauthorized;
  const { storyId } = await context.params;
  if (!STORY_UUID.test(storyId)) return noStoreJson({ error: "Invalid story ID" }, 400);
  try {
    const topicId = await requireActiveRequestTopic(request);
    return noStoreJson(await run(topicId, storyId), status);
  } catch (error) {
    if (error instanceof StoryEditorFactValidationError) return noStoreJson({ error: error.message }, 400);
    return topicRequestErrorResponse(error) ?? creativeRouteErrorResponse(error, "manage the story's editor facts");
  }
}
