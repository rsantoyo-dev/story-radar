import test from "node:test";
import assert from "node:assert/strict";
import data from "./fixtures/quebec-road-35.json";
import brossard from "./fixtures/quebec-road-brossard-15.json";
import { closureKind, hasRoadNoticeRecord, isOfficialRoadNoticeSource, localisationParts, matchRoadSegment, roadNoticeSignals, sameRoadSegment, selectRoadSegment } from "./quebec-road-map";
const fact = { id: "fact-1", statement: "Entrave majeure", sourceExcerpt: "35\nÀ Saint-Jean-sur-Richelieu, entre la sortie 39 (R-104) et la R-104\nEntrave\nMajeure\nDirection\nSud et nord\nDu 21 juin 2026 à 20 h au 31 octobre 2026 à 6 h" };
test("matches the actual 168598 notice without borrowing Saint-Sebastien dates", () => {
 const segment = selectRoadSegment(data, [fact]);
 assert.equal(segment?.id, "168598");
 assert.equal(segment?.chantier, undefined);
 assert.equal(selectRoadSegment(data, [{ ...fact, sourceExcerpt: fact.sourceExcerpt.replace("31 octobre", "9 octobre") }]), undefined);
 assert.equal(selectRoadSegment(data, [{ ...fact, sourceExcerpt: fact.sourceExcerpt.replace("Sud et nord", "Sud") }]), undefined);
 assert.equal(selectRoadSegment({ ...data, numberMatched: 9999 }, [fact]), undefined);
 assert.ok(hasRoadNoticeRecord([fact]));
});
test("rejects ambiguous and invalid geometry", () => {
 const feature = data.features.find(f => f.properties.identifiant === "168598")!;
 assert.equal(selectRoadSegment({ type: "FeatureCollection", numberMatched: 2, features: [feature, feature] }, [fact]), undefined);
 assert.equal(selectRoadSegment({ type: "FeatureCollection", numberMatched: 1, features: [{ ...feature, geometry: {type: "LineString", coordinates: [[0,0],[1,1]]} }] }, [fact]), undefined);
});

// The MTMD press release for the Marie-Victorin closure (story 0b6454cf), as
// ingested: one closure stated in prose, a detour naming other routes and
// directions, and the announced nights as a window with a year.
const press = "LONGUEUIL, QC , le 22 sept. 2026 /CNW/ -- Le ministère des Transports et de la Mobilité durable informe la population qu'il procédera à des fermetures complètes de la voie de desserte de l'autoroute 15 (boulevard Marie-Victorin), en direction sud, à Brossard, au cours des nuits du 28 septembre au 7 octobre 2026. Ces entraves sont requises dans le cadre des travaux d'asphaltage de l'autoroute 15, en direction sud, qui comprennent des interventions d'asphaltage sur le boulevard Marie-Victorin, en direction sud, entre le secteur du pont Samuel-De Champlain et la rue Tessier. Voie de desserte de l'autoroute 15 (boulevard Marie-Victorin), en direction sud et bretelle menant de l'autoroute 10 (des Cantons-de-l'Est), en direction est, vers l'autoroute 15, en direction sud. Un détour sera toutefois exigé par l'autoroute 10 (des Cantons-de-l'Est) en direction est, le boulevard Taschereau en direction ouest, et le boulevard de Rome en direction nord.";
const pressFacts = [
  { id: "fact-1", statement: "Fermetures complètes de la voie de desserte de l'autoroute 15 (boulevard Marie-Victorin), en direction sud, à Brossard, les nuits du 28 septembre au 7 octobre 2026.", sourceExcerpt: press.slice(0, 330) },
  { id: "fact-2", statement: "Les travaux d'asphaltage couvrent le boulevard Marie-Victorin entre le secteur du pont Samuel-De Champlain et la rue Tessier.", sourceExcerpt: press.slice(330, 640) },
  { id: "fact-3", statement: "Détour par l'autoroute 10 en direction est, le boulevard Taschereau en direction ouest et le boulevard de Rome en direction nord.", sourceExcerpt: press.slice(640) },
];
type Fixture = typeof brossard;
const shifted = (source: Fixture, ids: string[], from: [string, string], to: [string, string]): Fixture => ({ ...source, features: source.features.map(f => ids.includes(f.properties.identifiant) ? { ...f, properties: { ...f.properties, debut: f.properties.debut.replace(from[0], to[0]), fin: f.properties.fin.replace(from[1], to[1]) } } : f) });
const brossardOn28 = shifted(brossard, ["172650", "172721", "172780"], ["09/23", "09/24"], ["09/28", "09/29"]);

