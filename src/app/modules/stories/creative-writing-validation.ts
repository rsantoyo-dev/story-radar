import { CREATIVE_NARRATIVE_FORMS, CREATIVE_WRITING_GUIDANCE_MAX_LENGTH, type CreativeNarrativeForm } from "./creative-content.types";

/**
 * The brand's writing settings (2026-10-15): its own writing rules, which
 * every writer and judge of its posts reads, and the narrative forms its
 * stories may take. Fogón Lab's rules: neutral Latin American Spanish words,
 * a technical term explained the first time and never in a headline, its
 * character never named in the text; and no character-guide form. Pure.
 */
export class CreativeWritingValidationError extends Error {}

/** The brand's own writing rules, trimmed; empty when it has none. */
export function writingGuidanceValue(value: unknown): string {
  if (value === undefined || value === null) return "";
  if (typeof value !== "string") throw new CreativeWritingValidationError("writingGuidance must be text");
  const text = value.replace(/\r\n?/g, "\n").trim();
  if (text.length > CREATIVE_WRITING_GUIDANCE_MAX_LENGTH) throw new CreativeWritingValidationError(`Keep the writing rules under ${CREATIVE_WRITING_GUIDANCE_MAX_LENGTH.toLocaleString("en")} characters`);
  return text;
}

/** The narrative forms the brand allows, in their order, classic always among them; every form allowed (or none listed): no field. */
export function narrativeFormsField(value: unknown): { narrativeForms?: CreativeNarrativeForm[] } {
  if (value === undefined || value === null) return {};
  if (!Array.isArray(value) || value.some((entry) => !CREATIVE_NARRATIVE_FORMS.includes(entry as CreativeNarrativeForm))) {
    throw new CreativeWritingValidationError(`narrativeForms must list forms among ${CREATIVE_NARRATIVE_FORMS.join(", ")}`);
  }
  const forms = CREATIVE_NARRATIVE_FORMS.filter((form) => form === "classic" || value.includes(form));
  return forms.length === CREATIVE_NARRATIVE_FORMS.length ? {} : { narrativeForms: forms };
}
