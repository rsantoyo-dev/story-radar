import { authorizeRadarCollector } from "@/app/api/radar/radar-api-auth";
import { requireActiveRequestTopic } from "@/app/api/radar/radar-topic";
import { noStoreJson } from "@/app/api/radar/creative-route-error";
import { parseAutopilotUntil } from "@/app/modules/draft2/draft2-autopilot.core";
import { draft2AutopilotLeaseFree, kickDraft2AutopilotIfDue, latestDraft2AutopilotJob, startDraft2Autopilot, stopDraft2Autopilot } from "@/app/modules/draft2/draft2-autopilot";
import { recordAuditEventLater } from "@/app/modules/observability/audit";
import { DRAFT2_UUID_PATTERN, draft2ErrorResponse } from "../draft2-route";

export const runtime = "nodejs";
// The first pass runs in this request's own time, after the response.
export const maxDuration = 300;

/**
 * The autopilot on the server (2026-10-22): the editor starts it on a story
 * to a step ({ storyId, until?, fresh? }, the caption by default; fresh
 * starts over from the facts in a new session); the first pass starts at
 * once and the job goes on, pass after pass, with the page closed.
 */
export async function POST(request: Request) {
  const denied = await authorizeRadarCollector(request);
  if (denied) return denied;
  const body = await request.json().catch(() => null) as { storyId?: unknown; until?: unknown; fresh?: unknown } | null;
  const storyId = typeof body?.storyId === "string" ? body.storyId : "";
  if (!DRAFT2_UUID_PATTERN.test(storyId)) return noStoreJson({ error: "storyId must be a valid UUID" }, 400);
  const until = parseAutopilotUntil(body?.until);
  if (!until) return noStoreJson({ error: "until must name a Draft 2 step, such as images or caption" }, 400);
  try {
    const topicId = await requireActiveRequestTopic(request);
    const fresh = body?.fresh === true;
    const job = await startDraft2Autopilot({ topicId, storyId, until, origin: new URL(request.url).origin, fresh });
    recordAuditEventLater({ action: "draft2.autopilot.started", entityType: "draft2_autopilot_job", entityId: job.id, topicId, details: { storyId, until, fresh } });
    return noStoreJson({ job }, 202);
  } catch (error) {
    return draft2ErrorResponse(error, "start the autopilot on the server");
  }
}

/** The story's latest job; one waiting with a free lease is given a pass by this read. */
export async function GET(request: Request) {
  const denied = await authorizeRadarCollector(request);
  if (denied) return denied;
  const storyId = new URL(request.url).searchParams.get("storyId") ?? "";
  if (!DRAFT2_UUID_PATTERN.test(storyId)) return noStoreJson({ error: "storyId must be a valid UUID" }, 400);
  try {
    const topicId = await requireActiveRequestTopic(request);
    const job = await latestDraft2AutopilotJob(topicId, storyId);
    if (job) kickDraft2AutopilotIfDue(job, await draft2AutopilotLeaseFree(job.id), new URL(request.url).origin);
    return noStoreJson({ job: job ?? null });
  } catch (error) {
    return draft2ErrorResponse(error, "read the autopilot job");
  }
}

/** The editor stops a running job ({ storyId, jobId, action: "stop" }): the step running finishes, the job stops. */
export async function PATCH(request: Request) {
  const denied = await authorizeRadarCollector(request);
  if (denied) return denied;
  const body = await request.json().catch(() => null) as { storyId?: unknown; jobId?: unknown; action?: unknown } | null;
  const storyId = typeof body?.storyId === "string" ? body.storyId : "";
  const jobId = typeof body?.jobId === "string" ? body.jobId : "";
  if (!DRAFT2_UUID_PATTERN.test(storyId) || !DRAFT2_UUID_PATTERN.test(jobId)) return noStoreJson({ error: "storyId and jobId must be valid UUIDs" }, 400);
  if (body?.action !== "stop") return noStoreJson({ error: "action must be stop" }, 400);
  try {
    const topicId = await requireActiveRequestTopic(request);
    const job = await stopDraft2Autopilot({ topicId, storyId, jobId });
    recordAuditEventLater({ action: "draft2.autopilot.stopped", entityType: "draft2_autopilot_job", entityId: job.id, topicId, details: { storyId } });
    return noStoreJson({ job });
  } catch (error) {
    return draft2ErrorResponse(error, "stop the autopilot");
  }
}
