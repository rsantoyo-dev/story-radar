import { authorizeRadarCollector } from "@/app/api/radar/radar-api-auth";
import { requireActiveRequestTopic } from "@/app/api/radar/radar-topic";
import { noStoreJson } from "@/app/api/radar/creative-route-error";
import { planDraft2Spine } from "@/app/modules/draft2/draft2-focus";
import { parsePlanNotes } from "@/app/modules/draft2/draft2-focus.types";
import { DRAFT2_UUID_PATTERN, draft2ErrorResponse } from "../draft2-route";

export const runtime = "nodejs";
// One Claude call, allowed up to 240 s.
export const maxDuration = 300;

/**
 * Claude writes the spine from the focus as it stands: the lever, the guards,
 * one beat per slide and the two directions; the parts the editor owns stay
 * theirs. With the editor's notes, Claude revises the plan as it stands to
 * follow them, and the new plan is Claude's. Returns the session.
 */
export async function POST(request: Request) {
  const denied = await authorizeRadarCollector(request);
  if (denied) return denied;
  const body = await request.json().catch(() => null) as { storyId?: unknown; sessionId?: unknown; notes?: unknown } | null;
  const storyId = typeof body?.storyId === "string" ? body.storyId : "";
  const sessionId = typeof body?.sessionId === "string" ? body.sessionId : "";
  if (!DRAFT2_UUID_PATTERN.test(storyId) || !DRAFT2_UUID_PATTERN.test(sessionId)) return noStoreJson({ error: "storyId and sessionId must be valid UUIDs" }, 400);
  try {
    const notes = parsePlanNotes(body?.notes);
    const topicId = await requireActiveRequestTopic(request);
    return noStoreJson({ session: await planDraft2Spine({ topicId, storyId, sessionId, ...(notes ? { notes } : {}) }) });
  } catch (error) {
    return draft2ErrorResponse(error, "write the spine");
  }
}
