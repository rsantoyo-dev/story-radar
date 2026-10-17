import assert from "node:assert/strict";
import test from "node:test";
import sharp from "sharp";
import { TEXT_CANVAS, setSlideWords, textBandFor, textBandPrompt, wordsPalette, type Draft2TextBand } from "./draft2-text-layer";

test("where the program sets the words: along the top, below a logo on top; along the bottom when a photo bleeds from the top or the map sits top right", () => {
  assert.deepEqual(textBandFor({}), { edge: "top", left: 72, top: 64, width: 936, height: 540 });
  assert.equal(textBandFor({ logo: { left: 443, top: 54, width: 194, height: 59 } }).top, 141, "28 pixels below the cover's logo");
  const bleed = textBandFor({ photoLayout: "top-bleed" });
  assert.deepEqual([bleed.edge, bleed.top + bleed.height], ["bottom", TEXT_CANVAS.height - 120], "above the page number");
  assert.equal(textBandFor({ mapPosition: "top-right" }).edge, "bottom");
  assert.equal(textBandFor({ mapPosition: "bottom-right", photoLayout: "rounded-left" }).edge, "top", "a photo or a map low on the slide leaves the top to the words");
  const aboveLogo = textBandFor({ photoLayout: "top-bleed", logo: { left: 900, top: 1240, width: 120, height: 60 } });
  assert.equal(aboveLogo.top + aboveLogo.height, 1212, "above a logo that sits at the bottom");
  assert.match(textBandPrompt(textBandFor({})), /Render no words, letters, numbers or signs anywhere in the image[\s\S]*Keep the top of the image down to 45% of its height calm and plain/);
  assert.match(textBandPrompt(bleed), /Keep the band from 51% of the height down to 91% calm and plain/);
});

test("the words' colours: the palette's darkest and lightest when they read on each other, else a neutral pair", () => {
  // Fogón Lab's palette: terracotta, cream, teal and the ink blue it keeps for text.
  assert.deepEqual(wordsPalette([{ color: "#963F2D" }, { color: "#F6F0E4" }, { color: "#185B5C" }, { color: "#253746" }]), { ink: "#253746", paper: "#F6F0E4" });
  assert.deepEqual(wordsPalette([{ color: "#777777" }, { color: "#888888" }]), { ink: "#1b1f24", paper: "#ffffff" }, "two greys too close to read on each other");
  assert.deepEqual(wordsPalette(undefined), { ink: "#1b1f24", paper: "#ffffff" });
});

/** How many pixels of a region differ between two images of the slide's size. */
async function changedPixels(a: Uint8Array, b: Uint8Array, region: { left: number; top: number; width: number; height: number }): Promise<number> {
  const raw = async (image: Uint8Array) => sharp(Buffer.from(image)).extract(region).removeAlpha().raw().toBuffer();
  const [left, right] = await Promise.all([raw(a), raw(b)]);
  let changed = 0;
  for (let at = 0; at < left.length; at += 3) if (left[at] !== right[at] || left[at + 1] !== right[at + 1] || left[at + 2] !== right[at + 2]) changed++;
  return changed;
}

test("the words set in the band: straight on a calm field in the colour that reads, on a card over a busy one, never outside the band", async () => {
  const palette = { ink: "#253746", paper: "#F6F0E4" };
  const words = { headline: "Torcido, el rebote pierde fuerza", text: "Al torcerlo hace falta doblarlo menos, y el rebote se debilita.", practical: "Pruébalo con espagueti seco." };
  const band: Draft2TextBand = textBandFor({});
  const teal = new Uint8Array(await sharp({ create: { width: 1080, height: 1350, channels: 3, background: "#185B5C" } }).png().toBuffer());
  const plain = await setSlideWords({ image: teal, words, band, palette });
  assert.deepEqual([plain.panel, plain.color], [false, "#F6F0E4"], "cream on the dark teal, with no card");
  assert.ok(await changedPixels(teal, plain.image, band) > 2_000, "the words are in the band");
  assert.equal(await changedPixels(teal, plain.image, { left: 0, top: band.top + band.height, width: 1080, height: 1350 - band.top - band.height }), 0, "nothing below the band changed");
  assert.equal(await changedPixels(teal, plain.image, { left: 0, top: 0, width: band.left, height: 1350 }), 0, "nor in the side margin");
  const stripes = `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1350">${Array.from({ length: 34 }, (_, index) => `<rect x="0" y="${index * 40}" width="1080" height="20" fill="#ffffff"/>`).join("")}</svg>`;
  const busy = new Uint8Array(await sharp({ create: { width: 1080, height: 1350, channels: 3, background: "#101010" } }).composite([{ input: Buffer.from(stripes) }]).png().toBuffer());
  const carded = await setSlideWords({ image: busy, words, band, palette });
  assert.deepEqual([carded.panel, carded.color], [true, "#253746"], "ink on a cream card over the busy band");
  const cover = await setSlideWords({ image: teal, words: { headline: "¿Por qué el espagueti casi nunca se parte en dos?", text: "Un físico famoso pasó una noche intentándolo." }, band, palette, cover: true });
  assert.ok(await changedPixels(teal, cover.image, band) > await changedPixels(teal, plain.image, { ...band, height: 1 }), "a cover's words are set too");
});
