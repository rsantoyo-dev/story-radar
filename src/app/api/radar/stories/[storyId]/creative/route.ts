import { authorizeRadarCollector } from "@/app/api/radar/radar-api-auth";
import {
  requireActiveRequestTopic,
  topicRequestErrorResponse,
} from "@/app/api/radar/radar-topic";
import {
  createCreativeBrief,
  CreativeDraftValidationError,
  getCreativeWorkspaceState,
} from "@/app/modules/stories/manage-creative-content";
import {
  creativeRouteErrorResponse,
  noStoreJson,
} from "../../../creative-route-error";

export const runtime = "nodejs";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type Context = { params: Promise<{ storyId: string }> };

export async function GET(request: Request, context: Context) {
  const unauthorized = authorizeRadarCollector(request);
  if (unauthorized) return unauthorized;
  const storyId = await parseId(context);

  if (!storyId) {
    return noStoreJson({ error: "storyId must be a valid UUID" }, 400);
  }

  try {
    return noStoreJson(
      await getCreativeWorkspaceState(
        await requireActiveRequestTopic(request),
        storyId,
      ),
    );
  } catch (error) {
    const topicError = topicRequestErrorResponse(error);
    if (topicError) return topicError;

    return creativeRouteErrorResponse(error, "read the creative workspace");
  }
}

export async function POST(request: Request, context: Context) {
  const unauthorized = authorizeRadarCollector(request);
  if (unauthorized) return unauthorized;
  const storyId = await parseId(context);

  if (!storyId) {
    return noStoreJson({ error: "storyId must be a valid UUID" }, 400);
  }

  try {
    const editorialDirection = await parseEditorialDirection(request);
    return noStoreJson(
      await createCreativeBrief(
        await requireActiveRequestTopic(request),
        storyId,
        editorialDirection,
      ),
    );
  } catch (error) {
    const topicError = topicRequestErrorResponse(error);
    if (topicError) return topicError;

    return creativeRouteErrorResponse(error, "create the creative brief");
  }
}

async function parseEditorialDirection(
  request: Request,
): Promise<string | undefined> {
  const text = await request.text();
  if (!text.trim()) return undefined;
  const body = JSON.parse(text) as unknown;
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new CreativeDraftValidationError("A JSON object is required");
  }
  const value = (body as Record<string, unknown>).editorialDirection;
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string") {
    throw new CreativeDraftValidationError(
      "editorialDirection must be text",
    );
  }
  return value;
}

async function parseId(context: Context): Promise<string | undefined> {
  const { storyId } = await context.params;
  return UUID_PATTERN.test(storyId) ? storyId : undefined;
}
