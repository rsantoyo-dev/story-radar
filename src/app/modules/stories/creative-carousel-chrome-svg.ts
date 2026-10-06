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
    case "brush":
      return renderBrush(badge, text, copy, colors, seededRandom(style, copy));
    case "blob":
      return renderBlob(badge, text, copy, colors, seededRandom(style, copy));
    case "sketch":
      return renderSketch(badge, text, copy, colors, seededRandom(style, copy));
    case "torn-paper":
      return renderTornPaper(badge, text, copy, colors, seededRandom(style, copy));
    case "sticker":
      return renderSticker(badge, text, copy, colors, seededRandom(style, copy));
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

// ---------------------------------------------------------------------------
// Irregular shapes. Every point is clamped to the badge so prompt reservation
// and logo avoidance still hold. Variation comes from a seed derived from the
// style and slide position: each slide differs slightly, but the same slide
// always produces the same bytes.

type Point = [number, number];
type Random = () => number;

function renderBrush(
  badge: CreativeCarouselPixelRect,
  text: CreativeCarouselChromeText,
  copy: CreativeCarouselChromeCopy,
  colors: CreativeCarouselChromeColors,
  random: Random,
): string {
  const { left, top, width, height } = badge;
  const right = left + width;
  const bottom = top + height;
  const wobble = height * 0.1;
  const ragged = height * 0.22;
  const steps = Math.max(4, Math.round(width / (height * 0.7)));
  const points: Point[] = [];
  for (let index = 0; index <= steps; index += 1) {
    points.push([left + ragged + ((width - ragged * 2) * index) / steps, top + random() * wobble]);
  }
  for (let index = 1; index < 5; index += 1) {
    const y = top + (height * index) / 5;
    points.push([right - (index % 2 === 0 ? random() * 0.3 : 0.6 + random() * 0.4) * ragged, y]);
  }
  for (let index = steps; index >= 0; index -= 1) {
    points.push([left + ragged + ((width - ragged * 2) * index) / steps, bottom - random() * wobble]);
  }
  for (let index = 4; index > 0; index -= 1) {
    const y = top + (height * index) / 5;
    points.push([left + (index % 2 === 0 ? random() * 0.3 : 0.6 + random() * 0.4) * ragged, y]);
  }
  const streakY = top + height * (0.14 + random() * 0.04);
  return [
    `<path d="${polygonPath(points, badge)}" fill="${colors.background}" fill-opacity="0.94"/>`,
    `<path d="${polygonPath(
      [
        [left + ragged * 1.4, streakY],
        [right - ragged * 1.6, streakY + random() * 2],
        [right - ragged * 1.8, streakY + 2],
        [left + ragged * 1.5, streakY + 2.5],
      ],
      badge,
    )}" fill="${colors.text}" fill-opacity="0.12"/>`,
    renderChromeText(text, copy, colors, "brush"),
  ].join("");
}

function renderBlob(
  badge: CreativeCarouselPixelRect,
  text: CreativeCarouselChromeText,
  copy: CreativeCarouselChromeCopy,
  colors: CreativeCarouselChromeColors,
  random: Random,
): string {
  const cx = badge.left + badge.width / 2;
  const cy = badge.top + badge.height / 2;
  const halfWidth = badge.width / 2;
  const halfHeight = badge.height / 2;
  const count = 12;
  const offset = random() * Math.PI * 2;
  const points: Point[] = [];
  for (let index = 0; index < count; index += 1) {
    const angle = offset + (Math.PI * 2 * index) / count;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    // Superellipse keeps the text area wide; jitter makes it organic.
    const scale = 0.76 + random() * 0.24;
    points.push([
      cx + halfWidth * (0.9 + random() * 0.1) * Math.sign(cos) * Math.abs(cos) ** 0.45,
      cy + halfHeight * scale * Math.sign(sin) * Math.abs(sin) ** 0.8,
    ]);
  }
  return `<path d="${smoothClosedPath(points, badge)}" fill="${colors.background}" fill-opacity="0.92"/>${renderChromeText(text, copy, colors, "blob")}`;
}

function renderSketch(
  badge: CreativeCarouselPixelRect,
  text: CreativeCarouselChromeText,
  copy: CreativeCarouselChromeCopy,
  colors: CreativeCarouselChromeColors,
  random: Random,
): string {
  const stroke = strokeWidth(badge);
  const jitter = badge.height * 0.07;
  const inner = insetRect(badge, stroke + jitter);
  const outline = () =>
    wobblyRectPoints(inner, Math.max(3, Math.round(badge.width / (badge.height * 1.2))), jitter, random);
  return [
    `<path d="${polygonPath(outline(), badge)}" fill="${colors.background}" fill-opacity="0.85"/>`,
    `<path d="${polygonPath(outline(), badge)}" fill="none" stroke="${colors.accent}" stroke-width="${stroke}" stroke-linejoin="round"/>`,
    `<path d="${polygonPath(outline(), badge)}" fill="none" stroke="${colors.accent}" stroke-width="${Math.max(1, Math.round(stroke / 2))}" stroke-opacity="0.6" stroke-linejoin="round"/>`,
    renderChromeText(text, copy, colors, "sketch"),
  ].join("");
}

