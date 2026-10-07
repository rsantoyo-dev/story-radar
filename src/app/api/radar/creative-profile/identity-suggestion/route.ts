import { authorizeRadarCollector } from "@/app/api/radar/radar-api-auth";
import { creativeRouteErrorResponse, noStoreJson } from "@/app/api/radar/creative-route-error";
import { requireActiveRequestTopic, topicRequestErrorResponse } from "@/app/api/radar/radar-topic";
import { CreativeIdentityValidationError } from "@/app/modules/stories/creative-identity";
import { CreativeIdentitySuggestionLimitError, suggestCreativeIdentity } from "@/app/modules/stories/suggest-creative-identity";

export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * Creative profile › Creative identity: "Organize with AI". Body:
 * `{ guide, instruction?, fields?, current? }`. Returns a proposed identity
 * (and, for the whole identity, a palette); the profile is saved by the editor.
 */
export async function POST(request: Request) {
  const unauthorized = await authorizeRadarCollector(request);
  if (unauthorized) return unauthorized;
  try {
    const topicId = await requireActiveRequestTopic(request);
    const body = (await request.json().catch(() => undefined)) as Record<string, unknown> | undefined;
    if (!body || typeof body !== "object" || Array.isArray(body)) return noStoreJson({ error: "A JSON body is required" }, 400);
    return noStoreJson(await suggestCreativeIdentity({ topicId, guide: body.guide, instruction: body.instruction, fields: body.fields, current: body.current }));
  } catch (error) {
    const topicError = topicRequestErrorResponse(error);
    if (topicError) return topicError;
    if (error instanceof CreativeIdentityValidationError) return noStoreJson({ error: error.message }, 400);
    if (error instanceof CreativeIdentitySuggestionLimitError) return noStoreJson({ error: error.message }, 429);
    return creativeRouteErrorResponse(error, "organize the creative identity");
  }
}
