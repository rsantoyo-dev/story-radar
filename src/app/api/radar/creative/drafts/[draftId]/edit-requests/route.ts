import { authorizeRadarCollector } from "@/app/api/radar/radar-api-auth";
import {
  requireActiveRequestTopic,
  topicRequestErrorResponse,
} from "@/app/api/radar/radar-topic";
import { parseCreativeAssetEditRequestInput } from "@/app/modules/stories/creative-asset-edit-request-input";
import {
  discardCreativeAssetEditRequest,
  listCreativeAssetEditRequests,
  saveCreativeAssetEditRequest,
} from "@/app/modules/stories/creative-asset-edit-requests.repository";
import {
  creativeRouteErrorResponse,
  noStoreJson,
} from "../../../../creative-route-error";

export const runtime = "nodejs";
export const maxDuration = 15;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type Context = { params: Promise<{ draftId: string }> };

async function parseId(context: Context): Promise<string | undefined> {
  const { draftId } = await context.params;
  return UUID_PATTERN.test(draftId) ? draftId : undefined;
}

export async function GET(request: Request, context: Context) {
  const unauthorized = authorizeRadarCollector(request);
  if (unauthorized) return unauthorized;
  const draftId = await parseId(context);
  if (!draftId) {
    return noStoreJson({ error: "draftId must be a valid UUID" }, 400);
  }

  try {
    const topicId = await requireActiveRequestTopic(request);
    return noStoreJson({
      requests: await listCreativeAssetEditRequests(topicId, draftId),
    });
  } catch (error) {
    const topicError = topicRequestErrorResponse(error);
    if (topicError) return topicError;
    return creativeRouteErrorResponse(error, "load the saved image edits");
  }
}

export async function PUT(request: Request, context: Context) {
  const unauthorized = authorizeRadarCollector(request);
  if (unauthorized) return unauthorized;
  const draftId = await parseId(context);
  if (!draftId) {
    return noStoreJson({ error: "draftId must be a valid UUID" }, 400);
  }

  try {
    const input = parseCreativeAssetEditRequestInput(await request.json());
    const topicId = await requireActiveRequestTopic(request);
    return noStoreJson({
      request: await saveCreativeAssetEditRequest(topicId, draftId, input),
    });
  } catch (error) {
    const topicError = topicRequestErrorResponse(error);
    if (topicError) return topicError;
    return creativeRouteErrorResponse(error, "save the image edit");
  }
}

export async function DELETE(request: Request, context: Context) {
  const unauthorized = authorizeRadarCollector(request);
  if (unauthorized) return unauthorized;
  const draftId = await parseId(context);
  if (!draftId) {
    return noStoreJson({ error: "draftId must be a valid UUID" }, 400);
  }

  try {
    const body = (await request.json()) as { unitOrder?: unknown };
    if (
      typeof body.unitOrder !== "number" ||
      !Number.isInteger(body.unitOrder) ||
      body.unitOrder <= 0
    ) {
      return noStoreJson({ error: "unitOrder must be a positive integer" }, 400);
    }
    const topicId = await requireActiveRequestTopic(request);
    await discardCreativeAssetEditRequest(topicId, draftId, body.unitOrder);
    return noStoreJson({ ok: true });
  } catch (error) {
    const topicError = topicRequestErrorResponse(error);
    if (topicError) return topicError;
    return creativeRouteErrorResponse(error, "discard the image edit");
  }
}
