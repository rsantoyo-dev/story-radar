import assert from "node:assert/strict";
import test from "node:test";
import { evidenceQualityIssues, onlyTruncatedCreativeFacts, locationOnlyRoadFacts, requestsGeographicReconstruction, requiresVerifiedGeography } from "./creative-evidence-guardrails";
import type { GeneratedCreativeDraft } from "./creative-content.types";
const draft: GeneratedCreativeDraft = {concept:"Repères",caption:"Les seules informations disponibles sont des repères géographiques à Saint-Sébastien et à Saint-Jean-sur-Richelieu. Sans précision sur la nature de la situation routière ou ses effets.",hashtags:[],altText:"",units:[]};
test("the reported road-marker carousel is blocked, not converted into a cautious non-news post", () => {
  assert.equal(evidenceQualityIssues(draft,[])[0]?.code,"INSUFFICIENT_EVENT_EVIDENCE");
  assert.ok(locationOnlyRoadFacts([{id:"1",statement:"Entre les kilomètres 20 et 17 à Saint-Sébastien"},{id:"2",statement:"Entre la sortie 39 et la route 104 à Saint-Jean-sur-Richelieu"}]));
});
test("a road closure with actual event evidence is not rejected as location-only", () => {
  const facts = [{id:"1",statement:"Fermeture de la route 104 à la sortie 39 le 12 septembre, de 8 h à 16 h."}];
  assert.equal(locationOnlyRoadFacts(facts),false);
  assert.deepEqual(evidenceQualityIssues({...draft,caption:facts[0].statement},facts),[]);
});
test("schematic maps and road reconstructions cannot be delegated to image generation", () => {
  for (const direction of ["Montrer une carte schématique neutre reliant la sortie 39 à la route 104", "Illustrer sobrement un segment routier entre les bornes 20 et 17", "A road map of Saint-Jean", "Mostrar la plaza pública"]) assert.ok(requestsGeographicReconstruction(direction),direction);
  assert.equal(requestsGeographicReconstruction("Présenter le titre sur un fond neutre avec une mise en page typographique"),false);
});

test("an interactive map or navigation-app mockup is not a harmless UI motif", () => {
  for (const direction of [
    "A tablet on a car dashboard displaying an interactive map with highlighted street closures and glowing route lines.",
    "Une carte interactive affichant les rues fermées et les heures prévues.",
    "A smartphone showing a map app with highlighted zones and location pins near a street.",
    "Carte interactive des fermetures de rues à Brossard.",
    "An editorial illustration of a navigation app interface with route markers.",
    "Mostrar un mapa interactivo con los cierres de calles.",
  ]) assert.ok(requestsGeographicReconstruction(direction), direction);
});

 test("map exclusions do not divert conceptual illustrations into documentary composition", () => {
 for (const direction of [
  "Deux cartes-adresses abstraites reliées par une conduite stylisée. Ambiance nocturne, sans carte géographique détaillée.",
  "Illustrer un robinet, ne pas montrer de carte géographique.",
  "Un grifo sin mapa geográfico detallado.",
  "No mostrar un mapa de la ciudad.",
  "A faucet without a road map.",
  "Utiliser des formes géométriques plutôt qu’une carte géographique détaillée ou des lieux reconnaissables.",
  "Use geometric shapes rather than a schematic map.",
  "Usar formas geométricas en lugar de un mapa geográfico.",
  "Do not draw a schematic map.",
 ]) assert.equal(requestsGeographicReconstruction(direction), false, direction);
 });
 test("excluding one map does not authorize a separate positive geographic request", () => {
 for (const direction of [
  "Sans carte géographique détaillée. Montrer une carte schématique du quartier.",
  "Without a road map, show a street view.",
  "No mostrar un mapa de la ciudad; mostrar la plaza pública.",
 ]) assert.equal(requestsGeographicReconstruction(direction), true, direction);
 });

test("a slide declared verified-map takes the documentary path even when its direction never says map", () => {
  const direction = "Le tronçon concerné en rouge sur fond neutre, avec le nom du boulevard";
  assert.equal(requestsGeographicReconstruction(direction), false);
  assert.equal(requiresVerifiedGeography({ visualDirection: direction, visualNeed: "verified-map" }), true);
  assert.equal(requiresVerifiedGeography({ visualDirection: direction, visualNeed: "generic-illustration" }), false);
  assert.equal(requiresVerifiedGeography({ visualDirection: direction }), false);
  assert.equal(requiresVerifiedGeography({ visualDirection: "Carte des fermetures à Brossard", visualNeed: "generic-illustration" }), true);
});

test("a slide declared real-photo also takes the documentary path, for a named landmark its direction never draws", () => {
  const direction = "Illustration éditoriale 2D sur papier crème, un pictogramme abstrait de pont, sans reproduire de pont identifiable";
  assert.equal(requestsGeographicReconstruction(direction), false);
  assert.equal(requiresVerifiedGeography({ visualDirection: direction, visualNeed: "real-photo" }), true);
  assert.equal(requiresVerifiedGeography({ visualDirection: direction, visualNeed: "generic-illustration" }), false);
  assert.equal(requiresVerifiedGeography({ visualDirection: direction, visualNeed: "character-reference" }), false);
  assert.equal(requiresVerifiedGeography({ visualDirection: direction, visualNeed: "typography" }), false);
});

test("truncated-only facts are rejected without confusing a complete statement with a shortened quote", () => {
  assert.equal(onlyTruncatedCreativeFacts([{id:"1", statement:"Worked in their…",sourceExcerpt:"Worked in their…"}]),true);
  assert.equal(onlyTruncatedCreativeFacts([{id:"1", statement:"Worked in their...",sourceExcerpt:"Worked in their..."}]),true);
  assert.equal(onlyTruncatedCreativeFacts([{id:"1", statement:"One in five worked in their intended occupation.",sourceExcerpt:"One in five worked…"}]),false);
  assert.equal(onlyTruncatedCreativeFacts([{id:"1", statement:"Worked in their…"},{id:"2",statement:"The survey covered recent immigrants."}]),false);
});

test("an 'abstract, unreadable' map or interface is the same fabrication risk as a literal one", () => {
  for (const direction of [
    "Photographie réaliste d’une tablette affichant une carte abstraite non lisible, posée sur le capot d’une voiture.",
    "Placer le headline dans un bloc crème à droite ... montrer une interface abstraite non lisible sur le téléphone.",
    "Deux repères violets reliés par une ligne rose sur une carte abstraite non lisible.",
    "A phone screen showing an illegible interface with abstract UI elements.",
    "An unreadable map on a dashboard tablet.",
  ]) assert.ok(requestsGeographicReconstruction(direction), direction);
  // Editorial illustrations with no device or map language stay exempt.
  assert.equal(requestsGeographicReconstruction("Une illustration éditoriale avec un livre ouvert et un stylo, palette chaude."), false);
});
