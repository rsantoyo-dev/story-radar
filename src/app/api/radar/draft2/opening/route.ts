import { authorizeRadarCollector } from "@/app/api/radar/radar-api-auth";
import { requireActiveRequestTopic } from "@/app/api/radar/radar-topic";
import { noStoreJson } from "@/app/api/radar/creative-route-error";
import { recordOpeningChoice, runDraft2Opening } from "@/app/modules/draft2/draft2-opening";
import { DRAFT2_UUID_PATTERN, draft2ErrorResponse } from "../draft2-route";

export const runtime = "nodejs";
// Up to three writer rounds and three judgments; the step stops starting rounds well inside this.
export const maxDuration = 300;

const CANDIDATE_ID_PATTERN = /^[\w.-]{1,24}$/;

/** Runs the Opening step on the session's verified facts and returns the finished session. */
export async function POST(request: Request) {
  const denied = await authorizeRadarCollector(request);
  if (denied) return denied;
  const body = await request.json().catch(() => null) as { storyId?: unknown; sessionId?: unknown } | null;
  const storyId = typeof body?.storyId === "string" ? body.storyId : "";
  const sessionId = typeof body?.sessionId === "string" ? body.sessionId : "";
  if (!DRAFT2_UUID_PATTERN.test(storyId) || !DRAFT2_UUID_PATTERN.test(sessionId)) return noStoreJson({ error: "storyId and sessionId must be valid UUIDs" }, 400);
  try {
    const topicId = await requireActiveRequestTopic(request);
    return noStoreJson({ session: await runDraft2Opening({ topicId, storyId, sessionId }) });
  } catch (error) {
    return draft2ErrorResponse(error, "run the Draft 2 opening step");
  }
}

/** Records the editor's choice among the last round's candidates; no provider call. */
export async function PATCH(request: Request) {
  const denied = await authorizeRadarCollector(request);
  if (denied) return denied;
  const body = await request.json().catch(() => null) as { sessionId?: unknown; candidateId?: unknown } | null;
  const sessionId = typeof body?.sessionId === "string" ? body.sessionId : "";
  const candidateId = typeof body?.candidateId === "string" ? body.candidateId : "";
  if (!DRAFT2_UUID_PATTERN.test(sessionId)) return noStoreJson({ error: "sessionId must be a valid UUID" }, 400);
  if (!CANDIDATE_ID_PATTERN.test(candidateId)) return noStoreJson({ error: "candidateId must name a candidate, such as c3" }, 400);
  try {
    const topicId = await requireActiveRequestTopic(request);
    return noStoreJson({ session: await recordOpeningChoice({ topicId, sessionId, candidateId }) });
  } catch (error) {
    return draft2ErrorResponse(error, "record the opening choice");
  }
}
