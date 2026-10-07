import { authorizeRadarCollector } from "@/app/api/radar/radar-api-auth";
import { requireActiveRequestTopic, topicRequestErrorResponse } from "@/app/api/radar/radar-topic";
import { noStoreJson, creativeRouteErrorResponse } from "@/app/api/radar/creative-route-error";
import { getPublicationCandidate } from "@/app/modules/meta/get-publication-candidate";
import { DEFAULT_PUBLICATION_CHANNEL, parsePublicationChannel } from "@/app/modules/meta/publication-channel";

export const runtime = "nodejs";
export const maxDuration = 120;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(request: Request, context: { params: Promise<{ draftId: string }> }) {
  const unauthorized = await authorizeRadarCollector(request);
  if (unauthorized) return unauthorized;
  const { draftId } = await context.params;
  const params = new URL(request.url).searchParams;
  const batchId = params.get("batchId") ?? "";
  if (!UUID.test(draftId) || !UUID.test(batchId)) return noStoreJson({ error: "Valid draftId and batchId are required" }, 400);
  const channel = params.has("channel") ? parsePublicationChannel(params.get("channel")) : DEFAULT_PUBLICATION_CHANNEL;
  if (!channel) return noStoreJson({ error: "Unknown publication channel" }, 400);
  try {
    return noStoreJson(await getPublicationCandidate(await requireActiveRequestTopic(request), draftId, batchId, channel));
  } catch (error) {
    return topicRequestErrorResponse(error) ?? creativeRouteErrorResponse(error, "validate the publication candidate");
  }
}
