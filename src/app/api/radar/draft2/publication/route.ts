import { authorizeRadarCollector } from "@/app/api/radar/radar-api-auth";
import { requireActiveRequestTopic } from "@/app/api/radar/radar-topic";
import { noStoreJson } from "@/app/api/radar/creative-route-error";
import { prepareDraft2Publication } from "@/app/modules/draft2/draft2-publication";
import { DRAFT2_UUID_PATTERN, draft2ErrorResponse } from "../draft2-route";

export const runtime = "nodejs";
// Copies each slide's image once, then writes v1's rows; no provider call.
export const maxDuration = 60;

/**
 * The editor approves the carousel for publishing (`acknowledgeIssues: true`
 * when the review left images for them to check): it is copied once into
 * v1's rows, and the session names the v1 draft and batch v1's publication
 * panels act on. Nothing is published here.
 */
export async function POST(request: Request) {
  const denied = await authorizeRadarCollector(request);
  if (denied) return denied;
  const body = await request.json().catch(() => null) as { storyId?: unknown; sessionId?: unknown; acknowledgeIssues?: unknown } | null;
  const storyId = typeof body?.storyId === "string" ? body.storyId : "";
  const sessionId = typeof body?.sessionId === "string" ? body.sessionId : "";
  if (!DRAFT2_UUID_PATTERN.test(storyId) || !DRAFT2_UUID_PATTERN.test(sessionId)) return noStoreJson({ error: "storyId and sessionId must be valid UUIDs" }, 400);
  try {
    const topicId = await requireActiveRequestTopic(request);
    return noStoreJson({ session: await prepareDraft2Publication({ topicId, storyId, sessionId, acknowledgeIssues: body?.acknowledgeIssues === true }) });
  } catch (error) {
    return draft2ErrorResponse(error, "approve the carousel for publishing");
  }
}
