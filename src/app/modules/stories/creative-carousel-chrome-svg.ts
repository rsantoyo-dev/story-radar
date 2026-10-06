/**
 * Pure SVG markup for the compositor-rendered carousel counter.
 *
 * This module has no server-only dependencies so the creative profile editor
 * can preview the exact markup the compositor paints onto a slide. Geometry,
 * prompt reservation and Sharp compositing stay in `creative-carousel-chrome`.
 */
import type { CreativeCarouselChromeStyle } from "./creative-content.types";

export type CreativeCarouselChromeColors = {
  background: string;
  text: string;
  accent: string;
};

export type CreativeCarouselPixelRect = {
  left: number;
  top: number;
  width: number;
  height: number;
};

export type CreativeCarouselChromeCopy = {
  progress: string;
  continuationCue?: string;
  /** Exact deterministic copy rendered by the compositor. */
  visibleText: string;
};

export type CreativeCarouselChromeText = {
  centerX: number;
  centerY: number;
  fontSize: number;
};

/** Dot pitch and radius, relative to the counter font size. */
const DOT_PITCH_EM = 0.62;
const DOT_RADIUS_EM = 0.2;
const FONT_FAMILY = "Arial, Helvetica, sans-serif";

/**
 * Width of the counter content measured in font-size units. Text styles use
 * the visible copy; the dots style replaces the numeric progress with one dot
 * per slide.
 */
export function creativeCarouselChromeContentUnits(
  copy: CreativeCarouselChromeCopy,
  style: CreativeCarouselChromeStyle,
): number {
  if (style !== "dots") return estimatedTextUnits(copy.visibleText);
  const { total } = parseProgress(copy.progress);
  const cueUnits = copy.continuationCue
    ? estimatedTextUnits(dotsCueText(copy.continuationCue))
    : 0;
  return dotsWidthUnits(total) + cueUnits;
}

/** Badge shape plus counter text, positioned on the caller's canvas. */
export function renderCreativeCarouselChromeMarkup({
  badge,
  text,
  copy,
  colors,
  style,
}: {
  badge: CreativeCarouselPixelRect;
  text: CreativeCarouselChromeText;
  copy: CreativeCarouselChromeCopy;
  colors: CreativeCarouselChromeColors;
  style: CreativeCarouselChromeStyle;
}): string {
  switch (style) {
    case "pill":
    case "minimal":
      return `${legacyBadgeRect(badge, colors, style)}${renderChromeText(text, copy, colors, style)}`;
    case "outline":
      return `<rect x="${badge.left}" y="${badge.top}" width="${badge.width}" height="${badge.height}" rx="${Math.round(badge.height / 2)}" fill="none" stroke="${colors.accent}" stroke-width="${strokeWidth(badge)}"/>${renderChromeText(text, copy, colors, style)}`;
    case "tag":
      return renderTag(badge, text, copy, colors);
    case "underline":
      return renderUnderline(badge, text, copy, colors);
    case "dots":
      return renderDots(badge, text, copy, colors);
    case "progress-bar":
      return renderProgressBar(badge, text, copy, colors);
  }
}

/**
 * Standalone SVG for the profile editor: the same markup the compositor paints,
 * on a small neutral backdrop sized like a 1080px-wide slide's badge strip.
 */
