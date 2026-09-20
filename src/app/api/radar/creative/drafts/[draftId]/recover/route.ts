import { authorizeRadarCollector } from "@/app/api/radar/radar-api-auth";
import { requireActiveRequestTopic, topicRequestErrorResponse } from "@/app/api/radar/radar-topic";
import { recoverSavedCreativeDraft } from "@/app/modules/stories/manage-creative-content";
import { creativeRouteErrorResponse, noStoreJson } from "../../../../creative-route-error";
export const runtime = "nodejs";
export const maxDuration = 600;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export async function POST(request: Request, context: {
    params: Promise<{
        draftId: string;
    }>;
}) {
    const unauthorized = authorizeRadarCollector(request);
    if (unauthorized)
        return unauthorized;
    try {
        const { draftId } = await context.params;
        const body = await request.json();
        if (!uuid.test(draftId) || !body || typeof body.requestId !== "string" || !uuid.test(body.requestId) || !Number.isInteger(body.expectedVersion) || body.expectedVersion < 1)
            return noStoreJson({ error: "A valid requestId and expectedVersion are required." }, 400);
        return noStoreJson(await recoverSavedCreativeDraft(await requireActiveRequestTopic(request), draftId, body.expectedVersion, body.requestId));
    }
    catch (error) {
        return topicRequestErrorResponse(error) ?? creativeRouteErrorResponse(error, "repair and review the saved draft");
    }
}
