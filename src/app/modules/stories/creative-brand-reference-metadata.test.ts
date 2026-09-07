import assert from "node:assert/strict";
import { test } from "node:test";

import {
  CreativeBrandReferenceValidationError,
  parseCreativeBrandReferenceMetadata,
  parseCreativeBrandReferencePatch,
} from "./creative-brand-reference-metadata";

test("parseCreativeBrandReferenceMetadata normalises a full payload", () => {
  assert.deepEqual(
    parseCreativeBrandReferenceMetadata({
      name: "  j'aime   St-Jean  poster ",
      kind: "poster",
      provenance: "  Cuenta salut.st.jean, enero 2026 ",
      usageNote: "",
      providerTransmissionAllowed: "true",
    }),
    {
      name: "j'aime St-Jean poster",
      kind: "poster",
      provenance: "Cuenta salut.st.jean, enero 2026",
      usageNote: null,
      providerTransmissionAllowed: true,
    },
  );
});

test("name is required and capped at 120 chars", () => {
  assert.throws(
    () => parseCreativeBrandReferenceMetadata({ name: "   " }),
    CreativeBrandReferenceValidationError,
  );
  assert.throws(
    () => parseCreativeBrandReferenceMetadata({}),
    CreativeBrandReferenceValidationError,
  );
  assert.throws(
    () =>
      parseCreativeBrandReferenceMetadata({ name: "x".repeat(121) }),
    CreativeBrandReferenceValidationError,
  );
});

test("kind defaults to 'other' and rejects unknown values", () => {
  assert.equal(
    parseCreativeBrandReferenceMetadata({ name: "n" }).kind,
    "other",
  );
  assert.equal(
    parseCreativeBrandReferenceMetadata({ name: "n", kind: "" }).kind,
    "other",
  );
  assert.equal(
    parseCreativeBrandReferenceMetadata({ name: "n", kind: "sticker-sheet" })
      .kind,
    "sticker-sheet",
  );
  assert.throws(
    () => parseCreativeBrandReferenceMetadata({ name: "n", kind: "logo" }),
    CreativeBrandReferenceValidationError,
  );
});

test("providerTransmissionAllowed coercion — default false", () => {
  const flag = (value: unknown) =>
    parseCreativeBrandReferenceMetadata({ name: "n", providerTransmissionAllowed: value })
      .providerTransmissionAllowed;
  assert.equal(flag(undefined), false);
  assert.equal(flag("false"), false);
  assert.equal(flag(false), false);
  assert.equal(flag("true"), true);
  assert.equal(flag(true), true);
  assert.throws(
    () => flag("maybe"),
    CreativeBrandReferenceValidationError,
  );
});

test("provenance / usage note length caps and empty → null", () => {
  const parsed = parseCreativeBrandReferenceMetadata({
    name: "n",
    provenance: "   ",
    usageNote: "  keep the local motifs ",
  });
  assert.equal(parsed.provenance, null);
  assert.equal(parsed.usageNote, "keep the local motifs");
  assert.throws(
    () =>
      parseCreativeBrandReferenceMetadata({ name: "n", usageNote: "x".repeat(1001) }),
    CreativeBrandReferenceValidationError,
  );
});

test("parseCreativeBrandReferencePatch only carries present keys", () => {
  assert.deepEqual(parseCreativeBrandReferencePatch({ name: " New name " }), {
    name: "New name",
  });
  assert.deepEqual(parseCreativeBrandReferencePatch({ isActive: false }), {
    isActive: false,
  });
  assert.throws(
    () => parseCreativeBrandReferencePatch({}),
    CreativeBrandReferenceValidationError,
  );
  assert.throws(
    () => parseCreativeBrandReferencePatch({ isActive: "no" }),
    CreativeBrandReferenceValidationError,
  );
});
