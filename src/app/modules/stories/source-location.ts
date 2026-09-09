import { record } from "./creative-documentary";
import type { CreativeGeoScope, CreativeUnit, CreativeKeyFact } from "./creative-content.types";

export type SourceLocation = {
  relation: "nearby"; name: string; address: string; houseNumber: string; street: string;
  excerpt: string; factIds: string[];
};
export function geographicText(value: string): string {
  return value.toLowerCase().normalize("NFD").replace(/([a-z])[\u0300-\u036f]+/giu, "$1").normalize("NFC")
    .replace(/[\p{Pd}.,]/gu, " ").replace(/\s+/gu, " ").trim();
}
export function streetText(value: string): string {
  return geographicText(value).replace(/^(boul|blvd)\b/u, "boulevard").replace(/^ave?\b/u, "avenue");
}
/** Only an explicit source relationship can turn a nearby landmark into a map anchor. */
export function sourceLocations(facts: CreativeKeyFact[]): SourceLocation[] {
  const result: SourceLocation[] = [];
  for (const fact of facts) {
    const source = fact.sourceExcerpt || "";
    const pattern = /(?:à côté de|près de|next to|beside|junto a|al lado de)\s+(?:(?:la|le|l’|l'|the|el)\s*)?([^\n()!?;]{3,100}?)\s*\((\d{1,6}[a-zA-Z]?)[,\s]+([^()\n]{3,100})(?:\(opens in new tab\))?\)/giu;
    for (const match of source.matchAll(pattern)) {
      const name = match[1].trim(), street = match[3].trim();
      if (!/\p{L}/u.test(street) || /[;{}<>\[\]]/.test(name + street)) continue;
      const anchor = { relation: "nearby" as const, name, address: `${match[2]}, ${street}`, houseNumber: match[2], street, excerpt: match[0], factIds: [fact.id] };
      const same = result.find(item => item.excerpt === anchor.excerpt);
      if (same) same.factIds.push(fact.id); else result.push(anchor);
    }
  }
  return result.slice(0, 6);
}
export function sourceLocationForUnit(unit: CreativeUnit, locations: SourceLocation[]): SourceLocation | undefined {
  if (unit.assetRequest === "typography-only") return;
  const visible = geographicText([unit.headline, unit.subheadline, unit.body].filter(Boolean).join(" "));
  const matches = locations.filter(item => item.factIds.some(id => unit.factIds.includes(id)) && visible.includes(geographicText(item.name)));
  return matches.length === 1 ? matches[0] : undefined;
}
function literalPattern(value: string): string {
  const accents: Record<string, string> = { a: "[aàáâäãå]", e: "[eèéêë]", i: "[iìíîï]", o: "[oòóôöõ]", u: "[uùúûü]", c: "[cç]", n: "[nñ]" };
  return [...geographicText(value)].map(char => char === " " ? "[- ‐‑–]+" : accents[char] || char.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("");
}
function countryCode(name: string): string | undefined {
  const wanted = geographicText(name);
  const names = ["en", "fr", "es"].map(language => new Intl.DisplayNames([language], { type: "region" }));
  for (let first = 65; first <= 90; first++) for (let second = 65; second <= 90; second++) {
    const code = String.fromCharCode(first, second);
    if (names.some(display => { const label = display.of(code); return label && label !== code && geographicText(label) === wanted; })) return code;
  }
}
export function sourceLocationQuery(anchor: SourceLocation, scope: CreativeGeoScope): string {
  if (![scope.country, scope.region, scope.municipality].every(v => v.trim() && v.length <= 120)) throw new Error("Configure municipality, region and country before preparing the map.");
  // A concrete indexed key avoids scanning every relation's tag keys worldwide.
  // A translated administrative name unavailable as `name` remains unresolved.
  const filter = (name: string) => `["name"~${JSON.stringify(`^${literalPattern(name)}$`)},i]`;
  const country = countryCode(scope.country);
  // Each nested query is scoped to the preceding administrative area, never a global address search.
  return `[out:json][timeout:12][maxsize:8388608];area["boundary"="administrative"]["admin_level"="2"]${country ? `["ISO3166-1"=${JSON.stringify(country)}]` : filter(scope.country)}->.country;rel(area.country)["boundary"="administrative"]["admin_level"~"^[3-6]$"]${filter(scope.region)};map_to_area->.region;rel(area.region)["boundary"="administrative"]${filter(scope.municipality)};map_to_area->.city;(.country;.region;.city;);out tags;nwr(area.city)["addr:housenumber"=${JSON.stringify(anchor.houseNumber)}];out tags center;`;
}
export type ResolvedSourceLocation = { id: string; sourceUrl: string; longitude: number; latitude: number; scope: CreativeGeoScope };
export function resolveSourceLocation(data: unknown, anchor: SourceLocation, scope: CreativeGeoScope): ResolvedSourceLocation | undefined {
  if (!record(data) || data.remark || !Array.isArray(data.elements) || data.elements.length > 200) return;
  const elements = data.elements.filter(record);
  const areas = elements.filter(e => e.type === "area" && record(e.tags));
  const named = (e: Record<string, unknown>, value: string) => Object.entries(e.tags as Record<string, unknown>).some(([key, name]) => /^(name|name:en|name:fr|name:es|int_name)$/.test(key) && typeof name === "string" && geographicText(name) === geographicText(value));
  const country = areas.filter(e => (e.tags as Record<string, unknown>).admin_level === "2" && named(e, scope.country));
  const region = areas.filter(e => /^[3-6]$/.test(String((e.tags as Record<string, unknown>).admin_level)) && named(e, scope.region));
  if (country.length !== 1 || region.length !== 1) return;
  const city = areas.filter(e => Number((e.tags as Record<string, unknown>).admin_level) > Number((region[0].tags as Record<string, unknown>).admin_level) && named(e, scope.municipality));
  if (city.length !== 1 || new Set([country[0].id, region[0].id, city[0].id]).size !== 3) return;
  const matches = elements.filter(e => e.type === "node" && record(e.tags) && e.tags["addr:housenumber"] === anchor.houseNumber && typeof e.tags["addr:street"] === "string" && streetText(e.tags["addr:street"]) === streetText(anchor.street));
  // Building centres are deliberately not treated as precise access points.
  if (matches.length !== 1) return;
  const match = matches[0];
  if (!Number.isSafeInteger(match.id) || Number(match.id) <= 0 || typeof match.lat !== "number" || typeof match.lon !== "number" || !Number.isFinite(match.lat) || !Number.isFinite(match.lon) || Math.abs(match.lat) > 85 || Math.abs(match.lon) > 180) return;
  return { id: `osm:node:${match.id}`, sourceUrl: `https://www.openstreetmap.org/node/${match.id}`, longitude: match.lon, latitude: match.lat, scope };
}
