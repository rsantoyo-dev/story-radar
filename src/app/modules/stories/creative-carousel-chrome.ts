import sharp from "sharp";

import {
  DEFAULT_CREATIVE_CAROUSEL_CHROME_SETTINGS,
  type CreativeAspectRatio,
  type CreativeCarouselChromeSettings,
  type CreativeCarouselChromeStyle,
} from "./creative-content.types";
import { creativeCanvasDimensions } from "./creative-brand-overlay";

const BADGE_HEIGHT_PERCENT = 5.2;
const BADGE_BOTTOM_INSET_PERCENT = 2.2;
const BADGE_HORIZONTAL_INSET_PERCENT = 2.2;
const BADGE_MIN_WIDTH_PERCENT = 10;
const BADGE_MAX_WIDTH_PERCENT = 60;
const LOGO_SAFETY_GAP_PERCENT = 1.5;

export const DEFAULT_CREATIVE_CAROUSEL_CHROME_COLORS = {
  /** Neutral editorial navy used by the current Canada campaign system. */
  background: "#102A43",
  /** Warm neutral for high-contrast navigation copy. */
  text: "#F6F0E4",
  /** Editorial gold for progress and directional emphasis. */
  accent: "#E8A83E",
} as const satisfies CreativeCarouselChromeColors;

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

type CreativeCarouselChromeCanvas = { width: number; height: number };

export type CreativeCarouselChromeGeometry =
  | {
      canvas: CreativeCarouselChromeCanvas;
      /** The only area reserved from the image model and painted afterward. */
      badge: CreativeCarouselPixelRect;
      text: CreativeCarouselChromeText;
      layout: "full" | "adapted";
      skipReason?: never;
    }
  | {
      canvas: CreativeCarouselChromeCanvas;
      layout: "skipped";
      skipReason: "disabled" | "no-safe-region" | "copy-does-not-fit";
      badge?: never;
      text?: never;
    };

export type CreativeCarouselChromeOverlay = {
  /** Full-canvas SVG buffer accepted directly by Sharp's composite operation. */
  input: Buffer;
  left: 0;
  top: 0;
};

export type CreativeCarouselChrome = {
  copy: CreativeCarouselChromeCopy;
  colors: CreativeCarouselChromeColors;
  style: CreativeCarouselChromeStyle;
  geometry: CreativeCarouselChromeGeometry;
  /** Undefined when the chrome was skipped to protect a logo or legibility. */
  promptReservation?: string;
  /** Undefined when the chrome was skipped to protect a logo or legibility. */
  overlay?: CreativeCarouselChromeOverlay;
};

export type CreativeCarouselChromeInput = {
  aspectRatio: CreativeAspectRatio;
  unitOrder: number;
  totalSlides: number;
  /** Editor/model supplied copy only. This module never invents a cue. */
  continuationCue?: string;
  settings?: CreativeCarouselChromeSettings;
  colors?: Partial<CreativeCarouselChromeColors>;
  /**
   * Pixel coordinates on the final output canvas. Pass the brand compositor's
   * occupied/exclusion rectangle when its logo applies to this unit.
   */
  logoExclusionZone?: CreativeCarouselPixelRect;
};

/**
 * Builds deterministic carousel navigation copy, geometry, prompt reservation,
 * and a full-canvas SVG overlay. It does not call or derive text from an AI.
 */
