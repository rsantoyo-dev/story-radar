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
import { DEFAULT_PUBLICATION_CHANNEL, parsePublicationChannel } from "@/app/modules/meta/publication-channel";
import {
  creativeRouteErrorResponse,
  noStoreJson,
} from "../../../../creative-route-error";
import { recordAuditEventLater } from "@/app/modules/observability/audit";

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
  const unauthorized = await authorizeRadarCollector(request);
  if (unauthorized) return unauthorized;
  const draftId = await parseId(context);
  if (!draftId) return noStoreJson({ error: "draftId must be a valid UUID" }, 400);

  try {
    const raw = new URL(request.url).searchParams.get("channel");
    const channel = raw === null ? undefined : parsePublicationChannel(raw);
    if (raw !== null && !channel) return noStoreJson({ error: "Unknown publication channel" }, 400);
    const topicId = await requireActiveRequestTopic(request);
    return noStoreJson({ packages: await listPublicationPackages(topicId, draftId, channel) });
  } catch (error) {
    return (
      topicRequestErrorResponse(error) ??
      creativeRouteErrorResponse(error, "list the publication packages")
    );
  }
}

export async function POST(request: Request, context: Context) {
  const unauthorized = await authorizeRadarCollector(request);
  if (unauthorized) return unauthorized;
  const draftId = await parseId(context);
  if (!draftId) return noStoreJson({ error: "draftId must be a valid UUID" }, 400);

  try {
    const body = (await request.json()) as { batchId?: unknown; channel?: unknown };
    if (typeof body.batchId !== "string" || !UUID_PATTERN.test(body.batchId)) {
      return noStoreJson({ error: "batchId must be a valid UUID" }, 400);
    }
    const channel = body.channel === undefined ? DEFAULT_PUBLICATION_CHANNEL : parsePublicationChannel(body.channel);
    if (!channel) return noStoreJson({ error: "Unknown publication channel" }, 400);
    const topicId = await requireActiveRequestTopic(request);
    const frozen = await freezePublicationPackage(topicId, draftId, body.batchId, channel);
    recordAuditEventLater({ action: "publication.package.frozen", entityType: "publication_package", entityId: frozen.id, topicId, details: { draftId, batchId: body.batchId, channel } });
    return noStoreJson({ package: frozen }, 201);
  } catch (error) {
    return (
      topicRequestErrorResponse(error) ??
      creativeRouteErrorResponse(error, "freeze the publication package")
    );
  }
}

export async function DELETE(request: Request, context: Context) {
  const unauthorized = await authorizeRadarCollector(request);
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
    recordAuditEventLater({ action: "publication.package.discarded", entityType: "publication_package", entityId: body.packageId, topicId, details: { draftId } });
    return noStoreJson({ ok: true });
  } catch (error) {
    return (
      topicRequestErrorResponse(error) ??
      creativeRouteErrorResponse(error, "discard the publication package")
    );
  }
}
