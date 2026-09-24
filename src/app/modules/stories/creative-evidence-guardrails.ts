import type { CreativeKeyFact, CreativeQualityIssue, CreativeUnit, GeneratedCreativeDraft } from "./creative-content.types";

function normalized(text: string): string {
  return text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

/** Do not pay writers/critics to reconstruct a packet of unfinished excerpts. */
export function onlyTruncatedCreativeFacts(facts: readonly CreativeKeyFact[]): boolean {
  const truncated = (value: string) => /(?:…|\.{3})\s*["'”’]?\s*$/u.test(value);
  return facts.length > 0 && facts.every(fact =>
    truncated(fact.statement) && truncated(fact.sourceExcerpt ?? fact.statement));
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
  const text = normalized(direction).replace(/\b(qu|d)[’']/g, "$1e ");
  // An "interactive map" or "map/navigation app" request reads as harmless UI
  // chrome, but it renders the same fabricated routes, pins and closures as a
  // literal reconstruction would; route it through the same evidence path.
  // A "carte abstraite" ("abstract map") is the same risk under a hedge word:
  // the generated image still renders as a plausible navigation UI regardless
  // of how the direction qualifies it, so the qualifier does not exempt it.
  const geographic = /\b(?:(?:carte|interface)(?:s)? (?:schematique|routiere|geographique|interactive|abstraite?|(?:non |il)?lisible|(?:des? )?fermetures?)|cartograph\w*|(?:street|road|location|schematic|interactive|closure|navigation|route|abstract|unreadable|illegible) map|(?:map(?:ping)?|navigation) (?:app|application|interface|ui)|(?:abstract|illegible) interface|application (?:de )?carte|map of|google maps|street view|mapa(?:s)? (?:esquematico|geografico|vial|de|interactivo|abstracto)|segment routier|troncon routier|road segment|tramo (?:vial|de carretera)|place publique|public square|plaza publica)\b/g;
  // Scope exclusions to each mention. A later positive map request still
  // requires documentary handling, even if another map was excluded.
  const excluded = /(?:\b(?:rather than|instead of|en lugar de|en vez de|plutot que|au lieu de)|\b(?:sans|aucune?|sin|no|without|avoid|eviter|evita|evitar)|\b(?:do not|don't|ne pas|no)\s+(?:draw|show|render|include|use|dessiner|montrer|inclure|utiliser|dibujar|mostrar|incluir|usar))\s+(?:(?:a|an|any|the|une?|de|des|la|le|les|el|los|las|una?|ninguna?)\s+)*$/;
  return [...text.matchAll(geographic)].some(match =>
    !excluded.test(text.slice(0, match.index)));
}

/**
 * A slide takes the documentary (verified place) path when the writer declared
 * it needs verified map data or a real photograph of a named place, or when
 * its visual direction reads as a map or recognizable place reconstruction.
 * The declaration lets a slide whose direction never says "carte" — including
 * one about a named landmark the writer correctly did not try to draw itself
 * — still reach `preparePlaceVisuals` instead of an unverifiable illustration.
 * That path already carries its own discipline once reached: an archive photo
 * is only used for identity/location context (`purpose: "location"`), never
 * as evidence of a current closure, works or change (`purpose: "current-state"`,
 * which a fact naming a closure/travaux/fermeture forces); a map or the
 * existing conceptual fallback is used instead when nothing verifiable
 * resolves. Declaring "real-photo" never fabricates a photo of the place.
 */
export function requiresVerifiedGeography(unit: Pick<CreativeUnit, "visualDirection" | "visualNeed">): boolean {
  return unit.visualNeed === "verified-map" || unit.visualNeed === "real-photo" || requestsGeographicReconstruction(unit.visualDirection);
}
