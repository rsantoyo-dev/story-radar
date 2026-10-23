import assert from "node:assert/strict";
import test from "node:test";
import sharp from "sharp";
import { TEXT_CANVAS, autoWordsLayout, drawWords, setSlideWords, textBandFor, textBandPrompt, remarkData, textStyleFor, wordsPalette, type Draft2TextBand } from "./draft2-text-layer";

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

test("a layout sets the words where it says, in the brand's fonts: in its box, centred when asked, a band across the slide", async () => {
  const { drawWords, autoWordsLayout } = await import("./draft2-text-layer");
  const teal = new Uint8Array(await sharp({ create: { width: 1080, height: 1350, channels: 3, background: "#185B5C" } }).png().toBuffer());
  const words = { headline: "Torcido, el rebote pierde fuerza", text: "Al torcerlo hace falta doblarlo menos." };
  const style = { headline: { font: "fraunces-soft", weight: 900 }, text: { font: "dm-sans", weight: 500 } };
  const auto = await autoWordsLayout({ image: teal, words, band: textBandFor({}), palette: { ink: "#253746", paper: "#F6F0E4" }, style });
  assert.deepEqual([auto.headline.font, auto.headline.weight, auto.text.font, auto.text.weight, auto.background.kind], ["fraunces-soft", 900, "dm-sans", 500, "none"], "the brand's fonts, on the calm teal with no card");
  const capitals = await autoWordsLayout({ image: teal, words, band: textBandFor({}), palette: { ink: "#253746", paper: "#F6F0E4" }, style: { headline: { font: "lilita-one", weight: 400, upper: true as const }, text: { font: "inter", weight: 600 } } });
  assert.deepEqual([capitals.headline.upper, capitals.text.upper], [true, undefined], "a brand's headlines in capitals start the layout in capitals");
  // A longer text in the paragraph's font, counted as the program counts words; a short one in the text's.
  const fogon = { headline: { font: "fraunces-soft", weight: 900 }, text: { font: "dm-sans", weight: 700 }, paragraph: { font: "dm-sans", weight: 400, from: 16 } };
  const long = "Al nivel del mar el agua hierve a 100 °C. En Bogotá hierve a unos 91 °C: es un hervor más frío.";
  assert.deepEqual(textStyleFor(fogon, long), { font: "dm-sans", weight: 400 });
  assert.deepEqual(textStyleFor(fogon, "A unos 91 °C, no a los 100 del nivel del mar."), { font: "dm-sans", weight: 700 });
  const paragraphLayout = await autoWordsLayout({ image: teal, words: { ...words, text: long }, band: textBandFor({}), palette: { ink: "#253746", paper: "#F6F0E4" }, style: fogon });
  assert.deepEqual([paragraphLayout.text.font, paragraphLayout.text.weight, "from" in paragraphLayout.text], ["dm-sans", 400, false], "the slide's layout starts from the paragraph's font, without its rule");
  // The text's data marked in the brand's data weight, the practical line in it too; marked again when the words change, never when the editor took the marks off.
  const brossard = { headline: { font: "sora", weight: 800 }, text: { font: "inter", weight: 500 }, data: { weight: 600 } };
  const event = { headline: "Plante un arbre rare", text: "Le 21 octobre 2026, au Grand parc urbain, de 15 h à 18 h.", practical: "Samedi · 15 h · gratuit" };
  const dated = await autoWordsLayout({ image: teal, words: event, band: textBandFor({}), palette: { ink: "#253746", paper: "#F6F0E4" }, style: brossard, places: ["Grand parc urbain"] });
  assert.equal(dated.setAs?.text, "Le **21 octobre 2026**, au **Grand parc urbain**, de **15 h à 18 h**.");
  assert.deepEqual([dated.text.weight, dated.text.mark?.weight, dated.text.data], [500, 600, true]);
  const plainPractical = await drawWords({ image: teal, words: event, layout: { ...dated, text: { ...dated.text, data: undefined } } });
  const heavyPractical = await drawWords({ image: teal, words: event, layout: dated });
  assert.ok(await changedPixels(plainPractical, heavyPractical, { left: 0, top: 0, width: 1080, height: 1350 }) > 0, "the practical line in the data's weight");
  const changed = { ...event, text: "Le 28 octobre 2026, au Grand parc urbain, dès 9 h." };
  assert.equal(remarkData(dated, changed, ["Grand parc urbain"]).setAs?.text, "Le **28 octobre 2026**, au **Grand parc urbain**, dès **9 h**.");
  const { setAs: _marks, ...unmarked } = dated;
  void _marks;
  assert.equal(remarkData(unmarked, changed, ["Grand parc urbain"]).setAs, undefined, "the marks the editor took off stay off");
  assert.equal(remarkData(dated, event).setAs?.text, dated.setAs?.text, "marks that keep the words stay as they are");
  // Moved low and narrow, centred: nothing above the box changes.
  const low = { ...auto, box: { left: 240, top: 900, width: 600 }, align: "center" as const };
  const moved = await drawWords({ image: teal, words, layout: low });
  assert.equal(await changedPixels(teal, moved, { left: 0, top: 0, width: 1080, height: 880 }), 0, "nothing above its box");
  assert.ok(await changedPixels(teal, moved, { left: 240, top: 900, width: 600, height: 300 }) > 2_000, "the words in its box");
  // A band runs the whole width behind the words.
  const banded = await drawWords({ image: teal, words, layout: { ...low, background: { kind: "band", color: "#F6F0E4", opacity: 1 } } });
  assert.ok(await changedPixels(teal, banded, { left: 0, top: 905, width: 60, height: 40 }) > 2_000, "the band reaches the slide's edge");
});

