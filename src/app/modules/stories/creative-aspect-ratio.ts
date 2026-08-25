import {
  CREATIVE_ASPECT_RATIOS,
  isCreativeAspectRatio,
} from "./creative-content.types";
import type {
  CreativeAspectRatio,
  CreativeFormat,
} from "./creative-content.types";

export const CREATIVE_OUTPUT_ASPECT_RATIOS = CREATIVE_ASPECT_RATIOS;

export const isCreativeOutputAspectRatio = isCreativeAspectRatio;

export function defaultCreativeOutputAspectRatio(
  format: CreativeFormat,
): CreativeAspectRatio {
  return format === "meme" ? "1:1" : "4:5";
}

export function resolveCreativeOutputAspectRatio(
  format: CreativeFormat,
  aspectRatio: CreativeAspectRatio | undefined,
): CreativeAspectRatio {
  return aspectRatio ?? defaultCreativeOutputAspectRatio(format);
}
