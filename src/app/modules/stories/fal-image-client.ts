import "server-only";

import { fal } from "@fal-ai/client";
import sharp from "sharp";

import type { CreativeImageQuality } from "./creative-content.types";

/**
 * Fal exposes reference-guided generation as a distinct queued endpoint. It
 * is not enough to add `image_urls` to the text-to-image endpoint: the edit
 * endpoint must be used for those inputs and again for status/result calls.
 */
export const FAL_TEXT_TO_IMAGE_ENDPOINT = "openai/gpt-image-2" as const;
export const FAL_REFERENCE_GUIDED_ENDPOINT =
  "openai/gpt-image-2/edit" as const;

export type FalImageEndpoint =
  | typeof FAL_TEXT_TO_IMAGE_ENDPOINT
  | typeof FAL_REFERENCE_GUIDED_ENDPOINT;

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
  imageQuality,
  endpoint,
  referenceImages = [],
  retention,
}: {
  apiKey: string;
  prompt: string;
  width: number;
  height: number;
  imageQuality: CreativeImageQuality;
  endpoint: FalImageEndpoint;
  referenceImages?: File[];
  retention: "30d";
}): Promise<string> {
  assertEndpointMatchesReferences(endpoint, referenceImages);
  configureFal(apiKey);
  const imageUrls = await Promise.all(
    referenceImages.map((image) =>
      fal.storage.upload(image, { lifecycle: { expiresIn: retention } }),
    ),
  );
  const result = await fal.queue.submit(endpoint, {
    input: {
      prompt,
      image_size: { width, height },
      ...(imageUrls.length > 0
        ? { image_urls: imageUrls, input_fidelity: "high" as const }
        : {}),
      // The installed client endpoint map omits the current `auto` option,
      // though GPT Image 2 accepts it. Keep that compatibility cast at the
      // provider boundary; the app-level union is validated before this call.
      quality: imageQuality as "low" | "medium" | "high",
      output_format: "png",
    },
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
  endpoint: FalImageEndpoint,
  referenceImages: readonly File[],
): void {
  if (referenceImages.length > 16) {
    throw new FalImageResponseError(
      "Fal reference-guided generation accepts at most 16 reference images",
    );
  }

  if (
    endpoint === FAL_REFERENCE_GUIDED_ENDPOINT &&
    referenceImages.length === 0
  ) {
    throw new FalImageResponseError(
      "Reference-guided generation needs at least one character reference image",
    );
  }

  if (
    endpoint === FAL_TEXT_TO_IMAGE_ENDPOINT &&
    referenceImages.length > 0
  ) {
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
