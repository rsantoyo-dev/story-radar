import { comparableText, type Draft2Fact } from "./draft2-facts.types";

/**
 * Quotation marks promise the source's words (2026-10-24: a slide joined two
 * of the artist's sentences in one quote, and the review had to catch it). A
 * quote of four words or more on a slide must be in one fact word for word,
 * in its evidence or its claim; a term of one to three words in quotes (a
 * title, a coined word) is not a quote. Pure, in the publications' three
 * quotation styles.
 */
const QUOTE = /«\s*([^»]{4,400}?)\s*»|“([^”]{4,400})”|"([^"\n]{4,400})"|„([^“”]{4,400})“/gu;
export const QUOTE_MIN_WORDS = 4;

/** The quotes a text carries, as written, of QUOTE_MIN_WORDS words or more. */
export function quotesIn(text: string): string[] {
  return [...text.matchAll(QUOTE)].map((match) => (match[1] ?? match[2] ?? match[3] ?? match[4] ?? "").trim())
    .filter((quote) => quote.split(/\s+/u).filter((token) => /[\p{L}\p{N}]/u.test(token)).length >= QUOTE_MIN_WORDS);
}

/** The quotes of a text that no fact gives word for word. */
export function quotesNotInFacts(text: string, facts: readonly Pick<Draft2Fact, "claim" | "evidence">[]): string[] {
  const sources = facts.flatMap((fact) => [comparableText(fact.evidence ?? ""), comparableText(fact.claim)]);
  return quotesIn(text).filter((quote) => { const wanted = comparableText(quote).replace(/[.!?,;:]+$/u, ""); return !sources.some((source) => source.includes(wanted)); });
}

/** The finding's words for a slide's quotes no fact gives. */
export const quoteFinding = (quotes: readonly string[]) => `${quotes.map((quote) => `"${quote.slice(0, 80)}"`).join(" and ")} ${quotes.length === 1 ? "is" : "are"} in quotation marks, and no fact gives ${quotes.length === 1 ? "it" : "them"} word for word: quote one fact's words exactly, or tell it without quotation marks (a translation or two sentences joined are reported speech).`;
