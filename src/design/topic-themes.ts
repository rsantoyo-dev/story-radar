import type { CSSProperties } from "react";

import themeData from "./topic-themes.json";
import {
  contrastRatio,
  fitContrast,
  hexToOklch,
  oklchToHex,
  readableInk,
} from "./color/oklch";

const PALETTE_ROLES = [
  "primary",
  "secondary",
  "surface",
  "tertiary",
  "dark",
  "neutral",
  "light",
] as const;

const PALETTE_TONES = ["main", "light", "dark", "contrast"] as const;

type PaletteRole = (typeof PALETTE_ROLES)[number];
type PaletteTone = (typeof PALETTE_TONES)[number];

type BrandPaletteThemeInput = {
  brandPalette: readonly {
    name?: string;
    color: string;
    role?: "primary" | "secondary" | "surface";
  }[];
  carouselChrome: {
    backgroundColor: string;
    textColor: string;
    accentColor: string;
  };
};

export type TopicThemeKey =
  | "press-green"
  | "signal-blue"
  | "culture-amber"
  | "focus-coral";

export type TopicTheme = {
  key: TopicThemeKey;
  label: string;
  description: string;
  palette: Record<PaletteRole, Record<PaletteTone, string>>;
};

export type BrandUiPalette = TopicTheme["palette"];

/** The derived palette plus any human-readable adjustments the engine made. */
export type BrandUiDerivation = {
  palette: BrandUiPalette;
  warnings: string[];
};

export const DEFAULT_TOPIC_THEME_KEY: TopicThemeKey = "press-green";

export const TOPIC_THEMES = themeData.themes as TopicTheme[];

const themesByKey = new Map(TOPIC_THEMES.map((theme) => [theme.key, theme]));

export function isTopicThemeKey(value: unknown): value is TopicThemeKey {
  return typeof value === "string" && themesByKey.has(value as TopicThemeKey);
}

export function getTopicTheme(themeKey?: string): TopicTheme {
  return (
    themesByKey.get(themeKey as TopicThemeKey) ??
    themesByKey.get(DEFAULT_TOPIC_THEME_KEY)!
  );
}

type TopicThemeStyle = CSSProperties &
  Record<`--ds__palette__${PaletteRole}-${PaletteTone}`, string>;

/**
 * UXDSL resolves palette() to CSS variables. Overriding those tokens on the
 * dashboard root switches only the selected topic's palette — either a
 * predefined theme or one derived from the topic's brand colours.
 */
export function topicThemeStyle(
  themeKey?: string,
  brandTheme?: BrandPaletteThemeInput,
): TopicThemeStyle {
  const theme = getTopicTheme(themeKey);
  const palette = brandTheme
    ? deriveBrandUiPalette(brandTheme, theme.palette).palette
    : theme.palette;
  const style = {} as TopicThemeStyle;

  for (const role of PALETTE_ROLES) {
    for (const tone of PALETTE_TONES) {
      style[`--ds__palette__${role}-${tone}`] = palette[role][tone];
    }
  }

  return style;
}

/**
 * Back-compat wrapper: some callers only want the palette record.
 * Prefer {@link deriveBrandUiPalette} when the warnings matter (editor preview).
 */
export function brandPaletteTopicTheme(
  brandTheme: BrandPaletteThemeInput,
  fallback: BrandUiPalette = getTopicTheme().palette,
): BrandUiPalette {
  return deriveBrandUiPalette(brandTheme, fallback).palette;
}

const HEX_COLOR_PATTERN = /^#[0-9a-f]{6}$/i;

// Per-role recipe for turning a seed hex into a four-tone ramp. The brand hue
// is always preserved; lightness and (clamped) chroma are what move.
const ROLE_SPEC: Record<
  PaletteRole,
  {
    /**
     * How far `main` lightness may sit. Brand-seed roles (primary, secondary)
     * get near-full range so the picked colour survives; shell roles are pinned
     * to a band so the app frame stays usable for any brand.
     */
    mainRange: [number, number];
    lightL: number;
    darkL: number;
    maxChroma: number;
    /** Minimum contrast for this role's `contrast` tone against its `main`. */
    contrastTarget: number;
  }
