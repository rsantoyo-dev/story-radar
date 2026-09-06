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
