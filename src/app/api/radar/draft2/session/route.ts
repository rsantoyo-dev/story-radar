import { authorizeRadarCollector } from "@/app/api/radar/radar-api-auth";
import { requireActiveRequestTopic } from "@/app/api/radar/radar-topic";
import { noStoreJson } from "@/app/api/radar/creative-route-error";
import { parseDraft2ModelChoice } from "@/app/modules/draft2/draft2-models";
import { getDraft2Session, updateDraft2Session } from "@/app/modules/draft2/draft2-session.repository";
import { DRAFT2_UUID_PATTERN, draft2ErrorResponse, latestDraft2SessionResponse } from "../draft2-route";

export const runtime = "nodejs";

/** The latest Draft 2 session of a story (every column): the canvas reads it on load and after a run stops. */
export async function GET(request: Request) {
  return latestDraft2SessionResponse(request);
}

/** The editor's choice of the funnel's writer and judge for the session's next runs ({ sessionId, models: { writer, judge } }); no provider call. A run in progress keeps the models it started with. */
export async function PATCH(request: Request) {
  const denied = await authorizeRadarCollector(request);
  if (denied) return denied;
  const body = await request.json().catch(() => null) as { sessionId?: unknown; models?: unknown } | null;
  const sessionId = typeof body?.sessionId === "string" ? body.sessionId : "";
  if (!DRAFT2_UUID_PATTERN.test(sessionId)) return noStoreJson({ error: "sessionId must be a valid UUID" }, 400);
  try {
    const topicId = await requireActiveRequestTopic(request);
    const session = await getDraft2Session(topicId, sessionId);
    if (!session) return noStoreJson({ error: "This Draft 2 session was not found. Reload the canvas." }, 404);
    const models = parseDraft2ModelChoice(body?.models);
    return noStoreJson({ session: await updateDraft2Session(session.id, { models: models.writer || models.judge ? models : null }) });
  } catch (error) {
    return draft2ErrorResponse(error, "save the models");
  }
}
