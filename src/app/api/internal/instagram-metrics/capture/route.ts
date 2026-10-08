import { authorizePublicationWorker } from "@/app/modules/meta/publication-worker-auth";
import { captureInstagramMetricHistory } from "@/app/modules/meta/capture-instagram-metric-history";
import { withApiLog } from "@/app/modules/observability/api-request-log";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * One pass of the Instagram metrics history (IG-07). GitHub Actions calls it
 * every hour; only publications whose next capture is due are read, so most
 * passes touch few or none. Never publishes, links or approves anything.
 */
async function route_POST(request: Request) {
  const status = authorizePublicationWorker(request, process.env.INSTAGRAM_METRICS_WORKER_SECRET);
  if (status !== 200) return Response.json({ error: status === 503 ? "Instagram metrics worker is not configured" : "Unauthorized" }, { status });
  try {
    const topics = await captureInstagramMetricHistory();
    return Response.json({ topics }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ error: "The Instagram metrics pass could not complete" }, { status: 503 });
  }
}

export const POST = withApiLog(route_POST);
