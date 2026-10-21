import type { Draft2Skill } from "./draft2-skills";

/**
 * The reader skill: words this audience knows, said to it one way. Every role
 * that writes or judges reader-facing words reads it beside its own rubric.
 * Version 1, 2026-10-15, after an auditor read a Salut Brossard post that
 * mixed "vous" and "tu" on its last slide and named the Longueuil police
 * only as "SPAL", which few readers know. Version 2, the same day, after a
 * Fogón Lab carousel on why onions make you cry kept its English source's
 * "LF" and "LFS" in Spanish, even after "El LF, lo que irrita": an
 * abbreviation the source had to explain only after the post spells it out
 * in its own language, and never another language's initials. Version 3,
 * 2026-10-20, after a Salut Brossard carousel said "L'AREQ" on every slide
 * and the editor asked for its name "in at least one place, not in a
 * title": spelled out in a text, never a headline, the cover leaning on
 * slide 2's text; the name the source gives counts even when its initials
 * are not the abbreviation's letters (AREQ's are an older name's).
 */
export const READER_SKILL: Draft2Skill = {
  name: "reader",
  version: "3",
  text: `# Words this reader knows

- One form of address in the whole post, the one the publication sets (the
  brief says which): on every slide, in the call to action and in the
  caption, never both ("Pour vos sorties, retenez…" above "Suis Salut
  Brossard…" mixes them). The program refuses the other form.
- Name a person's role, an organization or an institution the way this
  audience knows it ("la police de Longueuil", not "le SPAL").
- No abbreviation the reader would not say themselves. Name the thing in
  the publication's language ("el factor lacrimógeno", "la Régie des
  alcools") or say what it does ("el gas que te hace llorar"), then a plain
  noun when it returns ("ese gas"). An abbreviation the facts spell out
  ("Lachrymatory factor (LF)") is one the source had to explain to its own
  readers: use it only when the reader needs the abbreviation itself (to
  look it up, or because it returns often), after the post spells it out
  once in a text, never in a headline, where it first appears or before
  (the cover may lean on slide 2's text): in its own language, its letters
  those of the name ("la Régie des alcools, des courses et des jeux
  (RACJ)"), or the name the source gives with it, as the source writes it
  ("l'Association des personnes retraitées de la Centrale des syndicats du
  Québec (AREQ-CSQ)"). Never initials from another
  language: "factor lacrimógeno (LF)" does not spell LF, and "LF" means
  nothing to a reader of Spanish. The program refuses the rest.
  Abbreviations people use every day (DJ, TV, ADN) are fine.
- Plain words over jargon: a legal, administrative or scientific term the
  reader would not use is said the way the reader would, as long as it
  means the same thing.`,
};
