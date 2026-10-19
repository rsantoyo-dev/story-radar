import { authorizeRadarCollector } from "@/app/api/radar/radar-api-auth";
import { requireActiveRequestTopic } from "@/app/api/radar/radar-topic";
import { noStoreJson } from "@/app/api/radar/creative-route-error";
import { listDraft2SessionSummaries } from "@/app/modules/draft2/draft2-session.repository";
import { draft2ErrorResponse } from "../draft2-route";

export const runtime = "nodejs";

/** Every story's latest Draft 2 session of the Topic, at a glance (step, status, cost): the dashboard's Today reads it. */
export async function GET(request: Request) {
  const denied = await authorizeRadarCollector(request);
  if (denied) return denied;
  try {
    const topicId = await requireActiveRequestTopic(request);
    return noStoreJson({ sessions: await listDraft2SessionSummaries(topicId) });
  } catch (error) {
    return draft2ErrorResponse(error, "read the Draft 2 sessions");
  }
}
