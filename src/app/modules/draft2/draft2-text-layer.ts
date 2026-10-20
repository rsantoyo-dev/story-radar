import { createCanvas, type SKRSContext2D } from "@napi-rs/canvas";
import sharp, { type OverlayOptions } from "sharp";

import { DEFAULT_WORDS_STYLE, brandFontById, brandFontChoice, type CreativeWordsRole, type CreativeWordsStyle } from "../stories/brand-fonts";
import { canvasFont, registerBrandFonts } from "../stories/brand-fonts.server";
import { lightness } from "../stories/creative-brand-logo-versions";
import type { CreativeBrandPaletteColor } from "../stories/creative-content.types";
import type { PortraitLayoutId } from "../stories/creative-portrait-composite";
import type { MapPanelPosition } from "../stories/map-panel-position";
import { markData } from "./draft2-data-marks";
import { funnelWordCount } from "./draft2-funnel";
import { readsAs, setAsMismatches, type Draft2SlideWords, type Draft2WordsLayout, type Draft2WordsPlace, type Draft2WordsRole } from "./draft2-images.types";

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
 * moves, resizes and restyles. Since 2026-10-18 a line may mix the role's
 * weight with **marked** words, break where the editor broke it, run in
 * capitals or with letter spacing, and carry a soft shadow on a photo.
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

/** A stretch of a line in one face: the role's, or its mark's. */
type Run = { text: string; marked: boolean };
type Line = { runs: Run[]; width: number };
/** One part's words: the headline, or the text (with the practical line and the call to action, set in the text's font). */
type Block = { lines: Line[]; size: number; lineHeight: number; role: Draft2WordsRole; part: "headline" | "text" };

/** How a role's marked words stand out: as the editor set it, else the font's heaviest weight in the role's colour. */
function markOf(role: Draft2WordsRole): { weight: number; color: string } {
  if (role.mark) return role.mark;
  const font = brandFontById(role.font);
  return { weight: font ? Math.max(...font.weights) : role.weight, color: role.color };
}

/** Sets the canvas to a role's face (its mark's when marked), with its letter spacing. */
function setFace(ctx: SKRSContext2D, role: Draft2WordsRole, marked: boolean): void {
  const { font, variations } = canvasFont({ font: role.font, weight: marked ? markOf(role).weight : role.weight }, role.size);
  ctx.font = font;
  ctx.fontVariationSettings = variations;
  ctx.letterSpacing = `${Math.round((role.size * (role.tracking ?? 0)) / 100) / 10}px`;
}

const runWidth = (ctx: SKRSContext2D, role: Draft2WordsRole, run: Run) => { setFace(ctx, role, run.marked); return ctx.measureText(run.text).width; };

/**
 * A role's words as paragraphs of words, each word its runs: ** turns the
 * mark on and off, a line break starts a paragraph (blank ones fall away), in
 * capitals when the role asks.
 */
function paragraphsOf(words: string, role: Draft2WordsRole): Run[][][] {
  const text = role.upper ? words.toLocaleUpperCase() : words;
  const paragraphs: Run[][][] = [[]];
  let word: Run[] = [];
  let marked = false;
  const endWord = () => { if (word.length) paragraphs[paragraphs.length - 1].push(word); word = []; };
  for (let at = 0; at < text.length; at++) {
    if (text.startsWith("**", at)) { marked = !marked; at++; continue; }
    const character = text[at];
    if (character === "\n") { endWord(); if (paragraphs[paragraphs.length - 1].length) paragraphs.push([]); continue; }
    if (/\s/u.test(character)) { endWord(); continue; }
    const last = word[word.length - 1];
    if (last && last.marked === marked) last.text += character;
    else word.push({ text: character, marked });
  }
  endWord();
  return paragraphs.filter((paragraph) => paragraph.length);
}

