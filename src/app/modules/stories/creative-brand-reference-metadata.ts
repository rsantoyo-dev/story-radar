/**
 * Pure parsing/validation for the editor-declared fields of a brand visual
 * reference (BRAND-01): name, kind, provenance, usage note, and the
 * provider-transmission permission. Shared by the multipart upload route (values
 * arrive as `FormData` strings) and the JSON PATCH route. Kept out of the
 * `server-only` repository so it stays unit-testable.
 */

import {
  BRAND_CONTRIBUTION_ASPECTS,
  CREATIVE_BRAND_REFERENCE_KINDS,
  type BrandContributionAspect,
  type CreativeBrandContribution,
  type CreativeBrandReferenceKind,
} from "./creative-content.types";

export class CreativeBrandReferenceValidationError extends Error {}

export const MAX_BRAND_REFERENCE_NAME_LENGTH = 120;
export const MAX_BRAND_REFERENCE_PROVENANCE_LENGTH = 500;
export const MAX_BRAND_REFERENCE_USAGE_NOTE_LENGTH = 1000;
export const MAX_BRAND_CONTRIBUTION_TEXT_LENGTH = 2000;

export type CreativeBrandReferenceMetadata = {
  name: string;
  kind: CreativeBrandReferenceKind;
  provenance: string | null;
  usageNote: string | null;
  providerTransmissionAllowed: boolean;
};

type RawMetadata = {
  name?: unknown;
  kind?: unknown;
  provenance?: unknown;
  usageNote?: unknown;
  providerTransmissionAllowed?: unknown;
};

/**
 * Full metadata for a new upload — `name` required. Whitespace is collapsed;
 * empty optional strings become null; `kind` defaults to "other".
 */
export function parseCreativeBrandReferenceMetadata(
  input: unknown,
): CreativeBrandReferenceMetadata {
  const raw = asRecord(input);
  return {
    name: requiredName(raw.name),
    kind: parseKind(raw.kind),
    provenance: optionalText(
      raw.provenance,
      "provenance",
      MAX_BRAND_REFERENCE_PROVENANCE_LENGTH,
    ),
    usageNote: optionalText(
      raw.usageNote,
      "usage note",
      MAX_BRAND_REFERENCE_USAGE_NOTE_LENGTH,
    ),
    providerTransmissionAllowed: parseBooleanFlag(raw.providerTransmissionAllowed),
  };
}

/**
 * A PATCH — every field optional. Only keys present in `input` appear in the
 * result, so a partial update never clobbers untouched columns.
 */
export type CreativeBrandReferencePatchValues = Partial<
  CreativeBrandReferenceMetadata & {
    isActive: boolean;
    contribution: CreativeBrandContribution;
    activatedForJourney: boolean;
  }
>;

export function parseCreativeBrandReferencePatch(
  input: unknown,
): CreativeBrandReferencePatchValues {
  const raw = asRecord(input) as RawMetadata & {
    isActive?: unknown;
    contribution?: unknown;
    activatedForJourney?: unknown;
  };
  const patch: CreativeBrandReferencePatchValues = {};

  if ("name" in raw) patch.name = requiredName(raw.name);
  if ("kind" in raw) patch.kind = parseKind(raw.kind);
  if ("provenance" in raw) {
    patch.provenance = optionalText(
      raw.provenance,
      "provenance",
      MAX_BRAND_REFERENCE_PROVENANCE_LENGTH,
    );
  }
  if ("usageNote" in raw) {
    patch.usageNote = optionalText(
      raw.usageNote,
      "usage note",
      MAX_BRAND_REFERENCE_USAGE_NOTE_LENGTH,
    );
  }
  if ("providerTransmissionAllowed" in raw) {
    patch.providerTransmissionAllowed = parseBooleanFlag(
      raw.providerTransmissionAllowed,
    );
  }
  if ("isActive" in raw) {
    patch.isActive = requiredBoolean(raw.isActive, "isActive");
  }
  if ("contribution" in raw) {
    patch.contribution = parseCreativeBrandContribution(raw.contribution);
  }
  if ("activatedForJourney" in raw) {
    patch.activatedForJourney = requiredBoolean(
      raw.activatedForJourney,
      "activatedForJourney",
    );
  }

  if (Object.keys(patch).length === 0) {
    throw new CreativeBrandReferenceValidationError(
      "The update did not contain any editable field",
    );
  }
  return patch;
}

