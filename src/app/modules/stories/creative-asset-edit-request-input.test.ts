import assert from "node:assert/strict";
import { test } from "node:test";

import {
  CreativeAssetEditRequestValidationError,
  parseCreativeAssetEditRequestInput,
} from "./creative-asset-edit-request-input";

const BASE = "11111111-1111-4111-8111-111111111111";
const REF_A = "22222222-2222-4222-8222-222222222222";
const REF_B = "33333333-3333-4333-8333-333333333333";

test("minimal valid body: defaults applied", () => {
  const parsed = parseCreativeAssetEditRequestInput({ baseAssetId: BASE });
  assert.deepEqual(parsed, {
    baseAssetId: BASE,
    instruction: null,
    useImageAsBase: true,
    brandReferenceIds: null,
    editType: "generative",
  });
});

test("baseAssetId is required and must be a UUID", () => {
  assert.throws(
    () => parseCreativeAssetEditRequestInput({}),
    CreativeAssetEditRequestValidationError,
  );
  assert.throws(
    () => parseCreativeAssetEditRequestInput({ baseAssetId: "nope" }),
    CreativeAssetEditRequestValidationError,
  );
});

test("instruction: empty/whitespace/null/undefined all become null", () => {
  for (const instruction of [undefined, null, "", "   ", "\n\t"]) {
    const parsed = parseCreativeAssetEditRequestInput({
      baseAssetId: BASE,
      instruction,
    });
    assert.equal(parsed.instruction, null);
  }
});

test("instruction is trimmed and length-capped at 2000", () => {
  assert.equal(
    parseCreativeAssetEditRequestInput({
      baseAssetId: BASE,
      instruction: "  make the sky bluer  ",
    }).instruction,
    "make the sky bluer",
  );
  assert.equal(
    parseCreativeAssetEditRequestInput({
      baseAssetId: BASE,
      instruction: "x".repeat(2000),
    }).instruction?.length,
    2000,
  );
  assert.throws(
    () =>
      parseCreativeAssetEditRequestInput({
        baseAssetId: BASE,
        instruction: "x".repeat(2001),
      }),
    CreativeAssetEditRequestValidationError,
  );
});

test("instruction must be a string when present", () => {
  assert.throws(
    () =>
      parseCreativeAssetEditRequestInput({ baseAssetId: BASE, instruction: 42 }),
    CreativeAssetEditRequestValidationError,
  );
});

test("useImageAsBase: default true, respects explicit false, rejects non-boolean", () => {
  assert.equal(
    parseCreativeAssetEditRequestInput({ baseAssetId: BASE }).useImageAsBase,
    true,
  );
  assert.equal(
    parseCreativeAssetEditRequestInput({
      baseAssetId: BASE,
      useImageAsBase: false,
    }).useImageAsBase,
    false,
  );
  assert.throws(
    () =>
      parseCreativeAssetEditRequestInput({
        baseAssetId: BASE,
        useImageAsBase: "yes",
      }),
    CreativeAssetEditRequestValidationError,
  );
});

test("brandReferenceIds: missing → null (inherit), [] → explicit none, list → override", () => {
  assert.equal(
    parseCreativeAssetEditRequestInput({ baseAssetId: BASE }).brandReferenceIds,
    null,
  );
  assert.deepEqual(
    parseCreativeAssetEditRequestInput({
      baseAssetId: BASE,
      brandReferenceIds: [],
    }).brandReferenceIds,
    [],
  );
  assert.deepEqual(
    parseCreativeAssetEditRequestInput({
      baseAssetId: BASE,
      brandReferenceIds: [REF_A, REF_B],
    }).brandReferenceIds,
    [REF_A, REF_B],
  );
});

test("brandReferenceIds: rejects >16, duplicates, and non-UUIDs", () => {
  assert.throws(
    () =>
      parseCreativeAssetEditRequestInput({
        baseAssetId: BASE,
        brandReferenceIds: Array.from(
          { length: 17 },
          (_, i) => `0000000${i.toString(16)}-0000-4000-8000-000000000000`,
        ),
      }),
    CreativeAssetEditRequestValidationError,
  );
  assert.throws(
    () =>
      parseCreativeAssetEditRequestInput({
        baseAssetId: BASE,
        brandReferenceIds: [REF_A, REF_A],
      }),
    CreativeAssetEditRequestValidationError,
  );
  assert.throws(
    () =>
      parseCreativeAssetEditRequestInput({
        baseAssetId: BASE,
        brandReferenceIds: ["not-a-uuid"],
      }),
    CreativeAssetEditRequestValidationError,
  );
});

test("editType: default generative, accepts composition, rejects anything else", () => {
  assert.equal(
    parseCreativeAssetEditRequestInput({ baseAssetId: BASE }).editType,
    "generative",
  );
  assert.equal(
    parseCreativeAssetEditRequestInput({
      baseAssetId: BASE,
      editType: "composition",
    }).editType,
    "composition",
  );
  assert.throws(
    () =>
      parseCreativeAssetEditRequestInput({
        baseAssetId: BASE,
        editType: "layers",
      }),
    CreativeAssetEditRequestValidationError,
  );
});

test("unknown keys are rejected", () => {
  assert.throws(
    () =>
      parseCreativeAssetEditRequestInput({
        baseAssetId: BASE,
        prompt: "sneaky",
      }),
    CreativeAssetEditRequestValidationError,
  );
});

test("non-object bodies are rejected", () => {
  for (const body of [null, undefined, "x", 5, [BASE]]) {
    assert.throws(
      () => parseCreativeAssetEditRequestInput(body),
      CreativeAssetEditRequestValidationError,
    );
  }
});
