import { mentionFitsScope, normalizePlaceName, type PlaceEvidence, type PlaceMention, type PhotoEvidence, type DocumentarySnapshot } from "./creative-documentary";
import { requiresVerifiedGeography } from "./creative-evidence-guardrails";
import { resolveEffectiveVisualFidelity } from "./creative-visual-fidelity";
import type { CreativeUnit, CreativeKeyFact, CreativeGeoScope } from "./creative-content.types";
import type { SourceLocation } from "./source-location";

export const PLACE_VISUAL_VERSION = "place-visual-v2";
export type PlaceVisualEvidence = {
  version: typeof PLACE_VISUAL_VERSION;
  representation: "photo" | "map" | "typography";
  preparedAt: string;
  /** "ai-reference": the model receives it; "panel": it is pasted unaltered after generation. */
  generationUse?: "ai-reference" | "panel";
  /** A pasted map's layout (see mapPanelLayout); absent on band-era snapshots. */
  panelLayout?: "inset" | "inset-labelled";
  /** The provider's name and street address for the place, printed on a labelled map card. */
  mapLabel?: { name: string; address: string };
  /**
   * "automatic": the writer declared no place need; automatic place detection
   * found the slide's one named place in the brand's area. Such a slide only
   * ever carries a verified photo as an AI identity reference, or nothing.
   */
  detection?: "automatic";
  referenceTopicId?: string;
  /** Mat colour behind a pasted map panel. */
  panelColor?: string;
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
  // A photo is only ever checked against its verified place; one recorded
  // without it can never be generated or approved, so it is prepared again.
  const complete = evidence.representation !== "photo" || Boolean(evidence.photo && evidence.place);
  return evidence.version === PLACE_VISUAL_VERSION && complete && Boolean(evidence.sha256 && evidence.attribution) && age >= 0 && age < 86_400_000;
}

/** The brand's area names a municipality, a region and a country: providers can then check a place against all three. */
export function placeScopeComplete(scope?: Partial<CreativeGeoScope> | null): boolean {
  return Boolean(scope?.municipality?.trim() && scope.region?.trim() && scope.country?.trim());
}

/** Formats whose slides feature places one by one (a list of venues, a programme). */
export function autoPlaceFormat(format?: string): boolean {
  return format === "carousel" || format === "sequence";
}

/**
 * The effective place-fidelity mode a preparation runs under, from the
 * topic's mode and the draft's override. An override that cannot be resolved
 * counts as the strictest mode, which never enables automatic detection.
 */
export function placeFidelityMode(inheritedMode: unknown, override?: { mode?: unknown; reason?: unknown } | null): string {
  try {
    return resolveEffectiveVisualFidelity({ inheritedMode, override: override?.mode ?? null, overrideReason: override?.reason }).mode;
  } catch {
    return "photo-required";
  }
}

/**
 * Automatic place detection: real places a carousel or sequence names get a
 * verifiable reference without the writer declaring a place need and without
 * a human picking photos. It runs only for a brand whose area is complete
 * (municipality, region and country — the provider identity check needs all
 * three) under the default illustration-editorial policy; the strict photo
 * policies keep their own rules unchanged.
 */
export function autoPlaceDetectionEnabled(input: { format?: string; geoScope?: Partial<CreativeGeoScope> | null; mode?: string }): boolean {
  return autoPlaceFormat(input.format) && input.mode === "illustration-editorial" && placeScopeComplete(input.geoScope);
}

/**
 * A slide automatic detection may research: it is an image slide (not
 * typography-only or typography-led), it is not built on an editor-chosen
 * story photo or documentary portrait, and the writer did not already route
 * it through the declared verified-geography path, whose rules still apply.
 */
export function autoPlaceCandidate(unit: Pick<CreativeUnit, "assetRequest" | "visualNeed" | "visualDirection" | "storyReferences">): boolean {
  return unit.assetRequest !== "typography-only" && unit.visualNeed !== "typography" &&
    !unit.storyReferences?.some(reference => reference.purpose !== "style") && !requiresVerifiedGeography(unit);
}

/**
 * The single place an automatic slide shows: exactly one named event place
 * cited by the slide's own facts (repeated mentions of the same name count
 * once), and that place fits the brand's area. None, several, a generic
 * location or a place elsewhere leaves the slide's illustration untouched.
 */
export function autoPlaceMention(unit: CreativeUnit, facts: CreativeKeyFact[], mentions: PlaceMention[], scope: CreativeGeoScope): PlaceMention | undefined {
  const named = mentionsForUnit(unit, facts, mentions);
  if (new Set(named.map(mention => normalizePlaceName(mention.name))).size !== 1) return undefined;
  return named.every(mention => mentionFitsScope(mention, scope)) ? named[0] : undefined;
}

/** An undeclared slide that names exactly one place in the brand's area: the slide automatic detection grounds. */
export function isAutoPlaceSlide(unit: CreativeUnit, facts: CreativeKeyFact[], mentions: PlaceMention[], scope: CreativeGeoScope): boolean {
  return autoPlaceCandidate(unit) && Boolean(autoPlaceMention(unit, facts, mentions, scope));
}

/**
 * The research trail an automatic place slide keeps when its photograph is
 * not sent to the model: identity and reasons, never the material itself, so
 * the slide is not mistaken for one with verified imagery.
 */
export function evidenceWithoutMaterial(evidence: PlaceVisualEvidence, reason: string): PlaceVisualEvidence {
  if (evidence.representation === "typography" && !evidence.generationUse) return evidence;
  return {
    version: evidence.version, representation: "typography", preparedAt: evidence.preparedAt, reasons: [...evidence.reasons, reason],
    ...(evidence.detection ? { detection: evidence.detection } : {}),
    ...(evidence.place ? { place: evidence.place } : {}),
    ...(evidence.sourceUrl ? { sourceUrl: evidence.sourceUrl } : {}),
    ...(evidence.discovery ? { discovery: evidence.discovery } : {}),
  };
}
