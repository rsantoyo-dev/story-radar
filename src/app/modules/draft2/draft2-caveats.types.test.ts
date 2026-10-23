import assert from "node:assert/strict";
import test from "node:test";
import { caveatIn, caveatsIn, choreIn, isChecklist, opensWithCaveat } from "./draft2-caveats.types";

test("a chore on the cover, a condition in a sentence, a closing that is a checklist: the Saint-Jean weekend carousel's words, in three languages", () => {
  assert.equal(choreIn("Cinq sorties d'Halloween: vérifie billets ou météo"), "vérifie");
  assert.equal(choreIn("Check the weather before you go"), "Check");
  assert.equal(choreIn("Verifica horarios antes de salir"), "Verifica");
  assert.equal(choreIn("5 idées pour sortir ce week-end"), undefined);
  assert.equal(choreIn("La vérification du pont dure trois jours"), undefined, "a noun is not an imperative");
  assert.equal(caveatIn("Viens costumé; la roue de prix, elle, exige un achat."), "exige un achat");
  assert.equal(caveatIn("Autocueillette, labyrinthe, fermette: la météo conditionne activités et accès aux champs."), "la météo conditionne");
  assert.equal(caveatIn("Fabrique ton chapeau, puis pars à la chasse aux bonbons!"), undefined);
  assert.equal(opensWithCaveat("Vérifie l'heure à la billetterie. Puis viens."), "Vérifie");
  assert.equal(opensWithCaveat("Viens costumé; la roue de prix exige un achat."), undefined, "the activity comes first");
  assert.deepEqual(caveatsIn("Musée: billetterie pour l'heure. Partout: horaires et disponibilités peuvent évoluer."), ["billetterie", "peuvent évoluer"]);
  assert.equal(isChecklist("Ta liste de vérifs avant de partir", "Musée: billetterie pour l'heure."), "liste de vérifs");
  assert.equal(isChecklist("Avant de partir", "Musée: billetterie pour l'heure. Ferme Reid: la météo décide."), 'billetterie", "la météo décide');
  assert.equal(isChecklist("Une nouvelle étape, pas un point final", "Pour l'AREQ, cette tournée présente la retraite comme une nouvelle étape."), undefined);
  assert.equal(isChecklist("Étoiles, légendes ou citrouilles?", "Tu choisis quoi ce week-end? Vérifie la météo avant."), undefined, "one condition does not make a checklist");
});
