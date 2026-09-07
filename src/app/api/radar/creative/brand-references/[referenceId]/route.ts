import { authorizeRadarCollector } from "@/app/api/radar/radar-api-auth";
import {
  creativeRouteErrorResponse,
  noStoreJson,
} from "@/app/api/radar/creative-route-error";
import {
  requireActiveRequestTopic,
  requireRequestTopic,
  topicRequestErrorResponse,
} from "@/app/api/radar/radar-topic";
import {
  editCreativeBrandReference,
  readCreativeBrandReferenceFile,
} from "@/app/modules/stories/manage-creative-brand-references";

export const runtime = "nodejs";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type Context = { params: Promise<{ referenceId: string }> };

/** Streams the private reference image bytes — no signed URL, per-topic scoped. */
export async function GET(request: Request, context: Context) {
  const unauthorized = authorizeRadarCollector(request);
  if (unauthorized) return unauthorized;
  const { referenceId } = await context.params;
  if (!UUID_PATTERN.test(referenceId)) {
    return noStoreJson({ error: "referenceId must be a valid UUID" }, 400);
  }

  try {
    const image = await readCreativeBrandReferenceFile({
      topicId: await requireRequestTopic(request),
      referenceId,
    });
    if (!image) {
      return noStoreJson({ error: "The brand reference was not found" }, 404);
    }
    return new Response(image, {
      headers: {
        "Cache-Control": "private, no-store",
        "Content-Length": String(image.size),
        "Content-Type": image.type || "image/webp",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    const topicError = topicRequestErrorResponse(error);
    if (topicError) return topicError;
    return creativeRouteErrorResponse(error, "load the brand reference");
  }
}

/**
 * Edits the declared metadata (name, kind, provenance, usage note, transmission
 * permission) or toggles `isActive`. Nothing is ever hard-deleted — deactivating
 * is `{ isActive: false }`.
 */
export async function PATCH(request: Request, context: Context) {
  const unauthorized = authorizeRadarCollector(request);
  if (unauthorized) return unauthorized;
  const { referenceId } = await context.params;
  if (!UUID_PATTERN.test(referenceId)) {
    return noStoreJson({ error: "referenceId must be a valid UUID" }, 400);
  }

  try {
    return noStoreJson(
      await editCreativeBrandReference({
        topicId: await requireActiveRequestTopic(request),
        referenceId,
        patch: await request.json(),
      }),
    );
  } catch (error) {
    const topicError = topicRequestErrorResponse(error);
    if (topicError) return topicError;
    return creativeRouteErrorResponse(error, "update the brand reference");
  }
}