export function buildCreativeCarouselChrome(
  input: CreativeCarouselChromeInput,
): CreativeCarouselChrome {
  let copy = buildCreativeCarouselChromeCopy(input);
  const settings = normalizeSettings(input.settings);
  const colors = normalizeColors({
    background: settings.backgroundColor,
    text: settings.textColor,
    accent: settings.accentColor,
    ...input.colors,
  });
  if (!settings.enabled) {
    return {
      copy,
      colors,
      style: settings.style,
      geometry: {
        canvas: creativeCanvasDimensions(input.aspectRatio),
        layout: "skipped",
        skipReason: "disabled",
      },
    };
  }
  let geometry = computeCreativeCarouselChromeGeometry({
    aspectRatio: input.aspectRatio,
    copy,
    logoExclusionZone: input.logoExclusionZone,
  });

  // An editor can intentionally keep a longer semantic cue. If it cannot fit
  // safely, preserve deterministic progress instead of dropping the badge.
  if (geometry.layout === "skipped" && copy.continuationCue) {
    copy = withoutContinuationCue(copy);
    geometry = computeCreativeCarouselChromeGeometry({
      aspectRatio: input.aspectRatio,
      copy,
      logoExclusionZone: input.logoExclusionZone,
    });
  }
  const model = { copy, colors, style: settings.style, geometry };

  if (geometry.layout === "skipped") {
    return model;
  }

  return {
    ...model,
    promptReservation: buildCreativeCarouselChromeReservationPrompt(geometry),
    overlay: {
      input: renderCreativeCarouselChromeSvg(model),
      left: 0,
      top: 0,
    },
  };
}

export function buildCreativeCarouselChromeCopy({
  unitOrder,
  totalSlides,
  continuationCue,
}: Pick<
  CreativeCarouselChromeInput,
  "unitOrder" | "totalSlides" | "continuationCue"
>): CreativeCarouselChromeCopy {
  assertPositiveInteger(unitOrder, "Carousel unit order");
  assertPositiveInteger(totalSlides, "Carousel total slides");
  if (unitOrder > totalSlides) {
    throw new CreativeCarouselChromeError(
      "Carousel unit order cannot exceed the total slide count.",
    );
  }

  const progress = `${unitOrder}/${totalSlides}`;
  const hasNextSlide = unitOrder < totalSlides;
  const normalizedCue = hasNextSlide
    ? normalizeContinuationCue(continuationCue)
    : undefined;
  const visibleText = normalizedCue
    ? `${progress} · ${normalizedCue} →`
    : progress;

  return {
    progress,
    ...(normalizedCue ? { continuationCue: normalizedCue } : {}),
    visibleText,
  };
}

export function computeCreativeCarouselChromeGeometry({
  aspectRatio,
  copy,
  logoExclusionZone,
}: {
  aspectRatio: CreativeAspectRatio;
  copy: CreativeCarouselChromeCopy;
  logoExclusionZone?: CreativeCarouselPixelRect;
}): CreativeCarouselChromeGeometry {
  const canvas = creativeCanvasDimensions(aspectRatio);
  const shortEdge = Math.min(canvas.width, canvas.height);
  const badgeHeight = Math.max(
    1,
    Math.round(shortEdge * (BADGE_HEIGHT_PERCENT / 100)),
  );
  const edgeInset = Math.max(
    1,
    Math.round(shortEdge * (BADGE_HORIZONTAL_INSET_PERCENT / 100)),
  );
  const bottomInset = Math.max(
    1,
    Math.round(shortEdge * (BADGE_BOTTOM_INSET_PERCENT / 100)),
  );
  const preferredFontSize = Math.round(shortEdge * 0.024);
  const horizontalTextPadding = edgeInset;
  const requestedWidth = Math.max(
    Math.round(shortEdge * (BADGE_MIN_WIDTH_PERCENT / 100)),
    Math.ceil(estimatedTextUnits(copy.visibleText) * preferredFontSize) +
      horizontalTextPadding * 2,
  );
  const maximumWidth = Math.min(
    canvas.width - edgeInset * 2,
    Math.round(shortEdge * (BADGE_MAX_WIDTH_PERCENT / 100)),
  );
  if (requestedWidth > maximumWidth) {
    return skippedGeometry(canvas, "copy-does-not-fit");
  }

  const placement = placeCompactBadge({
    canvas,
    width: requestedWidth,
    height: badgeHeight,
    edgeInset,
    bottomInset,
    logoExclusionZone,
    logoSafetyGap: Math.round(
      shortEdge * (LOGO_SAFETY_GAP_PERCENT / 100),
    ),
  });
  if (!placement) {
    return skippedGeometry(canvas, "no-safe-region");
  }

  const textRegion = {
    left: placement.rect.left + horizontalTextPadding,
    top: placement.rect.top,
    width: placement.rect.width - horizontalTextPadding * 2,
    height: placement.rect.height,
  };
  const fontSize = fitSingleLineFont(
    copy.visibleText,
    textRegion.width,
    preferredFontSize,
    Math.round(shortEdge * 0.021),
  );
  if (!fontSize) {
    return skippedGeometry(canvas, "copy-does-not-fit");
  }

  return {
    canvas,
    badge: placement.rect,
    text: {
      centerX: Math.round(textRegion.left + textRegion.width / 2),
      centerY: Math.round(textRegion.top + textRegion.height / 2),
      fontSize,
    },
    layout: placement.adapted ? "adapted" : "full",
  };
}