test("a slide lettered before layouts were kept: the program finds again the layout it set the words with, and drawing it gives the same slide", async () => {
  const palette = { ink: "#253746", paper: "#F6F0E4" };
  const words = { headline: "El anillo del café", text: "El agua se va por el borde y arrastra el polvo con ella.", practical: "" };
  const band = textBandFor({});
  const cream = new Uint8Array(await sharp({ create: { width: 1080, height: 1350, channels: 3, background: "#F6F0E4" } }).png().toBuffer());
  const set = await setSlideWords({ image: cream, words, band, palette, cover: true });
  const found = await autoWordsLayout({ image: cream, words, band, palette, cover: true });
  assert.deepEqual(found, set.layout);
  assert.equal(await changedPixels(set.image, await drawWords({ image: cream, words, layout: found }), { left: 0, top: 0, width: 1080, height: 1350 }), 0);
});

/** The pixels of a region close to a colour (within 40 on each channel). */
async function pixelsOf(image: Uint8Array, region: { left: number; top: number; width: number; height: number }, color: [number, number, number]): Promise<number> {
  const raw = await sharp(Buffer.from(image)).extract(region).removeAlpha().raw().toBuffer();
  let count = 0;
  for (let at = 0; at < raw.length; at += 3) if (Math.abs(raw[at] - color[0]) < 40 && Math.abs(raw[at + 1] - color[1]) < 40 && Math.abs(raw[at + 2] - color[2]) < 40) count++;
  return count;
}

test("the editor's styles on the words: a marked word in its colour, a line broken where they broke it, capitals, letter spacing and a shadow; the words themselves never change", async () => {
  const { drawWords, wordsBlockBottom } = await import("./draft2-text-layer");
  const cream = new Uint8Array(await sharp({ create: { width: 1080, height: 1350, channels: 3, background: "#F6F0E4" } }).png().toBuffer());
  const words = { headline: "El anillo del café", text: "El agua se va por el borde." };
  const base = {
    box: { left: 72, top: 64, width: 936 }, align: "left" as const, background: { kind: "none" as const, color: "#F6F0E4", opacity: 0.92 },
    headline: { font: "fraunces-soft", weight: 900, size: 88, color: "#253746" }, text: { font: "dm-sans", weight: 500, size: 40, color: "#253746" },
  };
  const whole = { left: 0, top: 0, width: 1080, height: 400 };
  const plain = await drawWords({ image: cream, words, layout: base });
  assert.equal(await pixelsOf(plain, whole, [0x96, 0x3f, 0x2d]), 0, "no terracotta before a mark");
  // "anillo" marked in terracotta: the rest stays ink.
  const marked = await drawWords({ image: cream, words, layout: { ...base, headline: { ...base.headline, mark: { weight: 900, color: "#963F2D" } }, setAs: { headline: "El **anillo** del café" } } });
  assert.ok(await pixelsOf(marked, whole, [0x96, 0x3f, 0x2d]) > 800, "the marked word in its colour");
  assert.ok(await pixelsOf(marked, whole, [0x25, 0x37, 0x46]) > 800, "the others in the role's");
  // A break where the editor wants it adds the headline's line; the block ends lower.
  const broken = { ...base, setAs: { headline: "El anillo\ndel café" } };
  assert.equal(wordsBlockBottom(words, broken) - wordsBlockBottom(words, base), Math.round(88 * 1.08), "one more headline line");
  // Words that are not the slide's are ignored: the slide reads as written.
  const other = await drawWords({ image: cream, words, layout: { ...base, setAs: { headline: "La mancha del té" } } });
  assert.equal(await changedPixels(plain, other, { left: 0, top: 0, width: 1080, height: 1350 }), 0, "never other words than the slide's");
  // Capitals and letter spacing widen the line; a shadow darkens around the letters.
  assert.ok(await changedPixels(plain, await drawWords({ image: cream, words, layout: { ...base, headline: { ...base.headline, upper: true } } }), whole) > 1_000);
  assert.ok(await changedPixels(plain, await drawWords({ image: cream, words, layout: { ...base, headline: { ...base.headline, tracking: 120 } } }), whole) > 1_000);
  assert.ok(await changedPixels(plain, await drawWords({ image: cream, words, layout: { ...base, shadow: true } }), whole) > 1_000);
});

