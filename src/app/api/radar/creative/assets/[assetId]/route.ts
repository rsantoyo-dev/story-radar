import { authorizeRadarCollector } from "@/app/api/radar/radar-api-auth";
import {
  requireActiveRequestTopic,
  topicRequestErrorResponse,
} from "@/app/api/radar/radar-topic";
import {
  changeCreativeAssetApproval,
  regenerateCreativeAsset,
} from "@/app/modules/stories/manage-creative-assets";
import {
  creativeRouteErrorResponse,
  noStoreJson,
} from "../../../creative-route-error";

export const runtime = "nodejs";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type Context = { params: Promise<{ assetId: string }> };

export async function POST(request: Request, context: Context) {
  const unauthorized = authorizeRadarCollector(request);
  if (unauthorized) return unauthorized;
  const assetId = await parseId(context);
  if (!assetId) {
    return noStoreJson({ error: "assetId must be a valid UUID" }, 400);
  }

  try {
    return noStoreJson(
      await regenerateCreativeAsset(
        await requireActiveRequestTopic(request),
        assetId,
        await request.json(),
      ),
      202,
    );
  } catch (error) {
    const topicError = topicRequestErrorResponse(error);
    if (topicError) return topicError;

    return creativeRouteErrorResponse(error, "regenerate the creative image");
  }
}

export async function PATCH(request: Request, context: Context) {
  const unauthorized = authorizeRadarCollector(request);
  if (unauthorized) return unauthorized;
  const assetId = await parseId(context);
  if (!assetId) {
    return noStoreJson({ error: "assetId must be a valid UUID" }, 400);
  }

  try {
    const body = (await request.json()) as { action?: unknown };
    if (body.action !== "approve" && body.action !== "unapprove") {
      return noStoreJson({ error: "action must be approve or unapprove" }, 400);
    }
    return noStoreJson(
      await changeCreativeAssetApproval(
        await requireActiveRequestTopic(request),
        assetId,
        body.action,
      ),
    );
  } catch (error) {
    const topicError = topicRequestErrorResponse(error);
    if (topicError) return topicError;

    return creativeRouteErrorResponse(
      error,
      "change the creative image approval",
    );
  }
}

async function parseId(context: Context): Promise<string | undefined> {
  const { assetId } = await context.params;
  return UUID_PATTERN.test(assetId) ? assetId : undefined;
}