export function buildCreativeCarouselChromeReservationPrompt(
  geometry: CreativeCarouselChromeGeometry,
): string | undefined {
  if (geometry.layout === "skipped") return undefined;

  const badge = geometry.badge;
  const right = badge.left + badge.width;
  const bottom = badge.top + badge.height;

  return [
    "<CAROUSEL_CHROME_CONTRACT>",
    `FINAL CAROUSEL NAVIGATION LOCK: reserve only the compact bottom badge x=${badge.left}-${right}px and y=${badge.top}-${bottom}px for deterministic post-generation pagination.`,
    "Continue only the underlying background color or low-detail texture through this small badge area. Do not place visible text, faces, focal subjects, charts, data, icons, high-contrast edges, or important details inside or overlapping it.",
    "Do not render or approximate pagination, a continuation cue, arrow, navigation bar, pill, button, swipe instruction, or any other UI chrome. The exact approved compact overlay will be composited afterward.",
    geometry.layout === "adapted"
      ? "The badge position has already been moved outside the logo exclusion zone; keep both reserved areas independent."
      : "The compact badge does not intersect the logo exclusion zone.",
    "</CAROUSEL_CHROME_CONTRACT>",
  ].join(" ");
}

/** Ensures at most one carousel chrome contract in a prompt. */
export function appendCreativeCarouselChromeContract(
  prompt: string,
  contract: string | undefined,
): string {
  const withoutPreviousContract = prompt
    .replace(
      /<CAROUSEL_CHROME_CONTRACT>[\s\S]*?<\/CAROUSEL_CHROME_CONTRACT>/giu,
      "",
    )
    .trim();
  if (!contract?.trim()) return withoutPreviousContract;
  return `${withoutPreviousContract}\n\n${contract.trim()}`;
}

export function hasCreativeCarouselChromeContract(prompt: string): boolean {
  return /<CAROUSEL_CHROME_CONTRACT>[\s\S]*?<\/CAROUSEL_CHROME_CONTRACT>/iu.test(
    prompt,
  );
}

export function renderCreativeCarouselChromeSvg({
  copy,
  colors,
  style = "pill",
  geometry,
}: Pick<CreativeCarouselChrome, "copy" | "colors" | "geometry"> & {
  style?: CreativeCarouselChromeStyle;
}): Buffer {
  if (geometry.layout === "skipped") {
    throw new CreativeCarouselChromeError(
      "Skipped carousel chrome has no SVG overlay.",
    );
  }

  const badge = geometry.badge;
  const badgeRect =
    style === "pill"
      ? `<rect x="${badge.left}" y="${badge.top}" width="${badge.width}" height="${badge.height}" rx="${Math.round(badge.height / 2)}" fill="${colors.background}" fill-opacity="0.88" stroke="${colors.accent}" stroke-width="2"/>`
      : `<rect x="${badge.left}" y="${badge.top}" width="${badge.width}" height="${badge.height}" rx="${Math.round(badge.height / 4)}" fill="${colors.background}" fill-opacity="0.38"/>`;
  const text = renderChromeText(geometry.text, copy, colors, style);

  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${geometry.canvas.width}" height="${geometry.canvas.height}" viewBox="0 0 ${geometry.canvas.width} ${geometry.canvas.height}" xml:space="preserve">${badgeRect}${text}</svg>`,
  );
}

