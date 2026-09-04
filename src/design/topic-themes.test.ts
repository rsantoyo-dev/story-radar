import assert from "node:assert/strict";
import test from "node:test";

import { contrastRatio, hexToOklch } from "./color/oklch";
import {
  deriveBrandUiPalette,
  getTopicTheme,
  type BrandUiPalette,
} from "./topic-themes";

const HEX = /^#[0-9A-F]{6}$/;
const ROLES = [
  "primary",
  "secondary",
  "surface",
  "tertiary",
  "dark",
  "neutral",
  "light",
] as const;
const TONES = ["main", "light", "dark", "contrast"] as const;

function hueGap(a: number, b: number): number {
  const diff = Math.abs(a - b) % 360;
  return diff > 180 ? 360 - diff : diff;
}

const chrome = {
  backgroundColor: "#102A43",
  textColor: "#FAF5E6",
  accentColor: "#E8A83E",
};

function assertUsable(palette: BrandUiPalette) {
  for (const role of ROLES) {
    for (const tone of TONES) {
      assert.match(palette[role][tone], HEX, `${role}-${tone}`);
    }
  }
  // The floors the engine promises the editor.
  assert.ok(
    contrastRatio(palette.surface.contrast, palette.surface.main) >= 7,
    "body text on surface",
  );
  assert.ok(
    contrastRatio(palette.primary.contrast, palette.primary.main) >= 4.5,
    "primary button label",
  );
  assert.ok(
    contrastRatio(palette.secondary.contrast, palette.secondary.main) >= 4.5,
    "secondary badge label",
  );
  assert.ok(
    contrastRatio(palette.dark.contrast, palette.dark.main) >= 4.5,
    "sidebar text",
  );
  assert.ok(
    contrastRatio(palette.tertiary.dark, palette.surface.main) >= 4.4,
    "muted caption on surface",
  );
  // Working surface must stay light and quiet.
  assert.ok(hexToOklch(palette.surface.main).L > 0.9, "surface is near-white");
  assert.ok(hexToOklch(palette.surface.main).C < 0.03, "surface barely tinted");
  // Sidebar must stay dark enough to host light text.
  assert.ok(hexToOklch(palette.dark.main).L < 0.3, "sidebar shell is dark");
}

test("falls back to the predefined theme when no valid colours are given", () => {
  const fallback = getTopicTheme("press-green").palette;
  const { palette, warnings } = deriveBrandUiPalette(
    { brandPalette: [{ color: "not-a-hex" }], carouselChrome: chrome },
    fallback,
  );
  assert.equal(palette, fallback);
  assert.deepEqual(warnings, []);
});

test("stays usable for a bright, warm brand palette", () => {
  const { palette } = deriveBrandUiPalette({
    brandPalette: [
      { name: "Sun", color: "#F4AF36", role: "primary" },
      { name: "Sky", color: "#3AA7F0", role: "secondary" },
      { name: "Paper", color: "#FFFDF7", role: "surface" },
    ],
    carouselChrome: chrome,
  });
  assertUsable(palette);
  assert.ok(
    Math.abs(hexToOklch(palette.primary.main).h - hexToOklch("#F4AF36").h) < 20,
    "primary keeps its gold hue",
  );
});

test("keeps a very dark brand primary verbatim (white text already reads)", () => {
  const { palette } = deriveBrandUiPalette({
    brandPalette: [
      { name: "Ink", color: "#0B1220", role: "primary" },
      { name: "Blood", color: "#7A0B0B", role: "secondary" },
      { name: "Slate", color: "#141A22", role: "surface" },
    ],
    carouselChrome: chrome,
  });
  assertUsable(palette);
  // A dark navy button is fine as-is: lightness barely moves.
  assert.ok(
    Math.abs(hexToOklch(palette.primary.main).L - hexToOklch("#0B1220").L) <
      0.06,
    "dark primary is preserved",
  );
});

test("keeps a saturated mid-tone primary and still clears the label floor", () => {
  const { palette } = deriveBrandUiPalette({
    brandPalette: [
      { name: "Signal", color: "#E85D2F", role: "primary" },
      { name: "Sky", color: "#2F6FE8", role: "secondary" },
      { name: "Paper", color: "#FFFFFF", role: "surface" },
    ],
    carouselChrome: chrome,
  });
  assertUsable(palette);
  // The engine picks the ink (here a near-black) rather than moving the colour.
  assert.ok(
    Math.abs(hexToOklch(palette.primary.main).L - hexToOklch("#E85D2F").L) <
      0.06,
    "brand orange is preserved",
  );
  assert.ok(
    contrastRatio(palette.primary.contrast, palette.primary.main) >= 4.5,
  );
});

test("stays usable when only supporting colours exist (legacy, no roles)", () => {
  const { palette } = deriveBrandUiPalette({
    brandPalette: [
      { name: "Cream", color: "#FAF5E6" },
      { name: "Navy", color: "#102A43" },
      { name: "Gold", color: "#E8A83E" },
    ],
    carouselChrome: chrome,
  });
  assertUsable(palette);
});

test("warns when primary and secondary are nearly the same hue", () => {
  const { warnings } = deriveBrandUiPalette({
    brandPalette: [
      { name: "Teal", color: "#2F777B", role: "primary" },
      { name: "Teal 2", color: "#2E7E82", role: "secondary" },
      { name: "Paper", color: "#FFFFFF", role: "surface" },
    ],
    carouselChrome: chrome,
  });
  assert.ok(warnings.some((line) => line.toLowerCase().includes("hue")));
});

test("blends tertiary hue across the 0° / 360° boundary", () => {
  const { palette } = deriveBrandUiPalette({
    brandPalette: [
      { name: "Pink red", color: "#FF00AA", role: "primary" },
      { name: "Warm red", color: "#FF3300", role: "secondary" },
      { name: "Paper", color: "#FFFFFF", role: "surface" },
    ],
    carouselChrome: chrome,
  });

  // 349.7° and 32.6° are neighbouring red hues; their midpoint is near 11°,
  // never the opposite cyan/teal region around 190°.
  assert.ok(
    hueGap(hexToOklch(palette.tertiary.main).h, 11) < 24,
    `expected a warm tertiary, received ${palette.tertiary.main}`,
  );
});

test("reports saturation and surface adjustments in the live preview", () => {
  const { warnings } = deriveBrandUiPalette({
    brandPalette: [
      { name: "Vivid magenta", color: "#FF00AA", role: "primary" },
      { name: "Warm red", color: "#FF3300", role: "secondary" },
      { name: "Dark paper", color: "#141A22", role: "surface" },
    ],
    carouselChrome: chrome,
  });

  assert.ok(
    warnings.some((line) => line.startsWith("Primary brand colour was adjusted")),
  );
  assert.ok(
    warnings.some((line) => line.startsWith("Surface brand colour was converted")),
  );
});

test("is deterministic", () => {
  const input = {
    brandPalette: [
      { name: "A", color: "#2F777B", role: "primary" as const },
      { name: "B", color: "#EF644B", role: "secondary" as const },
    ],
    carouselChrome: chrome,
  };
  assert.deepEqual(
    deriveBrandUiPalette(input).palette,
    deriveBrandUiPalette(input).palette,
  );
});