> = {
  // Buttons, links, headings — the brand colour, untouched while it is readable.
  primary: {
    mainRange: [0.16, 0.9],
    lightL: 0.93,
    darkL: 0.4,
    maxChroma: 0.2,
    contrastTarget: 4.5,
  },
  // Badges, secondary actions, highlights.
  secondary: {
    mainRange: [0.16, 0.9],
    lightL: 0.93,
    darkL: 0.42,
    maxChroma: 0.2,
    contrastTarget: 4.5,
  },
  // Page and card backgrounds — near-white, barely tinted.
  surface: {
    mainRange: [0.97, 0.995],
    lightL: 0.998,
    darkL: 0.9,
    maxChroma: 0.012,
    contrastTarget: 7,
  },
  // Muted captions and metadata (used mostly via `tertiary-dark`).
  tertiary: {
    mainRange: [0.5, 0.66],
    lightL: 0.92,
    darkL: 0.44,
    maxChroma: 0.05,
    contrastTarget: 4.5,
  },
  // Sidebar / nav shell.
  dark: {
    mainRange: [0.14, 0.22],
    lightL: 0.32,
    darkL: 0.12,
    maxChroma: 0.045,
    contrastTarget: 4.5,
  },
  // Borders, dividers, muted fills.
  neutral: {
    mainRange: [0.52, 0.62],
    lightL: 0.92,
    darkL: 0.34,
    maxChroma: 0.012,
    contrastTarget: 4.5,
  },
  // Raised near-white surfaces (chips, inset cards).
  light: {
    mainRange: [0.975, 0.998],
    lightL: 0.995,
    darkL: 0.9,
    maxChroma: 0.008,
    contrastTarget: 7,
  },
};

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

function toneScale(
  seedHex: string,
  spec: (typeof ROLE_SPEC)[PaletteRole],
): Record<PaletteTone, string> {
  const seed = hexToOklch(seedHex);
  const chroma = Math.min(seed.C, spec.maxChroma);
  let main = oklchToHex({
    L: clamp(seed.L, spec.mainRange[0], spec.mainRange[1]),
    C: chroma,
    h: seed.h,
  });

  let contrast = readableInk(main, spec.contrastTarget);
  // If the seed still cannot host readable ink at either lightness extreme,
  // move `main` itself (hue kept) until the ink fits.
  if (contrastRatio(contrast, main) < spec.contrastTarget) {
    main = fitContrast(main, contrast, spec.contrastTarget);
    contrast = readableInk(main, spec.contrastTarget);
  }

  return {
    main,
    light: oklchToHex({
      L: spec.lightL,
      C: Math.min(chroma, spec.maxChroma * 0.6),
      h: seed.h,
    }),
    dark: oklchToHex({ L: spec.darkL, C: chroma, h: seed.h }),
    contrast,
  };
}

function hueGap(a: number, b: number): number {
  const diff = Math.abs(a - b) % 360;
  return diff > 180 ? 360 - diff : diff;
}

function circularHueMean(a: number, b: number): number {
  const radians = [a, b].map((hue) => (hue * Math.PI) / 180);
  const angle = Math.atan2(
    radians.reduce((sum, value) => sum + Math.sin(value), 0),
    radians.reduce((sum, value) => sum + Math.cos(value), 0),
  );
  return ((angle * 180) / Math.PI + 360) % 360;
}

function hasMeaningfulBrandAdjustment(seed: string, derived: string): boolean {
  const source = hexToOklch(seed);
  const output = hexToOklch(derived);
  return Math.abs(output.L - source.L) > 0.06 || Math.abs(output.C - source.C) > 0.025;
}

function pickSeeds(
  colors: readonly { color: string; role?: string }[],
  chrome: BrandPaletteThemeInput["carouselChrome"],
): { primary: string; secondary: string; surfaceHue: string } {
  const normalized = colors.map((entry) => entry.color.toUpperCase());
  const known = new Set(normalized);
  const inPalette = (value: string): string | undefined => {
    const upper = value.toUpperCase();
    return known.has(upper) ? upper : undefined;
  };
  const byRole = (role: string): string | undefined =>
    colors.find((entry) => entry.role === role)?.color.toUpperCase();

  const primary =
    byRole("primary") ??
    inPalette(chrome.backgroundColor) ??
    normalized[0]!;

  const distinctSecondary = normalized.find(
    (color) =>
      color !== primary &&
      hueGap(hexToOklch(color).h, hexToOklch(primary).h) > 18,
  );
  const secondary =
    byRole("secondary") ??
    inPalette(chrome.accentColor) ??
    distinctSecondary ??
    // Nothing distinct on hand: swing to the complementary hue of primary.
    oklchToHex({ ...hexToOklch(primary), h: (hexToOklch(primary).h + 180) % 360 });

  const surfaceHue =
    byRole("surface") ?? inPalette(chrome.textColor) ?? primary;

  return { primary, secondary, surfaceHue };
}

/**
 * Derive the seven UXDSL palette roles from a topic's brand palette so the app
 * UI carries the brand without becoming unreadable.
 *
 * Rules that keep it usable regardless of the seed colours:
 * - Only `primary` / `secondary` / `surface` (role-tagged, with legacy carousel
 *   colours as fallback) seed the theme; other palette entries stay swatches.
 * - Working surfaces (page, cards, borders, body text) are a near-neutral ramp
 *   that borrows only the brand hue at very low chroma.
 * - Brand colours land at full strength on buttons, badges, links and the nav.
 * - Every text/background pair the theme emits is measured and, if it misses
 *   its WCAG floor, the lightness is repaired and a warning is recorded.
 */
