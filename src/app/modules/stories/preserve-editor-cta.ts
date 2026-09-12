import type { CreativeUnit } from "./creative-content.types";

/** Used at both save and approval: review invalid copy rather than erasing it. */
export function preserveEditorCtas(repaired: CreativeUnit[], submitted: CreativeUnit[]): CreativeUnit[] {
  return repaired.map((unit, index) => ({ ...unit, ctaQuestion: submitted[index].ctaQuestion }));
}
