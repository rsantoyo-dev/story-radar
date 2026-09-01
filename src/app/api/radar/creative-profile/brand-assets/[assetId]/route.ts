import { authorizeRadarCollector } from "@/app/api/radar/radar-api-auth";
import {
  creativeRouteErrorResponse,
  noStoreJson,
} from "@/app/api/radar/creative-route-error";
import {
  requireRequestTopic,
  topicRequestErrorResponse,
} from "@/app/api/radar/radar-topic";
import { readCreativeBrandAsset } from "@/app/modules/stories/manage-creative-brand-assets";

export const runtime = "nodejs";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type Context = { params: Promise<{ assetId: string }> };

export async function GET(request: Request, context: Context) {
  const unauthorized = authorizeRadarCollector(request);
  if (unauthorized) return unauthorized;
  const { assetId } = await context.params;
  if (!UUID_PATTERN.test(assetId)) {
    return noStoreJson({ error: "assetId must be a valid UUID" }, 400);
  }

  try {
    const image = await readCreativeBrandAsset({
      topicId: await requireRequestTopic(request),
      assetId,
    });
    return new Response(image, {
      headers: {
        "Cache-Control": "private, no-store",
        "Content-Length": String(image.size),
        "Content-Type": "image/png",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    const topicError = topicRequestErrorResponse(error);
    if (topicError) return topicError;

    return creativeRouteErrorResponse(error, "load the brand asset");
  }
}
