import path from "node:path";
import sharp, { type OverlayOptions } from "sharp";

import { lightness } from "../stories/creative-brand-logo-versions";
import type { CreativeBrandPaletteColor } from "../stories/creative-content.types";
import type { PortraitLayoutId } from "../stories/creative-portrait-composite";
import type { MapPanelPosition } from "../stories/map-panel-position";
import type { Draft2SlideWords } from "./draft2-images.types";

/**
 * The slide's words set by the program (2026-10-17, the editor: "put the
 * words afterwards, so we avoid making images again"). Under the focus's
 * textMode "program" every image is made without a word, keeping a calm band
 * the prompt reserves, and the words are set there afterwards, before the
 * page number and the logo: exact as written, accents and numbers included,
 * and a word changed later is set again on the stored image, never drawn
 * again. The first version is generic: one sans family (Liberation Sans, the
 * font the server already bundles for the page number), the brand palette's
 * darkest and lightest colours, a band along the top of the slide (below the
 * logo where the logo sits there), along the bottom when a real photo or a
 * map card takes the top.
 */

export const TEXT_CANVAS = { width: 1080, height: 1350 } as const;
/** The side margins, the distance from the edge, and the gap below the logo, in canvas pixels. */
const SIDE = 72;
const EDGE = 64;
const GAP = 28;
/** The bottom kept for the page number badge (5.2 % high, 2.2 % from the edge) and its margin. */
const BOTTOM_RESERVE = 120;
/** The band's height: a little under half the slide, the image keeps the rest. */
const BAND_HEIGHT = 540;

export type Draft2TextBand = { edge: "top" | "bottom"; left: number; top: number; width: number; height: number };
export type Draft2WordsPalette = { ink: string; paper: string };
type Box = { left: number; top: number; width: number; height: number };

/**
 * Where a slide's words go: along the top, below the logo when the logo sits
 * in the top half; along the bottom, above the page number, when a real
 * photo bleeds from the top (the "top-bleed" layout) or the map card sits in
 * the top right, and then above a logo that sits at the bottom.
 */
export function textBandFor({ logo, photoLayout, mapPosition }: { logo?: Box; photoLayout?: PortraitLayoutId; mapPosition?: MapPanelPosition }): Draft2TextBand {
  const logoOnTop = logo && logo.top + logo.height / 2 < TEXT_CANVAS.height / 2;
  const bottom = photoLayout === "top-bleed" || mapPosition === "top-right";
  if (!bottom) {
    const top = logoOnTop ? Math.round(logo.top + logo.height + GAP) : EDGE;
    return { edge: "top", left: SIDE, top, width: TEXT_CANVAS.width - SIDE * 2, height: BAND_HEIGHT };
  }
  const end = logo && !logoOnTop ? Math.round(logo.top - GAP) : TEXT_CANVAS.height - BOTTOM_RESERVE;
  return { edge: "bottom", left: SIDE, top: end - BAND_HEIGHT, width: TEXT_CANVAS.width - SIDE * 2, height: BAND_HEIGHT };
}

/** What the image prompt asks for the band, in the slide's own proportions. */
export function textBandPrompt(band: Draft2TextBand): string {
  const from = Math.round((band.top / TEXT_CANVAS.height) * 100);
  const to = Math.round(((band.top + band.height) / TEXT_CANVAS.height) * 100);
  const where = band.edge === "top" ? `the top of the image down to ${to}% of its height` : `the band from ${from}% of the height down to ${to}%`;
  return `\n\nWORDS SET AFTERWARDS\nRender no words, letters, numbers or signs anywhere in the image: the program sets the slide's words afterwards. Keep ${where} calm and plain, a flat field, sky, wall or table in the palette, with no subject, face, object or busy texture in it; the slide's subject sits in the rest of the image.\nEND WORDS SET AFTERWARDS`;
}

const hex = (value: string): [number, number, number] | undefined => {
  const match = /^#?([0-9a-f]{6})$/iu.exec(value.trim());
  return match ? [0, 2, 4].map((start) => Number.parseInt(match[1].slice(start, start + 2), 16)) as [number, number, number] : undefined;
};
const colorLightness = (value: string) => { const rgb = hex(value); return rgb ? lightness(...rgb) : undefined; };

/** The words' colours: the palette's darkest and lightest, when they are far enough apart to read on each other; a neutral pair otherwise. */
export function wordsPalette(palette: readonly Pick<CreativeBrandPaletteColor, "color">[] | undefined): Draft2WordsPalette {
  const colors = (palette ?? []).flatMap((entry) => { const value = colorLightness(entry.color); return value === undefined ? [] : [{ color: entry.color.startsWith("#") ? entry.color : `#${entry.color}`, value }]; });
  if (colors.length >= 2) {
    const sorted = [...colors].sort((a, b) => a.value - b.value);
    const ink = sorted[0];
    const paper = sorted[sorted.length - 1];
    if (paper.value - ink.value >= 50) return { ink: ink.color, paper: paper.color };
  }
  return { ink: "#1b1f24", paper: "#ffffff" };
}

