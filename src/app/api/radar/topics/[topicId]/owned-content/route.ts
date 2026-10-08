import { authorizeRadarCollector } from "@/app/api/radar/radar-api-auth";
import {
  jsonObject,
  noStoreJson,
} from "@/app/api/radar/topics/topic-route-utils";
import {
  createOwnedContentStory,
  listOwnedContentEntries,
  OwnedContentValidationError,
  type CreateOwnedContentInput,
} from "@/app/modules/stories/owned-content.repository";
import { TopicContextError, requireTopic } from "@/app/modules/topics/topic-context";
import { withApiLog } from "@/app/modules/observability/api-request-log";

type Context = { params: Promise<{ topicId: string }> };

async function route_GET(request: Request, context: Context) {
  const unauthorized = await authorizeRadarCollector(request);
  if (unauthorized) return unauthorized;

  try {
    const topicId = await topicIdFromContext(context);
    return noStoreJson({ entries: await listOwnedContentEntries(topicId) });
  } catch (error) {
    return ownedContentRouteError(error, "load owned content");
  }
}

async function route_POST(request: Request, context: Context) {
  const unauthorized = await authorizeRadarCollector(request);
  if (unauthorized) return unauthorized;

  try {
    const topicId = await topicIdFromContext(context);
    const entry = await createOwnedContentStory(
      topicId,
      parseCreateInput(await jsonObject(request)),
    );
    return noStoreJson({ entry }, 201);
  } catch (error) {
    return ownedContentRouteError(error, "create owned content");
  }
}

async function topicIdFromContext(context: Context): Promise<string> {
  const { topicId } = await context.params;
  return (await requireTopic(topicId, { active: true })).id;
}

function parseCreateInput(body: Record<string, unknown>): CreateOwnedContentInput {
  return {
    title: body.title as string,
    content: body.content as string,
    ...(typeof body.contentType === "string"
      ? { contentType: body.contentType as CreateOwnedContentInput["contentType"] }
      : {}),
    ...(typeof body.language === "string" ? { language: body.language } : {}),
    ...(typeof body.region === "string" ? { region: body.region } : {}),
    ...(typeof body.sourceUrl === "string" ? { sourceUrl: body.sourceUrl } : {}),
    ...(typeof body.publishedAt === "string" ? { publishedAt: body.publishedAt } : {}),
  };
}

function ownedContentRouteError(error: unknown, action: string) {
  if (error instanceof TopicContextError) {
    return noStoreJson({ error: error.message }, 404);
  }
  if (error instanceof OwnedContentValidationError) {
    return noStoreJson({ error: error.message }, 400);
  }
  console.error(`Failed to ${action}`, error);
  return noStoreJson({ error: `Unable to ${action}` }, 500);
}

export const GET = withApiLog(route_GET);
export const POST = withApiLog(route_POST);
