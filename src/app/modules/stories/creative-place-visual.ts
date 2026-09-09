import type { PlaceEvidence, PlaceMention, PhotoEvidence, DocumentarySnapshot } from "./creative-documentary";
import type { CreativeUnit, CreativeKeyFact } from "./creative-content.types";
import type { SourceLocation } from "./source-location";

export const PLACE_VISUAL_VERSION = "place-visual-v2";
export type PlaceVisualEvidence = {
  version: typeof PLACE_VISUAL_VERSION;
  representation: "photo" | "map" | "typography";
  preparedAt: string;
  reasons: string[];
  attribution?: string;
  sha256?: string;
  place?: PlaceEvidence;
  photo?: PhotoEvidence;
  discovery?: DocumentarySnapshot["discovery"];
  adapter?: string;
  adapterEvidence?: CreativeUnit["roadMapEvidence"];
  sourceUrl?: string;
  locationAnchor?: SourceLocation & { providerSourceUrl?: string; coordinates?: { latitude: number; longitude: number } };
};
export type PreparedPlaceVisual = { evidence: PlaceVisualEvidence; bytes?: Buffer };
export function unitSource(unit: CreativeUnit, facts: CreativeKeyFact[]): string {
  return facts.filter(f => unit.factIds.includes(f.id)).map(f => f.sourceExcerpt || "").join("\n");
}
export function mentionsForUnit(unit: CreativeUnit, facts: CreativeKeyFact[], mentions: PlaceMention[]): PlaceMention[] {
  const source = unitSource(unit, facts);
  // Only source-backed names, never the generator's visual direction.
  return mentions.filter(m => m.role === "event" && m.kind === "named" && source.includes(m.name));
}
export function visualEvidenceCurrent(evidence?: PlaceVisualEvidence, now = Date.now()): boolean {
  if (!evidence || evidence.representation === "typography") return true;
  const age = now - Date.parse(evidence.preparedAt);
  return evidence.version === PLACE_VISUAL_VERSION && Boolean(evidence.sha256 && evidence.attribution) && age >= 0 && age < 86_400_000;
}