/** The words wrapped to a width in a role's faces: by words, a word longer than the line kept whole, each paragraph on its own lines. */
function wrap(ctx: SKRSContext2D, words: string, role: Draft2WordsRole, width: number): Line[] {
  const space = runWidth(ctx, role, { text: " ", marked: false });
  const lines: Line[] = [];
  for (const paragraph of paragraphsOf(words, role)) {
    let runs: Run[] = [];
    let used = 0;
    for (const word of paragraph) {
      const wide = word.reduce((sum, run) => sum + runWidth(ctx, role, run), 0);
      if (runs.length && used + space + wide > width) {
        lines.push({ runs, width: used });
        runs = [];
        used = 0;
      }
      const pieces = runs.length ? [{ text: " ", marked: false }, ...word] : word;
      for (const piece of pieces) {
        const last = runs[runs.length - 1];
        if (last && last.marked === piece.marked) last.text += piece.text;
        else runs.push({ ...piece });
      }
      used += (pieces.length > word.length ? space : 0) + wide;
    }
    if (runs.length) lines.push({ runs, width: used });
  }
  return lines;
}

/** The blocks of a layout's words: the headline, the text, the practical line (the text's font, smaller; in its mark's weight when the text's data is marked) and the call to action (the text's font, heavier). */
function blocks(ctx: SKRSContext2D, words: Draft2SlideWords, layout: Draft2WordsLayout, width: number): Block[] {
  const heavier = (role: Draft2WordsRole): Draft2WordsRole => {
    const font = brandFontById(role.font);
    return { ...role, weight: font ? font.weights.reduce((best, weight) => Math.abs(weight - 700) < Math.abs(best - 700) ? weight : best, role.weight) : role.weight };
  };
  const parts: { words: string; role: Draft2WordsRole; lineHeight: number; part: Block["part"] }[] = [
    { words: readsAs(words.headline, layout.setAs?.headline), role: layout.headline, lineHeight: LINE_HEIGHT.headline, part: "headline" },
    { words: readsAs(words.text, layout.setAs?.text), role: layout.text, lineHeight: LINE_HEIGHT.text, part: "text" },
    { words: words.practical ?? "", role: { ...layout.text, size: Math.round(layout.text.size * 0.8), ...(layout.text.data ? { weight: markOf(layout.text).weight } : {}) }, lineHeight: LINE_HEIGHT.text, part: "text" },
    { words: words.cta ?? "", role: heavier({ ...layout.text, size: Math.round(layout.text.size * 0.9) }), lineHeight: LINE_HEIGHT.text, part: "text" },
  ];
  return parts.filter((part) => part.words.trim()).map((part) => ({
    lines: wrap(ctx, part.words.trim(), part.role, width), size: part.role.size, lineHeight: part.lineHeight, role: part.role, part: part.part,
  }));
}

const blockHeight = (block: Block) => Math.round(block.lines.length * block.size * block.lineHeight);
const blocksHeight = (list: readonly Block[], gap: number) => list.reduce((sum, block) => sum + blockHeight(block), 0) + gap * Math.max(0, list.length - 1);

/** Where each part of the words sits on the slide, top to bottom in slide pixels: what the editor's boxes show. */
export type Draft2WordsParts = { headline: { top: number; bottom: number }; text?: { top: number; bottom: number } };

/**
 * Draws one place's blocks: what is behind them (a card around them, a band
 * across the slide), then each line in its faces and colours, placed by its
 * own width. Returns where each block starts and ends.
 */
