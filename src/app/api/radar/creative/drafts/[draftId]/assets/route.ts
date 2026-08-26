import { authorizeRadarCollector } from "@/app/api/radar/radar-api-auth";
import {
  requireActiveRequestTopic,
  topicRequestErrorResponse,
} from "@/app/api/radar/radar-topic";
import {
  generateCreativeDraftAssets,
  generateNextCreativeDraftAssetVersion,
  getCreativeDraftAssets,
} from "@/app/modules/stories/manage-creative-assets";
import {
  DEFAULT_CREATIVE_IMAGE_QUALITY,
  isCreativeImageQuality,
  type CreativeImageQuality,
} from "@/app/modules/stories/creative-content.types";
import {
  creativeRouteErrorResponse,
  noStoreJson,
} from "../../../../creative-route-error";

export const runtime = "nodejs";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type Context = { params: Promise<{ draftId: string }> };

export async function GET(request: Request, context: Context) {
  const unauthorized = authorizeRadarCollector(request);
  if (unauthorized) return unauthorized;
  const draftId = await parseId(context);
  if (!draftId) {
    return noStoreJson({ error: "draftId must be a valid UUID" }, 400);
  }
  const imageQuality = parseImageQualityQuery(request);
  if (imageQuality instanceof InvalidImageQualityError) {
    return noStoreJson({ error: imageQuality.message }, 400);
  }
  const includeHistorical =
    new URL(request.url).searchParams.get("history") === "true";

  try {
    return noStoreJson(
      await getCreativeDraftAssets(
        await requireActiveRequestTopic(request),
        draftId,
        imageQuality,
        includeHistorical,
      ),
    );
  } catch (error) {
    if (error instanceof InvalidImageQualityError) {
      return noStoreJson({ error: error.message }, 400);
    }
    const topicError = topicRequestErrorResponse(error);
    if (topicError) return topicError;

    return creativeRouteErrorResponse(error, "load the creative images");
  }
}

export async function POST(request: Request, context: Context) {
  const unauthorized = authorizeRadarCollector(request);
  if (unauthorized) return unauthorized;
  const draftId = await parseId(context);
  if (!draftId) {
    return noStoreJson({ error: "draftId must be a valid UUID" }, 400);
  }

  try {
    const generation = await parseGenerationInput(request);
    const topicId = await requireActiveRequestTopic(request);
    return noStoreJson(
      generation.createNewVersion
        ? await generateNextCreativeDraftAssetVersion(
            topicId,
            draftId,
            generation.batchId!,
          )
        : await generateCreativeDraftAssets(
            topicId,
            draftId,
            generation.imageQuality,
          ),
      202,
    );
  } catch (error) {
    if (error instanceof InvalidImageQualityError) {
      return noStoreJson({ error: error.message }, 400);
    }
    const topicError = topicRequestErrorResponse(error);
    if (topicError) return topicError;

    return creativeRouteErrorResponse(error, "generate the creative images");
  }
}

async function parseId(context: Context): Promise<string | undefined> {
  const { draftId } = await context.params;
  return UUID_PATTERN.test(draftId) ? draftId : undefined;
}

function parseImageQualityQuery(
  request: Request,
): CreativeImageQuality | undefined | InvalidImageQualityError {
  const imageQuality = new URL(request.url).searchParams.get("imageQuality");
  if (imageQuality === null) return undefined;
  if (!isCreativeImageQuality(imageQuality)) {
    return new InvalidImageQualityError(
      "imageQuality must be auto, low, medium, or high",
    );
  }
  return imageQuality;
}

async function parseGenerationInput(request: Request): Promise<{
  imageQuality: CreativeImageQuality;
  createNewVersion: boolean;
  batchId?: string;
}> {
  const text = await request.text();
  if (!text.trim()) {
    return {
      imageQuality: DEFAULT_CREATIVE_IMAGE_QUALITY,
      createNewVersion: false,
    };
  }

  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    throw new InvalidImageQualityError("The JSON body is invalid");
  }
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    throw new InvalidImageQualityError("A JSON object is required");
  }
  if (
    Object.keys(body).some(
      (key) => key !== "quality" && key !== "createNewVersion" && key !== "batchId",
    )
  ) {
    throw new InvalidImageQualityError(
      "Only quality, createNewVersion, and batchId may be provided",
    );
  }
  const input = body as {
    quality?: unknown;
    createNewVersion?: unknown;
    batchId?: unknown;
  };
  const quality = input.quality;
  const imageQuality =
    quality === undefined ? DEFAULT_CREATIVE_IMAGE_QUALITY : quality;
  if (!isCreativeImageQuality(imageQuality)) {
    throw new InvalidImageQualityError(
      "quality must be auto, low, medium, or high",
    );
  }

  if (
    input.createNewVersion !== undefined &&
    typeof input.createNewVersion !== "boolean"
  ) {
    throw new InvalidImageQualityError("createNewVersion must be true or false");
  }
  const createNewVersion = input.createNewVersion === true;
  if (input.batchId !== undefined && typeof input.batchId !== "string") {
    throw new InvalidImageQualityError("batchId must be a valid UUID");
  }
  const batchId = input.batchId?.trim();
  if (batchId && !UUID_PATTERN.test(batchId)) {
    throw new InvalidImageQualityError("batchId must be a valid UUID");
  }
  if (createNewVersion && !batchId) {
    throw new InvalidImageQualityError(
      "batchId is required when creating a new image version",
    );
  }
  if (!createNewVersion && batchId) {
    throw new InvalidImageQualityError(
      "batchId may only be provided when creating a new image version",
    );
  }

  return { imageQuality, createNewVersion, ...(batchId ? { batchId } : {}) };
}

class InvalidImageQualityError extends Error {}
