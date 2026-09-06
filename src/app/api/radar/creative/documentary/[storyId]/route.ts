import { authorizeRadarCollector } from "@/app/api/radar/radar-api-auth";
import { requireActiveRequestTopic, topicRequestErrorResponse } from "@/app/api/radar/radar-topic";
import { getDocumentaryPreparation, prepareDocumentary, reviewDocumentary } from "@/app/modules/stories/manage-creative-documentary";
import { record } from "@/app/modules/stories/creative-documentary";
import { creativeRouteErrorResponse, noStoreJson } from "../../../creative-route-error";
export const runtime = "nodejs";
export const maxDuration = 120;
type Context = { params: Promise<{ storyId: string }> };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
async function handle(request: Request, context: Context, method: "GET" | "POST" | "PATCH") {
  const unauthorized = authorizeRadarCollector(request); if (unauthorized) return unauthorized;
  const { storyId } = await context.params;
  if (!uuid.test(storyId)) return noStoreJson({ error: "Invalid story ID" }, 400);
  try {
    const topicId = await requireActiveRequestTopic(request);
    if (method === "GET") return noStoreJson(await getDocumentaryPreparation(topicId, storyId));
    const body: unknown = await request.json();
    if (!record(body)) return noStoreJson({ error: "A JSON object is required" }, 400);
    if (method === "POST") {
      if ((body.correction !== undefined && (typeof body.correction !== "string" || body.correction.length > 450)) || (body.format !== "meme" && body.format !== "carousel") || (body.retry !== undefined && typeof body.retry !== "boolean") || Object.keys(body).some(k => !["format", "retry", "correction"].includes(k))) return noStoreJson({ error: "Provide format (meme or carousel) and optional retry" }, 400);
      return noStoreJson(await prepareDocumentary(topicId, storyId, body.format, body.retry === true, typeof body.correction === "string" ? body.correction.trim() : undefined));
    }
    if (typeof body.batchId !== "string" || !uuid.test(body.batchId) || typeof body.inputHash !== "string" || !/^[a-f0-9]{64}$/.test(body.inputHash) ||
        typeof body.actor !== "string" || !body.actor.trim() || body.actor.length > 120 || body.humanReviewed !== true ||
        !["approved", "rejected"].includes(String(body.decision)) || Object.keys(body).some(k => !["batchId", "inputHash", "actor", "humanReviewed", "decision"].includes(k))) return noStoreJson({ error: "Provide the reviewed version, decision and reviewer name" }, 400);
    return noStoreJson(await reviewDocumentary(topicId, storyId, body.batchId, body.inputHash, body.actor.trim(), body.decision as "approved" | "rejected"));
  } catch (error) {
    return topicRequestErrorResponse(error) || creativeRouteErrorResponse(error, "prepare or review the documentary publication");
  }
}
export async function GET(request: Request, context: Context) { return handle(request, context, "GET"); }
export async function POST(request: Request, context: Context) { return handle(request, context, "POST"); }
export async function PATCH(request: Request, context: Context) { return handle(request, context, "PATCH"); }
