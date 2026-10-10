import { authorizeRadarCollector } from "@/app/api/radar/radar-api-auth";
import { requireActiveRequestTopic } from "@/app/api/radar/radar-topic";
import { noStoreJson } from "@/app/api/radar/creative-route-error";
import { decideDraft2Focus, editDraft2Focus } from "@/app/modules/draft2/draft2-focus";
import { FOCUS_FIELDS, type Draft2FocusField } from "@/app/modules/draft2/draft2-focus.types";
import { DRAFT2_UUID_PATTERN, draft2ErrorResponse } from "../draft2-route";

export const runtime = "nodejs";
// One Claude call, allowed up to 240 s.
export const maxDuration = 300;

/** Claude decides the focus of the session's verified facts; the editor's fields stay theirs. Returns the session. */
export async function POST(request: Request) {
  const denied = await authorizeRadarCollector(request);
  if (denied) return denied;
  const body = await request.json().catch(() => null) as { storyId?: unknown; sessionId?: unknown } | null;
  const storyId = typeof body?.storyId === "string" ? body.storyId : "";
  const sessionId = typeof body?.sessionId === "string" ? body.sessionId : "";
  if (!DRAFT2_UUID_PATTERN.test(storyId) || !DRAFT2_UUID_PATTERN.test(sessionId)) return noStoreJson({ error: "storyId and sessionId must be valid UUIDs" }, 400);
  try {
    const topicId = await requireActiveRequestTopic(request);
    return noStoreJson({ session: await decideDraft2Focus({ topicId, storyId, sessionId }) });
  } catch (error) {
    return draft2ErrorResponse(error, "decide the Draft 2 focus");
  }
}

/** One field the editor set (`value`), or gave back to Claude (`reset: true`); no provider call. */
export async function PATCH(request: Request) {
  const denied = await authorizeRadarCollector(request);
  if (denied) return denied;
  const body = await request.json().catch(() => null) as { sessionId?: unknown; field?: unknown; value?: unknown; reset?: unknown } | null;
  const sessionId = typeof body?.sessionId === "string" ? body.sessionId : "";
  const field = FOCUS_FIELDS.find((candidate) => candidate === body?.field) as Draft2FocusField | undefined;
  if (!DRAFT2_UUID_PATTERN.test(sessionId)) return noStoreJson({ error: "sessionId must be a valid UUID" }, 400);
  if (!field) return noStoreJson({ error: `field must be one of ${FOCUS_FIELDS.join(", ")}` }, 400);
  const reset = body?.reset === true;
  if (!reset && !(body && "value" in body)) return noStoreJson({ error: "Send the field's value, or reset: true" }, 400);
  try {
    const topicId = await requireActiveRequestTopic(request);
    return noStoreJson({ session: await editDraft2Focus({ topicId, sessionId, field, value: body?.value, reset }) });
  } catch (error) {
    return draft2ErrorResponse(error, "save the focus");
  }
}
