import type { CreativeKeyFact } from "./creative-content.types";
export const ROAD_DATA_URL = "https://ws.mapserver.transports.gouv.qc.ca/swtq?service=wfs&version=2.0.0&request=getfeature&typename=ms:chantiers_mtmdet&srsname=EPSG:4326&outputformat=geojson";
/**
 * Sources whose road notices may be matched against the official MTMD
 * geometry: the 511 notice pages themselves and the ministry's own press
 * releases. The geometry always comes from the WFS, never from the source;
 * this list only decides which sources are worth checking against it.
 */
export const OFFICIAL_ROAD_NOTICE_HOSTS = ["www.511.gouv.qc.ca", "511.gouv.qc.ca", "www.quebec511.info", "quebec511.info", "www.quebec.ca", "quebec.ca", "www.transports.gouv.qc.ca", "transports.gouv.qc.ca"];
export function isOfficialRoadNoticeSource(url: URL): boolean {
  return OFFICIAL_ROAD_NOTICE_HOSTS.includes(url.hostname);
}
export type RoadSegment = {
  id: string; route: string; location: string; direction: string; start: string; end: string; updated: string; coordinates: number[][];
  /** Present when matched from a prose notice: the MTMD work-site id that groups nightly rows. */
  chantier?: string;
  /** Official closure wording and detour, verbatim from the MTMD record; rendered as the map legend. */
  entrave?: string;
  detour?: string;
};
export type RoadSegmentMatch = { segment?: RoadSegment; reason: string };
const normalized = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[’']/g, "'").replace(/\s+/g, " ").trim().toLowerCase();
const months = ["janvier","fevrier","mars","avril","mai","juin","juillet","aout","septembre","octobre","novembre","decembre"];
const MONTHS_EN = ["january","february","march","april","may","june","july","august","september","october","november","december"];
function sourceDate(value: string): string | undefined {
  const match = /^(\d{4})\/(\d{2})\/(\d{2}) (\d{2}):(\d{2}):00$/.exec(value);
  if (!match || !months[Number(match[2])-1]) return;
  return `${Number(match[3])} ${months[Number(match[2])-1]} ${match[1]} a ${Number(match[4])} h${Number(match[5]) ? ` ${Number(match[5])}` : ""}`;
}
type Feature = { properties: Record<string, unknown>; geometry?: { type?: string; coordinates?: unknown } };
const REQUIRED = ["identifiant","routeAutoroute","localisation","direction","debut","fin","miseAJour"];
function validFeatures(data: unknown): Feature[] | undefined {
  if (!data || typeof data !== "object") return;
  const collection = data as { type?: string; numberMatched?: number; features?: unknown[] };
  if (collection.type !== "FeatureCollection" || !Array.isArray(collection.features) || collection.numberMatched !== collection.features.length) return;
  const features: Feature[] = [];
  for (const raw of collection.features) {
    if (!raw || typeof raw !== "object") continue;
    const feature = raw as Feature;
    if (feature.properties && REQUIRED.every(k => typeof feature.properties[k] === "string")) features.push(feature);
  }
  return features;
}
/** Québec-bounded LineString or nothing; km markers are never turned into coordinates. */
function segmentGeometry(feature: Feature): number[][] | undefined {
  const points = feature.geometry?.coordinates;
  if (feature.geometry?.type !== "LineString" || !Array.isArray(points) || points.length < 2 || points.length > 1000 || !points.every(pt => Array.isArray(pt) && pt.length === 2 && pt.every(Number.isFinite) && pt[0] >= -80 && pt[0] <= -57 && pt[1] >= 44 && pt[1] <= 63)) return;
  return points as number[][];
}
function toSegment(feature: Feature, coordinates: number[][], structured: boolean): RoadSegment {
  const p = feature.properties;
  const base: RoadSegment = { id: p.identifiant as string, route: p.routeAutoroute as string, location: p.localisation as string, direction: p.direction as string, start: p.debut as string, end: p.fin as string, updated: p.miseAJour as string, coordinates };
  if (!structured) return base;
  const text = (key: string) => typeof p[key] === "string" ? (p[key] as string).replace(/\s+/g, " ").trim() : "";
  return { ...base, chantier: text("identifiantChantier") || base.id, ...(text("entrave") ? { entrave: text("entrave") } : {}), ...(text("detoursEtItinerairesFacultatifs") ? { detour: text("detoursEtItinerairesFacultatifs") } : {}) };
}
/** A 511 notice record carries exact dates; a press release only carries a window. */
export function hasRoadNoticeRecord(facts: readonly CreativeKeyFact[]): boolean {
  return facts.some(f => /\bentrave (?:majeure|mineure) direction (?:sud|nord|est|ouest)/.test(normalized(f.sourceExcerpt || "")));
}
/** Complete, unique row identity; no municipality centroid or model coordinates. */
export function selectRoadSegment(data: unknown, facts: CreativeKeyFact[]): RoadSegment | undefined {
  return matchRoadSegment(data, facts).segment;
}
export function matchRoadSegment(data: unknown, facts: CreativeKeyFact[]): RoadSegmentMatch {
  const features = validFeatures(data);
  if (!features) return { reason: "Official road data unavailable or incomplete" };
  return hasRoadNoticeRecord(facts) ? matchNoticeRecord(features, facts) : matchOfficialChantier(features, facts);
}
function matchNoticeRecord(features: Feature[], facts: CreativeKeyFact[]): RoadSegmentMatch {
  const excerpts = facts.map(f => normalized(f.sourceExcerpt || ""));
  const matches: RoadSegment[] = [];
  for (const feature of features) {
    const p = feature.properties;
    const start = sourceDate(p.debut as string), end = sourceDate(p.fin as string);
    if (!start || !end || !excerpts.some(e => e.startsWith(`${p.routeAutoroute} `) && e.includes(normalized(p.localisation as string)) && e.includes(`direction ${normalized(p.direction as string)} du ${start} au ${end}`))) continue;
    const coordinates = segmentGeometry(feature);
    if (!coordinates) return { reason: "Official notice geometry is invalid or unsupported" };
    matches.push(toSegment(feature, coordinates, false));
  }
  return matches.length === 1 ? { segment: matches[0], reason: "Official notice record matched" } : { reason: "No unique official segment matches the cited location, direction and dates" };
}

/**
 * Signals a prose notice (press release, news page) states about one closure.
 * Every field is read from the cited facts only; nothing is inferred from the
 * story date, the Topic scope or a model. A missing signal means no match.
 */
export type RoadNoticeSignals = {
  /** Route number paired with the direction stated in the same clause, e.g. ["15","sud"]. */
  routes: [string, string][];
  /** ISO date window (YYYY-MM-DD) the notice announces. */
  window?: { start: string; end: string };
  closure?: "complete" | "partial";
  text: string;
};
const DIRECTION = "(sud|nord|est|ouest)";
const MONTH = `(${months.join("|")}|${MONTHS_EN.join("|")})`;
function monthIndex(name: string): number {
  const i = months.indexOf(name); return i >= 0 ? i : MONTHS_EN.indexOf(name);
}
const isoDate = (year: number, month: number, day: number): string | undefined => {
  const date = new Date(Date.UTC(year, month, day));
  return date.getUTCMonth() === month && date.getUTCDate() === day ? date.toISOString().slice(0, 10) : undefined;
};
export function roadNoticeSignals(facts: readonly CreativeKeyFact[]): RoadNoticeSignals {
  // Facts are joined with ";" so a fact boundary is a clause boundary: the
  // route at the end of one fact can never pair with a direction that opens
  // the next one (normalization collapses newlines, so "\n" would not do).
  const text = normalized(facts.map(f => `${f.statement} ; ${f.sourceExcerpt || ""}`).join(" ; "));
  const routes: [string, string][] = [];
  // "autoroute 15 (boulevard Marie-Victorin), en direction sud" — the direction must
  // sit in the same clause as the route, so a detour's "direction est" never
  // attaches to the closed route.
  for (const match of text.matchAll(new RegExp(`\\b(?:autoroute|route|a-|r-)\\s*(\\d{1,3})\\b(?:[^.;\\n]{0,80}?)\\b(?:en )?direction ${DIRECTION}\\b`, "g"))) {
    const pair: [string, string] = [match[1], match[2]];
    if (!routes.some(r => r[0] === pair[0] && r[1] === pair[1])) routes.push(pair);
  }
  const years = [...new Set([...text.matchAll(/\b(20\d{2})\b/g)].map(m => m[1]))];
  const soleYear = years.length === 1 ? Number(years[0]) : undefined;
  let window: RoadNoticeSignals["window"];
  const range = new RegExp(`\\b(?:du|from)\\s+(\\d{1,2})(?:er)?\\s+(?:${MONTH}\\s+)?(?:(20\\d{2})\\s+)?(?:au|to|jusqu'au)\\s+(\\d{1,2})(?:er)?\\s+${MONTH}(?:\\s+(20\\d{2}))?`).exec(text);
  if (range) {
    const endMonth = monthIndex(range[5]), startMonth = range[2] ? monthIndex(range[2]) : endMonth;
    const endYear = range[6] ? Number(range[6]) : range[3] ? Number(range[3]) : soleYear;
    const startYear = range[3] ? Number(range[3]) : endYear === undefined ? undefined : startMonth > endMonth ? endYear - 1 : endYear;
    const start = startYear === undefined ? undefined : isoDate(startYear, startMonth, Number(range[1]));
    const end = endYear === undefined ? undefined : isoDate(endYear, endMonth, Number(range[4]));
    if (start && end && start <= end) window = { start, end };
  } else {
    const single = new RegExp(`\\b(?:le|la nuit du|nuit du|on)\\s+(\\d{1,2})(?:er)?\\s+${MONTH}(?:\\s+(20\\d{2}))?`).exec(text);
    const year = single?.[3] ? Number(single[3]) : soleYear;
    const date = single && year !== undefined ? isoDate(year, monthIndex(single[2]), Number(single[1])) : undefined;
    if (date) window = { start: date, end: date };
  }
  const closure = /\b(?:fermetures? complete|completement ferme|route fermee|autoroute fermee|full closure|completely closed|closed completely)/.test(text) ? "complete" as const
    : /\b(?:fermeture de \d+ voies?|\d+ voies? sur \d+|voie fermee|lane closure|lanes? closed)/.test(text) ? "partial" as const : undefined;
  return { routes, window, closure, text };
}
function featureClosure(p: Record<string, unknown>): "complete" | "partial" | undefined {
  const text = normalized(`${p.entrave ?? ""} ${p.entraveType ?? ""}`);
  if (/\b(?:route|autoroute|bretelle|voie de desserte) fermee|fermeture complete|\bfermee?\b(?![^]*\bvoie)/.test(text) && !/\bvoies? sur\b/.test(text)) return "complete";
  if (/\bvoies? sur\b|fermeture de \d+ voie|voie fermee|alternance/.test(text)) return "partial";
}
/** "À Brossard, entre le pont X et le boulevard Y" → municipality + the named anchors. */
export function localisationParts(localisation: string): { municipality?: string; anchors: string[] } {
  const text = normalized(localisation);
  const head = /^(?:a|au|aux) ([^,]+?)(?:,| entre | sur | dans | pres | au | a la | a l'| du | de |$)/.exec(text);
  const municipality = head?.[1]?.trim();
  const rest = municipality ? text.slice(text.indexOf(municipality) + municipality.length) : text;
  const anchors = rest.replace(/[()]/g, ",").split(/,| et | entre | sur | dans | pres de /)
    .map(part => part.replace(/^(?:l'acces (?:du|de la|de l'|des) |le |la |l'|les |du |de la |de l'|des |de |d')+/, "").trim())
    .filter(part => part.length >= 3 && /[a-z]/.test(part));
  return { municipality, anchors: [...new Set(anchors)] };
}
const loose = (s: string) => s.replace(/[-\s]+/g, " ");
const dateOf = (value: string) => { const m = /^(\d{4})\/(\d{2})\/(\d{2})/.exec(value); return m ? `${m[1]}-${m[2]}-${m[3]}` : undefined; };
/**
 * Match a prose notice to exactly one MTMD work site (identifiantChantier).
 * Stages are ordered so the reason names the first unmet criterion; a
 * "dates" failure specifically tells the editor the feed has not published
 * the announced nights yet, which is the normal state for a press release
 * issued days ahead of the closure.
 */
function matchOfficialChantier(features: Feature[], facts: CreativeKeyFact[]): RoadSegmentMatch {
  const signals = roadNoticeSignals(facts);
  if (!signals.routes.length) return { reason: "The cited facts do not state a numbered route together with its direction" };
  if (!signals.window) return { reason: "The cited facts do not state the closure dates with a year" };
  const text = loose(signals.text);
  const byRoute = features.filter(f => signals.routes.some(([route, direction]) => f.properties.routeAutoroute === route && normalized(f.properties.direction as string) === direction));
  if (!byRoute.length) return { reason: "No official notice covers the cited route in the cited direction" };
  const byPlace = byRoute.filter(f => {
    const parts = localisationParts(f.properties.localisation as string);
    return parts.municipality && text.includes(loose(parts.municipality)) && parts.anchors.some(anchor => text.includes(loose(anchor)));
  });
  if (!byPlace.length) return { reason: "No official notice for that route names the cited municipality and location" };
  const byClosure = signals.closure ? byPlace.filter(f => featureClosure(f.properties) === signals.closure) : byPlace;
  if (!byClosure.length) return { reason: "The official notices at that location describe a different closure type than the cited facts" };
  const byDate = byClosure.filter(f => { const s = dateOf(f.properties.debut as string), e = dateOf(f.properties.fin as string); return s && e && s <= signals.window!.end && e >= signals.window!.start; });
  if (!byDate.length) {
    const sites = [...new Set(byClosure.map(f => String(f.properties.identifiantChantier || f.properties.identifiant)))];
    return { reason: `Official work site ${sites.join(", ")} matches the cited route and location, but its published windows do not cover ${signals.window.start} to ${signals.window.end} yet; the feed lists closures night by night, so retry closer to the closure` };
  }
  const sites = new Map<string, Feature[]>();
  for (const f of byDate) { const id = String(f.properties.identifiantChantier || f.properties.identifiant); sites.set(id, [...(sites.get(id) ?? []), f]); }
  if (sites.size !== 1) return { reason: `${sites.size} official work sites match the cited route, location and dates; the notice is ambiguous` };
  const rows = [...sites.values()][0].sort((a, b) => String(a.properties.debut).localeCompare(String(b.properties.debut)));
  const coordinates = segmentGeometry(rows[0]);
  if (!coordinates) return { reason: "Official notice geometry is invalid or unsupported" };
  const key = (f: Feature) => JSON.stringify([f.properties.localisation, f.properties.detoursEtItinerairesFacultatifs, f.geometry?.coordinates]);
  if (rows.some(row => key(row) !== key(rows[0]))) return { reason: "The official work site publishes differing segments for the cited dates; the geometry is ambiguous" };
  return { segment: toSegment(rows[0], coordinates, true), reason: "Official MTMD work site matched from the cited route, direction, municipality, location and dates" };
}
/**
 * Nightly rows of one work site rotate their row id and hours; a saved map
 * stays current while the site, route, direction, wording, detour and
 * geometry are unchanged. Legacy notice-record segments compare whole.
 */
export function sameRoadSegment(a: RoadSegment | undefined, b: RoadSegment | undefined): boolean {
  if (!a || !b) return false;
  if (!a.chantier || !b.chantier) return JSON.stringify(a) === JSON.stringify(b);
  const identity = (s: RoadSegment) => JSON.stringify([s.chantier, s.route, s.direction, s.location, s.entrave ?? "", s.detour ?? "", s.coordinates]);
  return identity(a) === identity(b);
}
