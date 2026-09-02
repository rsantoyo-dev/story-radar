import type {
  CreativeAspectRatio,
  CreativeFormat,
} from "./creative-content.types";

/** Feed work remains 4:5 by default; companion Stories can opt into 9:16. */
export const CREATIVE_OUTPUT_ASPECT_RATIOS = ["4:5", "9:16"] as const;

export function isCreativeOutputAspectRatio(
  value: unknown,
): value is CreativeAspectRatio {
  return value === "4:5" || value === "9:16";
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
  return aspectRatio && isCreativeOutputAspectRatio(aspectRatio)
    ? aspectRatio
    : defaultCreativeOutputAspectRatio(format);
}
