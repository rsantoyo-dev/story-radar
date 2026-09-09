import { authorizeRadarCollector } from "@/app/api/radar/radar-api-auth";
import {
  requireActiveRequestTopic,
  topicRequestErrorResponse,
} from "@/app/api/radar/radar-topic";
import {
  discardPublicationPackage,
  freezePublicationPackage,
  listPublicationPackages,
} from "@/app/modules/meta/freeze-publication-package";
import {
  creativeRouteErrorResponse,
  noStoreJson,
} from "../../../../creative-route-error";

export const runtime = "nodejs";
export const maxDuration = 60;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type Context = { params: Promise<{ draftId: string }> };

async function parseId(context: Context): Promise<string | undefined> {
  const { draftId } = await context.params;
  return UUID_PATTERN.test(draftId) ? draftId : undefined;
}

export async function GET(request: Request, context: Context) {
  const unauthorized = authorizeRadarCollector(request);
  if (unauthorized) return unauthorized;
  const draftId = await parseId(context);
  if (!draftId) return noStoreJson({ error: "draftId must be a valid UUID" }, 400);

  try {
    const topicId = await requireActiveRequestTopic(request);
    return noStoreJson({ packages: await listPublicationPackages(topicId, draftId) });
  } catch (error) {
    return (
      topicRequestErrorResponse(error) ??
      creativeRouteErrorResponse(error, "list the publication packages")
    );
  }
}

export async function POST(request: Request, context: Context) {
  const unauthorized = authorizeRadarCollector(request);
  if (unauthorized) return unauthorized;
  const draftId = await parseId(context);
  if (!draftId) return noStoreJson({ error: "draftId must be a valid UUID" }, 400);

  try {
    const body = (await request.json()) as { batchId?: unknown };
    if (typeof body.batchId !== "string" || !UUID_PATTERN.test(body.batchId)) {
      return noStoreJson({ error: "batchId must be a valid UUID" }, 400);
    }
    const topicId = await requireActiveRequestTopic(request);
    return noStoreJson(
      { package: await freezePublicationPackage(topicId, draftId, body.batchId) },
      201,
    );
  } catch (error) {
    return (
      topicRequestErrorResponse(error) ??
      creativeRouteErrorResponse(error, "freeze the publication package")
    );
  }
}

export async function DELETE(request: Request, context: Context) {
  const unauthorized = authorizeRadarCollector(request);
  if (unauthorized) return unauthorized;
  const draftId = await parseId(context);
  if (!draftId) return noStoreJson({ error: "draftId must be a valid UUID" }, 400);

  try {
    const body = (await request.json()) as { packageId?: unknown };
    if (typeof body.packageId !== "string" || !UUID_PATTERN.test(body.packageId)) {
      return noStoreJson({ error: "packageId must be a valid UUID" }, 400);
    }
    const topicId = await requireActiveRequestTopic(request);
    await discardPublicationPackage(topicId, body.packageId);
    return noStoreJson({ ok: true });
  } catch (error) {
    return (
      topicRequestErrorResponse(error) ??
      creativeRouteErrorResponse(error, "discard the publication package")
    );
  }
}
