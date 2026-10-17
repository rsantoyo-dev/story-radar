import { createCanvas, type SKRSContext2D } from "@napi-rs/canvas";
import sharp, { type OverlayOptions } from "sharp";

import { DEFAULT_WORDS_STYLE, brandFontById, type CreativeWordsStyle } from "../stories/brand-fonts";
import { canvasFont, registerBrandFonts } from "../stories/brand-fonts.server";
import { lightness } from "../stories/creative-brand-logo-versions";
import type { CreativeBrandPaletteColor } from "../stories/creative-content.types";
import type { PortraitLayoutId } from "../stories/creative-portrait-composite";
import type { MapPanelPosition } from "../stories/map-panel-position";
import type { Draft2SlideWords, Draft2WordsLayout, Draft2WordsRole } from "./draft2-images.types";

/**
 * The slide's words set by the program (2026-10-17, the editor: "put the
 * words afterwards, so we avoid making images again"). Under the focus's
 * textMode "program" every image is made without a word, keeping a calm band
 * the prompt reserves, and the words are set there afterwards, before the
 * page number and the logo: exact as written, accents and numbers included,
 * and a word changed later is set again on the stored image, never drawn
 * again. Since the same day the words are drawn by Skia (@napi-rs/canvas) in
 * the brand's fonts (brand-fonts.ts), which it reads from their files on every
 * host; each slide keeps its layout (Draft2WordsLayout), which the editor
 * moves, resizes and restyles.
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

/** The band's lightness on the image: its mean and its spread (CIE points), read on a small copy. */
async function bandReading(image: Uint8Array, band: Pick<Box, "left" | "top" | "width" | "height">): Promise<{ mean: number; spread: number }> {
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
/** The padding inside a card or a band, and the gap between the headline and the text. */
const PANEL_PADDING = 32;
const BLOCK_GAP = 0.6;
const LINE_HEIGHT = { headline: 1.08, text: 1.3 } as const;

type Line = { text: string; width: number };
type Block = { lines: Line[]; size: number; lineHeight: number; role: Draft2WordsRole; weight: number; family: Draft2WordsRole["font"] };

/** The words wrapped to a width in a role's font: by words, a word longer than the line kept whole. */
function wrap(ctx: SKRSContext2D, words: string, role: Draft2WordsRole, width: number): Line[] {
  const { font, variations } = canvasFont({ font: role.font, weight: role.weight }, role.size);
  ctx.font = font;
  ctx.fontVariationSettings = variations;
  const lines: Line[] = [];
  for (const paragraph of words.split(/\n+/u)) {
    let current = "";
    for (const word of paragraph.split(/\s+/u).filter(Boolean)) {
      const next = current ? `${current} ${word}` : word;
      if (current && ctx.measureText(next).width > width) {
        lines.push({ text: current, width: ctx.measureText(current).width });
        current = word;
      } else current = next;
    }
    if (current) lines.push({ text: current, width: ctx.measureText(current).width });
  }
  return lines;
}

/** The blocks of a layout's words: the headline, the text, the practical line (the text's font, smaller) and the call to action (the text's font, heavier). */
function blocks(ctx: SKRSContext2D, words: Draft2SlideWords, layout: Draft2WordsLayout, width: number): Block[] {
  const heavier = (role: Draft2WordsRole): Draft2WordsRole => {
    const font = brandFontById(role.font);
    return { ...role, weight: font ? font.weights.reduce((best, weight) => Math.abs(weight - 700) < Math.abs(best - 700) ? weight : best, role.weight) : role.weight };
  };
  const parts: { words: string; role: Draft2WordsRole; lineHeight: number }[] = [
    { words: words.headline, role: layout.headline, lineHeight: LINE_HEIGHT.headline },
    { words: words.text, role: layout.text, lineHeight: LINE_HEIGHT.text },
    { words: words.practical ?? "", role: { ...layout.text, size: Math.round(layout.text.size * 0.8) }, lineHeight: LINE_HEIGHT.text },
    { words: words.cta ?? "", role: heavier({ ...layout.text, size: Math.round(layout.text.size * 0.9) }), lineHeight: LINE_HEIGHT.text },
  ];
  return parts.filter((part) => part.words.trim()).map((part) => ({
    lines: wrap(ctx, part.words.trim(), part.role, width), size: part.role.size, lineHeight: part.lineHeight, role: part.role, weight: part.role.weight, family: part.role.font,
  }));
}

const blockHeight = (block: Block) => Math.round(block.lines.length * block.size * block.lineHeight);
const blocksHeight = (list: readonly Block[], gap: number) => list.reduce((sum, block) => sum + blockHeight(block), 0) + gap * Math.max(0, list.length - 1);

/**
 * Draws a layout's words on a transparent sheet of the slide's size: what is
 * behind them (a card around the block, a band across the slide), then each
 * line in its font and colour. Returns the sheet and where the block ended.
 */
function drawSheet(words: Draft2SlideWords, layout: Draft2WordsLayout): { png: Buffer; bottom: number } {
  registerBrandFonts();
  const canvas = createCanvas(TEXT_CANVAS.width, TEXT_CANVAS.height);
  const ctx = canvas.getContext("2d");
  const padding = layout.background.kind === "none" ? 0 : PANEL_PADDING;
  const inner = Math.max(80, layout.box.width - padding * 2);
  const list = blocks(ctx, words, layout, inner);
  const gap = Math.round(layout.text.size * BLOCK_GAP);
  const height = blocksHeight(list, gap);
  const top = layout.box.top + padding;
  if (layout.background.kind !== "none") {
    ctx.globalAlpha = Math.min(1, Math.max(0, layout.background.opacity));
    ctx.fillStyle = layout.background.color;
    const widest = Math.max(...list.flatMap((block) => block.lines.map((line) => line.width)), 0);
    if (layout.background.kind === "band") ctx.fillRect(0, layout.box.top, TEXT_CANVAS.width, height + padding * 2);
    else {
      const cardWidth = Math.min(layout.box.width, widest + padding * 2);
      const cardLeft = layout.align === "center" ? layout.box.left + (layout.box.width - cardWidth) / 2 : layout.align === "right" ? layout.box.left + layout.box.width - cardWidth : layout.box.left;
      ctx.beginPath();
      ctx.roundRect(cardLeft, layout.box.top, cardWidth, height + padding * 2, 18);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
  ctx.textBaseline = "top";
  ctx.textAlign = layout.align;
  const x = layout.align === "center" ? layout.box.left + layout.box.width / 2 : layout.align === "right" ? layout.box.left + layout.box.width - padding : layout.box.left + padding;
  let y = top;
  for (const block of list) {
    const { font, variations } = canvasFont({ font: block.family, weight: block.weight }, block.size);
    ctx.font = font;
    ctx.fontVariationSettings = variations;
    ctx.fillStyle = block.role.color;
    for (const line of block.lines) {
      // The line's box is lineHeight tall; the glyphs sit a little below its top so the leading falls evenly.
      ctx.fillText(line.text, x, y + Math.round(block.size * (block.lineHeight - 1) / 2));
      y += Math.round(block.size * block.lineHeight);
    }
    y += gap;
  }
  return { png: canvas.toBuffer("image/png"), bottom: top + height + padding };
}

/** Where a layout's block of words ends on the slide (its box's bottom), for the editor's box. */
export function wordsBlockBottom(words: Draft2SlideWords, layout: Draft2WordsLayout): number {
  return drawSheet(words, layout).bottom;
}

/** The slide with a layout's words set on it. */
export async function drawWords({ image, words, layout }: { image: Uint8Array; words: Draft2SlideWords; layout: Draft2WordsLayout }): Promise<Uint8Array> {
  const { png } = drawSheet(words, layout);
  const layers: OverlayOptions[] = [{ input: png, left: 0, top: 0 }];
  return new Uint8Array(await sharp(Buffer.from(image)).composite(layers).png().toBuffer());
}

/**
 * The layout the program chooses for a slide: the band's box, the brand's
 * fonts, straight on a calm band in the palette colour that reads (a card of
 * the palette's lightest colour over a busy one), and the sizes brought down
 * together until the words fit the band (a cover starts larger). A bottom
 * band's block ends at the band's bottom.
 */
export async function autoWordsLayout({ image, words, band, palette, style = DEFAULT_WORDS_STYLE, cover = false }: {
  image: Uint8Array; words: Draft2SlideWords; band: Draft2TextBand; palette: Draft2WordsPalette; style?: CreativeWordsStyle; cover?: boolean;
}): Promise<Draft2WordsLayout> {
  registerBrandFonts();
  const reading = await bandReading(image, band);
  const inkContrast = Math.abs(reading.mean - (colorLightness(palette.ink) ?? 0));
  const paperContrast = Math.abs(reading.mean - (colorLightness(palette.paper) ?? 100));
  const plain = reading.spread <= CALM_SPREAD && Math.max(inkContrast, paperContrast) >= PLAIN_CONTRAST;
  const color = plain ? (inkContrast >= paperContrast ? palette.ink : palette.paper) : palette.ink;
  const background: Draft2WordsLayout["background"] = plain ? { kind: "none", color: palette.paper, opacity: 0.92 } : { kind: "card", color: palette.paper, opacity: 0.92 };
  const padding = plain ? 0 : PANEL_PADDING;
  const ctx = createCanvas(16, 16).getContext("2d");
  let layout: Draft2WordsLayout = {
    box: { left: band.left, top: band.top, width: band.width }, align: "left",
    headline: { ...style.headline, size: cover ? 88 : 66, color }, text: { ...style.text, size: cover ? 40 : 38, color }, background,
  };
  for (let scale = 1; scale >= 0.55; scale -= 0.05) {
    const sized: Draft2WordsLayout = { ...layout, headline: { ...layout.headline, size: Math.round((cover ? 88 : 66) * scale) }, text: { ...layout.text, size: Math.round((cover ? 40 : 38) * scale) } };
    const height = blocksHeight(blocks(ctx, words, sized, band.width - padding * 2), Math.round(sized.text.size * BLOCK_GAP)) + padding * 2;
    layout = sized;
    if (height <= band.height) {
      if (band.edge === "bottom") layout = { ...layout, box: { ...layout.box, top: band.top + band.height - height } };
      break;
    }
  }
  return layout;
}

/** The slide with its words set as the program chooses: the layout it chose comes back with it, for the editor. */
export async function setSlideWords({ image, words, band, palette, style, cover = false }: {
  image: Uint8Array; words: Draft2SlideWords; band: Draft2TextBand; palette: Draft2WordsPalette; style?: CreativeWordsStyle; cover?: boolean;
}): Promise<{ image: Uint8Array; layout: Draft2WordsLayout; panel: boolean; color: string }> {
  const layout = await autoWordsLayout({ image, words, band, palette, style, cover });
  return { image: await drawWords({ image, words, layout }), layout, panel: layout.background.kind !== "none", color: layout.headline.color };
}
