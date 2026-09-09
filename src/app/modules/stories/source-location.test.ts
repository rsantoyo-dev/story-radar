import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import sharp from "sharp";
import { createHash } from "node:crypto";
import * as policy from "./source-location";
import * as visual from "./creative-place-visual";
import type { CreativeKeyFact, CreativeProfile, CreativeUnit } from "./creative-content.types";

const scope = { municipality: "Saint jean sur richelieu", region: "quebec", country: "canada", validatedLocationId: null };
const excerpt = "sur le site de la nouvelle forêt nourricière située à côté de la bibliothèque Saint-Luc (347, boul. Saint-Luc(opens in new tab)).";
const facts = [{ id: "fact-1", statement: "Event", sourceExcerpt: excerpt }] as CreativeKeyFact[];
const unit = { id: "unit-4", order: 4, role: "conclusion", headline: "Rendez-vous près de la bibliothèque Saint-Luc", body: "Samedi", factIds: ["fact-1"], assetRequest: "generated-image" } as CreativeUnit;
const areas = [
  { type: "area", id: 1, tags: { name: "Canada", admin_level: "2" } },
  { type: "area", id: 2, tags: { name: "Québec", admin_level: "4" } },
  { type: "area", id: 3, tags: { name: "Saint-Jean-sur-Richelieu", admin_level: "8" } },
];
const node = { type: "node", id: 1296653926, lat: 45.3590819, lon: -73.3006559, tags: { "addr:housenumber": "347", "addr:street": "Boulevard Saint-Luc" } };
const data = { elements: [...areas, node] };

test("Source anchors preserve the explicit nearby relationship and only attach to units citing that place and fact", () => {
  const anchors = policy.sourceLocations(facts);
  assert.equal(anchors.length, 1);
  assert.equal(anchors[0].name, "bibliothèque Saint-Luc");
  assert.equal(anchors[0].address, "347, boul. Saint-Luc");
  assert.equal(anchors[0].relation, "nearby");
  assert.ok(excerpt.includes(anchors[0].excerpt));
  assert.equal(policy.sourceLocationForUnit(unit, anchors), anchors[0]);
  assert.equal(policy.sourceLocationForUnit({ ...unit, factIds: ["other"] }, anchors), undefined);
  assert.equal(policy.sourceLocationForUnit({ ...unit, headline: "Apportez vos surplus" }, anchors), undefined);
  assert.equal(policy.sourceLocationForUnit({ ...unit, assetRequest: "typography-only" }, anchors), undefined);
  assert.equal(policy.sourceLocations([{ ...facts[0], sourceExcerpt: "No address was supplied." }]).length, 0);
});

test("Source resolution requires one administrative chain and an exact numbered street node", () => {
  const anchor = policy.sourceLocations(facts)[0];
  const resolved = policy.resolveSourceLocation(data, anchor, scope);
  assert.equal(resolved?.id, "osm:node:1296653926");
  assert.equal(resolved?.latitude, node.lat);
  for (const bad of [
    { elements: [node] }, { elements: [...areas, node, { ...node, id: 99 }] },
    { elements: [...areas, { ...node, type: "way", center: { lat: node.lat, lon: node.lon } }] },
    { elements: [...areas, { ...node, tags: { ...node.tags, "addr:street": "Rue Laurier" } }] },
    { ...data, remark: "timeout" },
    { elements: [...areas, { ...areas[2], id: 44 }, node] },
  ]) assert.equal(policy.resolveSourceLocation(bad, anchor, scope), undefined);
  assert.equal(policy.resolveSourceLocation(data, anchor, { ...scope, municipality: "Montréal" }), undefined);
  assert.equal(policy.resolveSourceLocation(data, anchor, { ...scope, country: "France" }), undefined);
  assert.match(policy.sourceLocationQuery(anchor, scope), /rel\(area.country\)/);
  assert.match(policy.sourceLocationQuery(anchor, scope), /nwr\(area.city\)/);
});

function load<T>(file: string, dependencies: Record<string, unknown>): T {
  const exports = {};
  const code = ts.transpileModule(readFileSync(`src/app/modules/stories/${file}`, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  runInNewContext(code, { exports, Buffer, Date, require: (name: string) => name === "server-only" ? {} : dependencies[name] });
  return exports as T;
}
test("Preparing a nearby map uses independent OSM geometry and preserves its source evidence", async () => {
  let target: unknown;
  const bytes = Buffer.from("map");
  const prepare = load<typeof import("./prepare-source-location")>("prepare-source-location.ts", {
    "node:crypto": { createHash }, "./source-location": policy, "./creative-place-visual": visual,
    "./open-map-geometry": { OSM_ATTRIBUTION: "© OpenStreetMap contributors" },
    "./open-map-render": { fetchOpenMapData: async () => data, renderOpenMap: async (value: unknown) => { target = value; return bytes; } },
  });
  const result = await prepare.prepareSourceLocation(policy.sourceLocations(facts)[0], { geoScope: scope } as CreativeProfile, "https://example.org/source");
  assert.equal(result.evidence.representation, "map");
  assert.equal(result.evidence.locationAnchor?.relation, "nearby");
  assert.equal(result.evidence.locationAnchor?.coordinates?.latitude, node.lat);
  assert.equal(result.evidence.locationAnchor?.coordinates?.longitude, node.lon);
  assert.equal(result.evidence.sourceUrl, "https://example.org/source");
  assert.equal(JSON.stringify(target), JSON.stringify({ kind: "point", name: "347, boul. Saint-Luc", points: [[node.lon, node.lat]] }));
  assert.equal(result.bytes, bytes);
  assert.match(result.evidence.reasons[0], /not the exact event site/);
});

test("Editorial composition adds a visible original or conceptual graphic without touching the saved text", async () => {
  const renderer = load<typeof import("./creative-draft-typography")>("creative-draft-typography.ts", { sharp,
    "./creative-documentary-render": { escapeDocumentaryText: (text: string) => text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;") },
  });
  const profile = { name: "Salut St-Jean", language: "fr", brandPalette: [] } as unknown as CreativeProfile;
  const saved = { ...unit, headline: "Apportez vos surplus de potager", visualDirection: "Un panier de courgettes" };
  const before = JSON.stringify(saved);
  const output = await renderer.renderDraftTypography(saved, profile);
  const meta = await sharp(output).metadata();
  assert.equal(meta.width, 1080); assert.equal(meta.height, 1350);
  const stats = await sharp(output).extract({ left: 68, top: 400, width: 944, height: 410 }).stats();
  assert.ok(stats.channels[0].stdev > 20);
  assert.equal(JSON.stringify(saved), before);
  const original = await sharp({ create: { width: 944, height: 460, channels: 3, background: "#995511" } }).png().toBuffer();
  const mapped = await renderer.renderDraftTypography({ ...unit, placeVisual: { version: visual.PLACE_VISUAL_VERSION, representation: "map", preparedAt: new Date().toISOString(), reasons: [], locationAnchor: policy.sourceLocations(facts)[0] } }, profile, original);
  const pixels = await sharp(mapped).extract({ left: 68, top: 390, width: 944, height: 460 }).removeAlpha().raw().toBuffer();
  assert.deepEqual(pixels, await sharp(original).raw().toBuffer());
});