test("the text set apart: the headline in its box, the text in its own with its own card, nothing between; each part's place reported for the editor's boxes", async () => {
  const { drawWords, wordsParts } = await import("./draft2-text-layer");
  const teal = new Uint8Array(await sharp({ create: { width: 1080, height: 1350, channels: 3, background: "#185B5C" } }).png().toBuffer());
  const words = { headline: "El anillo del café", text: "El agua se va por el borde y arrastra el polvo con ella." };
  const base = {
    box: { left: 72, top: 64, width: 936 }, align: "left" as const, background: { kind: "none" as const, color: "#F6F0E4", opacity: 0.92 },
    headline: { font: "fraunces-soft", weight: 900, size: 88, color: "#F6F0E4" }, text: { font: "dm-sans", weight: 500, size: 40, color: "#253746" },
  };
  const joined = wordsParts(words, base);
  assert.equal(joined.headline.top, 64);
  assert.ok(joined.text && joined.text.top > joined.headline.bottom && joined.text.top - joined.headline.bottom < 40, "joined: the text right under the headline");
  const apart = { ...base, textBlock: { box: { left: 120, top: 1000, width: 840 }, align: "center" as const, background: { kind: "card" as const, color: "#F6F0E4", opacity: 1 } } };
  const parts = wordsParts(words, apart);
  assert.deepEqual([parts.headline.top, parts.text?.top], [64, 1000]);
  assert.ok(parts.headline.bottom < 300 && parts.text!.bottom > 1050);
  const set = await drawWords({ image: teal, words, layout: apart });
  assert.equal(await changedPixels(teal, set, { left: 0, top: 320, width: 1080, height: 660 }), 0, "nothing between the two parts");
  assert.ok(await pixelsOf(set, { left: 120, top: 1000, width: 840, height: 60 }, [0xf6, 0xf0, 0xe4]) > 5_000, "the text's own card");
  assert.equal(await pixelsOf(set, { left: 0, top: 64, width: 60, height: 200 }, [0xf6, 0xf0, 0xe4]), 0, "no card behind the headline");
});

test("a calm band still takes a card when a thin line crosses where the words go (a chain, a dashed carrier, a tree's crown), which the band's lightness spread misses; a clean field keeps the words with no card", async () => {
  const { autoWordsLayout } = await import("./draft2-text-layer");
  const cream = "#F6F0E4";
  const words = { headline: "Des jeux conçus avec des parents", text: "La Ville s'est entourée de parents d'enfants handicapés et de partenaires de la santé." };
  const palette = { ink: "#253746", paper: cream };
  const field = new Uint8Array(await sharp({ create: { width: 1080, height: 1350, channels: 3, background: "#E9DFC8" } }).png().toBuffer());
  assert.equal((await autoWordsLayout({ image: field, words, band: textBandFor({}), palette })).background.kind, "none", "a clean field");
  const line = `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1350"><path d="M 80 120 C 400 260, 700 60, 1000 300" stroke="#2A2A2A" stroke-width="6" stroke-dasharray="18 12" fill="none"/><line x1="860" y1="0" x2="860" y2="600" stroke="#3A3A3A" stroke-width="4"/></svg>`;
  const crossed = new Uint8Array(await sharp({ create: { width: 1080, height: 1350, channels: 3, background: "#E9DFC8" } }).composite([{ input: Buffer.from(line) }]).png().toBuffer());
  assert.equal((await autoWordsLayout({ image: crossed, words, band: textBandFor({}), palette })).background.kind, "card", "a dashed line and a chain through the words");
});

test("the band keeps clear of a pasted photo that starts in the lower half: it ends above the photo, with its gap (2026-10-22)", () => {
  assert.deepEqual(textBandFor({ photoLayout: "offset-block-right" }), { edge: "top", left: 72, top: 64, width: 936, height: 570 - 28 - 64 }, "the photo's top is at 570");
  assert.equal(textBandFor({ photoLayout: "rounded-left" }).height, 560 - 28 - 64);
  assert.deepEqual(textBandFor({ photoLayout: "top-bleed" }).edge, "bottom", "a photo across the top sends the words below it");
  assert.equal(textBandFor({}).height, 540, "no photo: the full band");
});
