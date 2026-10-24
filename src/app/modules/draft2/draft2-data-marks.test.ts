import assert from "node:assert/strict";
import test from "node:test";
import { dayDatesIn, dayPeriodIn, daysOutsidePeriod, endDatesIn, markData, nameCollisionsIn, namesDeadline, storyDeadline, storyPlaces } from "./draft2-data-marks";

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

test("the days a text names, in the three languages, and the period a cover announces; a year is never a day", () => {
  const days = (text: string) => dayDatesIn(text).map((date) => `${date.day}/${date.month}`);
  assert.deepEqual(days("Saint-Jean et environs, du 23 au 25 octobre 2026"), ["23/10", "24/10", "25/10"]);
  assert.deepEqual(days("Une série de visites: les 17, 24 et 31 octobre."), ["17/10", "24/10", "31/10"]);
  assert.deepEqual(days("Samedi 24 octobre · soirée · 15 h 20"), ["24/10"]);
  assert.deepEqual(days("Open Saturday, October 24, 2026 and October 31"), ["24/10", "31/10"]);
  assert.deepEqual(days("el sábado 24 de octubre de 2026 y el 1 de noviembre"), ["24/10", "1/11"]);
  assert.deepEqual(days("octobre 2026"), [], "a month without a day");
  assert.deepEqual(dayPeriodIn("Saint-Jean et environs, du 23 au 25 octobre 2026"), { month: 10, from: 23, to: 25 });
  assert.equal(dayPeriodIn("les 17, 24 et 31 octobre"), undefined, "two weeks are no period a check rests on");
  assert.equal(dayPeriodIn("Le 30 octobre et le 2 novembre"), undefined, "two months are no period");
  assert.deepEqual(daysOutsidePeriod("Une série de visites: les 17, 24 et 31 octobre.", { month: 10, from: 23, to: 25 }).map((date) => date.day), [17, 31]);
  assert.deepEqual(daysOutsidePeriod("Les 24 et 25 octobre, sans réservation", { month: 10, from: 23, to: 25 }), []);
});

test("the end of a story's event, from the facts, in the three languages; the days left from the publication's day; whether a cover names it (2026-10-24, ART[O])", () => {
  assert.deepEqual(endDatesIn("Deux expositions gratuites à découvrir jusqu'au 25 octobre."), [{ day: 25, month: 10 }]);
  assert.deepEqual(endDatesIn("Du 23 au 25 octobre, la Ferme Reid."), [{ day: 25, month: 10 }]);
  assert.deepEqual(endDatesIn("The show runs through October 25; tickets until October 24."), [{ day: 25, month: 10 }, { day: 24, month: 10 }]);
  assert.deepEqual(endDatesIn("October 23–25 at the fairgrounds."), [{ day: 25, month: 10 }]);
  assert.deepEqual(endDatesIn("La muestra sigue hasta el 25 de octubre, del 23 al 25 de octubre en la plaza."), [{ day: 25, month: 10 }, { day: 25, month: 10 }]);
  assert.deepEqual(endDatesIn("Le 25 octobre, l'atelier ouvre à 10 h."), [], "a date is not an end");
  const facts = [{ claim: "Les deux expositions sont présentées jusqu'au 25 octobre." }, { claim: "Le vernissage a eu lieu le 2 octobre." }];
  assert.deepEqual(storyDeadline(facts, "2026-10-23"), { date: "2026-10-25", day: 25, month: 10, daysLeft: 2 });
  assert.equal(storyDeadline(facts, "2026-10-27")?.daysLeft, -2, "past, negative");
  assert.equal(storyDeadline(facts, "2027-01-10")?.date, "2026-10-25", "the year that keeps the date nearest");
  assert.equal(storyDeadline([{ claim: "Rien." }], "2026-10-23"), undefined);
  const end = { day: 25 };
  assert.equal(namesDeadline("Dernier week-end pour voir Les Veilleurs", end), true);
  assert.equal(namesDeadline("Jusqu'au 25 octobre, gratuit", end), true);
  assert.equal(namesDeadline("Two free shows until Sunday", end), true);
  assert.equal(namesDeadline("430 kg de rebuts ont pris visage", end), false);
  assert.equal(namesDeadline("250 visiteurs attendus", end), false, "25 inside 250 is not the day");
  const entities = [{ name: "Symbiose", kind: "thing" as const }, { name: "Symbiose Haut-Richelieu", kind: "organization" as const }, { name: "ART[O]", kind: "organization" as const }];
  assert.deepEqual(nameCollisionsIn("Les Veilleurs et Symbiose, via Symbiose Haut-Richelieu.", entities).map(({ short, long }) => [short.name, long.name]), [["Symbiose", "Symbiose Haut-Richelieu"]]);
  assert.deepEqual(nameCollisionsIn("Symbiose revient dans la Petite Galerie.", entities), [], "one of them alone is clear");
  assert.deepEqual(nameCollisionsIn("Une initiative de Symbiose Haut-Richelieu.", entities), [], "the long name alone contains the short one once: no collision");
});
