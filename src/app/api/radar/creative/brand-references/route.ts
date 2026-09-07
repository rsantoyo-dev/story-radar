import { authorizeRadarCollector } from "@/app/api/radar/radar-api-auth";
import {
  creativeRouteErrorResponse,
  noStoreJson,
} from "@/app/api/radar/creative-route-error";
import {
  requireActiveRequestTopic,
  topicRequestErrorResponse,
} from "@/app/api/radar/radar-topic";
import { listCreativeBrandReferences } from "@/app/modules/stories/creative-brand-references.repository";
import { uploadCreativeBrandReference } from "@/app/modules/stories/manage-creative-brand-references";

export const runtime = "nodejs";

const MAX_BRAND_REFERENCE_MULTIPART_BYTES = 16 * 1024 * 1024;
const ALLOWED_FIELDS = new Set([
  "image",
  "name",
  "kind",
  "provenance",
  "usageNote",
  "providerTransmissionAllowed",
]);

export async function GET(request: Request) {
  const unauthorized = authorizeRadarCollector(request);
  if (unauthorized) return unauthorized;

  try {
    return noStoreJson(
      await listCreativeBrandReferences(await requireActiveRequestTopic(request)),
    );
  } catch (error) {
    const topicError = topicRequestErrorResponse(error);
    if (topicError) return topicError;
    return creativeRouteErrorResponse(error, "list the brand references");
  }
}

export async function POST(request: Request) {
  const unauthorized = authorizeRadarCollector(request);
  if (unauthorized) return unauthorized;

  const contentLength = request.headers.get("content-length");
  const declaredLength = contentLength ? Number(contentLength) : Number.NaN;
  if (!Number.isSafeInteger(declaredLength) || declaredLength <= 0) {
    return noStoreJson(
      { error: "A valid Content-Length header is required for brand uploads" },
      411,
    );
  }
  if (declaredLength > MAX_BRAND_REFERENCE_MULTIPART_BYTES) {
    return noStoreJson(
      { error: "The brand reference upload must be 16 MB or smaller" },
      413,
    );
  }

  try {
    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      return noStoreJson(
        { error: "A multipart form with an image file is required" },
        400,
      );
    }
    if ([...form.keys()].some((key) => !ALLOWED_FIELDS.has(key))) {
      return noStoreJson(
        { error: "Only image, name, kind, provenance, usageNote and providerTransmissionAllowed may be provided" },
        400,
      );
    }
    const images = form.getAll("image");
    const image = images[0];
    if (images.length !== 1 || !(image instanceof File)) {
      return noStoreJson({ error: "Exactly one image file is required" }, 400);
    }

    return noStoreJson(
      await uploadCreativeBrandReference({
        topicId: await requireActiveRequestTopic(request),
        image,
        name: form.get("name"),
        kind: form.get("kind") ?? undefined,
        provenance: form.get("provenance") ?? undefined,
        usageNote: form.get("usageNote") ?? undefined,
        providerTransmissionAllowed:
          form.get("providerTransmissionAllowed") ?? undefined,
      }),
      201,
    );
  } catch (error) {
    const topicError = topicRequestErrorResponse(error);
    if (topicError) return topicError;
    return creativeRouteErrorResponse(error, "upload the brand reference");
  }
}
