import { authorizeRadarCollector } from "@/app/api/radar/radar-api-auth";
import {
  requireActiveRequestTopic,
  topicRequestErrorResponse,
} from "@/app/api/radar/radar-topic";
import {
  getPublicationJob,
  listPublicationJobs,
  requestPublishNow,
} from "@/app/modules/meta/publish-publication-package";
import {
  creativeRouteErrorResponse,
  noStoreJson,
} from "../../../../creative-route-error";

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
  const unauthorized = authorizeRadarCollector(request);
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
    return noStoreJson(
      { job: await requestPublishNow(topicId, draftId, body.packageId, body.retryJobId as string | undefined) },
      202,
    );
  } catch (error) {
    return (
      topicRequestErrorResponse(error) ??
      creativeRouteErrorResponse(error, "publish the approved package")
    );
  }
}

export async function GET(request: Request, context: Context) {
  const unauthorized = authorizeRadarCollector(request);
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
    return noStoreJson({ jobs: await listPublicationJobs(topicId, draftId) });
  } catch (error) {
    return (
      topicRequestErrorResponse(error) ??
      creativeRouteErrorResponse(error, "load the publication jobs")
    );
  }
}
