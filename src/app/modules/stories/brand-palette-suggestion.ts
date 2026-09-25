import {
  CREATIVE_BRAND_PALETTE_USAGE_MAX_LENGTH,
  CREATIVE_BRAND_UI_ROLES,
  type CreativeBrandPaletteColor,
  type CreativeBrandUiRole,
} from "./creative-content.types";

/**
 * Brand palette assistant (creative profile › Identity).
 *
 * The editor describes the palette in plain words; Luna proposes named brand
 * colours with the three UI roles the topic theme needs (Primary, Secondary,
 * Surface). Everything here is pure and unit-tested: prompt, strict output
 * schema, and the validation/repair of the model's answer. The env read and
 * the provider call live in suggest-brand-palette.ts.
 *
 * The model is treated as untrusted input: hex values, names, roles and the
 * number of colours are all re-validated, and missing or duplicated roles are
 * repaired deterministically instead of trusting the answer.
 */

export const BRAND_PALETTE_SUGGESTION_PROMPT_VERSION = "brand-palette-assistant-v1";
export const BRAND_PALETTE_PROMPT_MIN_LENGTH = 8;
export const BRAND_PALETTE_PROMPT_MAX_LENGTH = 1_200;
export const BRAND_PALETTE_MIN_COLORS = 3;
export const BRAND_PALETTE_MAX_COLORS = 8;
const PALETTE_NAME_MAX_LENGTH = 40;
const SUMMARY_MAX_LENGTH = 280;
const HEX_PATTERN = /^#[0-9A-F]{6}$/;

export class BrandPaletteSuggestionValidationError extends Error {}
export class BrandPaletteSuggestionResponseError extends Error {}

export type BrandPaletteSuggestion = {
  summary: string;
  palette: CreativeBrandPaletteColor[];
};

export type BrandPaletteSuggestionContext = {
  prompt: string;
  currentPalette: readonly CreativeBrandPaletteColor[];
  profile: {
    name?: string;
    platform?: string;
    language?: string;
    region?: string;
    audience?: string;
  };
};

/** Strict JSON schema for the Responses API (`strict: true`). */
export const BRAND_PALETTE_SUGGESTION_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["summary", "colors"],
  properties: {
    summary: {
      type: "string",
      description:
        "One or two sentences, in the editor's language, explaining the mood of the palette and how the roles are used.",
    },
    colors: {
      type: "array",
      minItems: BRAND_PALETTE_MIN_COLORS,
      maxItems: 6,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "color", "role", "usage", "share"],
        properties: {
          name: { type: "string", description: "Short evocative name, two or three words." },
          color: { type: "string", description: "Uppercase hex colour, e.g. #1F3A5F." },
          role: {
            type: "string",
            enum: [...CREATIVE_BRAND_UI_ROLES, "supporting"],
            description:
              "primary: dark enough to carry white text; secondary: accent; surface: light background; supporting: everything else.",
          },
          usage: {
            type: "string",
            description:
              "Where this colour is used in the brand, as a short phrase, e.g. 'titles and accents' or 'page backgrounds'.",
          },
          share: {
            type: "integer",
            description:
              "Approximate share of the visual system as a whole percentage, 1 to 100. Shares of all colours add up to 100.",
          },
        },
      },
    },
  },
} as const;

export function validateBrandPalettePrompt(value: unknown): string {
  if (typeof value !== "string") {
    throw new BrandPaletteSuggestionValidationError("Describe the palette in a few words first.");
  }
  const prompt = value.replace(/\s+/gu, " ").trim();
  if (prompt.length < BRAND_PALETTE_PROMPT_MIN_LENGTH) {
    throw new BrandPaletteSuggestionValidationError(
      `Describe the palette with at least ${BRAND_PALETTE_PROMPT_MIN_LENGTH} characters.`,
    );
  }
  if (prompt.length > BRAND_PALETTE_PROMPT_MAX_LENGTH) {
    throw new BrandPaletteSuggestionValidationError(
      `Keep the palette description under ${BRAND_PALETTE_PROMPT_MAX_LENGTH} characters.`,
    );
  }
  return prompt;
}

