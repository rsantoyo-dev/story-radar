import { authorizeRadarCollector } from "@/app/api/radar/radar-api-auth";
import { requireActiveRequestTopic } from "@/app/api/radar/radar-topic";
import { noStoreJson } from "@/app/api/radar/creative-route-error";
import { recordCaptionChoice, recordCaptionCredits, runDraft2Caption } from "@/app/modules/draft2/draft2-caption";
import { DRAFT2_UUID_PATTERN, draft2ErrorResponse } from "../draft2-route";

export const runtime = "nodejs";
// Two writer rounds and two judgments; the step pauses before a round it has no time for, well inside this.
export const maxDuration = 300;

const CANDIDATE_ID_PATTERN = /^[\w.-]{1,24}$/;

/**
 * Writes the caption for the session's finished carousel and returns the
 * session: finished, or paused before a round this request had no time for;
 * `continue: true` runs a paused or stopped run on.
 */
export async function POST(request: Request) {
  const denied = await authorizeRadarCollector(request);
  if (denied) return denied;
  const body = await request.json().catch(() => null) as { storyId?: unknown; sessionId?: unknown; continue?: unknown; more?: unknown } | null;
  const storyId = typeof body?.storyId === "string" ? body.storyId : "";
  const sessionId = typeof body?.sessionId === "string" ? body.sessionId : "";
  if (!DRAFT2_UUID_PATTERN.test(storyId) || !DRAFT2_UUID_PATTERN.test(sessionId)) return noStoreJson({ error: "storyId and sessionId must be valid UUIDs" }, 400);
  try {
    const topicId = await requireActiveRequestTopic(request);
    return noStoreJson({ session: await runDraft2Caption({ topicId, storyId, sessionId, resume: body?.continue === true || body?.more === true, more: body?.more === true }) });
  } catch (error) {
    return draft2ErrorResponse(error, "write the Draft 2 caption");
  }
}

/**
 * Records the editor's choice among the run's captions (`candidateId`), or
 * whether the post shows the photo credits (`credits: "shown" | "hidden"`);
 * no provider call.
 */
export async function PATCH(request: Request) {
  const denied = await authorizeRadarCollector(request);
  if (denied) return denied;
  const body = await request.json().catch(() => null) as { sessionId?: unknown; candidateId?: unknown; credits?: unknown } | null;
  const sessionId = typeof body?.sessionId === "string" ? body.sessionId : "";
  if (!DRAFT2_UUID_PATTERN.test(sessionId)) return noStoreJson({ error: "sessionId must be a valid UUID" }, 400);
  if (body?.credits !== undefined) {
    if (body.credits !== "shown" && body.credits !== "hidden") return noStoreJson({ error: "credits must be \"shown\" or \"hidden\"" }, 400);
    try {
      const topicId = await requireActiveRequestTopic(request);
      return noStoreJson({ session: await recordCaptionCredits({ topicId, sessionId, shown: body.credits === "shown" }) });
    } catch (error) {
      return draft2ErrorResponse(error, "record whether the post shows the photo credits");
    }
  }
  const candidateId = typeof body?.candidateId === "string" ? body.candidateId : "";
  if (!CANDIDATE_ID_PATTERN.test(candidateId)) return noStoreJson({ error: "candidateId must name a candidate, such as c3" }, 400);
  try {
    const topicId = await requireActiveRequestTopic(request);
    return noStoreJson({ session: await recordCaptionChoice({ topicId, sessionId, candidateId }) });
  } catch (error) {
    return draft2ErrorResponse(error, "record the caption choice");
  }
}
