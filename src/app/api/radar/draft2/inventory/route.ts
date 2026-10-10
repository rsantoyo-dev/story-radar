import { authorizeRadarCollector } from "@/app/api/radar/radar-api-auth";
import { requireActiveRequestTopic } from "@/app/api/radar/radar-topic";
import { noStoreJson } from "@/app/api/radar/creative-route-error";
import { editDraft2Inventory, findDraft2Inventory } from "@/app/modules/draft2/draft2-inventory";
import { DRAFT2_UUID_PATTERN, draft2ErrorResponse } from "../draft2-route";

export const runtime = "nodejs";
// One Claude call, then Wikidata, Commons and Openverse lookups within their own budget.
export const maxDuration = 300;

/** Finds the people, places and organizations the verified facts name, and what verified images exist of them. Returns the session. */
export async function POST(request: Request) {
  const denied = await authorizeRadarCollector(request);
  if (denied) return denied;
  const body = await request.json().catch(() => null) as { storyId?: unknown; sessionId?: unknown } | null;
  const storyId = typeof body?.storyId === "string" ? body.storyId : "";
  const sessionId = typeof body?.sessionId === "string" ? body.sessionId : "";
  if (!DRAFT2_UUID_PATTERN.test(storyId) || !DRAFT2_UUID_PATTERN.test(sessionId)) return noStoreJson({ error: "storyId and sessionId must be valid UUIDs" }, 400);
  try {
    const topicId = await requireActiveRequestTopic(request);
    return noStoreJson({ session: await findDraft2Inventory({ topicId, storyId, sessionId }) });
  } catch (error) {
    return draft2ErrorResponse(error, "find the people and places");
  }
}

/** One editor decision: confirm, reject or reopen a person's Commons match, or the characters choice. No model call. */
export async function PATCH(request: Request) {
  const denied = await authorizeRadarCollector(request);
  if (denied) return denied;
  const body = await request.json().catch(() => null) as { sessionId?: unknown } | null;
  const sessionId = typeof body?.sessionId === "string" ? body.sessionId : "";
  if (!DRAFT2_UUID_PATTERN.test(sessionId)) return noStoreJson({ error: "sessionId must be a valid UUID" }, 400);
  try {
    const topicId = await requireActiveRequestTopic(request);
    return noStoreJson({ session: await editDraft2Inventory({ topicId, sessionId, input: body }) });
  } catch (error) {
    return draft2ErrorResponse(error, "save the people-and-places decision");
  }
}
