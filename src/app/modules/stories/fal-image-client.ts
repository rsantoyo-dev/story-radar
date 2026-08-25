import "server-only";

import { fal } from "@fal-ai/client";
import sharp from "sharp";

import type { CreativeImageQuality } from "./creative-content.types";

const ENDPOINT = "openai/gpt-image-2" as const;

export async function submitFalImage({
  apiKey,
  prompt,
  width,
  height,
  imageQuality,
}: {
  apiKey: string;
  prompt: string;
  width: number;
  height: number;
  imageQuality: CreativeImageQuality;
}): Promise<string> {
  configureFal(apiKey);
  const result = await fal.queue.submit(ENDPOINT, {
    input: {
      prompt,
      image_size: { width, height },
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
  targetWidth,
  targetHeight,
  retention,
}: {
  apiKey: string;
  requestId: string;
  targetWidth: number;
  targetHeight: number;
  retention: "30d";
}): Promise<FalImagePollResult> {
  configureFal(apiKey);
  const status = await fal.queue.status(ENDPOINT, {
    requestId,
    logs: false,
  });

  if (status.status === "IN_QUEUE") {
    return { status: "queued" };
  }
  if (status.status === "IN_PROGRESS") {
    return { status: "generating" };
  }

  const result = await fal.queue.result(ENDPOINT, { requestId });
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

async function normalizeFalImage({
  image,
  requestId,
  targetWidth,
  targetHeight,
  retention,
}: {
  image: FalImage;
  requestId: string;
  targetWidth: number;
  targetHeight: number;
  retention: "30d";
}): Promise<FalImage> {
  if (image.width === targetWidth && image.height === targetHeight) {
    return image;
  }

  const source = await fetch(image.url);
  if (!source.ok) {
    throw new FalImageResponseError(
      `fal.ai returned HTTP ${source.status} while downloading the generated image`,
    );
  }

  const output = await sharp(Buffer.from(await source.arrayBuffer()))
    .rotate()
    .resize(targetWidth, targetHeight, { fit: "cover", position: "centre" })
    .png()
    .toBuffer();
  const fileName = `creative-${requestId}.png`;
  const url = await fal.storage.upload(
    new File([output], fileName, { type: "image/png" }),
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
