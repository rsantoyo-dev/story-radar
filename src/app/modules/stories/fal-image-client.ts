import "server-only";

import { fal } from "@fal-ai/client";
import sharp from "sharp";

import type { CreativeAspectRatio, CreativeImageQuality } from "./creative-content.types";
import type { CreativeImageModelDescriptor } from "./creative-image-models";

/**
 * Fal exposes reference-guided generation as a distinct queued endpoint. It
 * is not enough to add `image_urls` to the text-to-image endpoint: the edit
 * endpoint must be used for those inputs and again for status/result calls.
 */
export const FAL_TEXT_TO_IMAGE_ENDPOINT = "openai/gpt-image-2" as const;
export const FAL_REFERENCE_GUIDED_ENDPOINT =
  "openai/gpt-image-2/edit" as const;

/**
 * Endpoint ids come from the model catalog (see creative-image-models.ts),
 * which is the only place allowed to name a fal.ai endpoint.
 */
export type FalImageEndpoint = string;

export type FalImagePostProcessInput = Readonly<{
  normalizedPng: Uint8Array;
  requestId: string;
  width: number;
  height: number;
}>;

/**
 * Runs only after Fal has completed and its image has been normalized to the
 * requested output dimensions. The returned bytes must be a PNG with those
 * same dimensions; they become the persisted image output.
 */
export type FalImagePostProcessor = (
  input: FalImagePostProcessInput,
) => Uint8Array | Promise<Uint8Array>;

export async function submitFalImage({
  apiKey,
  prompt,
  width,
  height,
  aspectRatio,
  imageQuality,
  model,
  endpoint,
  referenceImages = [],
  retention,
}: {
  apiKey: string;
  prompt: string;
  width: number;
  height: number;
  aspectRatio: CreativeAspectRatio;
  imageQuality: CreativeImageQuality;
  model: CreativeImageModelDescriptor;
  endpoint: FalImageEndpoint;
  referenceImages?: File[];
  retention: "30d";
}): Promise<string> {
  assertEndpointMatchesReferences(model, endpoint, referenceImages);
  configureFal(apiKey);
  const imageUrls = await Promise.all(
    referenceImages.map((image) =>
      fal.storage.upload(image, { lifecycle: { expiresIn: retention } }),
    ),
  );
  // Each model family takes a different input shape — exact pixels versus a
  // ratio plus resolution tier, one reference versus many — so the payload is
  // built by the model's own adapter rather than assumed here.
  const input = model.buildInput({
    prompt,
    width,
    height,
    aspectRatio,
    imageQuality,
    imageUrls,
  });
  const result = await fal.queue.submit(endpoint, {
    // The installed client's endpoint map is narrower than the live API (it
    // omits GPT Image's `auto` quality, for one). Inputs are validated by the
    // adapter and the app-level unions before reaching this boundary.
    input: input as Parameters<typeof fal.queue.submit>[1]["input"],
    storageSettings: { expiresIn: "30d" },
  });
  return result.request_id;
}

export async function pollFalImage({
  apiKey,
  requestId,
  endpoint,
  targetWidth,
  targetHeight,
  retention,
  postProcess,
}: {
  apiKey: string;
  requestId: string;
  endpoint: FalImageEndpoint;
  targetWidth: number;
  targetHeight: number;
  retention: "30d";
  postProcess?: FalImagePostProcessor;
}): Promise<FalImagePollResult> {
  configureFal(apiKey);
  const status = await fal.queue.status(endpoint, {
    requestId,
    logs: false,
  });

  if (status.status === "IN_QUEUE") {
    return { status: "queued" };
  }
  if (status.status === "IN_PROGRESS") {
    return { status: "generating" };
  }

  const result = await fal.queue.result(endpoint, { requestId });
  const image = result.data.images[0];
  if (!image?.url) {
    throw new FalImageResponseError(
      "fal.ai completed the request without returning an image",
    );
  }

  const normalizedImage = await normalizeFalImage({
    image: {
      url: image.url,
      contentType: image.content_type,
      fileName: image.file_name,
      fileSize: image.file_size,
      width: image.width,
      height: image.height,
    },
    requestId,
    targetWidth,
    targetHeight,
    retention,
    postProcess,
  });

  return {
    status: "generated",
    image: {
      ...normalizedImage,
      seed: result.data.seed,
      safetyFlag: result.data.has_nsfw_concepts?.[0],
    },
  };
}

