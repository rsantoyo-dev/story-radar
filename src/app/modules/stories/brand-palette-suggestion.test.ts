import assert from "node:assert/strict";
import test from "node:test";

import {
  assignUiRoles,
  fitShares,
  BRAND_PALETTE_SUGGESTION_SCHEMA,
  BrandPaletteSuggestionResponseError,
  BrandPaletteSuggestionValidationError,
  buildBrandPaletteSuggestionContents,
  parseBrandPaletteSuggestion,
  relativeLuminance,
  validateBrandPalettePrompt,
} from "./brand-palette-suggestion";

function roles(palette: { role?: string }[]) {
  return palette.map((entry) => entry.role ?? "-");
}

test("prompt validation trims whitespace and enforces bounds", () => {
  assert.equal(validateBrandPalettePrompt("  warm   Mediterranean\n morning  "), "warm Mediterranean morning");
  assert.throws(() => validateBrandPalettePrompt("short"), BrandPaletteSuggestionValidationError);
  assert.throws(() => validateBrandPalettePrompt(42), BrandPaletteSuggestionValidationError);
  assert.throws(() => validateBrandPalettePrompt("x".repeat(1_300)), BrandPaletteSuggestionValidationError);
});

test("a well-formed answer keeps names, uppercases hex and preserves roles", () => {
  const result = parseBrandPaletteSuggestion(
    JSON.stringify({
      summary: "Calm coastal editorial mood.",
      colors: [
        { name: "Deep harbour", color: "#0b2545", role: "primary" },
        { name: "Sea glass", color: "#8fd3c6", role: "secondary" },
        { name: "Sand paper", color: "#f7f2e8", role: "surface" },
        { name: "Rust buoy", color: "#c8553d", role: "supporting" },
      ],
    }),
  );
  assert.equal(result.summary, "Calm coastal editorial mood.");
  assert.deepEqual(
    result.palette.map((entry) => entry.color),
    ["#0B2545", "#8FD3C6", "#F7F2E8", "#C8553D"],
  );
  assert.deepEqual(roles(result.palette), ["primary", "secondary", "surface", "-"]);
});

test("missing roles are repaired by luminance and chroma", () => {
  const result = parseBrandPaletteSuggestion(
    JSON.stringify({
      summary: "",
      colors: [
        { name: "Ink", color: "#111827", role: "supporting" },
        { name: "Paper", color: "#FAFAF7", role: "supporting" },
        { name: "Saffron", color: "#F59E0B", role: "supporting" },
        { name: "Slate", color: "#64748B", role: "supporting" },
      ],
    }),
  );
  assert.deepEqual(roles(result.palette), ["primary", "surface", "secondary", "-"]);
});

test("duplicate roles keep the first and demote the rest", () => {
  const palette = assignUiRoles([
    { name: "A", color: "#202020", requestedRole: "primary" },
    { name: "B", color: "#303030", requestedRole: "primary" },
    { name: "C", color: "#FFFFFF", requestedRole: "surface" },
    { name: "D", color: "#FF0000" },
  ]);
  assert.deepEqual(roles(palette), ["primary", "-", "surface", "secondary"]);
});

test("invalid hex, duplicates and short-hand hex are normalized or dropped", () => {
  const result = parseBrandPaletteSuggestion(
    JSON.stringify({
      summary: "x",
      colors: [
        { name: "Bad", color: "not-a-colour", role: "primary" },
        { name: "Short", color: "#abc", role: "supporting" },
        { name: "Dup", color: "#AABBCC", role: "supporting" },
        { name: "Dark", color: "1A1A1A", role: "supporting" },
        { name: "Light", color: "#FFFFFF", role: "surface" },
      ],
    }),
  );
  assert.deepEqual(
    result.palette.map((entry) => entry.color),
    ["#AABBCC", "#1A1A1A", "#FFFFFF"],
  );
  assert.deepEqual(roles(result.palette), ["secondary", "primary", "surface"]);
});

test("too few usable colours or unreadable JSON are response errors", () => {
  assert.throws(
    () => parseBrandPaletteSuggestion(JSON.stringify({ summary: "", colors: [{ name: "One", color: "#000000", role: "primary" }] })),
    BrandPaletteSuggestionResponseError,
  );
  assert.throws(() => parseBrandPaletteSuggestion("not json"), BrandPaletteSuggestionResponseError);
  assert.throws(() => parseBrandPaletteSuggestion("[]"), BrandPaletteSuggestionResponseError);
});

