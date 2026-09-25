import assert from "node:assert/strict";
import { test } from "node:test";

import {
  CREATIVE_VISUAL_GUIDANCE_TEXT_PROMPT_MAX_CHARS,
  resolveCreativeVisualGuidance,
} from "./creative-visual-guidance";

const palette = [
  { name: "Green", color: "#2F6F4F" },
  { name: "Cream", color: "#F6F0E4" },
  { name: "Navy", color: "#102A43" },
];

test("returns the full guide when no cap is given", () => {
  const guide = "A".repeat(5_000);
  const result = resolveCreativeVisualGuidance({
    name: "T",
    visualGuidance: guide,
    brandPalette: palette,
  });
  assert.ok(result.startsWith(guide));
  assert.ok(result.includes("Approved brand palette:"));
});

test("trims the free text at a word boundary when maxChars is set", () => {
  const guide = `${"word ".repeat(600)}TAILEND`; // ~3000 chars
  const result = resolveCreativeVisualGuidance(
    { name: "T", visualGuidance: guide, brandPalette: palette },
    { maxChars: CREATIVE_VISUAL_GUIDANCE_TEXT_PROMPT_MAX_CHARS },
  );
  const trimmed = result.split("\n\nApproved brand palette:")[0]!;
  assert.ok(trimmed.length <= CREATIVE_VISUAL_GUIDANCE_TEXT_PROMPT_MAX_CHARS + 6);
  assert.ok(trimmed.endsWith(" […]"));
  assert.ok(!trimmed.includes("TAILEND"));
  // The palette line always survives the trim.
  assert.ok(result.includes("Approved brand palette:"));
});

test("a guide shorter than the cap is left untouched", () => {
  const guide = "Keep it clean and legible.";
  const result = resolveCreativeVisualGuidance(
    { name: "T", visualGuidance: guide, brandPalette: palette },
    { maxChars: CREATIVE_VISUAL_GUIDANCE_TEXT_PROMPT_MAX_CHARS },
  );
  assert.ok(result.startsWith(guide));
  assert.ok(!result.includes("[…]"));
});

test("usage and share reach the palette line only when set", () => {
  const plain = resolveCreativeVisualGuidance({ name: "T", brandPalette: palette });
  assert.ok(plain.includes("Approved brand palette: Green #2F6F4F; Cream #F6F0E4; Navy #102A43."));
  assert.ok(!plain.includes("Intended usage split"));

  const annotated = resolveCreativeVisualGuidance({
    name: "T",
    brandPalette: [
      { name: "Cream", color: "#F6F0E4", role: "surface", usage: "page backgrounds", share: 60 },
      { name: "Navy", color: "#102A43", role: "primary", share: 25 },
      { name: "Orange", color: "#E86A33", usage: "titles and accents" },
      { name: "Olive", color: "#71805A" },
    ],
  });
  assert.ok(annotated.includes("surface: Cream #F6F0E4 (60%, page backgrounds)"));
  assert.ok(annotated.includes("primary: Navy #102A43 (25%)"));
  assert.ok(annotated.includes("Orange #E86A33 (titles and accents)"));
  assert.ok(annotated.includes("Olive #71805A;") || annotated.includes("Olive #71805A."));
  assert.ok(
    annotated.includes(
      "Intended usage split: 60% Cream, 25% Navy; the remaining 15% is free for the other approved colours.",
    ),
  );
});
