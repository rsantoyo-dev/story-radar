import { parseDraft2ModelChoice, parseDraft2Pipeline } from "@/app/modules/draft2/draft2-models";
import { authorizeRadarCollector } from "@/app/api/radar/radar-api-auth";
import { requireActiveRequestTopic } from "@/app/api/radar/radar-topic";
import { noStoreJson } from "@/app/api/radar/creative-route-error";
import { acceptDraft2Facts, editDraft2Fact, runDraft2Facts } from "@/app/modules/draft2/draft2-facts";
import { DRAFT2_UUID_PATTERN, draft2ErrorResponse, latestDraft2SessionResponse } from "../draft2-route";

export const runtime = "nodejs";
// Up to three extractions and three reviews; the step stops starting rounds well inside this.
export const maxDuration = 300;

/** The latest Draft 2 session of a story; an alias of GET /api/radar/draft2/session. */
export async function GET(request: Request) {
  return latestDraft2SessionResponse(request);
}

/** Runs the Facts step for the story and returns the finished session. */
export async function POST(request: Request) {
  const denied = await authorizeRadarCollector(request);
  if (denied) return denied;
  const body = await request.json().catch(() => null) as { storyId?: unknown; models?: unknown; pipeline?: unknown } | null;
  const storyId = typeof body?.storyId === "string" ? body.storyId : "";
  if (!DRAFT2_UUID_PATTERN.test(storyId)) return noStoreJson({ error: "storyId must be a valid UUID" }, 400);
  try {
    const topicId = await requireActiveRequestTopic(request);
    return noStoreJson({ session: await runDraft2Facts({ topicId, storyId, models: parseDraft2ModelChoice(body?.models), pipeline: parseDraft2Pipeline(body?.pipeline) }) });
  } catch (error) {
    return draft2ErrorResponse(error, "run the Draft 2 facts step");
  }
}

/** The editor takes the facts as they stand after the reviewer's last "revise" ({ sessionId, action: "accept" }), or changes one fact's claim or attribution by hand ({ sessionId, action: "edit", factId, claim?, attribution? }); no provider call. */
export async function PATCH(request: Request) {
  const denied = await authorizeRadarCollector(request);
  if (denied) return denied;
  const body = await request.json().catch(() => null) as { sessionId?: unknown; action?: unknown; factId?: unknown; claim?: unknown; attribution?: unknown } | null;
  const sessionId = typeof body?.sessionId === "string" ? body.sessionId : "";
  if (!DRAFT2_UUID_PATTERN.test(sessionId)) return noStoreJson({ error: "sessionId must be a valid UUID" }, 400);
  if (body?.action === "edit") {
    if (typeof body.factId !== "string" || !/^f\d{1,3}$/.test(body.factId)) return noStoreJson({ error: "factId must name a fact, such as f6" }, 400);
    if (body.claim !== undefined && typeof body.claim !== "string") return noStoreJson({ error: "claim must be a string" }, 400);
    if (body.attribution !== undefined && typeof body.attribution !== "string") return noStoreJson({ error: "attribution must be a string" }, 400);
    try {
      const topicId = await requireActiveRequestTopic(request);
      return noStoreJson({ session: await editDraft2Fact({ topicId, sessionId, factId: body.factId, claim: body.claim as string | undefined, attribution: body.attribution as string | undefined }) });
    } catch (error) {
      return draft2ErrorResponse(error, "edit the fact");
    }
  }
  if (body?.action !== "accept") return noStoreJson({ error: "action must be accept or edit" }, 400);
  try {
    const topicId = await requireActiveRequestTopic(request);
    return noStoreJson({ session: await acceptDraft2Facts({ topicId, sessionId }) });
  } catch (error) {
    return draft2ErrorResponse(error, "take the facts as they stand");
  }
}
