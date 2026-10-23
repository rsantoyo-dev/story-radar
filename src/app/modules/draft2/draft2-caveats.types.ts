/**
 * Caveats are not content (2026-10-22). An auditor read the Salut Saint-Jean
 * weekend carousel: the cover told the reader to "vérifie billets ou météo",
 * one item's body was only "la roue de prix exige un achat", and the last
 * slide was "Ta liste de vérifs avant de partir". The Focus's guards had been
 * discharged with warnings on every slide, and a list of outings read as a
 * list of chores. A condition belongs in its item's practical line, or in the
 * caption, once; the cover sells the experience and the closing ends on it.
 * Everything here is pure, in the publications' three languages.
 */

/** An imperative that gives the reader a check to do. */
const CHORE = /(?<![\p{L}])(vérifiez?|vérifie[sz]?|confirmez?|confirme[sz]?|renseigne[sz]?-(?:toi|vous)|informe[sz]?-(?:toi|vous)|double-?check|check|verify|confirm|verifica|confirma|consulta|revisa|comprueba)(?![\p{L}])/iu;

/** A condition the reader must satisfy or watch: a check, a reservation, the weather, a purchase, a change. */
const CAVEAT = new RegExp([
  CHORE.source,
  "à confirmer", "sous réserve", "selon la météo", "la météo (?:décide|conditionne|le permet)", "dépend(?:ent)? (?:de la|des) (?:météo|conditions)", "conditions? météo",
  "exige un achat", "condition d['’]achat", "billetterie", "avant de réserver", "avant de partir", "avant de (?:te|vous) déplacer", "peu(?:ven)?t évoluer", "peu(?:ven)?t changer",
  "subject to", "weather permitting", "depends? on the weather", "requires? a purchase", "with purchase", "before you go", "may change", "box office", "check with",
  "sujet[oa]s? a", "según el clima", "depende del clima", "si el clima lo permite", "requiere (?:una )?compra", "con compra", "antes de ir", "antes de salir", "pueden? cambiar", "taquilla",
].map((part) => `(?:${part})`).join("|"), "giu");

/** A closing that is a list of checks. */
const CHECKLIST = /(?<![\p{L}])(vérifs?|vérifications?|checklist|check-?list|liste de (?:vérifs?|vérifications?|contrôles?)|verificaci[oó]n(?:es)?|lista de (?:verificaci[oó]n|comprobaci[oó]n)|to-?do)(?![\p{L}])/iu;

/** The chore a headline gives the reader, as written, or undefined. */
export function choreIn(text: string): string | undefined {
  return CHORE.exec(text)?.[1];
}

/** Every caveat phrase a text carries, as written. */
export function caveatsIn(text: string): string[] {
  return [...text.matchAll(CAVEAT)].map((match) => match[0]);
}

/** The first sentence of a text: up to its first period, colon, semicolon, question or exclamation mark. */
export const firstSentence = (text: string): string => text.split(/(?<=[.!?;:])\s+|\n+/u)[0] ?? "";

/** Whether a text opens with a condition instead of what the reader does or sees. */
export function opensWithCaveat(text: string): string | undefined {
  return caveatsIn(firstSentence(text))[0];
}

/** The first condition a short text carries: a list item's one sentence has no room for one. */
export function caveatIn(text: string): string | undefined {
  return caveatsIn(text)[0];
}

/** The sentences of a text, each with the first condition it carries. */
const caveatSentences = (text: string): string[] => text.split(/(?<=[.!?;])\s+|\n+/u).map((sentence) => caveatsIn(sentence)[0]).filter((caveat): caveat is string => Boolean(caveat));

/** Whether a closing reads as a checklist: its headline names one, or two of its sentences or more carry a condition. */
export function isChecklist(headline: string, body: string): string | undefined {
  const named = CHECKLIST.exec(headline)?.[1];
  if (named) return named;
  const caveats = caveatSentences(body);
  return caveats.length >= 2 ? caveats.slice(0, 2).join('", "') : undefined;
}
