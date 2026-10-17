/**
 * The fonts a brand can set its words in (2026-10-17, the editor: "fonts
 * preloaded and per brand… some 30 to choose from"). Every one is an open
 * Google Fonts family (SIL Open Font License, Roboto Slab under Apache 2.0)
 * bundled in fonts/brand/<dir>/ with its license, so the server sets the words
 * the same way on every host. A variable family is one file whose weight is an
 * axis; a static family is one file per weight. Pure: the catalog the canvas
 * lists and the server registers (brand-fonts.server.ts).
 */

export type BrandFontCategory = "display serif" | "serif" | "slab" | "sans" | "condensed" | "handwritten";
export type BrandFontFile = { file: string; weight?: number };
export type BrandFont = {
  id: string;
  /** The family's name, as the editor sees it and the server registers it. */
  name: string;
  category: BrandFontCategory;
  /** The folder under fonts/brand. */
  dir: string;
  /** A variable family's one file (no weight), or a static family's file per weight. */
  files: BrandFontFile[];
  /** The weights the editor can choose. */
  weights: number[];
  /** Axes always set besides the weight (Fraunces Soft's rounded serifs). */
  variations?: Record<string, number>;
  /** The optical size axis, set to the size the words are drawn at, within its range. */
  opsz?: [number, number];
  license: "OFL" | "Apache-2.0";
};

const variable = (file: string): BrandFontFile[] => [{ file }];

