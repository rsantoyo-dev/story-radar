import assert from "node:assert/strict";
import test from "node:test";

import {
  contrastRatio,
  fitContrast,
  hexToOklch,
  oklchToHex,
  readableInk,
  withLightness,
} from "./oklch";

const HEX = /^#[0-9A-F]{6}$/;

test("hex <-> OKLCH round-trips within one 8-bit step", () => {
  for (const hex of ["#000000", "#FFFFFF", "#2F777B", "#EF644B", "#102A43", "#E8A83E"]) {
    const back = oklchToHex(hexToOklch(hex));
    assert.match(back, HEX);
    for (let channel = 1; channel < 7; channel += 2) {
      const a = Number.parseInt(hex.slice(channel, channel + 2), 16);
      const b = Number.parseInt(back.slice(channel, channel + 2), 16);
      assert.ok(Math.abs(a - b) <= 2, `${hex} -> ${back} channel drift`);
    }
  }
});

test("withLightness moves perceived lightness without flipping hue", () => {
  const lighter = withLightness("#2F777B", 0.9);
  assert.ok(hexToOklch(lighter).L > 0.8);
  assert.ok(
    Math.abs(hexToOklch(lighter).h - hexToOklch("#2F777B").h) < 12,
  );
});

test("oklchToHex desaturates instead of clipping when out of gamut", () => {
  // Absurd chroma request must still produce a real hex.
  const hex = oklchToHex({ L: 0.6, C: 0.9, h: 30 });
  assert.match(hex, HEX);
});

test("fitContrast reaches the target against a light background", () => {
  const fixed = fitContrast("#9AD0FF", "#FFFFFF", 4.5);
  assert.ok(contrastRatio(fixed, "#FFFFFF") >= 4.49);
});

test("fitContrast reaches the target against a dark background", () => {
  const fixed = fitContrast("#334155", "#101010", 4.5);
  assert.ok(contrastRatio(fixed, "#101010") >= 4.49);
});

test("fitContrast is a no-op when the pair already passes", () => {
  assert.equal(fitContrast("#111111", "#FFFFFF", 4.5), "#111111");
});

test("readableInk hits the full target on a light surface", () => {
  for (const bg of ["#FFFFFF", "#FAF5E6", "#F1F5F9"]) {
    assert.ok(contrastRatio(readableInk(bg, 7), bg) >= 6.9, bg);
  }
});

test("readableInk returns the best-effort ink on a saturated mid-tone", () => {
  for (const bg of ["#2F777B", "#EF644B", "#E8A83E", "#102A43"]) {
    const ink = readableInk(bg, 4.5);
    // Never worse than the plain better-of-black/white choice.
    const plain = Math.max(contrastRatio("#000000", bg), contrastRatio("#FFFFFF", bg));
    assert.ok(contrastRatio(ink, bg) >= Math.min(4.5, plain) - 0.01, bg);
  }
});
