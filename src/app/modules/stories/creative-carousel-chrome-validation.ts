import {
  CREATIVE_BRAND_PALETTE_USAGE_MAX_LENGTH,
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
    const usage = optionalText(
      entry.usage,
      `brandPalette[${index}].usage`,
      CREATIVE_BRAND_PALETTE_USAGE_MAX_LENGTH,
    );
    const share = optionalShare(entry.share, `brandPalette[${index}].share`);
    return {
      name,
      color,
      ...(role ? { role } : {}),
      ...(usage ? { usage } : {}),
      ...(share !== undefined ? { share } : {}),
    };
  });
  const totalShare = colors.reduce((sum, color) => sum + (color.share ?? 0), 0);
  if (totalShare > 100) {
    throw new CreativeCarouselChromeValidationError(
      `brandPalette shares add up to ${totalShare}%; keep the total at 100% or less`,
    );
  }
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

/** Empty, null or undefined means "not set"; anything else must be text. */
function optionalText(value: unknown, field: string, max: number): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string") {
    throw new CreativeCarouselChromeValidationError(`${field} must be text`);
  }
  const trimmed = value.replace(/\s+/gu, " ").trim();
  return trimmed ? trimmed.slice(0, max) : undefined;
}

/** Integer percentage 1–100; empty, null or undefined means "not set". */
function optionalShare(value: unknown, field: string): number | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  const number = typeof value === "string" ? Number(value.trim()) : value;
  if (typeof number !== "number" || !Number.isInteger(number) || number < 1 || number > 100) {
    throw new CreativeCarouselChromeValidationError(
      `${field} must be a whole percentage between 1 and 100`,
    );
  }
  return number;
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