function drawGroup(ctx: SKRSContext2D, list: readonly Block[], place: Draft2WordsPlace, layout: Draft2WordsLayout): { top: number; bottom: number; spans: { part: Block["part"]; top: number; bottom: number }[] } {
  const padding = place.background.kind === "none" ? 0 : PANEL_PADDING;
  const gap = Math.round(layout.text.size * BLOCK_GAP);
  const height = blocksHeight(list, gap);
  const top = place.box.top + padding;
  if (place.background.kind !== "none" && list.length) {
    ctx.globalAlpha = Math.min(1, Math.max(0, place.background.opacity));
    ctx.fillStyle = place.background.color;
    const widest = Math.max(...list.flatMap((block) => block.lines.map((line) => line.width)), 0);
    if (place.background.kind === "band") ctx.fillRect(0, place.box.top, TEXT_CANVAS.width, height + padding * 2);
    else {
      const cardWidth = Math.min(place.box.width, widest + padding * 2);
      const cardLeft = place.align === "center" ? place.box.left + (place.box.width - cardWidth) / 2 : place.align === "right" ? place.box.left + place.box.width - cardWidth : place.box.left;
      ctx.beginPath();
      ctx.roundRect(cardLeft, place.box.top, cardWidth, height + padding * 2, 18);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
  ctx.textBaseline = "top";
  // Each line is placed by its own width, its runs one after the other.
  ctx.textAlign = "left";
  const start = place.box.left + padding;
  const end = place.box.left + place.box.width - padding;
  const spans: { part: Block["part"]; top: number; bottom: number }[] = [];
  let y = top;
  for (const block of list) {
    const blockTop = y;
    // The shadow lifts words straight on the image; on a card or a band they need none.
    if (layout.shadow && place.background.kind === "none") {
      ctx.shadowColor = "rgba(0, 0, 0, 0.45)";
      ctx.shadowBlur = Math.max(4, Math.round(block.size * 0.18));
      ctx.shadowOffsetY = Math.max(1, Math.round(block.size * 0.05));
    }
    for (const line of block.lines) {
      let x = place.align === "center" ? (start + end - line.width) / 2 : place.align === "right" ? end - line.width : start;
      // The line's box is lineHeight tall; the glyphs sit a little below its top so the leading falls evenly.
      const baseline = y + Math.round(block.size * (block.lineHeight - 1) / 2);
      for (const run of line.runs) {
        setFace(ctx, block.role, run.marked);
        ctx.fillStyle = run.marked ? markOf(block.role).color : block.role.color;
        ctx.fillText(run.text, x, baseline);
        x += ctx.measureText(run.text).width;
      }
      y += Math.round(block.size * block.lineHeight);
    }
    spans.push({ part: block.part, top: blockTop, bottom: y });
    y += gap;
  }
  ctx.shadowColor = "rgba(0, 0, 0, 0)";
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;
  return { top: place.box.top, bottom: top + height + padding, spans };
}

/**
 * Draws a layout's words on a transparent sheet of the slide's size: the
 * headline and the text in one block, or each in its own place when the
 * editor set the text apart. Returns the sheet, where the headline's block
 * ended, and where each part sits.
 */
function drawSheet(words: Draft2SlideWords, layout: Draft2WordsLayout): { png: Buffer; bottom: number; parts: Draft2WordsParts } {
  registerBrandFonts();
  const canvas = createCanvas(TEXT_CANVAS.width, TEXT_CANVAS.height);
  const ctx = canvas.getContext("2d");
  const inner = (place: Draft2WordsPlace) => Math.max(80, place.box.width - (place.background.kind === "none" ? 0 : PANEL_PADDING) * 2);
  const apart = layout.textBlock;
  const first = drawGroup(ctx, blocks(ctx, words, layout, inner(layout)).filter((block) => !apart || block.part === "headline"), layout, layout);
  const second = apart ? drawGroup(ctx, blocks(ctx, words, layout, inner(apart)).filter((block) => block.part === "text"), apart, layout) : undefined;
  const headline = first.spans.find((span) => span.part === "headline");
  const textSpans = (second ?? first).spans.filter((span) => span.part === "text");
  const parts: Draft2WordsParts = {
    headline: { top: first.top, bottom: apart ? first.bottom : headline?.bottom ?? first.bottom },
    ...(textSpans.length ? { text: { top: apart ? second!.top : textSpans[0].top, bottom: (second ?? first).bottom } } : {}),
  };
  return { png: canvas.toBuffer("image/png"), bottom: first.bottom, parts };
}

/** Where a layout's block of words ends on the slide (its box's bottom), for the editor's box. */
export function wordsBlockBottom(words: Draft2SlideWords, layout: Draft2WordsLayout): number {
  return drawSheet(words, layout).bottom;
}

/** Where the headline and the text sit on the slide, for the editor's two boxes. */
export function wordsParts(words: Draft2SlideWords, layout: Draft2WordsLayout): Draft2WordsParts {
  return drawSheet(words, layout).parts;
}

/** The slide with a layout's words set on it. */
export async function drawWords({ image, words, layout }: { image: Uint8Array; words: Draft2SlideWords; layout: Draft2WordsLayout }): Promise<Uint8Array> {
  const { png } = drawSheet(words, layout);
  const layers: OverlayOptions[] = [{ input: png, left: 0, top: 0 }];
  return new Uint8Array(await sharp(Buffer.from(image)).composite(layers).png().toBuffer());
}

/** The brand's font for a slide's text: its paragraph's from that many words, counted as the program counts them; else its text's. */
export function textStyleFor(style: CreativeWordsStyle, text: string): CreativeWordsRole {
  if (!style.paragraph || funnelWordCount(text) < style.paragraph.from) return style.text;
  const { from: _from, ...role } = style.paragraph;
  void _from;
  return role;
}

/**
 * The layout the program chooses for a slide: the band's box, the brand's
 * fonts (a longer text in its paragraph's, the text's data marked in its
 * data weight when the brand sets one), straight on a calm band in the
 * palette colour that reads (a card of the palette's lightest colour over a
 * busy one), and the sizes brought down together until the words fit the
 * band (a cover starts larger). A bottom band's block ends at the band's
 * bottom.
 */
export async function autoWordsLayout({ image, words, band, palette, style = DEFAULT_WORDS_STYLE, places = [], cover = false }: {
  image: Uint8Array; words: Draft2SlideWords; band: Draft2TextBand; palette: Draft2WordsPalette; style?: CreativeWordsStyle;
  /** The story's places, marked with the text's data. */
  places?: readonly string[];
  cover?: boolean;
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
  const textStyle = textStyleFor(style, words.text);
  const data = style.data ? { mark: { weight: brandFontChoice({ font: textStyle.font, weight: style.data.weight }, textStyle).weight, color }, data: true as const } : {};
  const marked = style.data ? markData(words.text, places) : words.text;
  let layout: Draft2WordsLayout = {
    box: { left: band.left, top: band.top, width: band.width }, align: "left",
    headline: { ...style.headline, size: cover ? 88 : 66, color }, text: { ...textStyle, size: cover ? 40 : 38, color, ...data }, background,
    ...(marked !== words.text ? { setAs: { text: marked } } : {}),
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

/**
 * A kept layout for the slide's words as they are now: when it marks the
 * text's data and its marks no longer keep the slide's words (they changed),
 * the data marked again in them. Marks the editor took off stay off.
 */
export function remarkData(layout: Draft2WordsLayout, words: Draft2SlideWords, places: readonly string[] = []): Draft2WordsLayout {
  if (!layout.text.data || !setAsMismatches(words, layout).includes("text")) return layout;
  const { setAs, ...rest } = layout;
  const { text: _stale, ...kept } = setAs ?? {};
  void _stale;
  const marked = markData(words.text, places);
  const next: NonNullable<Draft2WordsLayout["setAs"]> = marked !== words.text ? { ...kept, text: marked } : kept;
  return next.headline !== undefined || next.text !== undefined ? { ...rest, setAs: next } : rest;
}

/** The slide with its words set as the program chooses: the layout it chose comes back with it, for the editor. */
export async function setSlideWords({ image, words, band, palette, style, places, cover = false }: {
  image: Uint8Array; words: Draft2SlideWords; band: Draft2TextBand; palette: Draft2WordsPalette; style?: CreativeWordsStyle; places?: readonly string[]; cover?: boolean;
}): Promise<{ image: Uint8Array; layout: Draft2WordsLayout; panel: boolean; color: string }> {
  const layout = await autoWordsLayout({ image, words, band, palette, style, places, cover });
  return { image: await drawWords({ image, words, layout }), layout, panel: layout.background.kind !== "none", color: layout.headline.color };
}
