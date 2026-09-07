import { authorizeRadarCollector } from "@/app/api/radar/radar-api-auth";
import {
  creativeRouteErrorResponse,
  noStoreJson,
} from "@/app/api/radar/creative-route-error";
import {
  requireActiveRequestTopic,
  topicRequestErrorResponse,
} from "@/app/api/radar/radar-topic";
import { analyzeBrandReference } from "@/app/modules/stories/analyze-brand-reference";

export const runtime = "nodejs";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type Context = { params: Promise<{ referenceId: string }> };

/**
 * BRAND-02 — runs (or returns the cached) optional AI visual analysis of one
 * brand reference. No body. Returns the updated reference with `analysis`
 * populated. Provider failure comes back as 502; the daily cap as 429; a
 * missing `GEMINI_API_KEY` as 503.
 */
export async function POST(request: Request, context: Context) {
  const unauthorized = authorizeRadarCollector(request);
  if (unauthorized) return unauthorized;

  const { referenceId } = await context.params;
  if (!UUID_PATTERN.test(referenceId)) {
    return noStoreJson({ error: "referenceId must be a valid UUID" }, 400);
  }

  try {
    return noStoreJson(
      await analyzeBrandReference({
        topicId: await requireActiveRequestTopic(request),
        referenceId,
      }),
    );
  } catch (error) {
    const topicError = topicRequestErrorResponse(error);
    if (topicError) return topicError;
    return creativeRouteErrorResponse(error, "analyze the brand reference");
  }
}
