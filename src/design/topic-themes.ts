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
export function topicThemeStyle(themeKey?: string): TopicThemeStyle {
  const theme = getTopicTheme(themeKey);
  const style = {} as TopicThemeStyle;

  for (const role of PALETTE_ROLES) {
    for (const tone of PALETTE_TONES) {
      style[`--ds__palette__${role}-${tone}`] = theme.palette[role][tone];
    }
  }

  return style;
}
