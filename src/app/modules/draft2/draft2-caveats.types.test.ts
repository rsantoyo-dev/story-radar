import assert from "node:assert/strict";
import test from "node:test";
import { caveatIn, caveatsIn, choreIn, isChecklist, opensWithCaveat, withoutPlanningLabels } from "./draft2-caveats.types";

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

test("the spine's planning label never reaches a slide: the data stays, a sentence it opened starts with a capital (2026-10-23, the Saint-Jean weekend)", () => {
  assert.equal(withoutPlanningLabels("Ligne pratique : samedi 24 octobre en soirée; billetterie confirme heure, tarif, lieu."), "Samedi 24 octobre en soirée; billetterie confirme heure, tarif, lieu.");
  assert.equal(withoutPlanningLabels("Au Domaine Trinity, cinq courts métrages sous un dôme. Ligne pratique : 24 et 25 octobre, 10 h à 16 h, gratuit."), "Au Domaine Trinity, cinq courts métrages sous un dôme. 24 et 25 octobre, 10 h à 16 h, gratuit.");
  assert.equal(withoutPlanningLabels("Un parcours hanté, ligne pratique : billets en ligne."), "Un parcours hanté, billets en ligne.", "inside a sentence, no capital");
  assert.equal(withoutPlanningLabels("Practical line: Saturday, free."), "Saturday, free.");
  assert.equal(withoutPlanningLabels("Línea práctica: sábado, gratis."), "Sábado, gratis.");
  assert.equal(withoutPlanningLabels("Infos : billets en ligne"), "Infos : billets en ligne", "a reader's own label stays");
  assert.equal(withoutPlanningLabels("Samedi · Billets en ligne"), "Samedi · Billets en ligne");
});
