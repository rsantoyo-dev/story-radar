import type { CreativeReaderAddress } from "../stories/creative-content.types";

/**
 * How a post addresses its reader, in the languages that distinguish it
 * (French tu/vous, Spanish tú/usted): the Topic's choice, the same on every
 * slide, in the call to action and in the caption, never both forms in one
 * post. A Salut Brossard closing wrote "Pour vos sorties, retenez…" above
 * "Suis Salut Brossard…" (2026-10-15). Words in quotation marks are someone
 * else's and never count. Everything here is pure.
 */
export type Draft2Reader = { address?: CreativeReaderAddress; language: string };
type AddressLanguage = "french" | "spanish";

export function addressLanguage(language: string): AddressLanguage | undefined {
  const value = language.trim();
  if (/^(fr|french|fran[cç]ais)/iu.test(value)) return "french";
  if (/^(es|spanish|espa[nñ]ol)/iu.test(value)) return "spanish";
  return undefined;
}

/** Quoted words: someone's own, never the publication addressing its reader. */
const QUOTED = /«[^»]*»|“[^”]*”|"[^"]*"/gu;
const EDGE = "(?<![\\p{L}\\p{N}])";
const END = "(?![\\p{L}\\p{N}])";
/** The words of the other form: what an informal post never says, and what a formal one never says. */
const OTHER_FORM: Record<AddressLanguage, Record<CreativeReaderAddress, RegExp>> = {
  french: {
    informal: new RegExp(`${EDGE}(?:vous|votre|vos)${END}`, "giu"),
    formal: new RegExp(`${EDGE}(?:(?:tu|toi|ta|tes)${END}|t['’](?=\\p{L}))`, "giu"),
  },
  spanish: {
    informal: new RegExp(`${EDGE}(?:usted|ustedes)${END}`, "giu"),
    formal: new RegExp(`${EDGE}(?:tú|tu|tus|te|ti|contigo)${END}`, "giu"),
  },
};
/** A French verb in "-ez" is the vous form ("retenez", "suivez"); these words in "-ez" are not verbs. */
const EZ = new RegExp(`${EDGE}\\p{L}+ez${END}`, "gu");
const NOT_VERBS = new Set(["chez", "assez", "nez", "rez"]);
const SENTENCE_START = /(^|[.!?…:]\s+|\n\s*)$/u;

/** The words of the other form a reader-facing text uses, lowercased, once each, its quotations left out. */
export function addressBreaches(text: string, reader: Draft2Reader | undefined): string[] {
  const language = reader ? addressLanguage(reader.language) : undefined;
  if (!reader || !language) return [];
  const address = reader.address ?? "informal";
  const own = text.replace(QUOTED, " ");
  const found = [...own.matchAll(OTHER_FORM[language][address])].map((match) => match[0]);
  if (language === "french" && address === "informal") {
    for (const match of own.matchAll(EZ)) {
      const word = match[0];
      if (NOT_VERBS.has(word.toLowerCase())) continue;
      // A capitalized word in "-ez" inside a sentence is a name (Rodriguez); at its start it is an imperative (Retenez).
      if (word[0] !== word[0].toLowerCase() && !SENTENCE_START.test(own.slice(0, match.index))) continue;
      found.push(word);
    }
  }
  return [...new Set(found.map((word) => word.toLowerCase()))];
}

/** The form the publication uses, as its own words. */
export function addressForm(reader: Draft2Reader): string {
  const language = addressLanguage(reader.language);
  const informal = (reader.address ?? "informal") === "informal";
  if (language === "french") return informal ? "tu" : "vous";
  if (language === "spanish") return informal ? "tú" : "usted";
  return informal ? "informal" : "formal";
}

/** The finding for words of the other form. */
export function addressFinding(words: readonly string[], reader: Draft2Reader): string {
  return `The publication addresses its reader as "${addressForm(reader)}" on every slide, in the call to action and in the caption: ${words.map((word) => `"${word}"`).join(", ")} ${words.length === 1 ? "is" : "are"} the other form.`;
}

/** The line of the brand brief that sets the form, for the languages that distinguish it. */
export function addressBrief(reader: Draft2Reader): string | undefined {
  const language = addressLanguage(reader.language);
  const informal = (reader.address ?? "informal") === "informal";
  const same = "the same on every slide, in the call to action and in the caption";
  if (language === "french") {
    return informal
      ? `- Address the reader as "tu" (ton, ta, tes, toi; imperatives such as "découvre", "suis"), ${same}: never "vous", "votre", "vos" or an imperative in "-ez", never both forms in one post.`
      : `- Address the reader as "vous" (votre, vos; imperatives in "-ez"), ${same}: never "tu", never both forms in one post.`;
  }
  if (language === "spanish") {
    return informal
      ? `- Address the reader as "tú" (tu, te, ti; imperatives such as "descubre", "sigue"), ${same}: never "usted", never both forms in one post.`
      : `- Address the reader as "usted" (su, le; imperatives such as "descubra", "siga"), ${same}: never "tú", never both forms in one post.`;
  }
  return undefined;
}
