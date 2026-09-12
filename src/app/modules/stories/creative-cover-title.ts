import type { GeneratedCreativeDraft } from "./creative-content.types";

/** Cover subtitle is the editable content name; the headline remains the hook. */
export function enforceCoverTitle<T extends GeneratedCreativeDraft>(draft: T, enabled: boolean | undefined, title: string | undefined): T {
  if (!enabled || !title?.trim() || !draft.units.length) return draft;
  return { ...draft, units: draft.units.map((unit, index) => index === 0
    ? { ...unit, subheadline: title.trim().slice(0, 240) }
    : unit) };
}
