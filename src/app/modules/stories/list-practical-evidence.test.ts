import assert from "node:assert/strict";
import test from "node:test";

import type { GeneratedCreativeBrief } from "./creative-content.types";
import { attachListPracticalFacts, practicalBlocks } from "./list-practical-evidence";

// The October 2026 Saint-Jean weekend list: each item names itself in one
// sentence and gives its practical details in a labelled block below.
const SOURCE = `5 idées de sorties à Saint-Jean-sur-Richelieu pour la fin de semaine du 10 et 11 octobre 2026

LA MÉTÉO : UN SAMEDI FRAIS, UN DIMANCHE PLUS DOUX

Samedi 10 octobre : alternance de soleil et de nuages, avec un maximum de 14 °C.

1. VOIR LA NATURE EN GRAND

Dimanche matin, le Domaine Trinity accueille « Vibrations microscopiques », une expérience qui transforme des fragments naturels en images projetées.

L’artiste Danyel Murphy explore des textures invisibles à l’œil nu.

Date : dimanche 11 octobre 2026.
Heure : de 10 h 30 à 11 h 30.
Lieu : Centre d’art du Domaine Trinity, 360, rue McGinnis, secteur Iberville.
Coût : gratuit.

2. UNE PISTE DE DANSE POUR LES PETITES BÊTES DE FÊTE

Dimanche après-midi, Les Incomplètes invitent les familles à « Bêtes de fête », au Cabaret-Théâtre du Vieux-Saint-Jean.

Le public cible annoncé est celui des enfants de 4 à 7 ans.

Date : dimanche 11 octobre 2026.
Heure : 16 h.
Lieu : Cabaret-Théâtre du Vieux-Saint-Jean, 190, rue Laurier.
Tarif régulier annoncé : 22 $ CA.

3. DERNIÈRE FIN DE SEMAINE POUR LE GRAND FEU DE 1876

L’exposition « Le Grand Feu de 1876 » se termine le dimanche 11 octobre au Musée du Haut-Richelieu.

Dates proposées : samedi 10 ou dimanche 11 octobre 2026.
Horaire : de 11 h à 17 h.
Tarif : consulter le musée; la gratuité n’est pas confirmée.

LE CONSEIL DE JO

Samedi, choisis une visite au musée.`;

const fact = (id: string, excerpt: string) => ({ id, statement: excerpt, sourceExcerpt: excerpt });

function listBrief(): GeneratedCreativeBrief {
  return {
    recommendedFormat: "carousel", fallbackFormat: "meme", formatScores: [], confidence: 80,
    targetAudience: "Résidents", keyMessage: "", angle: "", hook: "",
    tone: { primary: "informative", energy: 60, humor: 10, reason: "" },
    contentSufficiency: "sufficient", riskFlags: [], suggestedConcepts: [],
    keyFacts: [
      fact("fact-1", "5 idées de sorties à Saint-Jean-sur-Richelieu pour la fin de semaine du 10 et 11 octobre 2026"),
      fact("fact-2", "Dimanche matin, le Domaine Trinity accueille « Vibrations microscopiques », une expérience qui transforme des fragments naturels en images projetées."),
      fact("fact-3", "Dimanche après-midi, Les Incomplètes invitent les familles à « Bêtes de fête », au Cabaret-Théâtre du Vieux-Saint-Jean."),
      fact("fact-4", "L’exposition « Le Grand Feu de 1876 » se termine le dimanche 11 octobre au Musée du Haut-Richelieu."),
    ],
    carouselPlan: {
      slideCount: 5, rationale: "", structure: "list",
      slides: [
        { editorialGoal: "hook", viewerQuestion: "Quoi faire?", allowedFactIds: ["fact-1", "fact-4"] },
        { editorialGoal: "opportunity", viewerQuestion: "Quoi à Trinity?", allowedFactIds: ["fact-2"] },
        { editorialGoal: "explain", viewerQuestion: "Quoi au Cabaret?", allowedFactIds: ["fact-3"] },
        { editorialGoal: "explain", viewerQuestion: "Quoi au musée?", allowedFactIds: ["fact-4"] },
        { editorialGoal: "conclude", viewerQuestion: "Comment choisir?", allowedFactIds: ["fact-2", "fact-3"] },
      ],
    },
  } as GeneratedCreativeBrief;
}

test("labelled practical blocks are found; labelled lines without practical details are not", () => {
  const blocks = practicalBlocks(SOURCE).map((block) => SOURCE.slice(block.start, block.end));
  assert.equal(blocks.length, 3);
  assert.match(blocks[0]!, /^Date : dimanche 11 octobre 2026\.\nHeure : de 10 h 30 à 11 h 30\.[\s\S]*Coût : gratuit\.$/u);
  assert.match(blocks[1]!, /Tarif régulier annoncé : 22 \$ CA\.$/u);
  assert.match(blocks[2]!, /^Dates proposées :[\s\S]*Horaire : de 11 h à 17 h\./u);
  // The weather line is labelled with a date, not a practical label, and a heading is not a block.
  assert.ok(blocks.every((block) => !block.includes("LA MÉTÉO") && !block.includes("alternance")));
});

