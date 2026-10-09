import assert from "node:assert/strict";
import test from "node:test";

import sharp from "sharp";

import { adaptationCreditLine, compositeDocumentaryPortrait, placePhotoAdaptationCreditLine, focalCrop, PORTRAIT_LAYOUTS, PORTRAIT_PHOTO, PORTRAIT_ZONE, portraitAccent, portraitCreditLine, portraitLayoutForSlide, portraitZonePrompt } from "./creative-portrait-composite";
import { parsePhotoFocus } from "./story-materials.types";

async function pixel(image: Buffer, x: number, y: number): Promise<number[]> {
  const { data } = await sharp(image).extract({ left: x, top: y, width: 1, height: 1 }).raw().toBuffer({ resolveWithObject: true });
  return [...data.subarray(0, 3)];
}

test("the real photo is a borderless crop inside the reserved zone, with no frame or credit; the design around it is untouched", async () => {
  const design = await sharp({ create: { width: 1080, height: 1350, channels: 3, background: { r: 246, g: 240, b: 228 } } }).png().toBuffer();
  const photo = await sharp({ create: { width: 700, height: 1000, channels: 3, background: { r: 10, g: 120, b: 200 } } }).png().toBuffer();
  const output = await compositeDocumentaryPortrait({ image: design, photo });

  const meta = await sharp(output).metadata();
  assert.deepEqual([meta.width, meta.height], [1080, 1350]);
  // Headline area and left column keep the generated design exactly.
  assert.deepEqual(await pixel(output, 100, 100), [246, 240, 228]);
  assert.deepEqual(await pixel(output, 100, 900), [246, 240, 228]);
  const isPhoto = (value: number[]) => Math.abs(value[0] - 10) <= 2 && Math.abs(value[1] - 120) <= 2 && Math.abs(value[2] - 200) <= 2;
  // Every corner and the bottom edge of the photo area are photo pixels: no white border or credit strip.
  const zone = PORTRAIT_PHOTO;
  for (const [x, y] of [[zone.left + 1, zone.top + 1], [zone.left + zone.width - 2, zone.top + 1], [zone.left + 1, zone.top + zone.height - 2], [zone.left + zone.width / 2, zone.top + zone.height - 8]]) {
    const value = await pixel(output, x, y);
    assert.ok(isPhoto(value), `${x},${y}: ${value.join(",")}`);
  }
  // A soft shadow falls below the photo, and fades out before the zone's left edge.
  const below = await pixel(output, PORTRAIT_PHOTO.left + PORTRAIT_PHOTO.width / 2, PORTRAIT_PHOTO.top + PORTRAIT_PHOTO.height + 6);
  assert.ok(below[0] < 246 && below[0] > 150, `shadow ${below.join(",")}`);
  assert.deepEqual(await pixel(output, PORTRAIT_ZONE.left - 20, PORTRAIT_ZONE.top + 5), [246, 240, 228]);
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
  // A verified place photo the model adapted gets the same caption line; its image carries none.
  assert.equal(placePhotoAdaptationCreditLine({ author: "Yource", license: "CC BY-SA 4.0" }), "Adaptation IA · Photo: Yource · CC BY-SA 4.0 · via Wikimedia Commons");
  assert.equal(placePhotoAdaptationCreditLine({ author: "Larry D. Moore", license: "CC BY 2.0", provider: "openverse" }), "Adaptation IA · Photo: Larry D. Moore · CC BY 2.0 · via Openverse");
});

test("photo slides rotate through the layouts, never repeating on consecutive slides", () => {
  const ids = [1, 2, 3, 4, 5, 6].map(portraitLayoutForSlide);
  assert.equal(new Set(ids.slice(0, 5)).size, 5);
  ids.slice(1).forEach((id, index) => assert.notEqual(id, ids[index]));
  const prompt = portraitZonePrompt("rounded-left");
  assert.match(prompt, /rounded corners on the left/);
  assert.match(prompt, /overrides any photo position/);
  assert.match(prompt, /supporting text in the right column/);
});

test("the colour block uses a brand accent, never the page surface or the text colour", () => {
  const palette = [{ color: "#F6F0E4", role: "surface" }, { color: "#173F52", role: "primary" }, { color: "#168C91", role: "secondary" }, { color: "#E85D4A" }];
  assert.equal(portraitAccent(palette, 1), "#168C91");
  assert.equal(portraitAccent(palette, 2), "#E85D4A");
  assert.equal(portraitAccent([{ color: "#F6F0E4", role: "surface" }], 1), undefined);
});