export const BRAND_FONTS: readonly BrandFont[] = [
  // Display serifs: titles with presence.
  { id: "fraunces-soft", name: "Fraunces Soft", category: "display serif", dir: "fraunces", files: variable("Fraunces[SOFT,WONK,opsz,wght].ttf"), weights: [400, 600, 700, 900], variations: { SOFT: 100, WONK: 0 }, opsz: [9, 144], license: "OFL" },
  { id: "fraunces", name: "Fraunces", category: "display serif", dir: "fraunces", files: variable("Fraunces[SOFT,WONK,opsz,wght].ttf"), weights: [400, 600, 700, 900], variations: { SOFT: 0, WONK: 0 }, opsz: [9, 144], license: "OFL" },
  { id: "dm-serif-display", name: "DM Serif Display", category: "display serif", dir: "dmserifdisplay", files: [{ file: "DMSerifDisplay-Regular.ttf", weight: 400 }], weights: [400], license: "OFL" },
  { id: "playfair-display", name: "Playfair Display", category: "display serif", dir: "playfairdisplay", files: variable("PlayfairDisplay[wght].ttf"), weights: [400, 700, 900], license: "OFL" },
  { id: "young-serif", name: "Young Serif", category: "display serif", dir: "youngserif", files: [{ file: "YoungSerif-Regular.ttf", weight: 400 }], weights: [400], license: "OFL" },
  { id: "gloock", name: "Gloock", category: "display serif", dir: "gloock", files: [{ file: "Gloock-Regular.ttf", weight: 400 }], weights: [400], license: "OFL" },
  { id: "abril-fatface", name: "Abril Fatface", category: "display serif", dir: "abrilfatface", files: [{ file: "AbrilFatface-Regular.ttf", weight: 400 }], weights: [400], license: "OFL" },
  // Text serifs.
  { id: "source-serif-4", name: "Source Serif 4", category: "serif", dir: "sourceserif4", files: variable("SourceSerif4[opsz,wght].ttf"), weights: [400, 600, 700, 900], opsz: [8, 60], license: "OFL" },
  { id: "lora", name: "Lora", category: "serif", dir: "lora", files: variable("Lora[wght].ttf"), weights: [400, 500, 700], license: "OFL" },
  { id: "merriweather", name: "Merriweather", category: "serif", dir: "merriweather", files: variable("Merriweather[opsz,wdth,wght].ttf"), weights: [400, 700, 900], opsz: [18, 144], license: "OFL" },
  // Slabs.
  { id: "bree-serif", name: "Bree Serif", category: "slab", dir: "breeserif", files: [{ file: "BreeSerif-Regular.ttf", weight: 400 }], weights: [400], license: "OFL" },
  { id: "roboto-slab", name: "Roboto Slab", category: "slab", dir: "robotoslab", files: variable("RobotoSlab[wght].ttf"), weights: [400, 700, 900], license: "Apache-2.0" },
  { id: "zilla-slab", name: "Zilla Slab", category: "slab", dir: "zillaslab", files: [{ file: "ZillaSlab-Regular.ttf", weight: 400 }, { file: "ZillaSlab-Medium.ttf", weight: 500 }, { file: "ZillaSlab-Bold.ttf", weight: 700 }], weights: [400, 500, 700], license: "OFL" },
  { id: "alfa-slab-one", name: "Alfa Slab One", category: "slab", dir: "alfaslabone", files: [{ file: "AlfaSlabOne-Regular.ttf", weight: 400 }], weights: [400], license: "OFL" },
  // Sans.
  { id: "dm-sans", name: "DM Sans", category: "sans", dir: "dmsans", files: variable("DMSans[opsz,wght].ttf"), weights: [400, 500, 700, 900], opsz: [9, 40], license: "OFL" },
  { id: "jost", name: "Jost", category: "sans", dir: "jost", files: variable("Jost[wght].ttf"), weights: [400, 500, 700, 900], license: "OFL" },
  { id: "outfit", name: "Outfit", category: "sans", dir: "outfit", files: variable("Outfit[wght].ttf"), weights: [400, 500, 700, 900], license: "OFL" },
  { id: "poppins", name: "Poppins", category: "sans", dir: "poppins", files: [{ file: "Poppins-Regular.ttf", weight: 400 }, { file: "Poppins-Medium.ttf", weight: 500 }, { file: "Poppins-Bold.ttf", weight: 700 }, { file: "Poppins-Black.ttf", weight: 900 }], weights: [400, 500, 700, 900], license: "OFL" },
  { id: "montserrat", name: "Montserrat", category: "sans", dir: "montserrat", files: variable("Montserrat[wght].ttf"), weights: [400, 500, 700, 900], license: "OFL" },
  { id: "work-sans", name: "Work Sans", category: "sans", dir: "worksans", files: variable("WorkSans[wght].ttf"), weights: [400, 500, 700, 900], license: "OFL" },
  { id: "manrope", name: "Manrope", category: "sans", dir: "manrope", files: variable("Manrope[wght].ttf"), weights: [400, 500, 700, 800], license: "OFL" },
  { id: "rubik", name: "Rubik", category: "sans", dir: "rubik", files: variable("Rubik[wght].ttf"), weights: [400, 500, 700, 900], license: "OFL" },
  { id: "nunito", name: "Nunito", category: "sans", dir: "nunito", files: variable("Nunito[wght].ttf"), weights: [400, 600, 800, 900], license: "OFL" },
  { id: "archivo", name: "Archivo", category: "sans", dir: "archivo", files: variable("Archivo[wdth,wght].ttf"), weights: [400, 500, 700, 900], license: "OFL" },
  { id: "barlow", name: "Barlow", category: "sans", dir: "barlow", files: [{ file: "Barlow-Regular.ttf", weight: 400 }, { file: "Barlow-Medium.ttf", weight: 500 }, { file: "Barlow-Bold.ttf", weight: 700 }, { file: "Barlow-Black.ttf", weight: 900 }], weights: [400, 500, 700, 900], license: "OFL" },
  { id: "ibm-plex-sans", name: "IBM Plex Sans", category: "sans", dir: "ibmplexsans", files: variable("IBMPlexSans[wdth,wght].ttf"), weights: [400, 500, 700], license: "OFL" },
  { id: "sora", name: "Sora", category: "sans", dir: "sora", files: variable("Sora[wght].ttf"), weights: [400, 500, 700, 800], license: "OFL" },
  { id: "liberation-sans", name: "Liberation Sans", category: "sans", dir: "..", files: [{ file: "LiberationSans-Regular.ttf", weight: 400 }, { file: "LiberationSans-Bold.ttf", weight: 700 }], weights: [400, 700], license: "OFL" },
  // Condensed and heavy display sans.
  { id: "bebas-neue", name: "Bebas Neue", category: "condensed", dir: "bebasneue", files: [{ file: "BebasNeue-Regular.ttf", weight: 400 }], weights: [400], license: "OFL" },
  { id: "oswald", name: "Oswald", category: "condensed", dir: "oswald", files: variable("Oswald[wght].ttf"), weights: [400, 500, 700], license: "OFL" },
  { id: "anton", name: "Anton", category: "condensed", dir: "anton", files: [{ file: "Anton-Regular.ttf", weight: 400 }], weights: [400], license: "OFL" },
  { id: "archivo-black", name: "Archivo Black", category: "condensed", dir: "archivoblack", files: [{ file: "ArchivoBlack-Regular.ttf", weight: 400 }], weights: [400], license: "OFL" },
  // Handwritten.
  { id: "caveat", name: "Caveat", category: "handwritten", dir: "caveat", files: variable("Caveat[wght].ttf"), weights: [400, 700], license: "OFL" },
  { id: "kalam", name: "Kalam", category: "handwritten", dir: "kalam", files: [{ file: "Kalam-Regular.ttf", weight: 400 }, { file: "Kalam-Bold.ttf", weight: 700 }], weights: [400, 700], license: "OFL" },
];