function configureFal(apiKey: string): void {
  fal.config({ credentials: apiKey });
}

function assertEndpointMatchesReferences(
  model: CreativeImageModelDescriptor,
  endpoint: FalImageEndpoint,
  referenceImages: readonly File[],
): void {
  if (referenceImages.length > model.maxReferenceImages) {
    throw new FalImageResponseError(
      `${model.label} accepts at most ${model.maxReferenceImages} reference image(s)`,
    );
  }

  if (endpoint === model.referenceEndpoint && referenceImages.length === 0) {
    throw new FalImageResponseError(
      "Reference-guided generation needs at least one character reference image",
    );
  }

  if (endpoint === model.textToImageEndpoint && referenceImages.length > 0) {
    throw new FalImageResponseError(
      "Character reference images require the Fal reference-guided endpoint",
    );
  }
}

async function normalizeFalImage({
  image,
  requestId,
  targetWidth,
  targetHeight,
  retention,
  postProcess,
}: {
  image: FalImage;
  requestId: string;
  targetWidth: number;
  targetHeight: number;
  retention: "30d";
  postProcess?: FalImagePostProcessor;
}): Promise<FalImage> {
  if (
    !postProcess &&
    image.width === targetWidth &&
    image.height === targetHeight
  ) {
    return image;
  }

  const source = await fetch(image.url);
  if (!source.ok) {
    throw new FalImageResponseError(
      `fal.ai returned HTTP ${source.status} while downloading the generated image`,
    );
  }

  const normalizedPng = await sharp(Buffer.from(await source.arrayBuffer()))
    .rotate()
    .resize(targetWidth, targetHeight, { fit: "cover", position: "centre" })
    .png()
    .toBuffer();
  const output = postProcess
    ? await postProcess({
        normalizedPng,
        requestId,
        width: targetWidth,
        height: targetHeight,
      })
    : normalizedPng;
  await assertFinalPngDimensions(output, targetWidth, targetHeight);
  const fileName = `creative-${requestId}.png`;
  const url = await fal.storage.upload(
    new File([Buffer.from(output)], fileName, { type: "image/png" }),
    { lifecycle: { expiresIn: retention } },
  );

  return {
    url,
    contentType: "image/png",
    fileName,
    fileSize: output.byteLength,
    width: targetWidth,
    height: targetHeight,
  };
}

async function assertFinalPngDimensions(
  output: Uint8Array,
  targetWidth: number,
  targetHeight: number,
): Promise<void> {
  if (!(output instanceof Uint8Array) || output.byteLength === 0) {
    throw new FalImageResponseError(
      "The image post-processor did not return PNG bytes",
    );
  }

  const metadata = await sharp(Buffer.from(output)).metadata();
  if (
    metadata.format !== "png" ||
    metadata.width !== targetWidth ||
    metadata.height !== targetHeight
  ) {
    throw new FalImageResponseError(
      `The final image must be a ${targetWidth}x${targetHeight} PNG`,
    );
  }
}

type FalImage = {
  url: string;
  contentType?: string;
  fileName?: string;
  fileSize?: number;
  width?: number;
  height?: number;
};

export type FalImagePollResult =
  | { status: "queued" | "generating" }
  | {
      status: "generated";
      image: FalImage & {
        seed?: number;
        safetyFlag?: boolean;
      };
    };

export class FalImageResponseError extends Error {}

/** Upload a locally composed PNG; no generation endpoint is invoked. */
export async function uploadComposedImage(apiKey: string, output: Uint8Array, assetId: string): Promise<FalImage> {
  configureFal(apiKey);
  await assertFinalPngDimensions(output, 1080, 1350);
  const fileName = `creative-${assetId}.png`;
  const url = await fal.storage.upload(new File([Buffer.from(output)], fileName, { type: "image/png" }), { lifecycle: { expiresIn: "30d" } });
  return { url, fileName, contentType: "image/png", fileSize: output.byteLength, width: 1080, height: 1350 };
}
