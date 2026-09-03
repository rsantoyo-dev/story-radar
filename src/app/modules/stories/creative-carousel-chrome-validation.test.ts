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

test("brand palette roles override UXDSL tokens for the selected topic", () => {
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

  assert.equal(style["--ds__palette__primary-main"], "#2F777B");
  assert.equal(style["--ds__palette__secondary-main"], "#EF644B");
  assert.equal(style["--ds__palette__surface-main"], "#FAF5E6");
  assert.equal(style["--ds__palette__primary-contrast"], "#FFFFFF");
  assert.equal(style["--ds__palette__surface-contrast"], "#111111");
});

test("carousel colours provide sensible UI roles for legacy palettes", () => {
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

  assert.equal(style["--ds__palette__primary-main"], "#102A43");
  assert.equal(style["--ds__palette__secondary-main"], "#E8A83E");
  assert.equal(style["--ds__palette__surface-main"], "#FAF5E6");
});