/** The font words fall back to: the one the server bundled first, for the page number. */
export const FALLBACK_BRAND_FONT = "liberation-sans";

export const brandFontById = (id: string | undefined): BrandFont | undefined => BRAND_FONTS.find((font) => font.id === id);

/** A font choice as a brand or a slide keeps it: the family and its weight. */
export type BrandFontChoice = { font: string; weight: number };

/** A valid choice: a known family at one of its weights (the nearest when the weight is not one of them); else the fallback's. */
export function brandFontChoice(value: unknown, fallback: BrandFontChoice): BrandFontChoice {
  const record = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const font = brandFontById(typeof record.font === "string" ? record.font : undefined);
  if (!font) return fallback;
  const asked = typeof record.weight === "number" && Number.isFinite(record.weight) ? record.weight : font.weights[0];
  const weight = font.weights.reduce((best, entry) => Math.abs(entry - asked) < Math.abs(best - asked) ? entry : best, font.weights[0]);
  return { font: font.id, weight };
}

/** The weights' names, for the editor. */
export const FONT_WEIGHT_NAME: Record<number, string> = { 400: "Regular", 500: "Medium", 600: "Semibold", 700: "Bold", 800: "Extrabold", 900: "Black" };

/**
 * The brand's fonts for the words the program sets on its slides: one for
 * the headlines, one for the text (the practical line and the call to action
 * take the text's family). Absent, the bundled Liberation Sans.
 */
export type CreativeWordsStyle = { headline: BrandFontChoice; text: BrandFontChoice };
export const DEFAULT_WORDS_STYLE: CreativeWordsStyle = { headline: { font: FALLBACK_BRAND_FONT, weight: 700 }, text: { font: FALLBACK_BRAND_FONT, weight: 400 } };

/** A brand's words style as stored or sent: each choice checked against the catalog; nothing usable is none. */
export function parseCreativeWordsStyle(value: unknown): CreativeWordsStyle | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (!record.headline && !record.text) return null;
  return {
    headline: brandFontChoice(record.headline, DEFAULT_WORDS_STYLE.headline),
    text: brandFontChoice(record.text, DEFAULT_WORDS_STYLE.text),
  };
}
