import "server-only";
import { createHash } from "node:crypto";
import { fetchOpenMapData, renderOpenMap } from "./open-map-render";
import { OSM_ATTRIBUTION } from "./open-map-geometry";
import { sourceLocationQuery, resolveSourceLocation, type SourceLocation } from "./source-location";
import { PLACE_VISUAL_VERSION, type PreparedPlaceVisual } from "./creative-place-visual";
import type { CreativeProfile } from "./creative-content.types";

export async function prepareSourceLocation(anchor: SourceLocation, profile: CreativeProfile, sourceUrl: string): Promise<PreparedPlaceVisual> {
  const evidence: PreparedPlaceVisual["evidence"] = { version: PLACE_VISUAL_VERSION, representation: "typography", preparedAt: new Date().toISOString(), sourceUrl, reasons: [], locationAnchor: anchor };
  try {
    const data = await fetchOpenMapData(sourceLocationQuery(anchor, profile.geoScope));
    const place = resolveSourceLocation(data, anchor, profile.geoScope);
    if (!place) { evidence.reasons.push("The source gives a nearby landmark, but open data did not resolve one address point in the configured scope."); return { evidence }; }
    const bytes = await renderOpenMap({ kind: "point", name: anchor.address, points: [[place.longitude, place.latitude]] });
    evidence.representation = "map";
    evidence.attribution = OSM_ATTRIBUTION;
    evidence.sha256 = createHash("sha256").update(bytes).digest("hex");
    evidence.locationAnchor = { ...anchor, providerSourceUrl: place.sourceUrl, coordinates: { latitude: place.latitude, longitude: place.longitude } };
    evidence.reasons.push("Map of the source's nearby address, independently resolved from OpenStreetMap. The marker is a location reference, not the exact event site. No Google imagery or coordinates used.");
    return { evidence, bytes };
  } catch {
    evidence.reasons.push("The source-address map could not be prepared within the provider limits. The source relationship is preserved; no event point was invented.");
    return { evidence };
  }
}
