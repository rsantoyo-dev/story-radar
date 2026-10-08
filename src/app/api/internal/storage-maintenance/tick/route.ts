import { authorizePublicationWorker } from "@/app/modules/meta/publication-worker-auth";
import { runStorageMaintenancePass } from "@/app/modules/stories/storage-maintenance";
import { purgeExpiredRequestLogs } from "@/app/modules/observability/api-request-log";
import { withApiLog } from "@/app/modules/observability/api-request-log";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * One bounded storage pass (GitHub Actions calls it hourly): copies approved
 * images to R2 before fal deletes them and moves published delivery JPEGs to
 * the permanent class. Never deletes; R2 lifecycle rules expire the 7-day and
 * 180-day classes. Also purges expired API request logs. Uses the
 * auto-collection worker credentials.
 */
async function route_POST(request: Request) {
  const status = authorizePublicationWorker(request, process.env.AUTO_COLLECTION_WORKER_SECRET);
  if (status !== 200) return Response.json({ error: status === 503 ? "Storage maintenance worker is not configured" : "Unauthorized" }, { status });
  try {
    const storage = await runStorageMaintenancePass(240_000);
    // API request logs older than API_REQUEST_LOG_RETENTION_DAYS (default 30); audit and change history are kept.
    const requestLogsPurged = await purgeExpiredRequestLogs().catch(() => null);
    return Response.json({ ...storage, requestLogsPurged }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ error: "The storage maintenance pass could not complete" }, { status: 503 });
  }
}

export const POST = withApiLog(route_POST);