test("names are deduplicated and capped, and at most eight colours survive", () => {
  const colors = Array.from({ length: 10 }, (_, index) => ({
    name: "Same name",
    color: `#${(index * 25).toString(16).padStart(2, "0").toUpperCase().repeat(3)}`,
    role: "supporting",
  }));
  const result = parseBrandPaletteSuggestion(JSON.stringify({ summary: "", colors }));
  assert.equal(result.palette.length, 8);
  assert.equal(new Set(result.palette.map((entry) => entry.name)).size, 8);
  assert.ok(result.palette.some((entry) => entry.role === "primary"));
  assert.ok(result.palette.some((entry) => entry.role === "surface"));
  assert.ok(result.palette.some((entry) => entry.role === "secondary"));
});

test("relative luminance orders black, grey and white", () => {
  assert.ok(relativeLuminance("#000000") < relativeLuminance("#808080"));
  assert.ok(relativeLuminance("#808080") < relativeLuminance("#FFFFFF"));
});

test("contents carry the editor description and the current palette without extra fields", () => {
  const contents = buildBrandPaletteSuggestionContents({
    prompt: "earthy and warm",
    currentPalette: [{ name: "Cream", color: "#F6F0E4", role: "surface" }],
    profile: { name: "Canada en claro", language: "es", audience: "newcomers" },
  });
  assert.equal(contents.editorDescription, "earthy and warm");
  assert.deepEqual(contents.publication, { name: "Canada en claro", language: "es", audience: "newcomers" });
  assert.deepEqual(contents.currentPalette, [{ name: "Cream", color: "#F6F0E4", role: "surface" }]);
});

test("the strict schema requires every property and forbids extras", () => {
  assert.equal(BRAND_PALETTE_SUGGESTION_SCHEMA.additionalProperties, false);
  assert.deepEqual([...BRAND_PALETTE_SUGGESTION_SCHEMA.required], ["summary", "colors"]);
  assert.equal(BRAND_PALETTE_SUGGESTION_SCHEMA.properties.colors.items.additionalProperties, false);
  assert.deepEqual([...BRAND_PALETTE_SUGGESTION_SCHEMA.properties.colors.items.required], ["name", "color", "role", "usage", "share"]);
});

test("usage and share from the model are normalized and only kept when meaningful", () => {
  const result = parseBrandPaletteSuggestion(
    JSON.stringify({
      summary: "",
      colors: [
        { name: "Cream", color: "#F6F0E4", role: "surface", usage: "  page   backgrounds ", share: 60.4 },
        { name: "Navy", color: "#102A43", role: "primary", usage: "", share: "25" },
        { name: "Orange", color: "#E86A33", role: "secondary", usage: "titles and accents", share: 0 },
        { name: "Olive", color: "#71805A", role: "supporting", usage: 7, share: "many" },
      ],
    }),
  );
  assert.deepEqual(result.palette, [
    { name: "Cream", color: "#F6F0E4", role: "surface", usage: "page backgrounds", share: 60 },
    { name: "Navy", color: "#102A43", role: "primary", share: 25 },
    { name: "Orange", color: "#E86A33", role: "secondary", usage: "titles and accents" },
    { name: "Olive", color: "#71805A" },
  ]);
});

test("shares that overshoot 100 are scaled down so the palette stays saveable", () => {
  const fitted = fitShares([
    { name: "A", color: "#111111", share: 80 },
    { name: "B", color: "#222222", share: 60 },
    { name: "C", color: "#333333", share: 1 },
    { name: "D", color: "#444444" },
  ]);
  assert.deepEqual(fitted, [
    { name: "A", color: "#111111", share: 56 },
    { name: "B", color: "#222222", share: 42 },
    { name: "C", color: "#333333" },
    { name: "D", color: "#444444" },
  ]);
  const untouched = [{ name: "A", color: "#111111", share: 50 }, { name: "B", color: "#222222", share: 50 }];
  assert.deepEqual(fitShares(untouched), untouched);
});
