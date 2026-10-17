import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { createCanvas } from "@napi-rs/canvas";
import { BRAND_FONTS, DEFAULT_WORDS_STYLE, brandFontChoice, parseCreativeWordsStyle } from "./brand-fonts";
import { canvasFont, registerBrandFonts } from "./brand-fonts.server";

test("every font of the catalog is bundled: a TrueType file in fonts/brand with its license", () => {
  assert.ok(BRAND_FONTS.length >= 30, "about thirty families to choose from");
  for (const font of BRAND_FONTS) {
    for (const { file } of font.files) {
      const full = path.join(process.cwd(), "fonts", "brand", font.dir, file);
      assert.ok(existsSync(full), `${font.name}: ${file}`);
      assert.equal(readFileSync(full).readUInt32BE(0), 0x00010000, `${font.name}: ${file} is TrueType`);
    }
    if (font.dir !== "..") assert.ok(existsSync(path.join(process.cwd(), "fonts", "brand", font.dir, font.license === "OFL" ? "OFL.txt" : "LICENSE.txt")), `${font.name}'s license`);
  }
  assert.equal(new Set(BRAND_FONTS.map((font) => font.id)).size, BRAND_FONTS.length, "ids are unique");
});

test("every font draws in its own face at each of its weights, never in a fallback", () => {
  registerBrandFonts();
  const ctx = createCanvas(16, 16).getContext("2d");
  const sample = "Ñandú pequeño · ¿Café à la crème? 1080";
  const measure = (font: string, variations: string) => { ctx.font = font; ctx.fontVariationSettings = variations; return Math.round(ctx.measureText(sample).width); };
  const missing = measure('400 32px "No Such Family"', "normal");
  for (const font of BRAND_FONTS.filter((entry) => entry.id !== "liberation-sans")) {
    const widths = font.weights.map((weight) => { const { font: spec, variations } = canvasFont({ font: font.id, weight }, 32); return measure(spec, variations); });
    assert.ok(widths.every((width) => width !== missing), `${font.name} draws in its own face`);
    if (font.weights.length > 1) assert.ok(new Set(widths).size > 1, `${font.name}'s weights differ`);
  }
  assert.match(canvasFont({ font: "fraunces-soft", weight: 900 }, 88).variations, /"wght" 900, "SOFT" 100, "WONK" 0, "opsz" 88/, "Fraunces Soft: its rounded serifs and the optical size of the words");
});

test("a brand's fonts as stored: a known family at one of its weights, the nearest when not; nothing usable is none", () => {
  assert.deepEqual(brandFontChoice({ font: "dm-sans", weight: 520 }, DEFAULT_WORDS_STYLE.text), { font: "dm-sans", weight: 500 });
  assert.deepEqual(brandFontChoice({ font: "no-such-font", weight: 700 }, DEFAULT_WORDS_STYLE.headline), DEFAULT_WORDS_STYLE.headline);
  assert.deepEqual(parseCreativeWordsStyle({ headline: { font: "fraunces-soft", weight: 900 }, text: { font: "dm-sans", weight: 500 } }), { headline: { font: "fraunces-soft", weight: 900 }, text: { font: "dm-sans", weight: 500 } });
  assert.equal(parseCreativeWordsStyle(null), null);
  assert.equal(parseCreativeWordsStyle({}), null);
});
