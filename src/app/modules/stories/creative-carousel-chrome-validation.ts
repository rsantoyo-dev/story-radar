import {
  CREATIVE_CAROUSEL_CHROME_STYLES,
  DEFAULT_CREATIVE_BRAND_PALETTE,
  DEFAULT_CREATIVE_CAROUSEL_CHROME_SETTINGS,
  isCreativeBrandUiRole,
  type CreativeBrandPaletteColor,
  type CreativeCarouselChromeSettings,
  type CreativeCarouselChromeStyle,
} from "./creative-content.types";

const HEX_COLOR_PATTERN = /^#[0-9a-f]{6}$/i;
const MAX_PALETTE_COLORS = 8;
const MIN_PALETTE_COLORS = 3;

export function parseCreativeBrandPaletteInput(
  value: unknown,
): CreativeBrandPaletteColor[] {
  if (value === undefined) return cloneDefaultPalette();
  if (!Array.isArray(value)) {
    throw new CreativeCarouselChromeValidationError(
      "brandPalette must be an array of named colours",
    );
  }
  if (value.length < MIN_PALETTE_COLORS || value.length > MAX_PALETTE_COLORS) {
    throw new CreativeCarouselChromeValidationError(
      `brandPalette must contain between ${MIN_PALETTE_COLORS} and ${MAX_PALETTE_COLORS} colours`,
    );
  }

  const colors = value.map((entry, index) => {
    if (!isRecord(entry)) {
      throw new CreativeCarouselChromeValidationError(
        `brandPalette[${index}] must be an object`,
      );
    }
    const name = text(entry.name, `brandPalette[${index}].name`, 40);
    const color = hex(entry.color, `brandPalette[${index}].color`);
    const role = entry.role;
    if (role !== undefined && !isCreativeBrandUiRole(role)) {
      throw new CreativeCarouselChromeValidationError(
        `brandPalette[${index}].role must be primary, secondary, or surface`,
      );
    }
    return { name, color, ...(role ? { role } : {}) };
  });
  if (new Set(colors.map((color) => color.color)).size !== colors.length) {
    throw new CreativeCarouselChromeValidationError(
      "brandPalette colours must be unique",
    );
  }
  const roles = colors.flatMap((color) => color.role ?? []);
  if (new Set(roles).size !== roles.length) {
    throw new CreativeCarouselChromeValidationError(
      "Each brandPalette UI role may be assigned to only one colour",
    );
  }
  return colors;
}

export function parseCreativeCarouselChromeInput(
  value: unknown,
  palette: readonly CreativeBrandPaletteColor[],
): CreativeCarouselChromeSettings {
  if (value === undefined) return defaultChromeForPalette(palette);
  if (!isRecord(value)) {
    throw new CreativeCarouselChromeValidationError(
      "carouselChrome must be an object",
    );
  }

  const settings = {
    enabled: boolean(value.enabled, "carouselChrome.enabled"),
    style: enumValue(
      value.style,
      CREATIVE_CAROUSEL_CHROME_STYLES,
      "carouselChrome.style",
    ) as CreativeCarouselChromeStyle,
    backgroundColor: hex(value.backgroundColor, "carouselChrome.backgroundColor"),
    textColor: hex(value.textColor, "carouselChrome.textColor"),
    accentColor: hex(value.accentColor, "carouselChrome.accentColor"),
  };
  const paletteColors = new Set(palette.map((entry) => entry.color));
  for (const [field, color] of Object.entries(settings)) {
    if (field.endsWith("Color") && !paletteColors.has(color as string)) {
      throw new CreativeCarouselChromeValidationError(
        `carouselChrome.${field} must be selected from brandPalette`,
      );
    }
  }
  return settings;
}

export function cloneDefaultPalette(): CreativeBrandPaletteColor[] {
  return DEFAULT_CREATIVE_BRAND_PALETTE.map((entry) => ({ ...entry }));
}

function defaultChromeForPalette(
  palette: readonly CreativeBrandPaletteColor[],
): CreativeCarouselChromeSettings {
  const defaultColors = new Set<string>(
    DEFAULT_CREATIVE_BRAND_PALETTE.map((entry) => entry.color),
  );
  if (
    DEFAULT_CREATIVE_CAROUSEL_CHROME_SETTINGS.backgroundColor &&
    DEFAULT_CREATIVE_CAROUSEL_CHROME_SETTINGS.textColor &&
    DEFAULT_CREATIVE_CAROUSEL_CHROME_SETTINGS.accentColor &&
    palette.every((entry) => defaultColors.has(entry.color))
  ) {
    return { ...DEFAULT_CREATIVE_CAROUSEL_CHROME_SETTINGS };
  }
  return {
    enabled: true,
    style: "pill",
    backgroundColor: palette[0]!.color,
    textColor: palette[1]!.color,
    accentColor: palette[2]!.color,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value: unknown, field: string, max: number): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new CreativeCarouselChromeValidationError(`${field} is required`);
  }
  return value.replace(/\s+/gu, " ").trim().slice(0, max);
}

function hex(value: unknown, field: string): string {
  if (typeof value !== "string" || !HEX_COLOR_PATTERN.test(value)) {
    throw new CreativeCarouselChromeValidationError(
      `${field} must use the #RRGGBB format`,
    );
  }
  return value.toUpperCase();
}

function boolean(value: unknown, field: string): boolean {
  if (typeof value !== "boolean") {
    throw new CreativeCarouselChromeValidationError(`${field} must be a boolean`);
  }
  return value;
}

function enumValue(
  value: unknown,
  values: readonly string[],
  field: string,
): string {
  if (typeof value !== "string" || !values.includes(value)) {
    throw new CreativeCarouselChromeValidationError(
      `${field} must be one of: ${values.join(", ")}`,
    );
  }
  return value;
}

export class CreativeCarouselChromeValidationError extends Error {}
