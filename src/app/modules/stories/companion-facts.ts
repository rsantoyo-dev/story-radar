import type { CreativeKeyFact, GeneratedCreativeDraft } from "./creative-content.types";

/** companion-story-generator accepts one to six verified facts. */
export const COMPANION_MAX_FACTS = 6;

/**
 * The facts a companion Story may use: those its approved parent cites, in
 * slide citation order (so the cover's facts lead), capped at six. A Story is
 * one vertical image; a parent citing more (a list of places plus an editor
 * fact, say) keeps its first six rather than failing.
 */
export function companionVerifiedFacts(
  parent: Pick<GeneratedCreativeDraft, "units">,
  keyFacts: readonly CreativeKeyFact[],
): CreativeKeyFact[] {
  const factsById = new Map(keyFacts.map((fact) => [fact.id, fact]));
  const cited = [...new Set([...parent.units].sort((a, b) => a.order - b.order).flatMap((unit) => unit.factIds))];
  return cited.flatMap((id) => { const fact = factsById.get(id); return fact ? [fact] : []; }).slice(0, COMPANION_MAX_FACTS);
}