export function buildBrandPaletteSuggestionInstructions(): string {
  return [
    "You are Luna, a senior brand designer at Press Craftor, an editorial publishing platform.",
    "Propose a brand colour palette for one publication from the editor's description. Return JSON only, following the schema.",
    "Rules:",
    "- Between 4 and 6 colours. Exactly one 'primary', exactly one 'secondary', exactly one 'surface'; the rest are 'supporting'.",
    "- 'primary' is the brand's main UI colour: dark or saturated enough that white text on it reaches a contrast ratio of at least 4.5:1.",
    "- 'surface' is a light page background: very high luminance, low saturation, and clearly distinct from 'primary'.",
    "- 'secondary' is the accent used for highlights and calls to action; it must be visible on 'surface'.",
    "- Colours must be visually distinct from each other; never repeat or near-repeat a hex value.",
    "- Hex values are uppercase, six digits, prefixed with '#'.",
    "- Names are short and evocative (two or three words), unique within the palette, in the editor's language.",
    "- 'usage' says where the colour lives in the brand (backgrounds, body text, titles, accents, buttons, illustrations), as a short phrase in the editor's language.",
    "- 'share' is the approximate proportion of the visual system, following a 60/30/10 logic: the surface dominates, primary and text colours come next, accents stay small. Whole numbers that add up to 100.",
    "- Respect explicit wishes in the description (a named colour, a mood, a season, a reference). If the description is vague, choose a coherent, professional editorial palette.",
    "- Do not mention brands you cannot see; do not invent constraints the editor did not give.",
    "- 'summary' is one or two sentences in the editor's language explaining the mood and how the roles are used.",
  ].join("\n");
}

export function buildBrandPaletteSuggestionContents(
  context: BrandPaletteSuggestionContext,
): Record<string, unknown> {
  return {
    editorDescription: context.prompt,
    publication: {
      ...(context.profile.name ? { name: context.profile.name } : {}),
      ...(context.profile.platform ? { platform: context.profile.platform } : {}),
      ...(context.profile.language ? { language: context.profile.language } : {}),
      ...(context.profile.region ? { region: context.profile.region } : {}),
      ...(context.profile.audience ? { audience: truncate(context.profile.audience, 600) } : {}),
    },
    currentPalette: context.currentPalette.map((entry) => ({
      name: entry.name,
      color: entry.color,
      ...(entry.role ? { role: entry.role } : {}),
    })),
    roles: {
      primary: "main UI colour, carries white text",
      secondary: "accent for highlights and calls to action",
      surface: "light page background",
    },
  };
}

/**
 * Parses and repairs the model output. Unknown fields are dropped, hex and
 * names are normalized, near-empty answers are rejected, and the three UI
 * roles end up assigned exactly once each even when the model forgot or
 * duplicated them.
 */
export function parseBrandPaletteSuggestion(text: string): BrandPaletteSuggestion {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new BrandPaletteSuggestionResponseError("Luna returned a palette that could not be read.");
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new BrandPaletteSuggestionResponseError("Luna returned a palette that could not be read.");
  }
  const record = parsed as Record<string, unknown>;
  const rawColors = Array.isArray(record.colors) ? record.colors : [];

  const seen = new Set<string>();
  const seenNames = new Set<string>();
  const entries: Array<CreativeBrandPaletteColor & { requestedRole?: string }> = [];
  for (const raw of rawColors) {
    if (typeof raw !== "object" || raw === null) continue;
    const item = raw as Record<string, unknown>;
    const color = normalizeHex(item.color);
    if (!color || seen.has(color)) continue;
    seen.add(color);
    const baseName = normalizeName(item.name) || `Brand colour ${entries.length + 1}`;
    let name = baseName;
    let suffix = 2;
    while (seenNames.has(name.toLowerCase())) name = `${baseName} ${suffix++}`;
    seenNames.add(name.toLowerCase());
    const usage = normalizeUsage(item.usage);
    const share = normalizeShare(item.share);
    entries.push({
      name,
      color,
      ...(typeof item.role === "string" ? { requestedRole: item.role } : {}),
      ...(usage ? { usage } : {}),
      ...(share !== undefined ? { share } : {}),
    });
    if (entries.length === BRAND_PALETTE_MAX_COLORS) break;
  }

  if (entries.length < BRAND_PALETTE_MIN_COLORS) {
    throw new BrandPaletteSuggestionResponseError(
      `Luna proposed fewer than ${BRAND_PALETTE_MIN_COLORS} usable colours; try describing the palette differently.`,
    );
  }

  const palette = fitShares(assignUiRoles(entries));
  const summary = truncate(
    typeof record.summary === "string" ? record.summary.replace(/\s+/gu, " ").trim() : "",
    SUMMARY_MAX_LENGTH,
  );
  return { summary, palette };
}

