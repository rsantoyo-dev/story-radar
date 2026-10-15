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
  assert.equal(abbreviationFinding(["LF"], explained), "\"LF\" (Lachrymatory factor) is an abbreviation the source had to explain: this reader does not know it. Name the thing in the publication's language, or say what it does. Only if the reader needs the abbreviation itself, spell it out once before, in the publication's language, its letters those of the name (\"Name (LF)\"); never initials from another language.");
  assert.match(abbreviationFinding(["LF", "SPAL"], explained), /^"LF" \(Lachrymatory factor\), "SPAL" are abbreviations .* does not know them\./u);
});
