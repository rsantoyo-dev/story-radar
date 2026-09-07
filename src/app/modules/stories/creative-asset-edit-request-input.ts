/**
 * IMG-01. Pure parser + validation for a saved (not executed) per-slide image
 * edit request. No `server-only` import so `tsx --test` can exercise it. The
 * repository derives `unitOrder` / `baseVersion` from the base asset row itself;
 * this parser only shapes the caller-supplied body.
 */

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const MAX_EDIT_INSTRUCTION_CHARACTERS = 2000;
const MAX_BRAND_REFERENCE_IDS = 16;

const EDIT_TYPES = ["generative", "composition"] as const;
export type CreativeAssetEditType = (typeof EDIT_TYPES)[number];

export class CreativeAssetEditRequestValidationError extends Error {}

export type CreativeAssetEditRequestInput = {
  baseAssetId: string;
  instruction: string | null;
  useImageAsBase: boolean;
  /**
   * `null` = inherit the base asset's brand references; `[]` = an explicit
   * "use no brand references"; a list = an explicit override.
   */
  brandReferenceIds: string[] | null;
  editType: CreativeAssetEditType;
};

const ALLOWED_KEYS = new Set([
  "baseAssetId",
  "instruction",
  "useImageAsBase",
  "brandReferenceIds",
  "editType",
]);

export function parseCreativeAssetEditRequestInput(
  input: unknown,
): CreativeAssetEditRequestInput {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    throw new CreativeAssetEditRequestValidationError(
      "A JSON object is required",
    );
  }
  const raw = input as Record<string, unknown>;
  const unknownKey = Object.keys(raw).find((key) => !ALLOWED_KEYS.has(key));
  if (unknownKey) {
    throw new CreativeAssetEditRequestValidationError(
      `Unexpected field: ${unknownKey}`,
    );
  }

  if (typeof raw.baseAssetId !== "string" || !UUID_PATTERN.test(raw.baseAssetId)) {
    throw new CreativeAssetEditRequestValidationError(
      "baseAssetId must be a valid UUID",
    );
  }

  const instruction = parseInstruction(raw.instruction);

  if (
    raw.useImageAsBase !== undefined &&
    typeof raw.useImageAsBase !== "boolean"
  ) {
    throw new CreativeAssetEditRequestValidationError(
      "useImageAsBase must be true or false",
    );
  }
  const useImageAsBase =
    raw.useImageAsBase === undefined ? true : raw.useImageAsBase;

  const brandReferenceIds = parseBrandReferenceIds(raw.brandReferenceIds);

  const editType = parseEditType(raw.editType);

  return { baseAssetId: raw.baseAssetId, instruction, useImageAsBase, brandReferenceIds, editType };
}

function parseInstruction(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") {
    throw new CreativeAssetEditRequestValidationError(
      "instruction must be text",
    );
  }
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.length > MAX_EDIT_INSTRUCTION_CHARACTERS) {
    throw new CreativeAssetEditRequestValidationError(
      `instruction must be ${MAX_EDIT_INSTRUCTION_CHARACTERS} characters or fewer`,
    );
  }
  return trimmed;
}

function parseBrandReferenceIds(value: unknown): string[] | null {
  // Absent → inherit (null). An explicit array (including `[]`) → override.
  if (value === undefined || value === null) return null;
  if (!Array.isArray(value)) {
    throw new CreativeAssetEditRequestValidationError(
      "brandReferenceIds must be an array",
    );
  }
  if (value.length > MAX_BRAND_REFERENCE_IDS) {
    throw new CreativeAssetEditRequestValidationError(
      `brandReferenceIds cannot list more than ${MAX_BRAND_REFERENCE_IDS} references`,
    );
  }
  for (const id of value) {
    if (typeof id !== "string" || !UUID_PATTERN.test(id)) {
      throw new CreativeAssetEditRequestValidationError(
        "brandReferenceIds must all be valid UUIDs",
      );
    }
  }
  if (new Set(value as string[]).size !== value.length) {
    throw new CreativeAssetEditRequestValidationError(
      "brandReferenceIds must not repeat a reference",
    );
  }
  return value as string[];
}

function parseEditType(value: unknown): CreativeAssetEditType {
  if (value === undefined || value === null) return "generative";
  if (
    typeof value !== "string" ||
    !EDIT_TYPES.includes(value as CreativeAssetEditType)
  ) {
    throw new CreativeAssetEditRequestValidationError(
      `editType must be one of: ${EDIT_TYPES.join(", ")}`,
    );
  }
  return value as CreativeAssetEditType;
}