function renderTornPaper(
  badge: CreativeCarouselPixelRect,
  text: CreativeCarouselChromeText,
  copy: CreativeCarouselChromeCopy,
  colors: CreativeCarouselChromeColors,
  random: Random,
): string {
  const { left, top, width, height } = badge;
  const right = left + width;
  const bottom = top + height;
  const tooth = height * 0.14;
  const step = height * 0.22;
  const points: Point[] = [];
  for (let x = left; x < right; x += step * (0.7 + random() * 0.6)) {
    points.push([x, top + random() * tooth]);
  }
  points.push([right, top + random() * tooth]);
  for (let x = right; x > left; x -= step * (0.7 + random() * 0.6)) {
    points.push([x, bottom - random() * tooth]);
  }
  points.push([left, bottom - random() * tooth]);
  return `<path d="${polygonPath(points, badge)}" fill="${colors.background}" fill-opacity="0.96"/>${renderChromeText(text, copy, colors, "torn-paper")}`;
}

function renderSticker(
  badge: CreativeCarouselPixelRect,
  text: CreativeCarouselChromeText,
  copy: CreativeCarouselChromeCopy,
  colors: CreativeCarouselChromeColors,
  random: Random,
): string {
  const shadow = Math.max(2, Math.round(badge.height * 0.07));
  const availableWidth = badge.width - shadow;
  const availableHeight = badge.height - shadow;
  // Long badges tilt less so the sticker keeps at least ~80% of its height.
  const maxRadians = Math.atan((availableHeight * 0.2) / availableWidth);
  const direction = random() < 0.5 ? -1 : 1;
  const radians = Math.min(((1.5 + random() * 1.5) * Math.PI) / 180, maxRadians);
  const degrees = (direction * radians * 180) / Math.PI;
  // Largest rectangle whose rotated bounding box stays inside the badge.
  const sin = Math.sin(radians);
  const cos = Math.cos(radians);
  const height = Math.max(
    1,
    (availableHeight - (availableWidth * sin) / cos) / (cos - (sin * sin) / cos),
  );
  const width = Math.max(1, (availableWidth - height * sin) / cos);
  const cx = badge.left + availableWidth / 2;
  const cy = badge.top + availableHeight / 2;
  const rect = (dx: number, fill: string, opacity: string) =>
    `<rect x="${fixed(cx - width / 2 + dx)}" y="${fixed(cy - height / 2 + dx)}" width="${fixed(width)}" height="${fixed(height)}" rx="${fixed(height * 0.22)}" fill="${fill}"${opacity}/>`;
  const centeredText = { ...text, centerX: Math.round(cx), centerY: Math.round(cy) };
  return [
    `<g transform="rotate(${fixed(degrees)} ${fixed(cx)} ${fixed(cy)})">`,
    rect(shadow, colors.accent, ""),
    rect(0, colors.background, ""),
    renderChromeText(centeredText, copy, colors, "sticker"),
    "</g>",
  ].join("");
}

function wobblyRectPoints(
  rect: CreativeCarouselPixelRect,
  segmentsPerLongEdge: number,
  jitter: number,
  random: Random,
): Point[] {
  const { left, top, width, height } = rect;
  const right = left + width;
  const bottom = top + height;
  const wobble = () => (random() - 0.5) * 2 * jitter;
  const points: Point[] = [];
  for (let index = 0; index < segmentsPerLongEdge; index += 1) {
    points.push([left + (width * index) / segmentsPerLongEdge + wobble(), top + wobble()]);
  }
  points.push([right + wobble(), top + wobble()], [right + wobble(), bottom + wobble()]);
  for (let index = segmentsPerLongEdge - 1; index > 0; index -= 1) {
    points.push([left + (width * index) / segmentsPerLongEdge + wobble(), bottom + wobble()]);
  }
  points.push([left + wobble(), bottom + wobble()]);
  return points;
}

function polygonPath(points: Point[], bounds: CreativeCarouselPixelRect): string {
  return `${points
    .map(([x, y], index) => `${index === 0 ? "M" : "L"}${fixed(clampX(x, bounds))} ${fixed(clampY(y, bounds))}`)
    .join(" ")} Z`;
}

/** Closed Catmull-Rom spline converted to cubic Béziers, clamped to bounds. */
function smoothClosedPath(points: Point[], bounds: CreativeCarouselPixelRect): string {
  const at = (index: number) => points[(index + points.length) % points.length]!;
  const parts = [`M${fixed(clampX(at(0)[0], bounds))} ${fixed(clampY(at(0)[1], bounds))}`];
  for (let index = 0; index < points.length; index += 1) {
    const [p0, p1, p2, p3] = [at(index - 1), at(index), at(index + 1), at(index + 2)];
    const c1: Point = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2: Point = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    parts.push(
      `C${[c1, c2, p2].map(([x, y]) => `${fixed(clampX(x, bounds))} ${fixed(clampY(y, bounds))}`).join(" ")}`,
    );
  }
  return `${parts.join(" ")} Z`;
}

function insetRect(rect: CreativeCarouselPixelRect, inset: number): CreativeCarouselPixelRect {
  return {
    left: rect.left + inset,
    top: rect.top + inset,
    width: Math.max(1, rect.width - inset * 2),
    height: Math.max(1, rect.height - inset * 2),
  };
}

function clampX(x: number, bounds: CreativeCarouselPixelRect): number {
  return Math.min(bounds.left + bounds.width, Math.max(bounds.left, x));
}

function clampY(y: number, bounds: CreativeCarouselPixelRect): number {
  return Math.min(bounds.top + bounds.height, Math.max(bounds.top, y));
}

function fixed(value: number): string {
  return String(Math.round(value * 10) / 10);
}

/** Mulberry32 seeded from the style and slide progress: stable per slide. */
function seededRandom(style: string, copy: CreativeCarouselChromeCopy): Random {
  let seed = 2166136261;
  for (const character of `${style}:${copy.progress}`) {
    seed = Math.imul(seed ^ character.charCodeAt(0), 16777619);
  }
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let value = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
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
