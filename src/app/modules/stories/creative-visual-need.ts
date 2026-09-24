import type { CreativeUnit, GeneratedCreativeDraft } from "./creative-content.types";

export type CreativeVisualNeed = NonNullable<CreativeUnit["visualNeed"]>;

/** The closed set the writer may return; the schema cannot carry it as an enum (Gemini rejects that). */
export const CREATIVE_VISUAL_NEEDS: ReadonlySet<string> = new Set<CreativeVisualNeed>([
  "verified-map",
  "real-photo",
  "character-reference",
  "generic-illustration",
  "typography",
]);

export function isCreativeVisualNeed(value: unknown): value is CreativeVisualNeed {
  return typeof value === "string" && CREATIVE_VISUAL_NEEDS.has(value);
}

/**
 * `creative_units` has no column for visualNeed; the writer's declaration
 * lives in the draft's AI snapshot, whose units align with the saved rows by
 * order (the same alignment `generatedDraftCopyMatches` relies on). An edit
 * that keeps the snapshot keeps the declaration; a snapshot without the
 * field, or with an unknown value, declares nothing.
 */
export function visualNeedsByOrder(snapshot: Partial<GeneratedCreativeDraft> | null | undefined): Map<number, CreativeVisualNeed> {
  const result = new Map<number, CreativeVisualNeed>();
  if (!snapshot || !Array.isArray(snapshot.units)) return result;
  for (const unit of snapshot.units) {
    if (unit && typeof unit === "object" && typeof unit.order === "number" && isCreativeVisualNeed(unit.visualNeed)) result.set(unit.order, unit.visualNeed);
  }
  return result;
}
