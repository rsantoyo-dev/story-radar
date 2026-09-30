import { after } from "next/server";

import { authorizePublicationWorker } from "@/app/modules/meta/publication-worker-auth";
import { drivePendingPreparations, tickAutoCollection } from "@/app/modules/stories/auto-collection";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * One pass of the scheduled reader (GitHub Actions calls it every 15 min).
 * Starts due collections, flags scoops and prepares them ahead, then advances
 * pending preparations after the response. Never approves or publishes.
 */
export async function POST(request: Request) {
  const status = authorizePublicationWorker(request, process.env.AUTO_COLLECTION_WORKER_SECRET);
  if (status !== 200) return Response.json({ error: status === 503 ? "Auto collection worker is not configured" : "Unauthorized" }, { status });
  try {
    const result = await tickAutoCollection();
    after(() => drivePendingPreparations(result.pending));
    return Response.json({ topics: result.topics, started: result.started.length, scoopsDetected: result.detected.length, scoopsPreparing: result.preparing.length, advancing: result.pending.length },
      { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ error: "The auto collection pass could not complete" }, { status: 503 });
  }
}
