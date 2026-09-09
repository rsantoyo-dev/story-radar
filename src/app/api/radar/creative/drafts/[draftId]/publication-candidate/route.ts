import { authorizeRadarCollector } from "@/app/api/radar/radar-api-auth";
import { requireActiveRequestTopic, topicRequestErrorResponse } from "@/app/api/radar/radar-topic";
import { noStoreJson, creativeRouteErrorResponse } from "@/app/api/radar/creative-route-error";
import { getPublicationCandidate } from "@/app/modules/meta/get-publication-candidate";

export const runtime = "nodejs";
export const maxDuration = 120;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(request: Request, context: { params: Promise<{ draftId: string }> }) {
  const unauthorized = authorizeRadarCollector(request);
  if (unauthorized) return unauthorized;
  const { draftId } = await context.params;
  const batchId = new URL(request.url).searchParams.get("batchId") ?? "";
  if (!UUID.test(draftId) || !UUID.test(batchId)) return noStoreJson({ error: "Valid draftId and batchId are required" }, 400);
  try {
    return noStoreJson(await getPublicationCandidate(await requireActiveRequestTopic(request), draftId, batchId));
  } catch (error) {
    return topicRequestErrorResponse(error) ?? creativeRouteErrorResponse(error, "validate the publication candidate");
  }
}
