import type { CreativeKeyFact, CreativeQualityIssue, GeneratedCreativeDraft } from "./creative-content.types";

function normalized(text: string): string {
  return text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

/** Conservative rejection signals, not a factual-accuracy certification. */
export function explicitlyInsufficientEvidence(text: string): boolean {
  const value = normalized(text);
  return /(?:seules? informations? (?:disponibles|fournies)|seuls? reperes geographiques|source (?:plus )?complete est necessaire|ne permettent? pas de confirmer|ne confirment? aucun chantier|sans precision sur la nature|only (?:available )?(?:information|geographic (?:references|markers))|insufficient (?:source|information|evidence)|(?:unica|unicas) informaci(?:on|ones) disponible|no (?:permite|permiten) confirmar|fuente mas completa)/.test(value);
}

/** Detect the specific location-only road snippets that triggered this incident. */
export function locationOnlyRoadFacts(facts: readonly CreativeKeyFact[]): boolean {
  return facts.length > 0 && facts.every(fact => {
    const text = normalized(`${fact.statement} ${fact.sourceExcerpt ?? ""}`);
    const location = /\b(?:km|kilometres?)\s*\d|\b(?:sortie|exit|salida)\s*\d/.test(text);
    const event = /\b(?:travaux|fermeture|ferme|fermee|fermes|fermees|entrave|accident|collision|ralentissement|construction|closed|closure|roadworks|crash|cierre|obras|accidente|trafic|circulation|traffic)\b/.test(text);
    return location && !event;
  });
}

export function evidenceQualityIssues(draft: GeneratedCreativeDraft, facts: readonly CreativeKeyFact[]): CreativeQualityIssue[] {
  // Inspect the reader-facing copy, not internal questions or visual instructions.
  const visible = [draft.caption, ...draft.units.flatMap(unit => [unit.headline, unit.subheadline, unit.body])].filter(Boolean).join("\n");
  if (!explicitlyInsufficientEvidence(visible) && !locationOnlyRoadFacts(facts)) return [];
  return [{ code: "INSUFFICIENT_EVENT_EVIDENCE", severity: "blocker",
    message: "The available copy only supplies locations or explicitly lacks evidence of what happened. Retrieve the complete source and verify the event before preparing a publication; do not turn missing information into a carousel." }];
}

/** Maps and recognizable road/place reconstructions belong to the documentary path. */
export function requestsGeographicReconstruction(direction: string): boolean {
  return /\b(?:carte(?:s)? (?:schematique|routiere|geographique)|cartograph\w*|(?:street|road|location|schematic) map|map of|google maps|street view|mapa(?:s)? (?:esquematico|vial|de)|segment routier|troncon routier|road segment|tramo (?:vial|de carretera)|place publique|public square|plaza publica)\b/.test(normalized(direction));
}