export async function compositeCreativeCarouselChrome({
  image,
  chrome,
}: {
  image: Uint8Array;
  chrome: CreativeCarouselChrome;
}): Promise<Buffer> {
  if (!chrome.overlay) return Buffer.from(image);

  const input = Buffer.from(image);
  const metadata = await sharp(input, { failOn: "error" }).metadata();
  if (
    metadata.format !== "png" ||
    metadata.width !== chrome.geometry.canvas.width ||
    metadata.height !== chrome.geometry.canvas.height
  ) {
    throw new CreativeCarouselChromeError(
      "Carousel chrome requires a normalized PNG matching its canvas.",
    );
  }

  return sharp(input, { failOn: "error" })
    .composite([chrome.overlay])
    .png()
    .toBuffer();
}

function renderChromeText(
  text: CreativeCarouselChromeText,
  copy: CreativeCarouselChromeCopy,
  colors: CreativeCarouselChromeColors,
  style: CreativeCarouselChromeStyle,
): string {
  const shared = `x="${text.centerX}" y="${text.centerY}" text-anchor="middle" dominant-baseline="middle" font-family="Arial, Helvetica, sans-serif" font-size="${text.fontSize}"`;
  if (!copy.continuationCue) {
    return `<text ${shared} font-weight="700" fill="${style === "minimal" ? colors.text : colors.accent}">${escapeXml(copy.progress)}</text>`;
  }

  return [
    `<text ${shared} font-weight="600">`,
    `<tspan fill="${colors.accent}">${escapeXml(copy.progress)}</tspan>`,
    `<tspan fill="${colors.text}" font-weight="500"> · ${escapeXml(copy.continuationCue)} </tspan>`,
    `<tspan fill="${colors.accent}">→</tspan>`,
    "</text>",
  ].join("");
}

function fitSingleLineFont(
  text: string,
  width: number,
  preferredSize: number,
  minimumSize: number,
): number | undefined {
  const units = estimatedTextUnits(text);
  const fitted = Math.min(preferredSize, Math.floor(width / units));
  return fitted >= minimumSize ? fitted : undefined;
}