export function deriveBrandUiPalette(
  brandTheme: BrandPaletteThemeInput,
  fallback: BrandUiPalette = getTopicTheme().palette,
): BrandUiDerivation {
  const colors = brandTheme.brandPalette
    .filter((entry) => HEX_COLOR_PATTERN.test(entry.color))
    .map((entry) => ({ color: entry.color.toUpperCase(), role: entry.role }));
  if (colors.length === 0) {
    return { palette: fallback, warnings: [] };
  }

  const warnings: string[] = [];
  const { primary, secondary, surfaceHue } = pickSeeds(
    colors,
    brandTheme.carouselChrome,
  );

  const primarySeed = hexToOklch(primary);
  if (hueGap(primarySeed.h, hexToOklch(secondary).h) < 12) {
    warnings.push(
      "Primary and secondary brand colours are very close in hue; badges and secondary actions may be hard to tell apart.",
    );
  }

  const primaryHueHex = oklchToHex({ L: 0.5, C: 0.03, h: primarySeed.h });
  const surfaceSeedHex = oklchToHex({
    L: 0.99,
    C: 0.01,
    h: hexToOklch(surfaceHue).h,
  });
  const tertiarySeedHex = oklchToHex({
    L: 0.58,
    C: 0.05,
    h: circularHueMean(primarySeed.h, hexToOklch(secondary).h),
  });

  const palette: BrandUiPalette = {
    primary: toneScale(primary, ROLE_SPEC.primary),
    secondary: toneScale(secondary, ROLE_SPEC.secondary),
    surface: toneScale(surfaceSeedHex, ROLE_SPEC.surface),
    tertiary: toneScale(tertiarySeedHex, ROLE_SPEC.tertiary),
    dark: toneScale(primaryHueHex, ROLE_SPEC.dark),
    neutral: toneScale(primaryHueHex, ROLE_SPEC.neutral),
    light: toneScale(surfaceSeedHex, ROLE_SPEC.light),
  };

  // The brand colour is kept verbatim unless it could not host readable text;
  // say so when the button/badge shade had to move.
  if (hasMeaningfulBrandAdjustment(primary, palette.primary.main)) {
    warnings.push(
      "Primary brand colour was adjusted for usable UI contrast or sRGB gamut, so buttons use the nearest workable shade of it.",
    );
  }
  if (hasMeaningfulBrandAdjustment(secondary, palette.secondary.main)) {
    warnings.push(
      "Secondary brand colour was adjusted for usable UI contrast or sRGB gamut, so badges use the nearest workable shade of it.",
    );
  }

  // Cross-role repairs: tones that are read against a different role's surface.
  const surfaceMain = palette.surface.main;

  const mutedBefore = palette.tertiary.dark;
  palette.tertiary.dark = fitContrast(mutedBefore, surfaceMain, 4.5);
  palette.neutral.dark = fitContrast(palette.neutral.dark, surfaceMain, 4.5);

  // Panel borders must be visible but quiet against the surface.
  if (contrastRatio(palette.surface.dark, surfaceMain) < 1.35) {
    palette.surface.dark = oklchToHex({
      ...hexToOklch(surfaceMain),
      L: Math.max(0, hexToOklch(surfaceMain).L - 0.09),
    });
  }
  palette.light.dark = palette.surface.dark;

  if (hasMeaningfulBrandAdjustment(surfaceHue, surfaceMain)) {
    warnings.push(
      "Surface brand colour was converted into a near-white app surface so long text stays comfortable to read.",
    );
  }

  // Final audit: anything still short of its floor is surfaced to the editor.
  const audit: [string, number, number][] = [
    [
      "Body text on the page",
      contrastRatio(palette.surface.contrast, surfaceMain),
      7,
    ],
    [
      "Label on primary buttons",
      contrastRatio(palette.primary.contrast, palette.primary.main),
      4.5,
    ],
    [
      "Text on secondary badges",
      contrastRatio(palette.secondary.contrast, palette.secondary.main),
      4.5,
    ],
    [
      "Sidebar text",
      contrastRatio(palette.dark.contrast, palette.dark.main),
      4.5,
    ],
    ["Muted captions", contrastRatio(palette.tertiary.dark, surfaceMain), 4.5],
  ];
  for (const [label, ratio, floor] of audit) {
    if (ratio < floor) {
      warnings.push(
        `${label} still falls slightly under the recommended contrast (${ratio.toFixed(
          1,
        )}:1 vs ${floor}:1). Consider a different brand colour for that role.`,
      );
    }
  }

  return { palette, warnings };
}
