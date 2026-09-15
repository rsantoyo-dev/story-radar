import "server-only";

import {
  DEFAULT_CREATIVE_IMAGE_QUALITY,
  type CreativeAssetConfiguration,
  type CreativeAspectRatio,
  type CreativeImageQuality,
} from "./creative-content.types";

import {
  creativeImageModel,
  isCreativeImageModel,
  type CreativeImageModel,
} from "./creative-image-models";

/** Used when FAL_IMAGE_MODEL is unset, preserving the pre-catalog behaviour. */
const DEFAULT_IMAGE_MODEL: CreativeImageModel = "gpt-image";

/**
 * Resolves the topic-independent default model. FAL_IMAGE_MODEL now names a
 * logical model from the catalog ("gpt-image", "flux-pro", "nano-banana");
 * the previous provider ids are still accepted so existing environments keep
 * working without an edit.
 */
export function resolveDefaultCreativeImageModel(): CreativeImageModel {
  const configured = process.env.FAL_IMAGE_MODEL?.trim();
  if (!configured) return DEFAULT_IMAGE_MODEL;
  if (isCreativeImageModel(configured)) return configured;
  const legacy = (["gpt-image", "flux-pro", "nano-banana", "ideogram"] as const).find(
    (key) => creativeImageModel(key).providerModel === configured,
  );
  if (legacy) return legacy;
  throw new FalImageConfigurationError(
    `FAL_IMAGE_MODEL must be one of gpt-image, flux-pro, nano-banana, ideogram`,
  );
}

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
  "9:16": {
    width: 1080,
    height: 1920,
    // fal.ai accepts custom image sizes only in 16px increments. 1088×1920
    // preserves the Story composition and is normalized to 1080×1920 later.
    generationWidth: 1088,
    generationHeight: 1920,
    promptVersion: "integrated-story-9x16-v1",
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
    model: creativeImageModel(resolveDefaultCreativeImageModel()).providerModel,
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

  return {
    ...publicConfiguration,
    generationWidth: configuration.generationWidth,
    generationHeight: configuration.generationHeight,
    // Models that take a ratio plus a resolution tier, rather than exact
    // pixels, need the ratio itself at submit time.
    aspectRatio,
    apiKey,
    retention: "30d" as const,
  };
}

export class FalImageConfigurationError extends Error {}
