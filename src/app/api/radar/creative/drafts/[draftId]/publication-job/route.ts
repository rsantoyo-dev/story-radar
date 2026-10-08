import { authorizeRadarCollector } from "@/app/api/radar/radar-api-auth";
import {
  requireActiveRequestTopic,
  topicRequestErrorResponse,
} from "@/app/api/radar/radar-topic";
import {
  getPublicationJob,
  listPublicationJobs,
  releaseUncertainPublicationJob,
  requestPublishNow,
} from "@/app/modules/meta/publish-publication-package";
import { parsePublicationChannel } from "@/app/modules/meta/publication-channel";
import {
  creativeRouteErrorResponse,
  noStoreJson,
} from "../../../../creative-route-error";
import { recordAuditEventLater } from "@/app/modules/observability/audit";

export const runtime = "nodejs";
export const maxDuration = 120;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type Context = { params: Promise<{ draftId: string }> };

async function parseId(context: Context): Promise<string | undefined> {
  const { draftId } = await context.params;
  return UUID_PATTERN.test(draftId) ? draftId : undefined;
}

export async function POST(request: Request, context: Context) {
  const unauthorized = await authorizeRadarCollector(request);
  if (unauthorized) return unauthorized;
  const draftId = await parseId(context);
  if (!draftId) return noStoreJson({ error: "draftId must be a valid UUID" }, 400);

  try {
    const body = (await request.json()) as { packageId?: unknown; retryJobId?: unknown };
    if (typeof body.packageId !== "string" || !UUID_PATTERN.test(body.packageId)) {
      return noStoreJson({ error: "packageId must be a valid UUID" }, 400);
    }
    if (body.retryJobId !== undefined && (typeof body.retryJobId !== "string" || !UUID_PATTERN.test(body.retryJobId))) {
      return noStoreJson({ error: "retryJobId must be a valid UUID" }, 400);
    }
    const topicId = await requireActiveRequestTopic(request);
    const job = await requestPublishNow(topicId, draftId, body.packageId, body.retryJobId as string | undefined);
    recordAuditEventLater({
      action: "publication.publish.requested", entityType: "publication_package", entityId: body.packageId, topicId,
      details: { draftId, retryJobId: body.retryJobId ?? null, jobId: job.id, status: job.status },
    });
    return noStoreJson({ job }, 202);
  } catch (error) {
    return (
      topicRequestErrorResponse(error) ??
      creativeRouteErrorResponse(error, "publish the approved package")
    );
  }
}

export async function GET(request: Request, context: Context) {
  const unauthorized = await authorizeRadarCollector(request);
  if (unauthorized) return unauthorized;
  const draftId = await parseId(context);
  if (!draftId) return noStoreJson({ error: "draftId must be a valid UUID" }, 400);

  try {
    const topicId = await requireActiveRequestTopic(request);
    const jobId = new URL(request.url).searchParams.get("jobId");
    if (jobId) {
      if (!UUID_PATTERN.test(jobId)) {
        return noStoreJson({ error: "jobId must be a valid UUID" }, 400);
      }
      return noStoreJson({ job: await getPublicationJob(topicId, jobId, draftId) });
    }
    const raw = new URL(request.url).searchParams.get("channel");
    const channel = raw === null ? undefined : parsePublicationChannel(raw);
    if (raw !== null && !channel) return noStoreJson({ error: "Unknown publication channel" }, 400);
    return noStoreJson({ jobs: await listPublicationJobs(topicId, draftId, channel) });
  } catch (error) {
    return (
      topicRequestErrorResponse(error) ??
      creativeRouteErrorResponse(error, "load the publication jobs")
    );
  }
}

/** An editor checked the platform: the uncertain order did not post. */
export async function PATCH(request: Request, context: Context) {
  const unauthorized = await authorizeRadarCollector(request);
  if (unauthorized) return unauthorized;
  const draftId = await parseId(context);
  if (!draftId) return noStoreJson({ error: "draftId must be a valid UUID" }, 400);

  try {
    const body = (await request.json()) as { jobId?: unknown; action?: unknown };
    if (typeof body.jobId !== "string" || !UUID_PATTERN.test(body.jobId)) {
      return noStoreJson({ error: "jobId must be a valid UUID" }, 400);
    }
    if (body.action !== "confirm-not-published") {
      return noStoreJson({ error: "action must be confirm-not-published" }, 400);
    }
    const topicId = await requireActiveRequestTopic(request);
    const job = await releaseUncertainPublicationJob(topicId, draftId, body.jobId);
    recordAuditEventLater({ action: "publication.job.confirmed_not_published", entityType: "publication_job", entityId: body.jobId, topicId, details: { draftId } });
    return noStoreJson({ job });
  } catch (error) {
    return (
      topicRequestErrorResponse(error) ??
      creativeRouteErrorResponse(error, "record that the post was not published")
    );
  }
}
