import { authorizeRadarCollector } from "@/app/api/radar/radar-api-auth";
import {
  creativeRouteErrorResponse,
  noStoreJson,
} from "@/app/api/radar/creative-route-error";
import {
  requireActiveRequestTopic,
  topicRequestErrorResponse,
} from "@/app/api/radar/radar-topic";
import { uploadCreativeBrandAsset } from "@/app/modules/stories/manage-creative-brand-assets";

export const runtime = "nodejs";

const MAX_BRAND_MULTIPART_BYTES = 6 * 1024 * 1024;

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
  if (declaredLength > MAX_BRAND_MULTIPART_BYTES) {
    return noStoreJson(
      { error: "The brand upload request must be 6 MB or smaller" },
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
    if ([...form.keys()].some((key) => key !== "image")) {
      return noStoreJson({ error: "Only an image field may be provided" }, 400);
    }
    const images = form.getAll("image");
    const image = images[0];
    if (images.length !== 1 || !(image instanceof File)) {
      return noStoreJson(
        { error: "Exactly one image file is required" },
        400,
      );
    }

    return noStoreJson(
      await uploadCreativeBrandAsset({
        topicId: await requireActiveRequestTopic(request),
        image,
      }),
      201,
    );
  } catch (error) {
    const topicError = topicRequestErrorResponse(error);
    if (topicError) return topicError;

    return creativeRouteErrorResponse(error, "upload the brand asset");
  }
}
