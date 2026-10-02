import assert from "node:assert/strict";
import test from "node:test";

import sharp from "sharp";

import { adaptationCreditLine, compositeDocumentaryPortrait, PORTRAIT_ZONE, portraitCreditLine } from "./creative-portrait-composite";

async function pixel(image: Buffer, x: number, y: number): Promise<number[]> {
  const { data } = await sharp(image).extract({ left: x, top: y, width: 1, height: 1 }).raw().toBuffer({ resolveWithObject: true });
  return [...data.subarray(0, 3)];
}

test("the real photo fills the reserved zone edge to edge, with no frame or credit; the design outside it is untouched", async () => {
  const design = await sharp({ create: { width: 1080, height: 1350, channels: 3, background: { r: 246, g: 240, b: 228 } } }).png().toBuffer();
  const photo = await sharp({ create: { width: 700, height: 1000, channels: 3, background: { r: 10, g: 120, b: 200 } } }).png().toBuffer();
  const output = await compositeDocumentaryPortrait({ image: design, photo });

  const meta = await sharp(output).metadata();
  assert.deepEqual([meta.width, meta.height], [1080, 1350]);
  // Headline area and left column keep the generated design exactly.
  assert.deepEqual(await pixel(output, 100, 100), [246, 240, 228]);
  assert.deepEqual(await pixel(output, 100, 900), [246, 240, 228]);
  const isPhoto = (value: number[]) => Math.abs(value[0] - 10) <= 2 && Math.abs(value[1] - 120) <= 2 && Math.abs(value[2] - 200) <= 2;
  // Every corner and the bottom edge of the zone are photo pixels: no white border or credit strip.
  const zone = PORTRAIT_ZONE;
  for (const [x, y] of [[zone.left + 1, zone.top + 1], [zone.left + zone.width - 2, zone.top + 1], [zone.left + 1, zone.top + zone.height - 2], [zone.left + zone.width / 2, zone.top + zone.height - 8]]) {
    const value = await pixel(output, x, y);
    assert.ok(isPhoto(value), `${x},${y}: ${value.join(",")}`);
  }
});

test("the credit line keeps author and license and drops URLs", () => {
  assert.equal(
    portraitCreditLine("Photo: Kevin Paul · CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/) · https://commons.wikimedia.org/wiki/File:K.jpg · via Wikimedia Commons"),
    "Photo: Kevin Paul · CC BY 4.0 · via Wikimedia Commons",
  );
  assert.ok(portraitCreditLine("x".repeat(200)).length <= 92);
});

test("an AI adaptation of a licensed photo has a credit line for the caption", () => {
  const credit = adaptationCreditLine("Photo: Pierre Bona · CC BY-SA 3.0 (https://creativecommons.org/licenses/by-sa/3.0/) · https://commons.wikimedia.org/wiki/File:M.jpg · via Wikimedia Commons");
  assert.equal(credit, "Adaptation IA · Photo: Pierre Bona · CC BY-SA 3.0 · via Wikimedia Commons");
});