export function buildCreativeCarouselChromePreviewSvg({
  copy,
  colors,
  style,
  width = 360,
  height = 96,
}: {
  copy: CreativeCarouselChromeCopy;
  colors: CreativeCarouselChromeColors;
  style: CreativeCarouselChromeStyle;
  width?: number;
  height?: number;
}): string {
  const badgeHeight = 56;
  const fontSize = 26;
  const padding = 24;
  const badgeWidth = Math.min(
    width - 16,
    Math.max(108, Math.ceil(creativeCarouselChromeContentUnits(copy, style) * fontSize) + padding * 2),
  );
  const badge = {
    left: Math.round((width - badgeWidth) / 2),
    top: Math.round((height - badgeHeight) / 2),
    width: badgeWidth,
    height: badgeHeight,
  };
  const markup = renderCreativeCarouselChromeMarkup({
    badge,
    text: {
      centerX: Math.round(badge.left + badge.width / 2),
      centerY: Math.round(badge.top + badge.height / 2),
      fontSize,
    },
    copy,
    colors,
    style,
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xml:space="preserve"><defs><linearGradient id="backdrop" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#C9C3B8"/><stop offset="1" stop-color="#5B6670"/></linearGradient></defs><rect width="${width}" height="${height}" fill="url(#backdrop)"/>${markup}</svg>`;
}

export function estimatedTextUnits(text: string): number {
  let units = 0;
  for (const character of [...text]) {
    if (/\s/u.test(character)) units += 0.32;
    else if (/[.,:;'!|ilI1·]/u.test(character)) units += 0.28;
    else if (/[MW@#%]/u.test(character)) units += 0.82;
    else if (/\p{Extended_Pictographic}/u.test(character)) units += 1;
    else units += 0.56;
  }
  return Math.max(units, 1);
}

export function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

// Compositor version 1 markup. Keep byte-identical so historical assets
// regenerate exactly.
function legacyBadgeRect(
  badge: CreativeCarouselPixelRect,
  colors: CreativeCarouselChromeColors,
  style: "pill" | "minimal",
): string {
  return style === "pill"
    ? `<rect x="${badge.left}" y="${badge.top}" width="${badge.width}" height="${badge.height}" rx="${Math.round(badge.height / 2)}" fill="${colors.background}" fill-opacity="0.88" stroke="${colors.accent}" stroke-width="2"/>`
    : `<rect x="${badge.left}" y="${badge.top}" width="${badge.width}" height="${badge.height}" rx="${Math.round(badge.height / 4)}" fill="${colors.background}" fill-opacity="0.38"/>`;
}

function renderTag(
  badge: CreativeCarouselPixelRect,
  text: CreativeCarouselChromeText,
  copy: CreativeCarouselChromeCopy,
  colors: CreativeCarouselChromeColors,
): string {
  const stripe = Math.max(3, Math.round(badge.height * 0.1));
  return [
    `<rect x="${badge.left}" y="${badge.top}" width="${badge.width}" height="${badge.height}" fill="${colors.background}"/>`,
    `<rect x="${badge.left}" y="${badge.top}" width="${stripe}" height="${badge.height}" fill="${colors.accent}"/>`,
    renderChromeText(text, copy, colors, "tag"),
  ].join("");
}

function renderUnderline(
  badge: CreativeCarouselPixelRect,
  text: CreativeCarouselChromeText,
  copy: CreativeCarouselChromeCopy,
  colors: CreativeCarouselChromeColors,
): string {
  const thickness = Math.max(3, Math.round(badge.height * 0.07));
  const lineWidth = Math.min(
    badge.width,
    Math.ceil(estimatedTextUnits(copy.visibleText) * text.fontSize),
  );
  const lineLeft = Math.round(text.centerX - lineWidth / 2);
  const lineTop = Math.round(text.centerY + text.fontSize * 0.62);
  const shifted = { ...text, centerY: text.centerY - Math.round(thickness / 2) };
  return [
    renderChromeText(shifted, copy, colors, "underline"),
    `<rect x="${lineLeft}" y="${lineTop - Math.round(thickness / 2)}" width="${lineWidth}" height="${thickness}" rx="${Math.round(thickness / 2)}" fill="${colors.accent}"/>`,
  ].join("");
}

function renderDots(
  badge: CreativeCarouselPixelRect,
  text: CreativeCarouselChromeText,
  copy: CreativeCarouselChromeCopy,
  colors: CreativeCarouselChromeColors,
): string {
  const { current, total } = parseProgress(copy.progress);
  const fontSize = text.fontSize;
  const pitch = fontSize * DOT_PITCH_EM;
  const radius = Math.max(2, Math.round(fontSize * DOT_RADIUS_EM));
  const contentWidth = creativeCarouselChromeContentUnits(copy, "dots") * fontSize;
  const start = text.centerX - contentWidth / 2;
  const parts = [
    `<rect x="${badge.left}" y="${badge.top}" width="${badge.width}" height="${badge.height}" rx="${Math.round(badge.height / 2)}" fill="${colors.background}" fill-opacity="0.88"/>`,
  ];
  for (let index = 1; index <= total; index += 1) {
    const cx = Math.round(start + fontSize * DOT_RADIUS_EM + (index - 1) * pitch);
    parts.push(
      index === current
        ? `<circle cx="${cx}" cy="${text.centerY}" r="${Math.round(radius * 1.35)}" fill="${colors.accent}"/>`
        : `<circle cx="${cx}" cy="${text.centerY}" r="${radius}" fill="${colors.text}" fill-opacity="0.45"/>`,
    );
  }
  if (copy.continuationCue) {
    const cueLeft = Math.round(start + dotsWidthUnits(total) * fontSize);
    parts.push(
      `<text x="${cueLeft}" y="${text.centerY}" text-anchor="start" dominant-baseline="middle" font-family="${FONT_FAMILY}" font-size="${fontSize}" font-weight="500">`,
      `<tspan fill="${colors.text}">${escapeXml(dotsCueText(copy.continuationCue).slice(0, -2))} </tspan>`,
      `<tspan fill="${colors.accent}" font-weight="600">→</tspan>`,
      "</text>",
    );
  }
  return parts.join("");
}

function renderProgressBar(
  badge: CreativeCarouselPixelRect,
  text: CreativeCarouselChromeText,
  copy: CreativeCarouselChromeCopy,
  colors: CreativeCarouselChromeColors,
): string {
  const { current, total } = parseProgress(copy.progress);
  const barHeight = Math.max(3, Math.round(badge.height * 0.08));
  const inset = Math.round(badge.height * 0.32);
  const trackWidth = Math.max(1, badge.width - inset * 2);
  const trackTop = badge.top + badge.height - Math.round(badge.height * 0.22) - barHeight;
  const filled = Math.max(barHeight, Math.round((trackWidth * current) / total));
  const lifted = {
    ...text,
    centerY: Math.round(badge.top + (trackTop - badge.top) / 2 + badge.height * 0.04),
    fontSize: Math.round(text.fontSize * 0.9),
  };
  return [
    `<rect x="${badge.left}" y="${badge.top}" width="${badge.width}" height="${badge.height}" rx="${Math.round(badge.height / 4)}" fill="${colors.background}" fill-opacity="0.88"/>`,
    renderChromeText(lifted, copy, colors, "progress-bar"),
    `<rect x="${badge.left + inset}" y="${trackTop}" width="${trackWidth}" height="${barHeight}" rx="${Math.round(barHeight / 2)}" fill="${colors.text}" fill-opacity="0.3"/>`,
    `<rect x="${badge.left + inset}" y="${trackTop}" width="${filled}" height="${barHeight}" rx="${Math.round(barHeight / 2)}" fill="${colors.accent}"/>`,
  ].join("");
}

function renderChromeText(
  text: CreativeCarouselChromeText,
  copy: CreativeCarouselChromeCopy,
  colors: CreativeCarouselChromeColors,
  style: CreativeCarouselChromeStyle,
): string {
  const shared = `x="${text.centerX}" y="${text.centerY}" text-anchor="middle" dominant-baseline="middle" font-family="${FONT_FAMILY}" font-size="${text.fontSize}"`;
  if (!copy.continuationCue) {
    return `<text ${shared} font-weight="700" fill="${style === "pill" ? colors.accent : colors.text}">${escapeXml(copy.progress)}</text>`;
  }

  return [
    `<text ${shared} font-weight="600">`,
    `<tspan fill="${colors.accent}">${escapeXml(copy.progress)}</tspan>`,
    `<tspan fill="${colors.text}" font-weight="500"> · ${escapeXml(copy.continuationCue)} </tspan>`,
    `<tspan fill="${colors.accent}">→</tspan>`,
    "</text>",
  ].join("");
}

function strokeWidth(badge: CreativeCarouselPixelRect): number {
  return Math.max(2, Math.round(badge.height * 0.05));
}

function dotsWidthUnits(total: number): number {
  return (total - 1) * DOT_PITCH_EM + DOT_RADIUS_EM * 2;
}

function dotsCueText(cue: string): string {
  return `  ${cue} →`;
}

function parseProgress(progress: string): { current: number; total: number } {
  const match = /^(\d+)\/(\d+)$/u.exec(progress);
  const current = Number(match?.[1]);
  const total = Number(match?.[2]);
  if (!match || current < 1 || total < current) {
    throw new Error(`Invalid carousel progress "${progress}".`);
  }
  return { current, total };
}
