import { authorizeRadarCollector } from "@/app/api/radar/radar-api-auth";
import { requireActiveRequestTopic, topicRequestErrorResponse } from "@/app/api/radar/radar-topic";
import { downloadApprovedCreativeBatch } from "@/app/modules/stories/manage-creative-assets";
import { creativeRouteErrorResponse, noStoreJson } from "../../../../../creative-route-error";

export const runtime = "nodejs";
// Up to 20 stored images, each rechecked before it joins the archive.
export const maxDuration = 120;

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Every approved image of the draft's current batch, as one ZIP in slide order. */
export async function GET(request: Request, context: { params: Promise<{ draftId: string }> }) {
  const unauthorized = await authorizeRadarCollector(request);
  if (unauthorized) return unauthorized;
  try {
    const { draftId } = await context.params;
    if (!uuid.test(draftId)) return noStoreJson({ error: "draftId must be a valid UUID" }, 400);
    const { fileName, archive } = await downloadApprovedCreativeBatch(await requireActiveRequestTopic(request), draftId);
    return new Response(new Uint8Array(archive), {
      headers: { "Content-Type": "application/zip", "Cache-Control": "private, no-store", "Content-Disposition": `attachment; filename="${fileName}"` },
    });
  } catch (error) {
    return topicRequestErrorResponse(error) || creativeRouteErrorResponse(error, "download the approved images");
  }
}
