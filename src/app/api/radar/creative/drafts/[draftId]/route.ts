import { authorizeRadarCollector } from "@/app/api/radar/radar-api-auth";
import {
  requireActiveRequestTopic,
  topicRequestErrorResponse,
} from "@/app/api/radar/radar-topic";
import {
  approveSavedCreativeDraft,
  saveCreativeDraft,
  unapproveSavedCreativeDraft,
} from "@/app/modules/stories/manage-creative-content";
import {
  creativeRouteErrorResponse,
  noStoreJson,
} from "../../../creative-route-error";

export const runtime = "nodejs";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type Context = { params: Promise<{ draftId: string }> };

export async function PUT(request: Request, context: Context) {
  const unauthorized = authorizeRadarCollector(request);
  if (unauthorized) return unauthorized;
  const draftId = await parseId(context);

  if (!draftId) {
    return noStoreJson({ error: "draftId must be a valid UUID" }, 400);
  }

  try {
    return noStoreJson(
      await saveCreativeDraft(
        await requireActiveRequestTopic(request),
        draftId,
        await request.json(),
      ),
    );
  } catch (error) {
    const topicError = topicRequestErrorResponse(error);
    if (topicError) return topicError;

    return creativeRouteErrorResponse(error, "save the creative draft");
  }
}

export async function PATCH(request: Request, context: Context) {
  const unauthorized = authorizeRadarCollector(request);
  if (unauthorized) return unauthorized;
  const draftId = await parseId(context);

  if (!draftId) {
    return noStoreJson({ error: "draftId must be a valid UUID" }, 400);
  }

  try {
    const body = (await request.json()) as { action?: unknown };
    if (body.action !== "approve" && body.action !== "unapprove") {
      return noStoreJson({ error: "action must be approve or unapprove" }, 400);
    }
    const topicId = await requireActiveRequestTopic(request);
    return noStoreJson(
      body.action === "approve"
        ? await approveSavedCreativeDraft(topicId, draftId)
        : await unapproveSavedCreativeDraft(topicId, draftId),
    );
  } catch (error) {
    const topicError = topicRequestErrorResponse(error);
    if (topicError) return topicError;

    return creativeRouteErrorResponse(
      error,
      "change the creative draft approval",
    );
  }
}

async function parseId(context: Context): Promise<string | undefined> {
  const { draftId } = await context.params;
  return UUID_PATTERN.test(draftId) ? draftId : undefined;
}