function estimatedTextUnits(text: string): number {
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

function skippedGeometry(
  canvas: CreativeCarouselChromeCanvas,
  skipReason: "no-safe-region" | "copy-does-not-fit",
): CreativeCarouselChromeGeometry {
  return {
    canvas,
    layout: "skipped",
    skipReason,
  };
}

function placeCompactBadge({
  canvas,
  width,
  height,
  edgeInset,
  bottomInset,
  logoExclusionZone,
  logoSafetyGap,
}: {
  canvas: CreativeCarouselChromeCanvas;
  width: number;
  height: number;
  edgeInset: number;
  bottomInset: number;
  logoExclusionZone?: CreativeCarouselPixelRect;
  logoSafetyGap: number;
}): { rect: CreativeCarouselPixelRect; adapted: boolean } | undefined {
  const centered: CreativeCarouselPixelRect = {
    left: Math.round((canvas.width - width) / 2),
    top: canvas.height - bottomInset - height,
    width,
    height,
  };
  if (!logoExclusionZone) return { rect: centered, adapted: false };

  assertPixelRect(logoExclusionZone, "Logo exclusion zone");
  const logo = expandedClippedRect(
    logoExclusionZone,
    logoSafetyGap,
    canvas.width,
    canvas.height,
  );
  if (!rectsIntersect(centered, logo)) {
    return { rect: centered, adapted: false };
  }

  const horizontalLanes = [
    { left: edgeInset, right: logo.left },
    {
      left: logo.left + logo.width,
      right: canvas.width - edgeInset,
    },
  ]
    .filter((lane) => lane.right - lane.left >= width)
    .map((lane) => {
      const left = Math.max(
        lane.left,
        Math.min(centered.left, lane.right - width),
      );
      return {
        rect: { ...centered, left },
        distance: Math.abs(left + width / 2 - canvas.width / 2),
      };
    })
    .sort((left, right) => left.distance - right.distance);

  const best = horizontalLanes[0];
  return best ? { rect: best.rect, adapted: true } : undefined;
}

function expandedClippedRect(
  rect: CreativeCarouselPixelRect,
  gap: number,
  canvasWidth: number,
  canvasHeight: number,
): CreativeCarouselPixelRect {
  const left = Math.max(0, Math.floor(rect.left - gap));
  const top = Math.max(0, Math.floor(rect.top - gap));
  const right = Math.min(canvasWidth, Math.ceil(rect.left + rect.width + gap));
  const bottom = Math.min(
    canvasHeight,
    Math.ceil(rect.top + rect.height + gap),
  );
  return { left, top, width: right - left, height: bottom - top };
}

function rectsIntersect(
  left: CreativeCarouselPixelRect,
  right: CreativeCarouselPixelRect,
): boolean {
  return (
    left.left < right.left + right.width &&
    left.left + left.width > right.left &&
    left.top < right.top + right.height &&
    left.top + left.height > right.top
  );
}

function normalizeContinuationCue(value: string | undefined): string | undefined {
  let cue = value?.trim().replace(/\s+/gu, " ");
  if (!cue) return undefined;
  if (
    [...cue].some((character) => {
      const codePoint = character.codePointAt(0) ?? 0;
      return codePoint < 32 && codePoint !== 9 && codePoint !== 10 && codePoint !== 13;
    })
  ) {
    throw new CreativeCarouselChromeError(
      "Carousel continuation cues cannot contain control characters.",
    );
  }
  cue = cue
    .replace(
      /^(?:(?:desliza|swipe|contin[uú]a|continue|siguiente|next)(?:\s+(?:para|to))?)\s*[:·—–-]?\s*/iu,
      "",
    )
    .replace(/^[→›]+\s*|\s*[→›]+$/gu, "")
    .trim();
  if (!cue || /^(?:ver\s+m[aá]s|see\s+more|m[aá]s|more)$/iu.test(cue)) {
    return undefined;
  }
  return cue;
}

function withoutContinuationCue(
  copy: CreativeCarouselChromeCopy,
): CreativeCarouselChromeCopy {
  return {
    progress: copy.progress,
    visibleText: copy.progress,
  };
}

function normalizeColors(
  colors: Partial<CreativeCarouselChromeColors> | undefined,
): CreativeCarouselChromeColors {
  const result = { ...DEFAULT_CREATIVE_CAROUSEL_CHROME_COLORS, ...colors };
  for (const [name, value] of Object.entries(result)) {
    if (!/^#[\da-f]{6}$/iu.test(value)) {
      throw new CreativeCarouselChromeError(
        `Carousel chrome ${name} must use the #RRGGBB format.`,
      );
    }
  }
  return result;
}

function normalizeSettings(
  settings: CreativeCarouselChromeSettings | undefined,
): CreativeCarouselChromeSettings {
  const value = { ...DEFAULT_CREATIVE_CAROUSEL_CHROME_SETTINGS, ...settings };
  if (typeof value.enabled !== "boolean") {
    throw new CreativeCarouselChromeError("Carousel chrome enabled must be a boolean.");
  }
  if (value.style !== "pill" && value.style !== "minimal") {
    throw new CreativeCarouselChromeError("Carousel chrome style must be pill or minimal.");
  }
  return value;
}

function assertPixelRect(value: CreativeCarouselPixelRect, label: string): void {
  if (
    !Number.isFinite(value.left) ||
    !Number.isFinite(value.top) ||
    !Number.isFinite(value.width) ||
    !Number.isFinite(value.height) ||
    value.width <= 0 ||
    value.height <= 0
  ) {
    throw new CreativeCarouselChromeError(
      `${label} must contain finite coordinates and positive dimensions.`,
    );
  }
}

function assertPositiveInteger(value: number, label: string): void {
  if (!Number.isInteger(value) || value < 1) {
    throw new CreativeCarouselChromeError(`${label} must be a positive integer.`);
  }
}

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

export class CreativeCarouselChromeError extends Error {}
