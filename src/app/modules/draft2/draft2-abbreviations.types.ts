import type { Draft2Fact } from "./draft2-facts.types";

/**
 * Abbreviations this reader does not know (2026-10-15). A Fogón Lab carousel
 * on why onions make you cry kept its English source's "LF" (lachrymatory
 * factor) and "LFS" (the enzyme that makes it): initials a Spanish reader
 * cannot unpack, even after "El LF, lo que irrita". A Salut Brossard post had
 * named the Longueuil police only "SPAL". An abbreviation the facts spell out
 * is one the source had to explain to its own readers: the post names the
 * thing instead, or spells the abbreviation out itself before using it, in
 * its own language, the abbreviation's letters those of the name ("la Régie
 * des alcools, des courses et des jeux (RACJ)"); "factor lacrimógeno (LF)"
 * does not spell LF. Abbreviations people use every day are always fine.
 * Words in quotation marks are someone else's and never count. Everything
 * here is pure.
 *
 * 2026-10-20: a Salut Brossard carousel said "L'AREQ" on the cover and four
 * slides, unexplained, though its facts wrote "L'Association des personnes
 * retraitées de la Centrale des syndicats du Québec (AREQ-CSQ)": a compound
 * in brackets was never read, so AREQ was never one the source explained.
 * Each part of a compound is now one ("AREQ", "CSQ"). AREQ's letters are
 * those of the association's older name, so no initials of today's name
 * carry them: the name the source writes before the brackets is kept, and a
 * text that writes that same name before the abbreviation spells it out.
 */

const EDGE = "(?<![\\p{L}\\p{N}])";
const END = "(?![\\p{L}\\p{N}])";
const TOKEN = "\\p{Lu}[\\p{Lu}\\p{N}]{1,9}";
/** One abbreviation or a compound of them: "LF", "AREQ-CSQ", "RTL/STM". */
const COMPOUND = `${TOKEN}(?:[-‑/]${TOKEN})*`;
/** "Lachrymatory factor (LF)": the name, then its abbreviation in brackets. */
const NAME_THEN_ABBREVIATION = new RegExp(`\\((${COMPOUND})\\)`, "gu");
/** "LFS (lachrymatory factor synthase)": the abbreviation, then its name in brackets. */
const ABBREVIATION_THEN_NAME = new RegExp(`${EDGE}(${COMPOUND})\\s*\\(([^()]*\\p{Ll}[^()]*)\\)`, "gu");
/** The abbreviations of a compound: "AREQ-CSQ" is AREQ and CSQ. */
const partsOf = (compound: string) => compound.split(/[-‑/]/u);
const QUOTED = /«[^»]*»|“[^”]*”|"[^"]*"/gu;
const ROMAN = /^[IVXLCDM]+$/u;
/** How far before the brackets a name is looked for, in words. */
const NAME_WORDS = 10;
/** How far before the brackets the name a source pairs with an abbreviation is looked for, in words, within its clause. */
const SOURCE_NAME_WORDS = 16;
/** Abbreviations people use every day, in the publications' languages: never refused, whatever the source explained. */
const EVERYDAY = new Set([
  "DJ", "TV", "PC", "CD", "DVD", "LED", "GPS", "USB", "PDF", "SMS", "VIP", "OK", "CEO", "CV", "BBQ", "SUV", "ATM", "PIN", "AM", "PM",
  "ADN", "DNA", "ARN", "RNA", "VIH", "HIV", "SIDA", "AIDS", "COVID", "IA", "AI",
  "ONU", "UN", "UE", "EU", "USA", "UK", "NASA", "FIFA", "NBA", "NFL", "NHL", "MLB",
]);

/** An abbreviation, by the program's measure: at least two capitals, never a Roman numeral. */
const isAbbreviation = (token: string) => (token.match(/\p{Lu}/gu)?.length ?? 0) >= 2 && !ROMAN.test(token);

