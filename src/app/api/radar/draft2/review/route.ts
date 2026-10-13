import { authorizeRadarCollector } from "@/app/api/radar/radar-api-auth";
import { requireActiveRequestTopic } from "@/app/api/radar/radar-topic";
import { noStoreJson } from "@/app/api/radar/creative-route-error";
import { decideDraft2ReviewPatch, reviewDraft2Carousel, type Draft2ReviewAction } from "@/app/modules/draft2/draft2-review";
import { DRAFT2_UUID_PATTERN, draft2ErrorResponse } from "../draft2-route";

export const runtime = "nodejs";
// Two provider calls: the reader (low effort) and the editor (medium), allowed up to 240 s.
export const maxDuration = 300;

const ACTIONS: readonly Draft2ReviewAction[] = ["apply", "decline", "undo", "apply-all"];

/** Reads the whole carousel: a reader's reactions, then the editor's scores, strengths and patches. Returns the session. */
export async function POST(request: Request) {
  const denied = await authorizeRadarCollector(request);
  if (denied) return denied;
  const body = await request.json().catch(() => null) as { storyId?: unknown; sessionId?: unknown } | null;
  const storyId = typeof body?.storyId === "string" ? body.storyId : "";
  const sessionId = typeof body?.sessionId === "string" ? body.sessionId : "";
  if (!DRAFT2_UUID_PATTERN.test(storyId) || !DRAFT2_UUID_PATTERN.test(sessionId)) return noStoreJson({ error: "storyId and sessionId must be valid UUIDs" }, 400);
  try {
    const topicId = await requireActiveRequestTopic(request);
    return noStoreJson({ session: await reviewDraft2Carousel({ topicId, storyId, sessionId }) });
  } catch (error) {
    return draft2ErrorResponse(error, "read the carousel");
  }
}

/** One decision on a patch (apply, decline, undo), or every proposed patch applied (apply-all). No model call. */
export async function PATCH(request: Request) {
  const denied = await authorizeRadarCollector(request);
  if (denied) return denied;
  const body = await request.json().catch(() => null) as { sessionId?: unknown; patchId?: unknown; action?: unknown; by?: unknown } | null;
  const sessionId = typeof body?.sessionId === "string" ? body.sessionId : "";
  const action = ACTIONS.find((candidate) => candidate === body?.action);
  if (!DRAFT2_UUID_PATTERN.test(sessionId)) return noStoreJson({ error: "sessionId must be a valid UUID" }, 400);
  if (!action) return noStoreJson({ error: `action must be one of ${ACTIONS.join(", ")}` }, 400);
  const patchId = typeof body?.patchId === "string" && /^p\d{1,2}$/.test(body.patchId) ? body.patchId : undefined;
  if (action !== "apply-all" && !patchId) return noStoreJson({ error: "patchId names the patch to decide on" }, 400);
  try {
    const topicId = await requireActiveRequestTopic(request);
    return noStoreJson({ session: await decideDraft2ReviewPatch({ topicId, sessionId, patchId, action, by: body?.by === "autopilot" ? "autopilot" : "editor" }) });
  } catch (error) {
    return draft2ErrorResponse(error, "decide on the review's patch");
  }
}
