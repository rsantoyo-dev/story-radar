import type {
  CreativeAspectRatio,
  CreativeBrandOverlaySettings,
  CreativeInteractiveOverlay,
  CreativeInstagramInteractionRecommendation,
} from "./creative-content.types";
import { creativeCanvasDimensions } from "./creative-brand-overlay";

const CREATIVE_INTERACTIVE_OVERLAY_PLACEMENTS = [
  "top-third",
  "middle-third",
  "bottom-third",
] as const satisfies CreativeInteractiveOverlay["placement"][];

/**
 * Runtime guard for the small persisted interaction-zone contract. Keeping it
 * here makes API validation independent from UI-only option lists.
 */
export function isCreativeInteractiveOverlay(
  value: unknown,
): value is CreativeInteractiveOverlay {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const overlay = value as Record<string, unknown>;
  if (
    !(
      overlay.kind === "instagram-sticker" &&
      CREATIVE_INTERACTIVE_OVERLAY_PLACEMENTS.includes(
        overlay.placement as CreativeInteractiveOverlay["placement"],
      )
    )
  ) {
    return false;
  }
  return (
    overlay.recommendation === undefined ||
    isCreativeInstagramInteractionRecommendation(overlay.recommendation)
  );
}

export function isCreativeInstagramInteractionRecommendation(
  value: unknown,
): value is CreativeInstagramInteractionRecommendation {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const recommendation = value as Record<string, unknown>;
  if (
    !["poll", "question", "quiz", "slider"].includes(
      recommendation.kind as string,
    ) ||
    !validText(recommendation.prompt, 180) ||
    !validText(recommendation.rationale, 300)
  ) {
    return false;
  }

  const options = recommendation.options;
  if (
    options !== undefined &&
    (!Array.isArray(options) ||
      !options.every((option) => validText(option, 40)))
  ) {
    return false;
  }
  if (
    recommendation.kind === "poll" &&
    (!Array.isArray(options) || options.length !== 2)
  ) {
    return false;
  }
  if (recommendation.kind === "quiz") {
    if (!Array.isArray(options) || options.length < 2 || options.length > 4) {
      return false;
    }
    if (
      typeof recommendation.correctOption !== "string" ||
      !options.includes(recommendation.correctOption)
    ) {
      return false;
    }
  }
  if (
    recommendation.kind === "slider" &&
    recommendation.emoji !== undefined &&
    !validText(recommendation.emoji, 8)
  ) {
    return false;
  }
  return true;
}

function validText(value: unknown, maxLength: number): value is string {
  return (
    typeof value === "string" &&
    Boolean(value.trim()) &&
    value.trim().length <= maxLength
  );
}

/**
 * Picks a vertical third that leaves the logo's usual edge available. The
 * editor may still explicitly choose a placement; this is only the safe
 * default for a newly requested companion Story.
 */
export function defaultCreativeInteractiveOverlay(
  brandOverlay?: Pick<CreativeBrandOverlaySettings, "enabled" | "placement">,
): CreativeInteractiveOverlay {
  const placement = brandOverlay?.enabled
    ? brandOverlay.placement.startsWith("top")
      ? "bottom-third"
      : brandOverlay.placement.startsWith("bottom")
        ? "top-third"
        : "bottom-third"
    : "bottom-third";

  return { kind: "instagram-sticker", placement };
}

/**
 * A strict prompt reservation for a native Instagram poll, question, quiz,
 * or slider that an editor adds after the image is exported. The reserved
 * region intentionally remains background-only; it is not rendered by a
 * compositor and is never included in visible story copy.
 */
export function buildCreativeInteractiveOverlayPrompt({
  overlay,
  aspectRatio,
}: {
  overlay: CreativeInteractiveOverlay | undefined;
  aspectRatio: CreativeAspectRatio;
}): string | undefined {
  if (!overlay) return undefined;

  const canvas = creativeCanvasDimensions(aspectRatio);
  const zone = interactiveOverlayZone(overlay.placement, canvas.height);
  const label = overlay.placement.replace("-", " ").toUpperCase();

  return [
    "<INSTAGRAM_INTERACTION_ZONE>",
    `FINAL ${label} INTERACTION ZONE (non-negotiable): reserve the full-width region x=0-${canvas.width}px and y=${zone.top}-${zone.bottom}px as intentionally empty, low-detail background-only canvas.`,
    "The editor will add a native Instagram poll, question, quiz, or slider there manually after export. Do not draw a mock Instagram sticker, poll, question box, answer choices, or UI.",
    "Do not place visible text, people, faces, focal subjects, products, icons, charts, data, logos, decorative objects, high-contrast edges, or any editorially relevant information in or overlapping this reserved region. Reflow every required visible word and place all visual focus completely outside it.",
    "The empty region may contain only calm continuous background color, gradient, or very low-detail texture so the native sticker remains easy to read.",
    "</INSTAGRAM_INTERACTION_ZONE>",
  ].join(" ");
}

function interactiveOverlayZone(
  placement: CreativeInteractiveOverlay["placement"],
  canvasHeight: number,
): { top: number; bottom: number } {
  const third = Math.round(canvasHeight / 3);

  switch (placement) {
    case "top-third":
      return { top: 0, bottom: third };
    case "middle-third":
      return { top: third, bottom: third * 2 };
    case "bottom-third":
      return { top: third * 2, bottom: canvasHeight };
  }
}