/** A word past an elision ("l'agglomération" is "agglomération"). */
const elided = (word: string) => word.replace(/^\p{L}['’]/u, "");
/** A word's initial, past an elision and its accent ("l'Éducation" starts with "e"). */
const initial = (word: string) => elided(word).normalize("NFD").charAt(0).toLocaleLowerCase();
const lettersOf = (abbreviation: string) => [...abbreviation.normalize("NFD").replace(/[\p{M}\p{N}]/gu, "").toLocaleLowerCase()];

/** How many of an abbreviation's letters words carry, in order, as initials, the first word giving the first letter. */
function carried(words: readonly string[], abbreviation: string): number {
  const letters = lettersOf(abbreviation);
  if (!words.length || initial(words[0]) !== letters[0]) return 0;
  let matched = 0;
  for (const word of words) if (matched < letters.length && initial(word) === letters[matched]) matched += 1;
  return matched;
}

/** Whether words carry all of an abbreviation's letters. */
const carries = (words: readonly string[], abbreviation: string) => carried(words, abbreviation) === lettersOf(abbreviation).length;

const wordsOf = (text: string) => text.match(/[\p{L}\p{N}'’]+/gu) ?? [];
/** A name's words as a reader compares them: past elisions, in lower case ("L’Association" and "l'association" are one). */
const plainWords = (text: string) => wordsOf(text).map((word) => elided(word).toLocaleLowerCase());

/** Whether a text ends with a name, word for word, elisions and capitals aside. */
function endsWithName(text: string, name: string | undefined): boolean {
  if (!name) return false;
  const wanted = plainWords(name);
  const have = plainWords(text).slice(-wanted.length);
  return wanted.length > 0 && have.length === wanted.length && wanted.every((word, at) => have[at] === word);
}

/**
 * The name an abbreviation abbreviates, in the words right before its
 * brackets: the shortest run of words that carries its letters, in order, as
 * initials ("Service de police de l'agglomération de Longueuil" for SPAL);
 * each part of a hyphenated word counts ("Vieux-Longueuil" gives V and L).
 */
function nameBefore(text: string, abbreviation: string): string | undefined {
  const words = [...text.matchAll(/[\p{L}\p{N}'’]+/gu)].slice(-NAME_WORDS);
  for (let start = words.length - 1; start >= 0; start -= 1) {
    if (carries(words.slice(start).map(([word]) => word), abbreviation)) return text.slice(words[start].index).trim();
  }
  return undefined;
}

/**
 * The name a source pairs with an abbreviation whose letters no initials
 * before its brackets carry, as AREQ's are those of an older name: within
 * the clause before the brackets, from the word that starts with the
 * abbreviation's first letter and carries the most of its letters (the
 * latest on a tie) to the brackets. "L’Association des personnes retraitées
 * de la Centrale des syndicats du Québec" for AREQ.
 */
function sourceNameBefore(text: string, abbreviation: string): string | undefined {
  const clause = text.split(/[.;:!?«»"“”]|,\s/u).at(-1) ?? "";
  const offset = text.length - clause.length;
  const words = [...clause.matchAll(/[\p{L}\p{N}'’]+/gu)].slice(-SOURCE_NAME_WORDS);
  let best: { start: number; matched: number } | undefined;
  for (let start = 0; start < words.length; start += 1) {
    const matched = carried(words.slice(start).map(([word]) => word), abbreviation);
    if (matched && (!best || matched >= best.matched)) best = { start, matched };
  }
  return best ? text.slice(offset + words[best.start].index).trim() : undefined;
}

/**
 * The abbreviations the facts spell out, each with the name it abbreviates
 * when the facts give one whose initials carry it: the source had to explain
 * them, so even its own readers did not know them. Everyday ones are left
 * out.
 */
export function explainedAbbreviations(facts: readonly Pick<Draft2Fact, "claim" | "evidence">[]): Map<string, string | undefined> {
  const explained = new Map<string, string | undefined>();
  const note = (abbreviation: string, name: string | undefined) => {
    if (!isAbbreviation(abbreviation) || EVERYDAY.has(abbreviation)) return;
    if (!explained.get(abbreviation)) explained.set(abbreviation, name?.trim() || undefined);
  };
  for (const fact of facts) {
    for (const text of [fact.claim, fact.evidence]) {
      for (const match of text.matchAll(NAME_THEN_ABBREVIATION)) {
        const before = text.slice(0, match.index);
        for (const part of partsOf(match[1])) note(part, nameBefore(before, part) ?? sourceNameBefore(before, part));
      }
      // A compound's part names the end of the brackets its letters carry ("AREQ-CSQ (… de la Centrale des syndicats du Québec)" for CSQ), else all of them.
      for (const match of text.matchAll(ABBREVIATION_THEN_NAME)) {
        const parts = partsOf(match[1]);
        for (const part of parts) note(part, parts.length > 1 ? nameBefore(match[2], part) ?? match[2] : match[2]);
      }
    }
  }
  return explained;
}

/**
 * The abbreviations a text spells out itself, the name's initials carrying
 * their letters ("la Régie des alcools, des courses et des jeux (RACJ)",
 * "SPAL (Service de police de l'agglomération de Longueuil)"), or the name
 * the source gives with one written as the source writes it (`explained`):
 * "l'Association des personnes retraitées de la Centrale des syndicats du
 * Québec (AREQ-CSQ)" spells out AREQ and CSQ.
 */
export function spelledOutAbbreviations(text: string, explained?: ReadonlyMap<string, string | undefined>): Set<string> {
  const spelled = new Set<string>();
  for (const match of text.matchAll(NAME_THEN_ABBREVIATION)) {
    const before = text.slice(0, match.index);
    for (const part of partsOf(match[1])) if (nameBefore(before, part) || endsWithName(before, explained?.get(part))) spelled.add(part);
  }
  for (const match of text.matchAll(ABBREVIATION_THEN_NAME)) {
    const name = plainWords(match[2]).join(" ");
    const parts = partsOf(match[1]);
    for (const part of parts) {
      const known = explained?.get(part);
      const named = carries(wordsOf(match[2]), part) || (parts.length > 1 && nameBefore(match[2], part) !== undefined);
      if (named || (known && plainWords(known).join(" ") === name)) spelled.add(part);
    }
  }
  return spelled;
}

/**
 * The explained abbreviations a reader-facing text uses without the post
 * having spelled them out, in the text or in what the reader saw before it
 * (`before`); once each, in the order of the list, quotations left out.
 */
export function abbreviationBreaches(text: string, explained: ReadonlyMap<string, string | undefined>, before = ""): string[] {
  const own = text.replace(QUOTED, " ");
  const spelled = spelledOutAbbreviations(`${before.replace(QUOTED, " ")}\n${own}`, explained);
  return [...explained.keys()].filter((abbreviation) => !spelled.has(abbreviation) && new RegExp(`${EDGE}${abbreviation}s?${END}`, "u").test(own));
}

/** The finding for abbreviations a text uses: what each abbreviates, and what to write instead. */
export function abbreviationFinding(found: readonly string[], explained: ReadonlyMap<string, string | undefined>): string {
  const named = found.map((abbreviation) => {
    const name = explained.get(abbreviation);
    return name ? `"${abbreviation}" (${name})` : `"${abbreviation}"`;
  });
  const one = found.length === 1;
  return `${named.join(", ")} ${one ? "is an abbreviation" : "are abbreviations"} the source had to explain: this reader does not know ${one ? "it" : "them"}. Name the thing in the publication's language, or say what it does. Only if the reader needs the abbreviation itself, spell it out once in a text, never a headline, where it first appears or before ("Name (${found[0]})"): the name the source gives with it, or one in the publication's language whose initials are its letters; never initials from another language.`;
}
