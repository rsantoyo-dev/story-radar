import type { CreativeKeyFact } from "./creative-content.types";
export const ROAD_DATA_URL = "https://ws.mapserver.transports.gouv.qc.ca/swtq?service=wfs&version=2.0.0&request=getfeature&typename=ms:chantiers_mtmdet&srsname=EPSG:4326&outputformat=geojson";
export type RoadSegment = { id: string; route: string; location: string; direction: string; start: string; end: string; updated: string; coordinates: number[][] };
const normalized = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim().toLowerCase();
const months = ["janvier","fevrier","mars","avril","mai","juin","juillet","aout","septembre","octobre","novembre","decembre"];
function sourceDate(value: string): string | undefined {
  const match = /^(\d{4})\/(\d{2})\/(\d{2}) (\d{2}):(\d{2}):00$/.exec(value);
  if (!match || !months[Number(match[2])-1]) return;
  return `${Number(match[3])} ${months[Number(match[2])-1]} ${match[1]} a ${Number(match[4])} h${Number(match[5]) ? ` ${Number(match[5])}` : ""}`;
}
/** Complete, unique row identity; no municipality centroid or model coordinates. */
export function selectRoadSegment(data: unknown, facts: CreativeKeyFact[]): RoadSegment | undefined {
  if (!data || typeof data !== "object") return;
  const collection = data as { type?: string; numberMatched?: number; features?: unknown[] };
  if (collection.type !== "FeatureCollection" || !Array.isArray(collection.features) || collection.numberMatched !== collection.features.length) return;
  const excerpts = facts.map(f => normalized(f.sourceExcerpt || ""));
  const matches: RoadSegment[] = [];
  for (const raw of collection.features) {
    if (!raw || typeof raw !== "object") continue;
    const feature = raw as { properties?: Record<string, unknown>; geometry?: { type?: string; coordinates?: unknown } };
    const p = feature.properties;
    if (!p || !["identifiant","routeAutoroute","localisation","direction","debut","fin","miseAJour"].every(k => typeof p[k] === "string")) continue;
    const start = sourceDate(p.debut as string), end = sourceDate(p.fin as string);
    if (!start || !end || !excerpts.some(e => e.startsWith(`${p.routeAutoroute} `) && e.includes(normalized(p.localisation as string)) && e.includes(`direction ${normalized(p.direction as string)} du ${start} au ${end}`))) continue;
    const points = feature.geometry?.coordinates;
    if (feature.geometry?.type !== "LineString" || !Array.isArray(points) || points.length < 2 || points.length > 1000 || !points.every(pt => Array.isArray(pt) && pt.length === 2 && pt.every(Number.isFinite) && pt[0] >= -80 && pt[0] <= -57 && pt[1] >= 44 && pt[1] <= 63)) return;
    matches.push({ id: p.identifiant as string, route: p.routeAutoroute as string, location: p.localisation as string, direction: p.direction as string, start: p.debut as string, end: p.fin as string, updated: p.miseAJour as string, coordinates: points as number[][] });
  }
  return matches.length === 1 ? matches[0] : undefined;
}
