import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_CREATIVE_BRAND_PALETTE,
  DEFAULT_CREATIVE_CAROUSEL_CHROME_SETTINGS,
} from "./creative-content.types";
import {
  CreativeCarouselChromeValidationError,
  parseCreativeBrandPaletteInput,
  parseCreativeCarouselChromeInput,
} from "./creative-carousel-chrome-validation";
import { topicThemeStyle } from "@/design/topic-themes";
import { contrastRatio, hexToOklch } from "@/design/color/oklch";

const HEX = /^#[0-9A-F]{6}$/;
const hueGap = (a: number, b: number) => {
  const diff = Math.abs(a - b) % 360;
  return diff > 180 ? 360 - diff : diff;
};

test("palette and carousel chrome default to the current campaign system", () => {
  const palette = parseCreativeBrandPaletteInput(undefined);
  assert.deepEqual(palette, DEFAULT_CREATIVE_BRAND_PALETTE);
  assert.deepEqual(
    parseCreativeCarouselChromeInput(undefined, palette),
    DEFAULT_CREATIVE_CAROUSEL_CHROME_SETTINGS,
  );
});

test("carousel chrome only accepts colours approved in the brand palette", () => {
  const palette = parseCreativeBrandPaletteInput([
    { name: "Cream", color: "#FAF5E6" },
    { name: "Coral", color: "#EF644B" },
    { name: "Teal", color: "#2F777B" },
  ]);
  assert.deepEqual(
    parseCreativeCarouselChromeInput(
      {
        enabled: true,
        style: "pill",
        backgroundColor: "#2f777b",
        textColor: "#faf5e6",
        accentColor: "#ef644b",
      },
      palette,
    ),
    {
      enabled: true,
      style: "pill",
      backgroundColor: "#2F777B",
      textColor: "#FAF5E6",
      accentColor: "#EF644B",
    },
  );
  assert.throws(
    () =>
      parseCreativeCarouselChromeInput(
        { ...DEFAULT_CREATIVE_CAROUSEL_CHROME_SETTINGS, backgroundColor: "#000000" },
        palette,
      ),
    CreativeCarouselChromeValidationError,
  );
});

test("palette UI roles are persisted and remain unique", () => {
  assert.deepEqual(
    parseCreativeBrandPaletteInput([
      { name: "Cream", color: "#faf5e6", role: "surface" },
      { name: "Coral", color: "#ef644b", role: "secondary" },
      { name: "Teal", color: "#2f777b", role: "primary" },
    ]),
    [
      { name: "Cream", color: "#FAF5E6", role: "surface" },
      { name: "Coral", color: "#EF644B", role: "secondary" },
      { name: "Teal", color: "#2F777B", role: "primary" },
    ],
  );

  assert.throws(
    () =>
      parseCreativeBrandPaletteInput([
        { name: "Teal", color: "#2F777B", role: "primary" },
        { name: "Coral", color: "#EF644B", role: "primary" },
        { name: "Cream", color: "#FAF5E6", role: "surface" },
      ]),
    CreativeCarouselChromeValidationError,
  );
});

test("brand palette roles theme the topic UI while keeping brand hues", () => {
  const style = topicThemeStyle("press-green", {
    brandPalette: [
      { name: "Cream", color: "#FAF5E6", role: "surface" },
      { name: "Coral", color: "#EF644B", role: "secondary" },
      { name: "Teal", color: "#2F777B", role: "primary" },
    ],
    carouselChrome: {
      backgroundColor: "#2F777B",
      textColor: "#FAF5E6",
      accentColor: "#EF644B",
    },
  });

  // Every emitted token is a valid opaque hex.
  for (const value of Object.values(style)) {
    assert.match(String(value), HEX);
  }

  // The primary role still reads as teal, the secondary still as coral.
  assert.ok(
    hueGap(
      hexToOklch(style["--ds__palette__primary-main"]).h,
      hexToOklch("#2F777B").h,
    ) < 18,
  );
  assert.ok(
    hueGap(
      hexToOklch(style["--ds__palette__secondary-main"]).h,
      hexToOklch("#EF644B").h,
    ) < 22,
  );

  // Working surface stays near-white regardless of the cream seed's warmth.
  assert.ok(hexToOklch(style["--ds__palette__surface-main"]).L > 0.9);

  // Contrast floors the engine promises.
  assert.ok(
    contrastRatio(
      style["--ds__palette__surface-contrast"],
      style["--ds__palette__surface-main"],
    ) >= 7,
  );
  assert.ok(
    contrastRatio(
      style["--ds__palette__primary-contrast"],
      style["--ds__palette__primary-main"],
    ) >= 4.5,
  );
  assert.ok(
    contrastRatio(
      style["--ds__palette__dark-contrast"],
      style["--ds__palette__dark-main"],
    ) >= 4.5,
  );
});

test("carousel colours seed sensible UI roles for legacy palettes", () => {
  const style = topicThemeStyle("press-green", {
    brandPalette: [
      { name: "Cream", color: "#FAF5E6" },
      { name: "Navy", color: "#102A43" },
      { name: "Gold", color: "#E8A83E" },
    ],
    carouselChrome: {
      backgroundColor: "#102A43",
      textColor: "#FAF5E6",
      accentColor: "#E8A83E",
    },
  });

  // No roles tagged: the carousel background hue drives primary, the accent
  // hue drives secondary.
  assert.ok(
    hueGap(
      hexToOklch(style["--ds__palette__primary-main"]).h,
      hexToOklch("#102A43").h,
    ) < 20,
  );
  assert.ok(
    hueGap(
      hexToOklch(style["--ds__palette__secondary-main"]).h,
      hexToOklch("#E8A83E").h,
    ) < 20,
  );
  assert.ok(hexToOklch(style["--ds__palette__surface-main"]).L > 0.9);
  assert.ok(
    contrastRatio(
      style["--ds__palette__surface-contrast"],
      style["--ds__palette__surface-main"],
    ) >= 7,
  );
});