/**
 * Keeps the first colour the model tagged with each role, demotes duplicates
 * and fills gaps by luminance: surface = lightest, primary = darkest,
 * secondary = most chromatic of what is left.
 */
export function assignUiRoles(
  entries: ReadonlyArray<CreativeBrandPaletteColor & { requestedRole?: string }>,
): CreativeBrandPaletteColor[] {
  const assigned = new Map<CreativeBrandUiRole, number>();
  entries.forEach((entry, index) => {
    const role = entry.requestedRole;
    if (isUiRole(role) && !assigned.has(role)) assigned.set(role, index);
  });
  const taken = () => new Set(assigned.values());
  const pick = (
    role: CreativeBrandUiRole,
    score: (color: string) => number,
    prefer: "max" | "min",
  ) => {
    if (assigned.has(role)) return;
    let best: number | undefined;
    let bestScore = prefer === "max" ? -Infinity : Infinity;
    entries.forEach((entry, index) => {
      if (taken().has(index)) return;
      const value = score(entry.color);
      if (prefer === "max" ? value > bestScore : value < bestScore) {
        bestScore = value;
        best = index;
      }
    });
    if (best !== undefined) assigned.set(role, best);
  };
  pick("surface", relativeLuminance, "max");
  pick("primary", relativeLuminance, "min");
  pick("secondary", chroma, "max");

  const roleByIndex = new Map<number, CreativeBrandUiRole>();
  for (const [role, index] of assigned) roleByIndex.set(index, role);
  return entries.map((entry, index) => {
    const role = roleByIndex.get(index);
    return {
      name: entry.name,
      color: entry.color,
      ...(role ? { role } : {}),
      ...(entry.usage ? { usage: entry.usage } : {}),
      ...(entry.share !== undefined ? { share: entry.share } : {}),
    };
  });
}

/**
 * Shares must add up to at most 100 to be saveable. When the model overshoots
 * (or a dropped duplicate skews the split), scale proportionally and floor,
 * dropping any share that rounds to zero.
 */
export function fitShares(palette: CreativeBrandPaletteColor[]): CreativeBrandPaletteColor[] {
  const total = palette.reduce((sum, entry) => sum + (entry.share ?? 0), 0);
  if (total <= 100) return palette;
  return palette.map((entry) => {
    if (entry.share === undefined) return entry;
    const scaled = Math.floor((entry.share * 100) / total);
    const rest: CreativeBrandPaletteColor = { ...entry };
    delete rest.share;
    return scaled >= 1 ? { ...rest, share: scaled } : rest;
  });
}

/** WCAG relative luminance of an sRGB hex colour, 0 (black) to 1 (white). */
export function relativeLuminance(hex: string): number {
  const [r, g, b] = hexChannels(hex).map((channel) => {
    const value = channel / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function chroma(hex: string): number {
  const channels = hexChannels(hex);
  return Math.max(...channels) - Math.min(...channels);
}

function hexChannels(hex: string): [number, number, number] {
  return [
    Number.parseInt(hex.slice(1, 3), 16),
    Number.parseInt(hex.slice(3, 5), 16),
    Number.parseInt(hex.slice(5, 7), 16),
  ];
}

function normalizeHex(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  let hex = value.trim().toUpperCase();
  if (!hex.startsWith("#")) hex = `#${hex}`;
  if (/^#[0-9A-F]{3}$/u.test(hex)) {
    hex = `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`;
  }
  return HEX_PATTERN.test(hex) ? hex : undefined;
}

function normalizeUsage(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const usage = value.replace(/\s+/gu, " ").trim();
  return usage ? truncate(usage, CREATIVE_BRAND_PALETTE_USAGE_MAX_LENGTH) : undefined;
}

function normalizeShare(value: unknown): number | undefined {
  const number = typeof value === "string" ? Number(value.trim()) : value;
  if (typeof number !== "number" || !Number.isFinite(number)) return undefined;
  const rounded = Math.round(number);
  return rounded >= 1 && rounded <= 100 ? rounded : undefined;
}

function normalizeName(value: unknown): string {
  if (typeof value !== "string") return "";
  return truncate(value.replace(/\s+/gu, " ").trim(), PALETTE_NAME_MAX_LENGTH);
}

function isUiRole(value: unknown): value is CreativeBrandUiRole {
  return CREATIVE_BRAND_UI_ROLES.includes(value as CreativeBrandUiRole);
}

function truncate(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max - 1).trimEnd()}…` : value;
}
