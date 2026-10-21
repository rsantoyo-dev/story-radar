import assert from "node:assert/strict";
import test from "node:test";

import { abbreviationBreaches, abbreviationFinding, explainedAbbreviations, spelledOutAbbreviations } from "./draft2-abbreviations.types";

const fact = (claim: string, evidence = "") => ({ claim, evidence });

test("the abbreviations the facts spell out, with the names they abbreviate, in either order and any language", () => {
  const explained = explainedAbbreviations([
    fact("Lachrymatory factor (LF) is formed when an onion is cut.", "LF is actually formed when the onion is cut."),
    fact("In onions, the enzyme LFS rearranges a thiosulfinate into LF.", "Another enzyme known as lachrymatory factory synthase (LFS), rearranges one of these thiosulfinates into LF."),
    fact("Le Service de police de l'agglomération de Longueuil (SPAL) enquête.", ""),
    fact("La RACJ (Régie des alcools, des courses et des jeux) a suspendu le permis.", ""),
    fact("La Bibliothèque du Vieux-Longueuil (BVL) rouvre samedi.", ""),
  ]);
  assert.deepEqual([...explained], [
    ["LF", "Lachrymatory factor"],
    ["LFS", "lachrymatory factory synthase"],
    ["SPAL", "Service de police de l'agglomération de Longueuil"],
    ["RACJ", "Régie des alcools, des courses et des jeux"],
    ["BVL", "Bibliothèque du Vieux-Longueuil"],
  ]);
});

test("a single letter, a formula, a Roman numeral, a lowercase aside or an everyday abbreviation is not one the facts explain", () => {
  const explained = explainedAbbreviations([
    fact("LF is (Z)-propanthial S-oxide.", "Acids form protons (H+), which are positively-charged hydrogen atoms."),
    fact("World War (II) ended in 1945.", "A DOD official says awards took less than a week (in several instances)."),
    fact("Quatre disc-jockeys (DJ) se relaient.", "l'acide désoxyribonucléique (ADN)"),
  ]);
  assert.deepEqual([...explained.keys()], []);
});

test("a reader-facing text breaches an explained abbreviation it uses, plural included, never inside a quotation or another word", () => {
  const explained = explainedAbbreviations([fact("Lachrymatory factor (LF) is volatile.", "an enzyme known as lachrymatory factory synthase (LFS)")]);
  assert.deepEqual(abbreviationBreaches("El LF, lo que irrita, no parece aumentar con la edad.", explained), ["LF"]);
  assert.deepEqual(abbreviationBreaches("La enzima LFS convierte uno en LF, que sale al aire.", explained), ["LF", "LFS"]);
  assert.deepEqual(abbreviationBreaches("Los LFs vuelan.", explained), ["LF"]);
  assert.deepEqual(abbreviationBreaches("Un compuesto que te hace llorar sale al aire: el factor lacrimógeno.", explained), []);
  assert.deepEqual(abbreviationBreaches("La autora dice: «el LF pica». SELF y LFX no cuentan.", explained), []);
});

test("an abbreviation the post spells out itself, in its own language and its letters those of the name, may return; initials from another language never", () => {
  const explained = explainedAbbreviations([
    fact("La RACJ (Régie des alcools, des courses et des jeux) a suspendu le permis.", ""),
    fact("Lachrymatory factor (LF) is volatile.", ""),
  ]);
  assert.deepEqual([...spelledOutAbbreviations("La Régie des alcools, des courses et des jeux (RACJ) suspend le permis.")], ["RACJ"]);
  assert.deepEqual([...spelledOutAbbreviations("RACJ (Régie des alcools, des courses et des jeux)")], ["RACJ"]);
  assert.deepEqual([...spelledOutAbbreviations("El factor lacrimógeno (LF) sale al aire.")], [], "f, l does not spell LF");
  assert.deepEqual(abbreviationBreaches("La Régie des alcools, des courses et des jeux (RACJ) suspend le permis. La RACJ précise…", explained), []);
  assert.deepEqual(abbreviationBreaches("La RACJ précise la durée.", explained, "La Régie des alcools, des courses et des jeux (RACJ) suspend le permis."), [], "spelled out on a slide the reader saw before");
  assert.deepEqual(abbreviationBreaches("La RACJ précise la durée.", explained), ["RACJ"]);
  assert.deepEqual(abbreviationBreaches("El factor lacrimógeno (LF) sale al aire; el LF pica.", explained), ["LF"]);
});

