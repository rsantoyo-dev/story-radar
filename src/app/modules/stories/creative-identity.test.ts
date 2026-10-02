import assert from "node:assert/strict";
import test from "node:test";

import {
  CREATIVE_IDENTITY_FIELDS,
  creativeIdentityIsEmpty,
  CreativeIdentityValidationError,
  EMPTY_CREATIVE_IDENTITY,
  parseCreativeIdentityFields,
  parseCreativeIdentityInput,
  parseCreativeIdentityOrganizerResponse,
  renderCreativeIdentity,
} from "./creative-identity";

const identity = parseCreativeIdentityInput({
  priority: "Visual truth > editorial clarity > brand expression",
  format: { default: "carousel", rules: "4:5, cover with a single strong headline" },
  style: "Contemporary local editorial collage",
  photography: "Natural colour, believable available light, restrained processing",
  composition: "One dominant focal point, generous negative space",
  variation: "Alternate photo-led, typography-led and date-led slides",
  typography: "Bold geometric sans headlines, clean sans supporting text",
  avoid: [
    { category: "Light and effects", items: ["sparkles", "lens flares", "sparkles"] },
    { category: "light and effects", items: ["halos"] },
    { category: "Decorative marks", items: ["brush strokes", "connector lines"] },
    { category: "Empty", items: [] },
  ],
  allowed: ["simple weather symbols", "verified map markers"],
  fallback: "Typography-led or date-led layout",
  acceptance: ["Is every real place grounded in a verified reference?"],
});

test("an identity is validated: avoid groups merged and de-duplicated, empty groups dropped", () => {
  assert.equal(identity.format.default, "carousel");
  assert.deepEqual(identity.avoid, [
    { category: "Light and effects", items: ["sparkles", "lens flares", "halos"] },
    { category: "Decorative marks", items: ["brush strokes", "connector lines"] },
  ]);
  assert.equal(parseCreativeIdentityInput({ format: { default: "video" } }).format.default, null);
  assert.deepEqual(parseCreativeIdentityInput(undefined), EMPTY_CREATIVE_IDENTITY);
  assert.throws(() => parseCreativeIdentityInput("text"), CreativeIdentityValidationError);
  assert.equal(creativeIdentityIsEmpty(parseCreativeIdentityInput({})), true);
  assert.equal(creativeIdentityIsEmpty(identity), false);
});

test("an identity saved with the first, flat avoid list keeps it as one General group", () => {
  const legacy = parseCreativeIdentityInput({ style: "Collage", avoid: ["bunting", "garlands"] });
  assert.deepEqual(legacy.avoid, [{ category: "General", items: ["bunting", "garlands"] }]);
  assert.equal(legacy.photography, "");
});

test("the image model reads filled branches in a fixed order; acceptance criteria never reach it", () => {
  const text = renderCreativeIdentity(identity, "Salut St-Jean");
  const headings = ["PRIORITY:", "FORMAT:", "STYLE:", "PHOTOGRAPHY:", "COMPOSITION:", "VARIATION ACROSS SLIDES:", "TYPOGRAPHY:",
    "AVOID (never include these):", "ALLOWED EXCEPTIONS", "WHEN NO VERIFIED IMAGE IS AVAILABLE:"];
  const positions = headings.map((heading) => text.indexOf(heading));
  assert.ok(positions.every((position) => position > 0), positions.join(","));
  assert.deepEqual([...positions].sort((a, b) => a - b), positions);
  assert.match(text, /AVOID \(never include these\):\nLight and effects: sparkles; lens flares; halos\.\nDecorative marks: brush strokes; connector lines\./);
  assert.doesNotMatch(text, /verified reference\?/);
  assert.equal(renderCreativeIdentity(parseCreativeIdentityInput({ style: "Only style" }), "X"), "X — CREATIVE IDENTITY\n\nSTYLE: Only style");
});

test("a single-field rewrite keeps every other field exactly as it was", () => {
  const answer = JSON.stringify({ ...EMPTY_CREATIVE_IDENTITY, style: "changed", photography: "New: overcast natural light, no HDR", paletteDirection: "Cream base, navy text" });
  const { identity: next, paletteDirection } = parseCreativeIdentityOrganizerResponse(answer, ["photography"], identity);
  assert.equal(next.photography, "New: overcast natural light, no HDR");
  for (const field of CREATIVE_IDENTITY_FIELDS.filter((field) => field !== "photography")) assert.deepEqual(next[field], identity[field], field);
  assert.equal(paletteDirection, "Cream base, navy text");
});

test("requested fields are validated", () => {
  assert.deepEqual(parseCreativeIdentityFields(undefined), [...CREATIVE_IDENTITY_FIELDS]);
  assert.deepEqual(parseCreativeIdentityFields(["avoid", "avoid"]), ["avoid"]);
  assert.throws(() => parseCreativeIdentityFields(["palette"]), CreativeIdentityValidationError);
  assert.throws(() => parseCreativeIdentityOrganizerResponse("not json", ["style"], identity), CreativeIdentityValidationError);
});