test("a prose press release reads route+direction pairs per clause, a dated window and the closure type", () => {
  const signals = roadNoticeSignals(pressFacts);
  assert.deepEqual(signals.routes, [["15", "sud"], ["10", "est"]]);
  assert.deepEqual(signals.window, { start: "2026-09-28", end: "2026-10-07" });
  assert.equal(signals.closure, "complete");
  assert.equal(hasRoadNoticeRecord(pressFacts), false);
  assert.deepEqual(localisationParts("À Brossard, entre le pont Samuel-De Champlain et le boulevard Matte"), { municipality: "brossard", anchors: ["pont samuel-de champlain", "boulevard matte"] });
  assert.deepEqual(localisationParts("À Boucherville entre la sortie 136 ( boulevard Marie-Victorin) et l'accès du boulevard Marie-Victorin"), { municipality: "boucherville", anchors: ["sortie 136", "boulevard marie-victorin"] });
});

test("the live feed before the announced nights names the work site and says the dates are not published yet", () => {
  const match = matchRoadSegment(brossard, pressFacts);
  assert.equal(match.segment, undefined);
  assert.match(match.reason, /work site 319446/);
  assert.match(match.reason, /2026-09-28 to 2026-10-07/);
});

test("once the feed publishes a night in the window, exactly one work site matches and carries the official legend", () => {
  const match = matchRoadSegment(brossardOn28, pressFacts);
  assert.equal(match.segment?.id, "172650");
  assert.equal(match.segment?.chantier, "319446");
  assert.equal(match.segment?.direction, "Sud");
  assert.equal(match.segment?.entrave, "Route fermée");
  assert.equal(match.segment?.detour, "Sortie 75, boulevard Marie-Victorin");
  assert.equal(match.segment?.coordinates.length, 112);
  // 172780 (Marie-Victorin, 1 voie sur 2) and 172721 (Sud et nord) share the
  // route, municipality and night; closure type and direction keep them out.
  assert.equal(matchRoadSegment(brossardOn28, pressFacts.map(f => ({ ...f, statement: f.statement.replace("Fermetures complètes", "Fermetures"), sourceExcerpt: f.sourceExcerpt.replace(/fermetures? compl[eè]tes?/gi, "fermetures") }))).reason, "2 official work sites match the cited route, location and dates; the notice is ambiguous");
});

test("an exit or access closure at the same anchor never competes with the mainline closure it belongs to", () => {
  const first = brossardOn28.features.find(f => f.properties.identifiant === "172650")!;
  const exit = { ...first, properties: { ...first.properties, identifiant: "172699", identifiantChantier: "888888", localisation: "À Brossard, sortie 8 (pont Samuel-De Champlain)", entrave: "Sortie fermée", detoursEtItinerairesFacultatifs: "" } };
  const withExit = { ...brossardOn28, numberMatched: brossardOn28.features.length + 1, features: [...brossardOn28.features, exit] };
  assert.equal(matchRoadSegment(withExit, pressFacts).segment?.id, "172650");
  for (const [text, kind] of [["Autoroute fermée\n- Jeudi entre 20 h 30 et 5 h", "complete"], ["fermetures complètes de la voie de desserte", "complete"], ["Chaussée fermée en direction SUD, circulation à contresens", "complete"], ["Sortie fermée", "ramp"], ["Accès fermé", "ramp"], ["Fermeture de 1 voie sur 3", "partial"], ["Circulation en alternance en tout temps", "partial"], ["Majeure (semaine)", undefined]] as const) assert.equal(closureKind(text), kind, text);
});

