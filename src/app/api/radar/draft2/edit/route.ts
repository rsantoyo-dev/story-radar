import { authorizeRadarCollector } from "@/app/api/radar/radar-api-auth";
import { requireActiveRequestTopic } from "@/app/api/radar/radar-topic";
import { noStoreJson } from "@/app/api/radar/creative-route-error";
import { editDraft2 } from "@/app/modules/draft2/draft2-edits";
import { parseDraft2EditInput } from "@/app/modules/draft2/draft2-edits.types";
import { DRAFT2_UUID_PATTERN, draft2ErrorResponse } from "../draft2-route";

export const runtime = "nodejs";

/**
 * The editor's hand on a finished step, no provider call: a text of the
 * chosen version changed (`action: "edit"`, with step, slide, field and
 * text) or a change undone (`action: "undo"`, with step and editId), or the
 * editor's own opening (`action: "own-opening"`, used as it is or set to be
 * developed in one more round, which the canvas then runs).
 */
export async function PATCH(request: Request) {
  const denied = await authorizeRadarCollector(request);
  if (denied) return denied;
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const sessionId = typeof body?.sessionId === "string" ? body.sessionId : "";
  if (!DRAFT2_UUID_PATTERN.test(sessionId)) return noStoreJson({ error: "sessionId must be a valid UUID" }, 400);
  try {
    const input = parseDraft2EditInput(body);
    const topicId = await requireActiveRequestTopic(request);
    return noStoreJson({ session: await editDraft2({ topicId, sessionId, input }) });
  } catch (error) {
    return draft2ErrorResponse(error, "save your change");
  }
}
