import { authorizeRadarCollector } from "@/app/api/radar/radar-api-auth";
import { requireActiveRequestTopic } from "@/app/api/radar/radar-topic";
import { noStoreJson } from "@/app/api/radar/creative-route-error";
import { listDraft2SessionSummaries } from "@/app/modules/draft2/draft2-session.repository";
import { latestDraft2AutopilotJobs } from "@/app/modules/draft2/draft2-autopilot";
import { draft2ErrorResponse } from "../draft2-route";

export const runtime = "nodejs";

/** Every story's latest Draft 2 session of the Topic, at a glance (step, status, cost), and its latest autopilot job on the server: the dashboard's Today reads them. */
export async function GET(request: Request) {
  const denied = await authorizeRadarCollector(request);
  if (denied) return denied;
  try {
    const topicId = await requireActiveRequestTopic(request);
    const [sessions, jobs] = await Promise.all([listDraft2SessionSummaries(topicId), latestDraft2AutopilotJobs(topicId)]);
    return noStoreJson({ sessions, jobs: [...jobs.values()] });
  } catch (error) {
    return draft2ErrorResponse(error, "read the Draft 2 sessions");
  }
}
