import { authorizePublicationWorker } from "@/app/modules/meta/publication-worker-auth";
import { runStorageMaintenancePass } from "@/app/modules/stories/storage-maintenance";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * One bounded storage pass (GitHub Actions calls it hourly): copies approved
 * images to R2 before fal deletes them and moves published delivery JPEGs to
 * the permanent class. Never deletes; R2 lifecycle rules expire the 7-day and
 * 180-day classes. Uses the auto-collection worker credentials.
 */
export async function POST(request: Request) {
  const status = authorizePublicationWorker(request, process.env.AUTO_COLLECTION_WORKER_SECRET);
  if (status !== 200) return Response.json({ error: status === 503 ? "Storage maintenance worker is not configured" : "Unauthorized" }, { status });
  try {
    return Response.json(await runStorageMaintenancePass(240_000), { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ error: "The storage maintenance pass could not complete" }, { status: 503 });
  }
}
