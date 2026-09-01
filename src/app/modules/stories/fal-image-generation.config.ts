import "server-only";

import {
  DEFAULT_CREATIVE_IMAGE_QUALITY,
  type CreativeAssetConfiguration,
  type CreativeAspectRatio,
  type CreativeImageQuality,
} from "./creative-content.types";

const SUPPORTED_MODEL = "openai/gpt-image-2" as const;

const ASPECT_RATIO_CONFIGURATIONS = {
  "1:1": {
    width: 1080,
    height: 1080,
    generationWidth: 1088,
    generationHeight: 1088,
    promptVersion: "integrated-square-1x1-v12",
  },
  "4:5": {
    width: 1080,
    height: 1350,
    // fal.ai accepts custom image sizes only in 16px increments. This is an
    // exact 4:5 canvas that is normalized to the requested output size later.
    generationWidth: 1088,
    generationHeight: 1360,
    promptVersion: "integrated-portrait-4x5-v13",
  },
  "16:9": {
    width: 1920,
    height: 1080,
    // fal.ai accepts custom image sizes only in 16px increments. The final
    // 1920×1080 output is normalized after generation.
    generationWidth: 1920,
    generationHeight: 1088,
    promptVersion: "integrated-landscape-16x9-v11",
  },
} as const satisfies Record<
  CreativeAspectRatio,
  {
    width: number;
    height: number;
    generationWidth: number;
    generationHeight: number;
    promptVersion: string;
  }
>;

export function getFalImagePublicConfig(
  aspectRatio: CreativeAspectRatio,
  imageQuality: CreativeImageQuality = DEFAULT_CREATIVE_IMAGE_QUALITY,
): CreativeAssetConfiguration {
  const configuration = ASPECT_RATIO_CONFIGURATIONS[aspectRatio];

  return {
    provider: "fal",
    model: process.env.FAL_IMAGE_MODEL?.trim() || SUPPORTED_MODEL,
    width: configuration.width,
    height: configuration.height,
    promptVersion: configuration.promptVersion,
    imageQuality,
    outputFormat: "png",
  };
}

export function getFalImageRuntimeConfig(
  aspectRatio: CreativeAspectRatio,
  imageQuality: CreativeImageQuality = DEFAULT_CREATIVE_IMAGE_QUALITY,
) {
  const publicConfiguration = getFalImagePublicConfig(
    aspectRatio,
    imageQuality,
  );
  const configuration = ASPECT_RATIO_CONFIGURATIONS[aspectRatio];
  const apiKey = process.env.FAL_KEY?.trim();

  if (!apiKey) {
    throw new FalImageConfigurationError(
      "FAL_KEY is not configured on the server",
    );
  }

  if (publicConfiguration.model !== SUPPORTED_MODEL) {
    throw new FalImageConfigurationError(
      `FAL_IMAGE_MODEL must be ${SUPPORTED_MODEL} for this image workflow`,
    );
  }

  return {
    ...publicConfiguration,
    model: SUPPORTED_MODEL,
    generationWidth: configuration.generationWidth,
    generationHeight: configuration.generationHeight,
    apiKey,
    retention: "30d" as const,
  };
}

export class FalImageConfigurationError extends Error {}
