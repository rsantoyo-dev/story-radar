import {
  CREATIVE_BRAND_BACKDROP_MODES,
  CREATIVE_BRAND_PLACEMENTS,
  CREATIVE_BRAND_SCOPES,
  DEFAULT_CREATIVE_BRAND_OVERLAY_SETTINGS,
  type CreativeBrandBackdropMode,
  type CreativeBrandOverlay,
  type CreativeBrandOverlaySettings,
  type CreativeBrandPlacement,
  type CreativeBrandScope,
} from "./creative-content.types";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const HEX_COLOR_PATTERN = /^#[0-9a-f]{6}$/i;

/**
 * Parses the browser-facing profile value. Asset metadata is intentionally
 * ignored: the repository resolves trusted metadata from the asset ID.
 */
export function parseCreativeBrandOverlayInput(
  value: unknown,
): CreativeBrandOverlay {
  if (value === undefined) {
    return { ...DEFAULT_CREATIVE_BRAND_OVERLAY_SETTINGS };
  }
  if (!isRecord(value)) {
    throw new CreativeBrandOverlayValidationError(
      "brandOverlay must be an object",
    );
  }

  const settings = parseCreativeBrandOverlaySettings(value);
  const assetId = optionalUuid(value.assetId, "brandOverlay.assetId");
  if (settings.enabled && !assetId) {
    throw new CreativeBrandOverlayValidationError(
      "brandOverlay.assetId is required when the brand overlay is enabled",
    );
  }

  return {
    ...settings,
    ...(assetId ? { assetId } : {}),
  };
}

/** Validates the settings-only JSON persisted on creative_profiles. */
export function parseCreativeBrandOverlaySettings(
  value: unknown,
): CreativeBrandOverlaySettings {
  if (!isRecord(value)) {
    throw new CreativeBrandOverlayValidationError(
      "brandOverlay must be an object",
    );
  }

  return {
    enabled: booleanValue(value.enabled, "brandOverlay.enabled"),
    scope: enumValue(
      value.scope,
      CREATIVE_BRAND_SCOPES,
      "brandOverlay.scope",
    ) as CreativeBrandScope,
    placement: enumValue(
      value.placement,
      CREATIVE_BRAND_PLACEMENTS,
      "brandOverlay.placement",
    ) as CreativeBrandPlacement,
    sizePercent: boundedInteger(
      value.sizePercent,
      "brandOverlay.sizePercent",
      5,
      40,
    ),
    insetPercent: boundedInteger(
      value.insetPercent,
      "brandOverlay.insetPercent",
      0,
      20,
    ),
    backdropMode: enumValue(
      value.backdropMode,
      CREATIVE_BRAND_BACKDROP_MODES,
      "brandOverlay.backdropMode",
    ) as CreativeBrandBackdropMode,
    backdropColor: colorValue(
      value.backdropColor,
      "brandOverlay.backdropColor",
    ),
    backdropOpacity: boundedInteger(
      value.backdropOpacity,
      "brandOverlay.backdropOpacity",
      0,
      100,
    ),
  };
}

function enumValue(
  value: unknown,
  choices: readonly string[],
  field: string,
): string {
  if (typeof value !== "string" || !choices.includes(value)) {
    throw new CreativeBrandOverlayValidationError(
      `${field} must be one of: ${choices.join(", ")}`,
    );
  }
  return value;
}

function boundedInteger(
  value: unknown,
  field: string,
  minimum: number,
  maximum: number,
): number {
  if (
    !Number.isInteger(value) ||
    (value as number) < minimum ||
    (value as number) > maximum
  ) {
    throw new CreativeBrandOverlayValidationError(
      `${field} must be an integer from ${minimum} to ${maximum}`,
    );
  }
  return value as number;
}

function booleanValue(value: unknown, field: string): boolean {
  if (typeof value !== "boolean") {
    throw new CreativeBrandOverlayValidationError(`${field} must be a boolean`);
  }
  return value;
}

function colorValue(value: unknown, field: string): string {
  if (typeof value !== "string" || !HEX_COLOR_PATTERN.test(value)) {
    throw new CreativeBrandOverlayValidationError(
      `${field} must be a six-digit hexadecimal color`,
    );
  }
  return value.toUpperCase();
}

function optionalUuid(value: unknown, field: string): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string" || !UUID_PATTERN.test(value)) {
    throw new CreativeBrandOverlayValidationError(
      `${field} must be a valid UUID`,
    );
  }
  return value.toLowerCase();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export class CreativeBrandOverlayValidationError extends Error {}
