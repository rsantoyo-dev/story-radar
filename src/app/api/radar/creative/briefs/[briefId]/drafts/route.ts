import { authorizeRadarCollector } from "@/app/api/radar/radar-api-auth";
import {
  requireActiveRequestTopic,
  topicRequestErrorResponse,
} from "@/app/api/radar/radar-topic";
import { isCreativeOutputAspectRatio } from "@/app/modules/stories/creative-aspect-ratio";
import { isCreativeFormat } from "@/app/modules/stories/creative-content.types";
import { createCreativeDraft } from "@/app/modules/stories/manage-creative-content";
import {
  creativeRouteErrorResponse,
  noStoreJson,
} from "../../../../creative-route-error";

export const runtime = "nodejs";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type Context = { params: Promise<{ briefId: string }> };

export async function POST(request: Request, context: Context) {
  const unauthorized = authorizeRadarCollector(request);
  if (unauthorized) return unauthorized;
  const { briefId } = await context.params;

  if (!UUID_PATTERN.test(briefId)) {
    return noStoreJson({ error: "briefId must be a valid UUID" }, 400);
  }

  try {
    const body = (await request.json()) as {
      format?: unknown;
      aspectRatio?: unknown;
      createNewVersion?: unknown;
    };

    if (!isCreativeFormat(body.format)) {
      return noStoreJson({ error: "format must be meme or carousel" }, 400);
    }
    if (
      body.aspectRatio !== undefined &&
      !isCreativeOutputAspectRatio(body.aspectRatio)
    ) {
      return noStoreJson(
        { error: "aspectRatio must be 1:1, 4:5, or 16:9" },
        400,
      );
    }
    if (
      body.createNewVersion !== undefined &&
      typeof body.createNewVersion !== "boolean"
    ) {
      return noStoreJson({ error: "createNewVersion must be true or false" }, 400);
    }

    return noStoreJson(
      await createCreativeDraft(
        await requireActiveRequestTopic(request),
        briefId,
        body.format,
        body.aspectRatio,
        body.createNewVersion === true,
      ),
    );
  } catch (error) {
    const topicError = topicRequestErrorResponse(error);
    if (topicError) return topicError;

    return creativeRouteErrorResponse(error, "generate the creative draft");
  }
}