test("each layout shows the photo in its place, its shape and its brand block, leaving the rest of the design", async () => {
  const design = await sharp({ create: { width: 1080, height: 1350, channels: 3, background: { r: 246, g: 240, b: 228 } } }).png().toBuffer();
  const photo = await sharp({ create: { width: 700, height: 1000, channels: 3, background: { r: 10, g: 120, b: 200 } } }).png().toBuffer();
  const isPhoto = (value: number[]) => Math.abs(value[0] - 10) <= 3 && Math.abs(value[1] - 120) <= 3 && Math.abs(value[2] - 200) <= 3;
  for (const layout of PORTRAIT_LAYOUTS) {
    const output = await compositeDocumentaryPortrait({ image: design, photo, layout: layout.id, accent: "#E85D4A" });
    const { left, top, width, height } = layout.photo;
    assert.ok(isPhoto(await pixel(output, left + width / 2, top + height - 30)), `${layout.id} centre`);
    if (layout.shape === "arch" || layout.shape === "circle" || layout.shape === "rounded") {
      assert.ok(!isPhoto(await pixel(output, left + 2, top + 2)), `${layout.id} corner is cut to its shape`);
    }
    if (layout.block) {
      const corner = await pixel(output, left + layout.block.dx + 4, top + height + layout.block.dy - 4);
      assert.deepEqual(corner, [232, 93, 74], `${layout.id} brand block`);
    }
    if (layout.id !== "top-bleed") assert.deepEqual(await pixel(output, 20, 20), [246, 240, 228], `${layout.id} design kept`);
  }
});

test("the crop window keeps the editor's focal point, as central as the photo allows", () => {
  // A phone photo (9:16) in the 4:5 frame: full width, a window of the frame's shape.
  const phone = { width: 941, height: 1672 };
  const frame = { width: 510, height: 640 };
  assert.deepEqual(focalCrop(phone, frame, { x: 0.5, y: 0.75 }), { left: 0, top: 491, width: 941, height: 1181 }, "people at the bottom: the window goes as low as the photo allows");
  assert.deepEqual(focalCrop(phone, frame, { x: 0.5, y: 0.5 }), { left: 0, top: 246, width: 941, height: 1181 });
  assert.deepEqual(focalCrop(phone, frame, { x: 0.5, y: 0.1 }).top, 0, "clamped at the top");
  // A landscape photo in the circle: full height, the window slides sideways.
  assert.deepEqual(focalCrop({ width: 1600, height: 900 }, { width: 520, height: 520 }, { x: 0.9, y: 0.5 }), { left: 700, top: 0, width: 900, height: 900 });
});

test("with a focal point the pasted photo keeps the subject where the automatic crop would not", async () => {
  const design = await sharp({ create: { width: 1080, height: 1350, channels: 3, background: { r: 246, g: 240, b: 228 } } }).png().toBuffer();
  // Bright foliage on top, the people in the bottom fifth of a tall photo.
  const foliage = await sharp({ create: { width: 900, height: 1300, channels: 3, background: { r: 240, g: 200, b: 20 } } }).png().toBuffer();
  const photo = await sharp({ create: { width: 900, height: 1600, channels: 3, background: { r: 20, g: 60, b: 160 } } })
    .composite([{ input: foliage, left: 0, top: 0 }]).png().toBuffer();
  const layout = PORTRAIT_LAYOUTS.find((candidate) => candidate.id === "offset-block-right")!;
  const output = await compositeDocumentaryPortrait({ image: design, photo, layout: layout.id, focus: { x: 0.5, y: 0.9 } });
  const bottom = await pixel(output, layout.photo.left + layout.photo.width / 2, layout.photo.top + layout.photo.height - 10);
  assert.ok(bottom[2] > 140 && bottom[0] < 40, `the people stay in the frame: ${bottom.join(",")}`);
  const top = await pixel(output, layout.photo.left + layout.photo.width / 2, layout.photo.top + 10);
  assert.ok(top[0] > 200, `the foliage above is what gets cut: ${top.join(",")}`);
});

test("a focal point from the browser must be two fractions; null clears it", () => {
  assert.deepEqual(parsePhotoFocus({ x: 0.12345, y: 1 }), { x: 0.123, y: 1 });
  assert.equal(parsePhotoFocus(null), null);
  assert.throws(() => parsePhotoFocus({ x: 1.2, y: 0.5 }), /between 0 and 1/);
  assert.throws(() => parsePhotoFocus({ x: "0.5", y: 0.5 }), /between 0 and 1/);
  assert.throws(() => parsePhotoFocus(undefined), /between 0 and 1/);
});
