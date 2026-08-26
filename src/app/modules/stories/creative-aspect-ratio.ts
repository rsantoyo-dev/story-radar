import type {
  CreativeAspectRatio,
  CreativeFormat,
} from "./creative-content.types";

export const CREATIVE_OUTPUT_ASPECT_RATIOS = ["4:5"] as const;

export function isCreativeOutputAspectRatio(
  value: unknown,
): value is CreativeAspectRatio {
  return value === "4:5";
}

export function defaultCreativeOutputAspectRatio(
  format: CreativeFormat,
): CreativeAspectRatio {
  void format;
  return "4:5";
}

export function resolveCreativeOutputAspectRatio(
  format: CreativeFormat,
  aspectRatio: CreativeAspectRatio | undefined,
): CreativeAspectRatio {
  void format;
  void aspectRatio;
  return "4:5";
}
