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
 */

const EDGE = "(?<![\\p{L}\\p{N}])";
const END = "(?![\\p{L}\\p{N}])";
const TOKEN = "\\p{Lu}[\\p{Lu}\\p{N}]{1,9}";
/** "Lachrymatory factor (LF)": the name, then its abbreviation in brackets. */
const NAME_THEN_ABBREVIATION = new RegExp(`\\((${TOKEN})\\)`, "gu");
/** "LFS (lachrymatory factor synthase)": the abbreviation, then its name in brackets. */
const ABBREVIATION_THEN_NAME = new RegExp(`${EDGE}(${TOKEN})\\s*\\(([^()]*\\p{Ll}[^()]*)\\)`, "gu");
const QUOTED = /«[^»]*»|“[^”]*”|"[^"]*"/gu;
const ROMAN = /^[IVXLCDM]+$/u;
/** How far before the brackets a name is looked for, in words. */
const NAME_WORDS = 10;
/** Abbreviations people use every day, in the publications' languages: never refused, whatever the source explained. */
const EVERYDAY = new Set([
  "DJ", "TV", "PC", "CD", "DVD", "LED", "GPS", "USB", "PDF", "SMS", "VIP", "OK", "CEO", "CV", "BBQ", "SUV", "ATM", "PIN", "AM", "PM",
  "ADN", "DNA", "ARN", "RNA", "VIH", "HIV", "SIDA", "AIDS", "COVID", "IA", "AI",
  "ONU", "UN", "UE", "EU", "USA", "UK", "NASA", "FIFA", "NBA", "NFL", "NHL", "MLB",
]);

/** An abbreviation, by the program's measure: at least two capitals, never a Roman numeral. */
const isAbbreviation = (token: string) => (token.match(/\p{Lu}/gu)?.length ?? 0) >= 2 && !ROMAN.test(token);

/** A word's initial, past an elision ("l'agglomération" starts with "a"). */
const initial = (word: string) => word.replace(/^\p{L}['’]/u, "").charAt(0).toLocaleLowerCase();

/** Whether words carry an abbreviation's letters, in order, as initials, the first word giving the first letter. */
function carries(words: readonly string[], abbreviation: string): boolean {
  const letters = [...abbreviation.toLocaleLowerCase().replace(/\p{N}/gu, "")];
  if (!words.length || initial(words[0]) !== letters[0]) return false;
  let matched = 0;
  for (const word of words) if (matched < letters.length && initial(word) === letters[matched]) matched += 1;
  return matched === letters.length;
}

const wordsOf = (text: string) => text.match(/[\p{L}\p{N}'’]+/gu) ?? [];

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
      for (const match of text.matchAll(NAME_THEN_ABBREVIATION)) note(match[1], nameBefore(text.slice(0, match.index), match[1]));
      for (const match of text.matchAll(ABBREVIATION_THEN_NAME)) note(match[1], match[2]);
    }
  }
  return explained;
}

/** The abbreviations a text spells out itself, the name's initials carrying their letters: "la Régie des alcools, des courses et des jeux (RACJ)", "SPAL (Service de police de l'agglomération de Longueuil)". */
export function spelledOutAbbreviations(text: string): Set<string> {
  const spelled = new Set<string>();
  for (const match of text.matchAll(NAME_THEN_ABBREVIATION)) if (nameBefore(text.slice(0, match.index), match[1])) spelled.add(match[1]);
  for (const match of text.matchAll(ABBREVIATION_THEN_NAME)) if (carries(wordsOf(match[2]), match[1])) spelled.add(match[1]);
  return spelled;
}

/**
 * The explained abbreviations a reader-facing text uses without the post
 * having spelled them out, in the text or in what the reader saw before it
 * (`before`); once each, in the order of the list, quotations left out.
 */
export function abbreviationBreaches(text: string, explained: ReadonlyMap<string, string | undefined>, before = ""): string[] {
  const own = text.replace(QUOTED, " ");
  const spelled = spelledOutAbbreviations(`${before.replace(QUOTED, " ")}\n${own}`);
  return [...explained.keys()].filter((abbreviation) => !spelled.has(abbreviation) && new RegExp(`${EDGE}${abbreviation}s?${END}`, "u").test(own));
}

/** The finding for abbreviations a text uses: what each abbreviates, and what to write instead. */
export function abbreviationFinding(found: readonly string[], explained: ReadonlyMap<string, string | undefined>): string {
  const named = found.map((abbreviation) => {
    const name = explained.get(abbreviation);
    return name ? `"${abbreviation}" (${name})` : `"${abbreviation}"`;
  });
  const one = found.length === 1;
  return `${named.join(", ")} ${one ? "is an abbreviation" : "are abbreviations"} the source had to explain: this reader does not know ${one ? "it" : "them"}. Name the thing in the publication's language, or say what it does. Only if the reader needs the abbreviation itself, spell it out once before, in the publication's language, its letters those of the name ("Name (${found[0]})"); never initials from another language.`;
}
