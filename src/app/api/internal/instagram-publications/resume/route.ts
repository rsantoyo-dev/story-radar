import { authorizePublicationWorker } from "@/app/modules/meta/publication-worker-auth";
import { resumePublicationJobs } from "@/app/modules/meta/publish-publication-package";
import { withApiLog } from "@/app/modules/observability/api-request-log";

export const runtime = "nodejs";
export const maxDuration = 120;

/** Only advances explicitly authorized orders; never creates publication jobs. */
async function route_POST(request: Request) {
  const status = authorizePublicationWorker(request, process.env.INSTAGRAM_PUBLISH_WORKER_SECRET);
  if (status !== 200) return Response.json({ error: status === 503 ? "Publication worker is not configured" : "Unauthorized" }, { status });
  try {
    return Response.json(await resumePublicationJobs(), { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ error: "The publication worker could not complete this pass" }, { status: 503 });
  }
}

export const POST = withApiLog(route_POST);
