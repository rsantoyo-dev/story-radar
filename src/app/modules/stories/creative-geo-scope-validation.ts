import {
  DEFAULT_CREATIVE_GEO_SCOPE,
  type CreativeGeoScope,
} from "./creative-content.types";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_PLACE_NAME_LENGTH = 120;

/**
 * Parses the confirmed geographic scope stored on `creative_profiles.geo_scope`
 * (FEAT-GEO-001 / GEO-01). Names are free text the editor confirms; they are
 * never resolved to coordinates here. `validatedLocationId` stays null until
 * GEO-03/GEO-08 resolve a concrete place. Unknown keys are ignored and
 * `undefined` yields the empty default so pre-GEO profiles keep working.
 */
export function parseCreativeGeoScopeInput(value: unknown): CreativeGeoScope {
  if (value === undefined || value === null) {
    return { ...DEFAULT_CREATIVE_GEO_SCOPE };
  }
  if (!isRecord(value)) {
    throw new CreativeGeoScopeValidationError("geoScope must be an object");
  }

  return {
    municipality: placeName(value.municipality, "geoScope.municipality"),
    region: placeName(value.region, "geoScope.region"),
    country: placeName(value.country, "geoScope.country"),
    validatedLocationId: optionalUuid(
      value.validatedLocationId,
      "geoScope.validatedLocationId",
    ),
  };
}

/** True when the editor has confirmed at least the municipality and country. */
export function isCreativeGeoScopeConfirmed(scope: CreativeGeoScope): boolean {
  return scope.municipality.length > 0 && scope.country.length > 0;
}

function placeName(value: unknown, field: string): string {
  if (value === undefined || value === null || value === "") return "";
  if (typeof value !== "string") {
    throw new CreativeGeoScopeValidationError(`${field} must be a string`);
  }
  return value.replace(/\s+/gu, " ").trim().slice(0, MAX_PLACE_NAME_LENGTH);
}

function optionalUuid(value: unknown, field: string): string | null {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string" || !UUID_PATTERN.test(value)) {
    throw new CreativeGeoScopeValidationError(`${field} must be a valid UUID`);
  }
  return value.toLowerCase();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export class CreativeGeoScopeValidationError extends Error {}
