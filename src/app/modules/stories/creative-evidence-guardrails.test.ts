import assert from "node:assert/strict";
import test from "node:test";
import { evidenceQualityIssues, locationOnlyRoadFacts, requestsGeographicReconstruction } from "./creative-evidence-guardrails";
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