test("nightly rows of one work site stay one match; a second work site or a missing year yields nothing", () => {
  const first = brossardOn28.features.find(f => f.properties.identifiant === "172650")!;
  const secondNight = { ...first, properties: { ...first.properties, identifiant: "172651", debut: "2026/09/29 23:00:00", fin: "2026/09/30 05:00:00" } };
  const twoNights = { ...brossardOn28, numberMatched: brossardOn28.features.length + 1, features: [...brossardOn28.features, secondNight] };
  assert.equal(matchRoadSegment(twoNights, pressFacts).segment?.id, "172650");
  const otherSite = { ...twoNights, features: twoNights.features.map(f => f.properties.identifiant === "172651" ? { ...f, properties: { ...f.properties, identifiantChantier: "999999" } } : f) };
  assert.match(matchRoadSegment(otherSite, pressFacts).reason, /2 official work sites/);
  const movedGeometry = { ...twoNights, features: twoNights.features.map(f => f.properties.identifiant === "172651" ? { ...f, geometry: { type: "LineString", coordinates: [[-73.47, 45.45], [-73.46, 45.46]] } } : f) };
  assert.match(matchRoadSegment(movedGeometry, pressFacts).reason, /differing segments/);
  assert.match(matchRoadSegment(brossardOn28, pressFacts.map(f => ({ ...f, statement: f.statement.replace(/ ?2026/g, ""), sourceExcerpt: f.sourceExcerpt.replace(/ ?2026/g, "") }))).reason, /with a year/);
  assert.match(matchRoadSegment(brossardOn28, pressFacts.map(f => ({ ...f, statement: f.statement.replace("Brossard", "Longueuil"), sourceExcerpt: f.sourceExcerpt.replace("Brossard", "Longueuil") }))).reason, /municipality and location/);
  assert.match(matchRoadSegment(brossardOn28, pressFacts.map(f => ({ ...f, statement: f.statement.replace("direction sud", "direction nord"), sourceExcerpt: f.sourceExcerpt.replace(/direction sud/g, "direction nord") }))).reason, /route in the cited direction/);
});

test("a saved work-site map survives the nightly row rotation but not a changed detour, wording or geometry", () => {
  const segment = matchRoadSegment(brossardOn28, pressFacts).segment!;
  assert.ok(sameRoadSegment(segment, { ...segment, id: "172651", start: "2026/09/29 23:00:00", end: "2026/09/30 05:00:00", updated: "2026/09/29 12:00:00" }));
  assert.equal(sameRoadSegment(segment, { ...segment, detour: "Sortie 67" }), false);
  assert.equal(sameRoadSegment(segment, { ...segment, entrave: "Fermeture de 1 voie sur 3" }), false);
  assert.equal(sameRoadSegment(segment, { ...segment, coordinates: segment.coordinates.slice(1) }), false);
  const legacy = selectRoadSegment(data, [fact])!;
  assert.equal(sameRoadSegment(legacy, { ...legacy, id: "1" }), false);
  assert.equal(sameRoadSegment(undefined, legacy), false);
});

test("only official MTMD sources are checked against the WFS", () => {
  for (const url of ["https://www.quebec.ca/nouvelles/actualites/details/fermetures-72523", "https://www.511.gouv.qc.ca/fr/Diffusion/EtatReseau/DetailsChantier.aspx?idChantier=1", "https://www.quebec511.info/"]) assert.ok(isOfficialRoadNoticeSource(new URL(url)), url);
  for (const url of ["https://www.newswire.ca/fr/releases/archive/September2026/22/c1541.html", "https://quebec.ca.example.org/", "https://example.org/quebec.ca"]) assert.equal(isOfficialRoadNoticeSource(new URL(url)), false, url);
});
