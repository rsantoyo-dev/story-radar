import { after } from "next/server";
import { draft2WorkerSecret, resumeDraft2AutopilotJobs } from "@/app/modules/draft2/draft2-autopilot";
import { authorizePublicationWorker } from "@/app/modules/meta/publication-worker-auth";

export const runtime = "nodejs";
// A pass runs steps for AUTOPILOT_PASS_BUDGET_MS (270 s) after the response.
export const maxDuration = 300;

/**
 * One pass of the Draft 2 autopilot on the server (2026-10-22): the running
 * jobs whose lease is free are driven for this request's time, after the
 * response, so a pass that chains the next one, the worker's cron and a read
 * of a story all come through here and none waits on another. Only advances
 * jobs the editor started; never creates one.
 */
export async function POST(request: Request) {
  const status = authorizePublicationWorker(request, draft2WorkerSecret());
  if (status !== 200) return Response.json({ error: status === 503 ? "The Draft 2 worker is not configured" : "Unauthorized" }, { status });
  const origin = new URL(request.url).origin;
  after(async () => { await resumeDraft2AutopilotJobs(origin).catch(() => undefined); });
  return Response.json({ accepted: true }, { status: 202, headers: { "Cache-Control": "no-store" } });
}
