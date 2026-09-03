import type { CSSProperties } from "react";

import themeData from "./topic-themes.json";

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

export const DEFAULT_TOPIC_THEME_KEY: TopicThemeKey = "press-green";

export const TOPIC_THEMES = themeData.themes as TopicTheme[];

const themesByKey = new Map(TOPIC_THEMES.map((theme) => [theme.key, theme]));

export function isTopicThemeKey(value: unknown): value is TopicThemeKey {
  return typeof value === "string" && themesByKey.has(value as TopicThemeKey);
}

export function getTopicTheme(themeKey?: string): TopicTheme {
  return themesByKey.get(themeKey as TopicThemeKey)
    ?? themesByKey.get(DEFAULT_TOPIC_THEME_KEY)!;
}

type TopicThemeStyle = CSSProperties & Record<`--ds__palette__${PaletteRole}-${PaletteTone}`, string>;

/**
 * UXDSL resolves palette() to CSS variables. Overriding those tokens on the
 * dashboard root switches only the selected topic's predefined palette.
 */
export function topicThemeStyle(
  themeKey?: string,
  brandTheme?: BrandPaletteThemeInput,
): TopicThemeStyle {
  const theme = getTopicTheme(themeKey);
  const palette = brandTheme
    ? brandPaletteTopicTheme(brandTheme, theme.palette)
    : theme.palette;
  const style = {} as TopicThemeStyle;

  for (const role of PALETTE_ROLES) {
    for (const tone of PALETTE_TONES) {
      style[`--ds__palette__${role}-${tone}`] = palette[role][tone];
    }
  }

  return style;
}

export function brandPaletteTopicTheme(
  brandTheme: BrandPaletteThemeInput,
  fallback: TopicTheme["palette"] = getTopicTheme().palette,
): TopicTheme["palette"] {
  const colors = brandTheme.brandPalette
    .filter((entry) => HEX_COLOR_PATTERN.test(entry.color))
    .map((entry) => ({ ...entry, color: entry.color.toUpperCase() }));
  if (colors.length === 0) return fallback;

  const paletteColors = new Set(colors.map((entry) => entry.color));
  const assigned = (role: "primary" | "secondary" | "surface") =>
    colors.find((entry) => entry.role === role)?.color;
  const approvedChromeColor = (color: string) => {
    const normalized = color.toUpperCase();
    return paletteColors.has(normalized) ? normalized : undefined;
  };
  const primary =
    assigned("primary") ??
    approvedChromeColor(brandTheme.carouselChrome.backgroundColor) ??
    colors[0]!.color;
  const secondary =
    assigned("secondary") ??
    approvedChromeColor(brandTheme.carouselChrome.accentColor) ??
    colors.find((entry) => entry.color !== primary)?.color ??
    primary;
  const selectedSurface =
    assigned("surface") ??
    approvedChromeColor(brandTheme.carouselChrome.textColor) ??
    brightestColor(colors.map((entry) => entry.color));
  const surfaceMain = readableSurface(selectedSurface);
  const darkest = darkestColor(colors.map((entry) => entry.color));
  const darkMain =
    relativeLuminance(darkest) <= 0.24
      ? darkest
      : mixHex(primary, "#000000", 0.58);
  const neutralMain = mixHex(darkMain, surfaceMain, 0.52);

  return {
    primary: colorTones(primary),
    secondary: colorTones(secondary),
    surface: {
      main: surfaceMain,
      light: mixHex(surfaceMain, "#FFFFFF", 0.6),
      dark: mixHex(surfaceMain, darkMain, 0.16),
      contrast: readableContrast(surfaceMain),
    },
    tertiary: colorTones(mixHex(secondary, primary, 0.32)),
    dark: {
      main: darkMain,
      light: mixHex(darkMain, "#FFFFFF", 0.16),
      dark: mixHex(darkMain, "#000000", 0.28),
      contrast: readableContrast(darkMain),
    },
    neutral: {
      main: neutralMain,
      light: mixHex(neutralMain, "#FFFFFF", 0.38),
      dark: mixHex(neutralMain, "#000000", 0.28),
      contrast: readableContrast(neutralMain),
    },
    light: {
      main: mixHex(surfaceMain, darkMain, 0.04),
      light: mixHex(surfaceMain, "#FFFFFF", 0.78),
      dark: mixHex(surfaceMain, darkMain, 0.16),
      contrast: readableContrast(surfaceMain),
    },
  };
}

const HEX_COLOR_PATTERN = /^#[0-9a-f]{6}$/i;

function colorTones(main: string): Record<PaletteTone, string> {
  return {
    main,
    light: mixHex(main, "#FFFFFF", 0.28),
    dark: mixHex(main, "#000000", 0.3),
    contrast: readableContrast(main),
  };
}

function readableSurface(color: string): string {
  return relativeLuminance(color) >= 0.62
    ? color
    : mixHex(color, "#FFFFFF", 0.82);
}

function brightestColor(colors: readonly string[]): string {
  return [...colors].sort(
    (left, right) => relativeLuminance(right) - relativeLuminance(left),
  )[0]!;
}

function darkestColor(colors: readonly string[]): string {
  return [...colors].sort(
    (left, right) => relativeLuminance(left) - relativeLuminance(right),
  )[0]!;
}

function readableContrast(background: string): string {
  return contrastRatio(background, "#FFFFFF") >=
    contrastRatio(background, "#111111")
    ? "#FFFFFF"
    : "#111111";
}

function contrastRatio(left: string, right: string): number {
  const lighter = Math.max(relativeLuminance(left), relativeLuminance(right));
  const darker = Math.min(relativeLuminance(left), relativeLuminance(right));
  return (lighter + 0.05) / (darker + 0.05);
}

function relativeLuminance(color: string): number {
  const [red, green, blue] = hexChannels(color).map((channel) => {
    const value = channel / 255;
    return value <= 0.04045
      ? value / 12.92
      : ((value + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * red! + 0.7152 * green! + 0.0722 * blue!;
}

function mixHex(left: string, right: string, rightWeight: number): string {
  const leftChannels = hexChannels(left);
  const rightChannels = hexChannels(right);
  return `#${leftChannels
    .map((channel, index) =>
      Math.round(channel * (1 - rightWeight) + rightChannels[index]! * rightWeight)
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`.toUpperCase();
}

function hexChannels(color: string): [number, number, number] {
  return [
    Number.parseInt(color.slice(1, 3), 16),
    Number.parseInt(color.slice(3, 5), 16),
    Number.parseInt(color.slice(5, 7), 16),
  ];
}