/** The editor's structured "what to take from this reference" config (BRAND-02). */
export function parseCreativeBrandContribution(
  input: unknown,
): CreativeBrandContribution {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new CreativeBrandReferenceValidationError(
      "The contribution must be an object",
    );
  }
  const raw = input as {
    aspects?: unknown;
    guidance?: unknown;
    avoid?: unknown;
  };

  const aspects: BrandContributionAspect[] = [];
  if (raw.aspects !== undefined && raw.aspects !== null) {
    if (!Array.isArray(raw.aspects)) {
      throw new CreativeBrandReferenceValidationError(
        "contribution.aspects must be an array",
      );
    }
    for (const value of raw.aspects) {
      if (
        typeof value !== "string" ||
        !(BRAND_CONTRIBUTION_ASPECTS as readonly string[]).includes(value)
      ) {
        throw new CreativeBrandReferenceValidationError(
          `contribution.aspects must be a subset of: ${BRAND_CONTRIBUTION_ASPECTS.join(", ")}`,
        );
      }
      if (!aspects.includes(value as BrandContributionAspect)) {
        aspects.push(value as BrandContributionAspect);
      }
    }
  }

  return {
    aspects,
    guidance: optionalText(
      raw.guidance,
      "contribution guidance",
      MAX_BRAND_CONTRIBUTION_TEXT_LENGTH,
    ),
    avoid: optionalText(
      raw.avoid,
      "contribution avoid note",
      MAX_BRAND_CONTRIBUTION_TEXT_LENGTH,
    ),
  };
}

/** Whether a contribution carries any real editor decision. */
export function brandContributionIsConfigured(
  contribution: CreativeBrandContribution | null | undefined,
): boolean {
  return Boolean(
    contribution &&
      (contribution.aspects.length > 0 ||
        contribution.guidance ||
        contribution.avoid),
  );
}

/**
 * The activation gate (BRAND-02): a reference may only be turned on for the
 * creative journey once the editor has allowed provider transmission AND set a
 * contribution. Auto-analysis never grants this.
 */
export function assertBrandReferenceActivatable(state: {
  providerTransmissionAllowed: boolean;
  contribution: CreativeBrandContribution | null | undefined;
}): void {
  if (!state.providerTransmissionAllowed) {
    throw new CreativeBrandReferenceValidationError(
      "Allow provider transmission before activating this reference",
    );
  }
  if (!brandContributionIsConfigured(state.contribution)) {
    throw new CreativeBrandReferenceValidationError(
      "Set what this reference contributes before activating it",
    );
  }
}

function requiredBoolean(value: unknown, field: string): boolean {
  if (typeof value !== "boolean") {
    throw new CreativeBrandReferenceValidationError(
      `${field} must be true or false`,
    );
  }
  return value;
}

function asRecord(value: unknown): RawMetadata {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new CreativeBrandReferenceValidationError(
      "Brand reference details must be an object",
    );
  }
  return value as RawMetadata;
}

function requiredName(value: unknown): string {
  if (typeof value !== "string") {
    throw new CreativeBrandReferenceValidationError("A name is required");
  }
  const name = value.trim().replace(/\s+/g, " ");
  if (name.length === 0) {
    throw new CreativeBrandReferenceValidationError("A name is required");
  }
  if (name.length > MAX_BRAND_REFERENCE_NAME_LENGTH) {
    throw new CreativeBrandReferenceValidationError(
      `The name must be ${MAX_BRAND_REFERENCE_NAME_LENGTH} characters or fewer`,
    );
  }
  return name;
}

function parseKind(value: unknown): CreativeBrandReferenceKind {
  if (value === undefined || value === null || value === "") return "other";
  if (
    typeof value === "string" &&
    (CREATIVE_BRAND_REFERENCE_KINDS as readonly string[]).includes(value)
  ) {
    return value as CreativeBrandReferenceKind;
  }
  throw new CreativeBrandReferenceValidationError(
    `kind must be one of: ${CREATIVE_BRAND_REFERENCE_KINDS.join(", ")}`,
  );
}

function optionalText(
  value: unknown,
  label: string,
  max: number,
): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") {
    throw new CreativeBrandReferenceValidationError(
      `The ${label} must be text`,
    );
  }
  const text = value.trim();
  if (text.length === 0) return null;
  if (text.length > max) {
    throw new CreativeBrandReferenceValidationError(
      `The ${label} must be ${max} characters or fewer`,
    );
  }
  return text;
}

function parseBooleanFlag(value: unknown): boolean {
  if (value === true || value === "true" || value === "on" || value === "1") {
    return true;
  }
  if (
    value === undefined ||
    value === null ||
    value === false ||
    value === "false" ||
    value === "off" ||
    value === "0" ||
    value === ""
  ) {
    return false;
  }
  throw new CreativeBrandReferenceValidationError(
    "providerTransmissionAllowed must be a boolean",
  );
}