/** The words in Pango's markup: escaped, in one colour. */
const markup = (value: string, color: string) => `<span foreground="${color}">${value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}</span>`;

const fontFile = (bold: boolean) => path.join(process.cwd(), "fonts", bold ? "LiberationSans-Bold.ttf" : "LiberationSans-Regular.ttf");

/** One block of words drawn by Pango, wrapped to the width: the font the server bundles, so it renders the same on every host. */
async function block(words: string, { size, bold, width, color }: { size: number; bold: boolean; width: number; color: string }): Promise<{ png: Buffer; width: number; height: number }> {
  const { data, info } = await sharp({
    text: { text: markup(words, color), font: `Liberation Sans${bold ? " Bold" : ""} ${size}`, fontfile: fontFile(bold), width, rgba: true, align: "left", wrap: "word", spacing: Math.round(size * 0.14) },
  }).png().toBuffer({ resolveWithObject: true });
  return { png: data, width: info.width, height: info.height };
}

/** The band's lightness on the image: its mean and its spread (CIE points), read on a small copy. */
async function bandReading(image: Uint8Array, band: Draft2TextBand): Promise<{ mean: number; spread: number }> {
  const { data, info } = await sharp(Buffer.from(image)).extract({ left: band.left, top: band.top, width: band.width, height: band.height }).resize(96, 56, { fit: "fill" }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const values: number[] = [];
  for (let at = 0; at < data.length; at += info.channels) values.push(lightness(data[at], data[at + 1], data[at + 2]));
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const spread = Math.sqrt(values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length);
  return { mean, spread };
}

/** A band this calm (spread in CIE points) carries words with no card behind them; and they need this much contrast with it. */
const CALM_SPREAD = 14;
const PLAIN_CONTRAST = 45;
const PANEL_PADDING = 32;

/**
 * The slide with its words set in the band: the headline in bold, the text
 * under it, the practical line and the call to action smaller. On a calm
 * band of enough contrast the words sit on the image in the palette colour
 * that reads best; otherwise on a card of the palette's lightest colour. The
 * sizes come down together until the words fit the band (a cover starts
 * larger); words that still do not fit at the smallest size take the room
 * they need below it, never clipped.
 */
export async function setSlideWords({ image, words, band, palette, cover = false }: {
  image: Uint8Array; words: Draft2SlideWords; band: Draft2TextBand; palette: Draft2WordsPalette; cover?: boolean;
}): Promise<{ image: Uint8Array; panel: boolean; color: string }> {
  const reading = await bandReading(image, band);
  const inkContrast = Math.abs(reading.mean - (colorLightness(palette.ink) ?? 0));
  const paperContrast = Math.abs(reading.mean - (colorLightness(palette.paper) ?? 100));
  const plain = reading.spread <= CALM_SPREAD && Math.max(inkContrast, paperContrast) >= PLAIN_CONTRAST;
  const color = plain ? (inkContrast >= paperContrast ? palette.ink : palette.paper) : palette.ink;
  const padding = plain ? 0 : PANEL_PADDING;
  const width = band.width - padding * 2;
  const room = band.height - padding * 2;
  const parts = [
    { words: words.headline, size: cover ? 84 : 64, bold: true },
    { words: words.text, size: cover ? 40 : 38, bold: false },
    { words: words.practical ?? "", size: 30, bold: false },
    { words: words.cta ?? "", size: 34, bold: true },
  ].filter((part) => part.words.trim());
  let blocks: Awaited<ReturnType<typeof block>>[] = [];
  let gap = 0;
  for (let scale = 1; scale >= 0.55; scale -= 0.05) {
    blocks = await Promise.all(parts.map((part) => block(part.words.trim(), { size: Math.round(part.size * scale), bold: part.bold, width, color })));
    gap = Math.round(30 * scale);
    if (blocks.reduce((sum, entry) => sum + entry.height, 0) + gap * (blocks.length - 1) <= room) break;
  }
  const total = blocks.reduce((sum, entry) => sum + entry.height, 0) + gap * Math.max(0, blocks.length - 1);
  const top = band.edge === "top" ? band.top + padding : Math.max(EDGE, band.top + band.height - padding - total);
  const layers: OverlayOptions[] = [];
  if (!plain) {
    const panelWidth = Math.min(band.width, Math.max(...blocks.map((entry) => entry.width)) + padding * 2);
    const panelHeight = Math.min(TEXT_CANVAS.height - (top - padding), total + padding * 2);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${panelWidth}" height="${panelHeight}"><rect x="0" y="0" width="${panelWidth}" height="${panelHeight}" rx="18" ry="18" fill="${palette.paper}" fill-opacity="0.92"/></svg>`;
    layers.push({ input: Buffer.from(svg), left: band.left, top: top - padding });
  }
  let y = top;
  for (const entry of blocks) {
    if (y + entry.height > TEXT_CANVAS.height) break;
    layers.push({ input: entry.png, left: band.left + padding, top: y });
    y += entry.height + gap;
  }
  const out = await sharp(Buffer.from(image)).composite(layers).png().toBuffer();
  return { image: new Uint8Array(out), panel: !plain, color };
}
