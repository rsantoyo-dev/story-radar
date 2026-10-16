import { comparableText } from "./draft2-facts.types";

/**
 * What no generated image may be asked for, wherever the asking happens: in a
 * visual script's direction (draft2-visual.types.ts) or, since the spine
 * decides what each image adds, in a spine beat's image line
 * (draft2-spine-checks.ts). Words, logos, captions, signs or interface would
 * be drawn as such; the image model letters only the slide's words, and the
 * logo and the page number are added afterwards. The brand's avoid list is
 * matched the same way in both places. Everything here is pure.
 */

// Word boundaries that know accented letters: JavaScript's \b takes "á" for a boundary, so \blogo\b matched inside "diálogo" and blocked a real run's slide.
const WORD_START = "(?<![\\p{L}\\p{N}_])";
const WORD_END = "(?![\\p{L}\\p{N}_])";
/** Elements no image may carry: they would be drawn as words, logos or interface. */
const FORBIDDEN = new RegExp(`${WORD_START}(logos?|watermarks?|captions?|subtitles?|hashtags?|swipe|page numbers?|signage|(?:text|words|letters|lettering) (?:that )?(?:reads?|says?|saying))${WORD_END}`, "iu");
/** A direction that keeps a corner for the logo added afterwards ("esquina libre para logo", "logo abajo a la derecha, libre", "logo en haut à gauche dégagé"), or rules an element out ("no logos", "sin texto", "aucun logo ni interface", "pas de visage, de logo ni de lieu"), does not ask for it (in the publications' languages). */
const ALLOWED = new RegExp([
  `${WORD_START}(?:espacio|zona|área|hueco|esquina|margen|rincón|room|space|zone|area|corner|margin|espace|coin|marge|emplacement|réserve)${WORD_END}[^.;]{0,60}?${WORD_START}logos?${WORD_END}`,
  `${WORD_START}logos?${WORD_END}[^.;]{0,60}?${WORD_START}(?:se añade|añadid[oa]|added|afterwards|después|luego|libre|libres|free|clear|empty|vacío|vacía|reservad[oa]s?|dégagée?s?|libérée?s?|réservée?s?|ajoutée?s?|ensuite|plus tard|hors cadre|hors image)${WORD_END}`,
  `${WORD_START}(?:sin|no|without|never|nunca|ningún|ninguna|sans|aucune?|pas d[e']|jamais|ni)${WORD_END}[^.;]{0,60}?${WORD_START}(?:logos?|watermarks?|captions?|subtitles?|hashtags?|signage|page numbers?|text|texto|words|letters|lettering|texte|légendes?|filigranes?|números?|cifras|chiffres|etiquetas?|étiquettes?|labels?)${WORD_END}`,
].join("|"), "giu");
/**
 * Words asked of the image beyond the slide's own: numbered or labelled
 * things, "with text", "con números" (a real spine asked for "tarjetas
 * numeradas con iconos" and the image lettered digits the slide never had).
 */
const WORDS_ASKED = new RegExp(`${WORD_START}(?:numerad[oa]s?|numbered|numérotée?s?|etiquetad[oa]s?|labell?ed|étiquetée?s?|rotulad[oa]s?|con (?:texto|números|cifras|etiquetas|rótulos|letreros|leyendas)|with (?:text|numbers|digits|labels|captions|signs|legends)|avec (?:du texte|des chiffres|des étiquettes|des légendes))${WORD_END}`, "iu");

/** The forbidden element a direction asks for, if any: words, logos, signs or interface the image would have to carry. */
export function forbiddenElement(direction: string): string | undefined {
  return FORBIDDEN.exec(direction.replace(ALLOWED, " "))?.[0];
}

/** Words the line asks the image to carry beyond the slide's own (numbered cards, labels, "with text"), if any. */
export function wordsAskedOfImage(line: string): string | undefined {
  return WORDS_ASKED.exec(line.replace(ALLOWED, " "))?.[0];
}

/** Whether a comparable text mentions a term as whole words (the term already comparable: avoidTerms, nameForms). */
export const mentionsTerm = (text: string, term: string) => new RegExp(`(?:^|[^\\p{L}\\p{N}])${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:$|[^\\p{L}\\p{N}])`, "u").test(text);

/** The avoid items worth matching in a direction or an image line: short phrases the identity lists, compared as written. */
export function avoidTerms(identity: { avoid?: readonly { items: readonly string[] }[] } | null | undefined): string[] {
  return [...new Set((identity?.avoid ?? []).flatMap((group) => group.items).map((item) => comparableText(item).replace(/[.;:,]+$/u, "").trim()).filter((item) => [...item].length >= 4 && item.split(" ").length <= 4))];
}