test("each item slide gets its own block as a verbatim fact, and the closing lays out the plan", () => {
  const brief = attachListPracticalFacts(listBrief(), SOURCE, 24);
  const facts = new Map(brief.keyFacts.map((entry) => [entry.id, entry]));
  const slides = brief.carouselPlan!.slides;
  assert.deepEqual(slides[1]!.allowedFactIds, ["fact-2", "fact-5"]);
  assert.match(facts.get("fact-5")!.statement, /Heure : de 10 h 30 à 11 h 30\. .*Coût : gratuit\./u);
  assert.ok(SOURCE.includes(facts.get("fact-5")!.sourceExcerpt!), "the excerpt is copied verbatim");
  assert.deepEqual(slides[2]!.allowedFactIds, ["fact-3", "fact-6"]);
  assert.match(facts.get("fact-6")!.statement, /Heure : 16 h\..*22 \$ CA/u);
  assert.deepEqual(slides[3]!.allowedFactIds, ["fact-4", "fact-7"]);
  assert.match(facts.get("fact-7")!.statement, /de 11 h à 17 h/u);
  // The closing gets every item's block, ahead of its earlier facts.
  assert.deepEqual(slides[4]!.allowedFactIds, ["fact-5", "fact-6", "fact-7", "fact-2", "fact-3"]);
  // Numbers in the block are allowed on the slides that cite it.
  assert.ok(facts.get("fact-6")!.claimGuard!.allowedNumbers.includes("22"));
});

test("attaching twice adds nothing: blocks already extracted are reused", () => {
  const once = attachListPracticalFacts(listBrief(), SOURCE, 24);
  const twice = attachListPracticalFacts(once, SOURCE, 24);
  assert.deepEqual(twice, once);
  // A plan revised without the blocks gets the same facts back, no new ones.
  const revised = { ...once, carouselPlan: { ...once.carouselPlan!, slides: listBrief().carouselPlan!.slides } };
  const reseated = attachListPracticalFacts(revised, SOURCE, 24);
  assert.equal(reseated.keyFacts.length, once.keyFacts.length);
  assert.deepEqual(reseated.carouselPlan!.slides[2]!.allowedFactIds, ["fact-3", "fact-6"]);
});

test("a forecast stated before the list does not pull its item's slide back to the top", () => {
  // The October 2026 dry run: the outdoor item also cited the weekend forecast,
  // and its block was missed, so the closing's plan lacked that item.
  const brief = listBrief();
  brief.keyFacts.push(fact("fact-5", "Samedi 10 octobre : alternance de soleil et de nuages, avec un maximum de 14 °C."));
  brief.carouselPlan!.slides[3]!.allowedFactIds = ["fact-5", "fact-4"];
  const attached = attachListPracticalFacts(brief, SOURCE, 24);
  const museum = attached.carouselPlan!.slides[3]!;
  const block = attached.keyFacts.find((entry) => /de 11 h à 17 h/u.test(entry.statement))!;
  assert.ok(museum.allowedFactIds.includes(block.id));
  assert.ok(attached.carouselPlan!.slides[4]!.allowedFactIds.includes(block.id), "the closing's plan includes it");
});

test("a full explain slide becomes an opportunity to seat its block", () => {
  const brief = listBrief();
  brief.keyFacts.push(fact("fact-5", "Le public cible annoncé est celui des enfants de 4 à 7 ans."));
  brief.carouselPlan!.slides[2]!.allowedFactIds = ["fact-3", "fact-5"];
  const attached = attachListPracticalFacts(brief, SOURCE, 24);
  const slide = attached.carouselPlan!.slides[2]!;
  assert.equal(slide.editorialGoal, "opportunity");
  assert.equal(slide.allowedFactIds.length, 3);
});

test("blocks that may precede their items, arcs and briefs without blocks are left unchanged", () => {
  // A practical block before the first item: blocks may sit above their items.
  const before = `Date : samedi 10 octobre.\nLieu : parc.\n\n${SOURCE}`;
  assert.deepEqual(attachListPracticalFacts(listBrief(), before, 24), listBrief());
  const arc = listBrief();
  arc.carouselPlan!.structure = "arc";
  assert.deepEqual(attachListPracticalFacts(arc, SOURCE, 24), arc);
  const plain = SOURCE.replace(/^(?:Date|Heure|Lieu|Coût|Tarif|Dates|Horaire)[^\n]*\n?/gmu, "");
  assert.deepEqual(attachListPracticalFacts(listBrief(), plain, 24), listBrief());
  // No room for more facts: nothing is invented to fit.
  assert.equal(attachListPracticalFacts(listBrief(), SOURCE, 4).keyFacts.length, 4);
});
