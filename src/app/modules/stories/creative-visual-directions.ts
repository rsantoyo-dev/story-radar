import type { CreativeFormat, CreativeUnit } from "./creative-content.types";

/**
 * "Rewrite visual directions": a script's per-slide visual direction is the
 * layout the image model follows, and it was written under the visual guide
 * of its time. When the Topic's creative identity changes, regenerating
 * images keeps that old layout. This rewrites only the directions under the
 * current identity; the approved visible text never changes.
 */
export const CREATIVE_VISUAL_DIRECTIONS_PROMPT_VERSION = "visual-directions-v1";
export const VISUAL_DIRECTION_MAX_LENGTH = 1_000;
const VISUAL_DIRECTION_MIN_LENGTH = 20;

/** What a rewrite replaced, so the earlier directions stay recoverable. */
export type CreativeVisualDirectionsRewrite = {
  guideHash: string;
  at: string;
  model: string;
  promptVersion: string;
  previous: { order: number; visualDirection: string }[];
};

export class CreativeVisualDirectionsResponseError extends Error {}

export const CREATIVE_VISUAL_DIRECTIONS_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["units"],
  properties: {
    units: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["order", "visualDirection"],
        properties: {
          order: { type: "integer" },
          visualDirection: { type: "string" },
        },
      },
    },
  },
} as const;

export function buildVisualDirectionsInstructions(): string {
  return [
    "You are the art director of a local editorial brand. Rewrite ONLY the visual direction of each slide of an already approved post so its images follow the brand's CURRENT creative identity.",
    "The visible text of every slide is approved and fixed. Never change, add, translate or quote words to render; refer to them only as the headline, the subheadline, the body or the call to action.",
    "Follow the creative identity exactly: its priority, style, photography, composition, variation across slides, typography, avoid list, allowed exceptions and what to do when no verified image is available. Anything in the avoid list must not appear, even if the previous direction asked for it.",
    "Plan the slides as one sequence: keep palette, typography and treatment consistent, and vary the dominant layout from slide to slide as the identity asks. Do not keep the previous layout just because it existed; keep it only where it already satisfies the identity.",
    "Facts stay conservative: depict only subjects supported by the slide's visible text or its previous direction. Never add real people, named places, landmarks, logos, businesses, events, dates or numbers. Keep any verified photo, map or approved character the previous direction relies on (flags in the slide data), without describing a real person's face beyond what the reference provides.",
    "Use the approved palette by name or hex. Each direction: one concrete paragraph on layout, focal point, imagery, scale and placement, at most 900 characters, written in the same language as the previous directions.",
    "Return every slide once, with its order unchanged.",
  ].join("\n");
}

export function buildVisualDirectionsContents(input: {
  identity: string;
  format: CreativeFormat;
  language: string;
  concept: string;
  units: CreativeUnit[];
}): string {
  return JSON.stringify({
    creativeIdentity: input.identity,
    format: input.format,
    language: input.language,
    postConcept: input.concept,
    slides: input.units.map((unit) => ({
      order: unit.order,
      role: unit.role,
      ...(unit.editorialGoal ? { narrativePurpose: unit.editorialGoal } : {}),
      visibleText: {
        headline: unit.headline,
        ...(unit.subheadline ? { subheadline: unit.subheadline } : {}),
        ...(unit.body ? { body: unit.body } : {}),
        ...(unit.ctaQuestion ? { callToAction: unit.ctaQuestion } : {}),
      },
      previousVisualDirection: unit.visualDirection,
      ...(unit.visualNeed ? { visualNeed: unit.visualNeed } : {}),
      usesApprovedCharacter: (unit.characterIds?.length ?? 0) > 0,
      usesVerifiedStoryPhoto: (unit.storyReferences?.length ?? 0) > 0 || Boolean(unit.documentaryPortrait),
      usesVerifiedMapOrPlace: Boolean(unit.placeVisual || unit.roadMapEvidence),
    })),
  });
}

/** One direction per existing slide, in range; anything else is rejected. */
export function parseVisualDirectionsResponse(text: string, units: Pick<CreativeUnit, "order">[]): Map<number, string> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new CreativeVisualDirectionsResponseError("The visual directions response was not valid JSON");
  }
  const entries = (parsed as { units?: unknown })?.units;
  if (!Array.isArray(entries)) throw new CreativeVisualDirectionsResponseError("The visual directions response has no slides");
  const expected = new Set(units.map((unit) => unit.order));
  const directions = new Map<number, string>();
  for (const entry of entries) {
    const order = (entry as { order?: unknown })?.order;
    const value = (entry as { visualDirection?: unknown })?.visualDirection;
    if (typeof order !== "number" || !expected.has(order) || directions.has(order)) {
      throw new CreativeVisualDirectionsResponseError("The visual directions response does not match the slides");
    }
    const direction = typeof value === "string" ? value.trim() : "";
    if (direction.length < VISUAL_DIRECTION_MIN_LENGTH) {
      throw new CreativeVisualDirectionsResponseError(`Slide ${order} came back without a usable visual direction`);
    }
    directions.set(order, direction.length > VISUAL_DIRECTION_MAX_LENGTH
      ? direction.slice(0, VISUAL_DIRECTION_MAX_LENGTH).replace(/\s+\S*$/u, "").trimEnd()
      : direction);
  }
  if (directions.size !== expected.size) throw new CreativeVisualDirectionsResponseError("The visual directions response skipped a slide");
  return directions;
}
