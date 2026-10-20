import assert from "node:assert/strict";
import test from "node:test";
import { markData, storyPlaces } from "./draft2-data-marks";

test("the data marked in a slide's text: days, dates, times, prices, free, figures and the story's places, the words kept", () => {
  assert.equal(markData("Le 21 octobre 2026, le secteur C du Grand parc urbain accueille la plantation de 15 h à 18 h.", ["Grand parc urbain"]),
    "Le **21 octobre 2026**, le secteur C du **Grand parc urbain** accueille la plantation de **15 h à 18 h**.");
  assert.equal(markData("L'avis entre en vigueur le vendredi 16 octobre 2026 à 6 h: pense à ton trajet."),
    "L'avis entre en vigueur le **vendredi 16 octobre 2026** à **6 h**: pense à ton trajet.");
  assert.equal(markData("Du 16 au 18 octobre: choisis selon l'heure et le ciel"), "Du **16 au 18 octobre**: choisis selon l'heure et le ciel");
  assert.equal(markData("Samedi 18 h 30 · Grande marche · gratuite; 20 h · dès 42,75 $."), "**Samedi** **18 h 30** · Grande marche · **gratuite**; **20 h** · dès **42,75 $**.");
  assert.equal(markData("Open Saturday, October 21, 2026, 9:30 a.m. to 4 p.m., $12 for ages 6 to 12 years."),
    "Open **Saturday, October 21, 2026**, **9:30 a.m. to 4 p.m.**, **$12** for ages **6 to 12 years**.");
  assert.equal(markData("En Bogotá el agua hierve a unos 91 °C, el 40 % de la gente no lo sabe; el sábado 21 de octubre de 2026."),
    "En Bogotá el agua hierve a unos **91 °C**, el **40 %** de la gente no lo sabe; el **sábado 21 de octubre de 2026**.");
  assert.equal(markData("Au parc, rue de l’Éclipse.", ["rue de l'Éclipse"]), "Au parc, **rue de l’Éclipse**.");
});

test("nothing marked that is no data: a modal may, a word that starts like a unit, a plain number, figures spelled out, words already marked; a duration is a figure", () => {
  assert.equal(markData("You may come with 3 amis for 4 heures in phase 2."), "You may come with 3 amis for **4 heures** in phase 2.");
  assert.equal(markData("Déjà **marqué** le 21 octobre."), "Déjà **marqué** le 21 octobre.");
  assert.equal(markData("Une sphère de neuf mètres."), "Une sphère de neuf mètres.");
});

test("the story's places: People and places' places, without the brand's own city", () => {
  const entities = [{ name: "Brossard", kind: "place" as const }, { name: "Grand parc urbain", kind: "place" as const }, { name: "Ville de Brossard", kind: "organization" as const }, { name: "Grand parc urbain", kind: "place" as const }];
  assert.deepEqual(storyPlaces(entities, "Brossard, Quebec"), ["Grand parc urbain"]);
});
