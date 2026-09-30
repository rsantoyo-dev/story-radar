import assert from "node:assert/strict";
import test from "node:test";

import sharp from "sharp";

import { adaptationCreditLine, compositeAdaptationCredit, compositeDocumentaryPortrait, PORTRAIT_ZONE, portraitCreditLine } from "./creative-portrait-composite";

async function pixel(image: Buffer, x: number, y: number): Promise<number[]> {
  const { data } = await sharp(image).extract({ left: x, top: y, width: 1, height: 1 }).raw().toBuffer({ resolveWithObject: true });
  return [...data.subarray(0, 3)];
}

test("the real photo is pasted inside the reserved zone; the AI design outside it is untouched", async () => {
  const design = await sharp({ create: { width: 1080, height: 1350, channels: 3, background: { r: 246, g: 240, b: 228 } } }).png().toBuffer();
  const photo = await sharp({ create: { width: 700, height: 1000, channels: 3, background: { r: 10, g: 120, b: 200 } } }).png().toBuffer();
  const output = await compositeDocumentaryPortrait({ image: design, photo, provenance: "Photo: Jane Doe · CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/) · https://commons.wikimedia.org/wiki/File:X.jpg" });

  const meta = await sharp(output).metadata();
  assert.deepEqual([meta.width, meta.height], [1080, 1350]);
  // Headline area and left column keep the generated design exactly.
  assert.deepEqual(await pixel(output, 100, 100), [246, 240, 228]);
  assert.deepEqual(await pixel(output, 100, 900), [246, 240, 228]);
  // The centre of the zone shows the photograph's own pixels.
  const centre = await pixel(output, PORTRAIT_ZONE.left + PORTRAIT_ZONE.width / 2, PORTRAIT_ZONE.top + PORTRAIT_ZONE.height / 2 - 40);
  assert.ok(Math.abs(centre[0] - 10) <= 2 && Math.abs(centre[1] - 120) <= 2 && Math.abs(centre[2] - 200) <= 2, centre.join(","));
});

test("the credit line keeps author and license and drops URLs", () => {
  assert.equal(
    portraitCreditLine("Photo: Kevin Paul · CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/) · https://commons.wikimedia.org/wiki/File:K.jpg · via Wikimedia Commons"),
    "Photo: Kevin Paul · CC BY 4.0 · via Wikimedia Commons",
  );
  assert.ok(portraitCreditLine("x".repeat(200)).length <= 92);
});

test("an AI adaptation of a licensed photo carries its credit on the right edge, leaving the design intact", async () => {
  const design = await sharp({ create: { width: 1080, height: 1350, channels: 3, background: { r: 200, g: 102, b: 42 } } }).png().toBuffer();
  const credit = adaptationCreditLine("Photo: Pierre Bona · CC BY-SA 3.0 (https://creativecommons.org/licenses/by-sa/3.0/) · https://commons.wikimedia.org/wiki/File:M.jpg · via Wikimedia Commons");
  assert.equal(credit, "Adaptation IA · Photo: Pierre Bona · CC BY-SA 3.0 · via Wikimedia Commons");
  const output = await compositeAdaptationCredit({ image: design, credits: [credit] });
  assert.deepEqual([(await sharp(output).metadata()).width, (await sharp(output).metadata()).height], [1080, 1350]);
  assert.deepEqual(await pixel(output, 540, 675), [200, 102, 42], "the centre of the design is untouched");
  assert.notDeepEqual(await pixel(output, 1060, 675), [200, 102, 42], "the credit label sits on the right edge");
});
