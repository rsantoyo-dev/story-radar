import { authorizeRadarCollector } from "@/app/api/radar/radar-api-auth";
import {
  creativeRouteErrorResponse,
  noStoreJson,
} from "@/app/api/radar/creative-route-error";
import {
  requireActiveRequestTopic,
  topicRequestErrorResponse,
} from "@/app/api/radar/radar-topic";
import {
  BrandPaletteSuggestionResponseError,
  BrandPaletteSuggestionValidationError,
} from "@/app/modules/stories/brand-palette-suggestion";
import {
  BrandPaletteSuggestionLimitError,
  suggestBrandPalette,
} from "@/app/modules/stories/suggest-brand-palette";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Creative profile › Identity: "How do you imagine your palette?". Body:
 * `{ prompt }`. Returns a proposed brand palette plus a short summary; the
 * profile is not modified here, the editor saves it from the panel.
 */
export async function POST(request: Request) {
  const unauthorized = authorizeRadarCollector(request);
  if (unauthorized) return unauthorized;

  try {
    const topicId = await requireActiveRequestTopic(request);
    const body = (await request.json().catch(() => undefined)) as unknown;
    const prompt =
      typeof body === "object" && body !== null && !Array.isArray(body)
        ? (body as Record<string, unknown>).prompt
        : undefined;
    return noStoreJson(await suggestBrandPalette({ topicId, prompt }));
  } catch (error) {
    const topicError = topicRequestErrorResponse(error);
    if (topicError) return topicError;
    if (error instanceof BrandPaletteSuggestionValidationError) {
      return noStoreJson({ error: error.message }, 400);
    }
    if (error instanceof BrandPaletteSuggestionLimitError) {
      return noStoreJson({ error: error.message }, 429);
    }
    if (error instanceof BrandPaletteSuggestionResponseError) {
      return noStoreJson({ error: error.message }, 502);
    }
    return creativeRouteErrorResponse(error, "suggest a brand palette");
  }
}
