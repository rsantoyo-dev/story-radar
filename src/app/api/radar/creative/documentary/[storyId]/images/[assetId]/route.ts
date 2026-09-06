import { authorizeRadarCollector } from "@/app/api/radar/radar-api-auth";
import { requireActiveRequestTopic, topicRequestErrorResponse } from "@/app/api/radar/radar-topic";
import { documentaryImage } from "@/app/modules/stories/manage-creative-documentary";
import { creativeRouteErrorResponse, noStoreJson } from "../../../../../creative-route-error";
export const runtime = "nodejs";
type Context = { params: Promise<{ storyId: string; assetId: string }> };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export async function GET(request: Request, context: Context) {
  const unauthorized = authorizeRadarCollector(request); if (unauthorized) return unauthorized;
  const { storyId, assetId } = await context.params;
  if (!uuid.test(storyId) || !uuid.test(assetId)) return noStoreJson({ error: "Invalid image ID" }, 400);
  try {
    const query = new URL(request.url).searchParams;
    const ready = query.get("download") === "true";
    const file = await documentaryImage(await requireActiveRequestTopic(request), storyId, assetId, query.get("original") === "true", ready);
    return new Response(await file.arrayBuffer(), { headers: { "Content-Type": file.type, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", ...(ready ? { "Content-Disposition": `attachment; filename="documentary-${assetId}.png"` } : {}) } });
  } catch (error) { return topicRequestErrorResponse(error) || creativeRouteErrorResponse(error, "load the documentary image"); }
}
