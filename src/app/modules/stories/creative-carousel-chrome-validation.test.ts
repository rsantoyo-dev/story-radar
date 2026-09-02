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
