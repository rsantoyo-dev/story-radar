import assert from "node:assert/strict";
import test from "node:test";

import sharp from "sharp";

import {
  chooseCreativeLogoVersion,
  creativeLogoFormForSlide,
  creativeLogoVersionsForSlide,
  creativeLogoZoneSize,
  lightness,
} from "./creative-brand-logo-versions";
import { computeCreativeBrandOverlayGeometry } from "./creative-brand-overlay";
import {
  DEFAULT_CREATIVE_BRAND_OVERLAY_SETTINGS,
  type CreativeBrandOverlaySettings,
  type CreativeBrandOverlaySnapshot,
  type CreativeLogoForm,
  type CreativeLogoTone,
} from "./creative-content.types";

const settings = (values: Partial<CreativeBrandOverlaySettings> = {}): CreativeBrandOverlaySettings => ({
  ...DEFAULT_CREATIVE_BRAND_OVERLAY_SETTINGS,
  enabled: true,
  scope: "all-units",
  placement: "top-left",
  sizePercent: 20,
  insetPercent: 4,
  backdropMode: "none",
  ...values,
});

const asset = (id: string, width: number, height: number) => ({
  id, fileName: `${id}.png`, contentType: "image/png" as const, fileSize: 10, width, height, createdAt: new Date(0), objectKey: `brand/${id}.png`, sha256: id.padEnd(64, "0"),
});

const version = (id: string, form: CreativeLogoForm, tone: CreativeLogoTone, width = 400, height = 200) => ({ form, tone, asset: asset(id, width, height) });

const snapshot = (values: Partial<CreativeBrandOverlaySettings>, logoVersions?: CreativeBrandOverlaySnapshot["logoVersions"]): CreativeBrandOverlaySnapshot => ({
  ...settings(values), compositorVersion: 1, asset: asset("main", 400, 200), ...(logoVersions ? { logoVersions } : {}),
});

const canvas = (color: string, dark?: { width: number; height: number }) =>
  sharp({ create: { width: 1080, height: 1350, channels: 3, background: color } })
    .composite(dark ? [{ input: { create: { width: dark.width, height: dark.height, channels: 3, background: "#000000" } }, left: 0, top: 0 }] : [])
    .png()
    .toBuffer();

/** A logo: a solid mark in the middle of a transparent PNG, like an uploaded one. */
const logo = (color: string, width = 400, height = 200) =>
  sharp({ create: { width, height, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: { create: { width: Math.round(width * 0.8), height: Math.round(height * 0.6), channels: 4, background: color } }, left: Math.round(width * 0.1), top: Math.round(height * 0.2) }])
    .png()
    .toBuffer();

test("the cover shows the full logo; the other slides the form the brand chose, the full one by default", () => {
  assert.equal(creativeLogoFormForSlide({ innerForm: "symbol" }, 1), "full");
  assert.equal(creativeLogoFormForSlide({ innerForm: "symbol" }, 2), "symbol");
  assert.equal(creativeLogoFormForSlide({}, 5), "full");
});

test("a slide receives the versions of its form; the full ones when the brand has none of that form; the main logo when it has no versions", () => {
  const versions = [version("main", "full", "alpha"), version("negative", "full", "negative"), version("symbol", "symbol", "positive", 300, 300)];
  assert.deepEqual(creativeLogoVersionsForSlide(snapshot({ innerForm: "symbol" }, versions), 1).map((entry) => entry.asset.id), ["main", "negative"]);
  assert.deepEqual(creativeLogoVersionsForSlide(snapshot({ innerForm: "symbol" }, versions), 3).map((entry) => entry.asset.id), ["symbol"]);
  assert.deepEqual(creativeLogoVersionsForSlide(snapshot({ innerForm: "symbol" }, versions.slice(0, 2)), 3).map((entry) => entry.asset.id), ["main", "negative"]);
  assert.deepEqual(creativeLogoVersionsForSlide(snapshot({ innerForm: "full" }, [version("symbol", "symbol", "alpha")]), 1).map((entry) => entry.asset.id), ["symbol"]);
  const alone = creativeLogoVersionsForSlide(snapshot({ innerForm: "symbol" }), 2);
  assert.deepEqual(alone.map((entry) => [entry.asset.id, entry.form, entry.tone]), [["main", "full", "alpha"]]);
  assert.equal(creativeLogoVersionsForSlide(snapshot({ mainTone: "positive" }), 1)[0].tone, "positive", "the main logo is made for the backgrounds the brand said");
});

test("the slot the prompt keeps free holds every version the slide may receive", () => {
  const cases = [
    [asset("a", 1674, 838), asset("b", 2006, 605)],
    [asset("a", 300, 600), asset("b", 500, 700)],
    [asset("a", 1674, 838), asset("b", 1236, 1195), asset("c", 400, 800)],
    [asset("a", 1000, 1000)],
  ];
  for (const placement of ["top-left", "center", "bottom-right"] as const) {
    for (const assets of cases) {
      const zone = creativeLogoZoneSize(assets.map((entry) => ({ asset: entry })));
      const geometry = (width: number, height: number) => computeCreativeBrandOverlayGeometry({ settings: settings({ placement }), canvasWidth: 1080, canvasHeight: 1350, logoWidth: width, logoHeight: height }).logo;
      const slot = geometry(zone.width, zone.height);
      for (const entry of assets) {
        const rect = geometry(entry.width, entry.height);
        // The rounding of a scaled edge may differ by a pixel; the prompt's 5% buffer is far wider.
        assert.ok(rect.left >= slot.left - 1 && rect.top >= slot.top - 1, `${placement}: ${entry.width}x${entry.height} starts inside the slot`);
        assert.ok(rect.left + rect.width <= slot.left + slot.width + 1 && rect.top + rect.height <= slot.top + slot.height + 1, `${placement}: ${entry.width}x${entry.height} ends inside the slot`);
      }
    }
  }
  assert.deepEqual(creativeLogoZoneSize([{ asset: asset("a", 1674, 838) }, { asset: asset("b", 2006, 605) }]), { width: 1674, height: 838 });
  assert.deepEqual(creativeLogoZoneSize([{ asset: asset("a", 1674, 838) }, { asset: asset("b", 300, 600) }]), { width: 1000, height: 1000 });
});

