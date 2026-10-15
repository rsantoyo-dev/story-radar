import type { Draft2Skill } from "./draft2-skills";

/**
 * The reader skill: words this audience knows, said to it one way. Every role
 * that writes or judges reader-facing words reads it beside its own rubric.
 * Version 1, 2026-10-15, after an auditor read a Salut Brossard post that
 * mixed "vous" and "tu" on its last slide and named the Longueuil police
 * only as "SPAL", which few readers know.
 */
export const READER_SKILL: Draft2Skill = {
  name: "reader",
  version: "1",
  text: `# Words this reader knows

- One form of address in the whole post, the one the publication sets (the
  brief says which): on every slide, in the call to action and in the
  caption, never both ("Pour vos sorties, retenez…" above "Suis Salut
  Brossard…" mixes them). The program refuses the other form.
- Name a person's role, an organization or an institution the way this
  audience knows it ("la police de Longueuil", not "le SPAL"). An acronym
  appears only after its full name, once in the post ("le Service de police
  de l'agglomération de Longueuil (SPAL)"), and only when repeating it is
  shorter; a name the facts give only as an acronym is written out when the
  facts also give its full name.
- Plain words over jargon: a legal or administrative term the reader would
  not use is said the way the reader would, as long as it means the same
  thing.`,
};