test("the finding names each abbreviation with what it abbreviates and asks for the thing's name or what it does", () => {
  const explained = new Map([["LF", "Lachrymatory factor"], ["SPAL", undefined]]);
  assert.equal(abbreviationFinding(["LF"], explained), "\"LF\" (Lachrymatory factor) is an abbreviation the source had to explain: this reader does not know it. Name the thing in the publication's language, or say what it does. Only if the reader needs the abbreviation itself, spell it out once in a text, never a headline, where it first appears or before (\"Name (LF)\"): the name the source gives with it, or one in the publication's language whose initials are its letters; never initials from another language.");
  assert.match(abbreviationFinding(["LF", "SPAL"], explained), /^"LF" \(Lachrymatory factor\), "SPAL" are abbreviations .* does not know them\./u);
});

test("a compound in brackets explains each of its abbreviations; one whose letters are an older name's keeps the name the source writes", () => {
  // Salut Brossard, 2026-10-20: AREQ's letters are those of the association's older name, CSQ's those of today's.
  const explained = explainedAbbreviations([
    fact("L’Association des personnes retraitées de la Centrale des syndicats du Québec (AREQ-CSQ) va présenter son jeu au Randolph de Brossard."),
    fact("Selon le communiqué, le ministère de l'Éducation (MEQ) appuie la tournée.", "Les sociétés RTL/STM (réseaux de transport de Longueuil et de Montréal) ajoutent des départs."),
  ]);
  assert.deepEqual([...explained], [
    ["AREQ", "L’Association des personnes retraitées de la Centrale des syndicats du Québec"],
    ["CSQ", "Centrale des syndicats du Québec"],
    ["MEQ", "ministère de l'Éducation"],
    ["RTL", "réseaux de transport de Longueuil et de Montréal"],
    ["STM", "réseaux de transport de Longueuil et de Montréal"],
  ]);
});

test("a text that writes the name the source gives spells the abbreviation out, its capitals and elision aside; part of the name does not", () => {
  const explained = explainedAbbreviations([fact("L’Association des personnes retraitées de la Centrale des syndicats du Québec (AREQ-CSQ) va présenter son jeu.")]);
  const spelled = "L'Association des personnes retraitées de la Centrale des syndicats du Québec (AREQ-CSQ) rappelle que la retraite peut ouvrir la porte aux rencontres.";
  assert.deepEqual([...spelledOutAbbreviations(spelled, explained)], ["AREQ", "CSQ"]);
  assert.deepEqual(abbreviationBreaches(`${spelled} L'AREQ vise tous les âges.`, explained), []);
  assert.deepEqual(abbreviationBreaches("Pour l'AREQ, cette tournée présente la retraite comme une nouvelle étape.", explained, spelled), [], "spelled out on a slide the reader saw before");
  assert.deepEqual(abbreviationBreaches("L'AREQ répond avec Par ici la retraite!", explained), ["AREQ"], "the cover's \"L'AREQ\", never explained");
  assert.deepEqual(abbreviationBreaches("L'AREQ-CSQ répond.", explained), ["AREQ", "CSQ"]);
  assert.deepEqual([...spelledOutAbbreviations("la Centrale des syndicats du Québec (AREQ-CSQ)", explained)], ["CSQ"], "the union's name is not the association's");
  assert.deepEqual([...spelledOutAbbreviations("AREQ-CSQ (l'association des personnes retraitées de la Centrale des syndicats du Québec)", explained)], ["AREQ", "CSQ"]);
  assert.deepEqual([...spelledOutAbbreviations("l'Association des personnes retraitées de la Centrale des syndicats du Québec (AREQ-CSQ)")], ["CSQ"], "without the source's name, only initials that carry the letters count");
});