test("lightness runs from black to white", () => {
  assert.equal(Math.round(lightness(0, 0, 0)), 0);
  assert.equal(Math.round(lightness(255, 255, 255)), 100);
  assert.equal(Math.round(lightness(119, 119, 119)), 50);
});

test("a light background takes the positive version, a dark one the negative, measured where the logo goes, backdrop included", async () => {
  const [dark, white] = await Promise.all([logo("#14213D"), logo("#FFFFFF")]);
  const versions = [{ tone: "positive" as const }, { tone: "negative" as const }];
  const onLight = await chooseCreativeLogoVersion({ image: await canvas("#F6F0E4"), settings: settings(), versions, logos: [dark, white] });
  assert.deepEqual([onLight.index, onLight.ground], [0, "light"]);
  assert.ok(onLight.readings[0].background > 90 && onLight.readings[0].contrast > 70);
  const onDark = await chooseCreativeLogoVersion({ image: await canvas("#101820"), settings: settings(), versions, logos: [dark, white] });
  assert.deepEqual([onDark.index, onDark.ground], [1, "dark"]);
  // Only what is behind the logo counts: a light image with a dark corner where the logo goes takes the negative.
  const darkCorner = await chooseCreativeLogoVersion({ image: await canvas("#FFFFFF", { width: 500, height: 400 }), settings: settings(), versions, logos: [dark, white] });
  assert.equal(darkCorner.index, 1);
  // A light backdrop under the logo turns a dark image into a light background.
  const onBackdrop = await chooseCreativeLogoVersion({
    image: await canvas("#101820"), settings: settings({ backdropMode: "solid", backdropColor: "#FFFFFF", backdropOpacity: 100 }), versions, logos: [dark, white],
  });
  assert.equal(onBackdrop.index, 0);
});

test("a mixed background keeps the version made for any background, though another stands out a little more", async () => {
  const [ink, white] = await Promise.all([logo("#333333"), logo("#FFFFFF")]);
  const versions = [{ tone: "alpha" as const }, { tone: "negative" as const }];
  const mid = await chooseCreativeLogoVersion({ image: await canvas("#8A8A8A"), settings: settings(), versions, logos: [ink, white] });
  assert.ok(mid.readings[1].contrast > mid.readings[0].contrast, "the negative stands out a little more there");
  assert.deepEqual([mid.index, mid.ground], [0, "mixed"]);
  const darker = await chooseCreativeLogoVersion({ image: await canvas("#4A4A4A"), settings: settings(), versions, logos: [ink, white] });
  assert.deepEqual([darker.index, darker.ground], [1, "dark"]);
  // Without a version for any background, a mixed one takes whichever stands out most.
  const neither = await chooseCreativeLogoVersion({ image: await canvas("#8A8A8A"), settings: settings(), versions: [{ tone: "positive" }, { tone: "negative" }], logos: [ink, white] });
  assert.equal(neither.index, 1);
});

test("each background takes the version made for it, then one for any; among the same kind the one that stands out most, then the first", async () => {
  const [navy, navyToo, grey] = await Promise.all([logo("#14213D"), logo("#14213D"), logo("#9A9A9A")]);
  const light = await canvas("#FFFFFF");
  const made = await chooseCreativeLogoVersion({ image: light, settings: settings(), versions: [{ tone: "alpha" }, { tone: "positive" }], logos: [navy, navyToo] });
  assert.equal(made.index, 1);
  const any = await chooseCreativeLogoVersion({ image: light, settings: settings(), versions: [{ tone: "negative" }, { tone: "alpha" }], logos: [navy, navyToo] });
  assert.equal(any.index, 1);
  const clearer = await chooseCreativeLogoVersion({ image: light, settings: settings(), versions: [{ tone: "positive" }, { tone: "positive" }], logos: [grey, navy] });
  assert.equal(clearer.index, 1);
  const first = await chooseCreativeLogoVersion({ image: light, settings: settings(), versions: [{ tone: "alpha" }, { tone: "alpha" }], logos: [navy, navyToo] });
  assert.equal(first.index, 0);
});

test("a version that would vanish gives way to one that reads, whatever the labels say", async () => {
  const [white, navy] = await Promise.all([logo("#FFFFFF"), logo("#14213D")]);
  const mislabelled = await chooseCreativeLogoVersion({ image: await canvas("#FFFFFF"), settings: settings(), versions: [{ tone: "positive" }, { tone: "negative" }], logos: [white, navy] });
  assert.equal(mislabelled.index, 1);
});
