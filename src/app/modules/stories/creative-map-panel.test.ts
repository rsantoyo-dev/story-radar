import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import * as crypto from "node:crypto";
import ts from "typescript";
import sharp from "sharp";

import * as policy from "./creative-documentary";
import { compositeMapPanel, MAP_PANEL_MAP, MAP_PANEL_MAT, mapPaletteFromBrand, mapPanelRegion, mapPanelZonePrompt } from "./creative-map-panel";

const requireLocal = createRequire(import.meta.url);
function load(file: string, imports: Record<string, unknown>) {
  const code = ts.transpileModule(readFileSync(new URL(file, import.meta.url), "utf8"), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true,
  } }).outputText;
  const exports = {};
  runInNewContext(code, { exports, Buffer, URL, URLSearchParams, AbortSignal, Date, Set, Map, JSON, Math, Number, String, Array, Object, RegExp, console, process: { env: {} },
    require: (name: string) => name in imports ? imports[name] : requireLocal(name) });
  return exports;
}

const austin = [
  { name: "Deep Teal", role: "primary", color: "#173F43" },
  { name: "Burnt Orange", role: "secondary", color: "#B94F24" },
  { name: "Sunny Cream", role: "surface", color: "#FFF9F0" },
  { name: "Soft Olive", color: "#71805A" },
  { name: "Austin Blue", color: "#75B9C7" },
  { name: "Golden Mustard", color: "#A87416" },
];

test("the map palette takes the brand's page, text and accent, plus water and park tints", () => {
  assert.deepEqual(mapPaletteFromBrand(austin), { surface: "#FFF9F0", primary: "#173F43", accent: "#B94F24", water: "#75B9C7", park: "#71805A" });
  assert.equal(mapPaletteFromBrand(austin.slice(0, 2)), undefined, "too few colours to style a map");
  const unlabeled = mapPaletteFromBrand([{ color: "#101010" }, { color: "#F5F5F5" }, { color: "#CC3300" }]);
  assert.equal(unlabeled?.surface, "#F5F5F5", "without roles, the lightest colour is the page");
  assert.equal(unlabeled?.primary, "#101010", "and the darkest is the text");
});

test("the map is pasted unaltered in its band, on the brand mat, and nothing else changes", async () => {
  const base = await sharp({ create: { width: 1080, height: 1350, channels: 3, background: "#FFF9F0" } }).png().toBuffer();
  const map = await sharp({ create: { width: 1080, height: 680, channels: 3, background: "#3A7BD5" } })
    .composite([{ input: await sharp({ create: { width: 200, height: 200, channels: 3, background: "#E04040" } }).png().toBuffer(), left: 440, top: 240 }])
    .png().toBuffer();
  const composed = await compositeMapPanel({ image: base, map, matColor: "#173F43" });
  const { data, info } = await sharp(composed).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const pixel = (x: number, y: number) => [...data.subarray((y * info.width + x) * 3, (y * info.width + x) * 3 + 3)];
  assert.deepEqual(pixel(10, 10), [0xFF, 0xF9, 0xF0], "outside the panel the slide is untouched");
  assert.deepEqual(pixel(MAP_PANEL_MAT.left + 3, MAP_PANEL_MAT.top + 300), [0x17, 0x3F, 0x43], "the mat border is the brand colour");
  const centre = pixel(MAP_PANEL_MAP.left + Math.round(MAP_PANEL_MAP.width / 2), MAP_PANEL_MAP.top + Math.round(MAP_PANEL_MAP.height / 2));
  assert.ok(centre[0] > 200 && centre[1] < 90, `the map's own centre survives: ${centre}`);
  const edge = pixel(MAP_PANEL_MAP.left + 20, MAP_PANEL_MAP.top + 20);
  assert.ok(edge[2] > 180 && edge[0] < 90, `the map reaches its corners, uncropped: ${edge}`);
});

test("the slide reserves the band and is told never to draw geography", () => {
  const prompt = mapPanelZonePrompt();
  const region = mapPanelRegion();
  const [, top, bottom] = /from (\d+)% to (\d+)% of the height/.exec(prompt) ?? [];
  assert.ok(Number(top) <= region.top && Number(bottom) >= region.bottom, `the reserved zone covers the whole panel: ${top}–${bottom}% vs ${region.top}–${region.bottom}%`);
  assert.match(prompt, /Do not draw any map, street, road, pin/);
  assert.match(prompt, /Place every piece of text above it/);
});

test("a Google static map is requested in the brand's colours, without points of interest", () => {
  const provider = load("./google-maps-provider.ts", {
    "server-only": {}, "node:crypto": crypto, "./creative-documentary": policy,
    "node:https": { request: () => { throw new Error("No real network in tests"); } },
    "../sources/rss/fetch-rss-feed": { lookupPublicAddress: () => {} },
  }) as typeof import("./google-maps-provider");
  const place = { latitude: 30.2669, longitude: -97.7689 } as Parameters<typeof provider.staticGoogleMapUrl>[0];
  const config = { enabled: true, apiKey: "key", signingSecret: "", maxPhotos: 1, maxPreviewsPerDay: 1 };
  const styled = provider.staticGoogleMapUrl(place, config, mapPaletteFromBrand(austin));
  const styles = styled.searchParams.getAll("style");
  assert.ok(styles.includes("feature:poi|visibility:off"));
  assert.ok(styles.some((style) => style.startsWith("feature:poi.park|element:geometry|visibility:on")), "parks stay visible after points of interest are hidden");
  assert.ok(styles.includes("element:labels.text.fill|color:0x173F43"));
  assert.equal(styled.searchParams.get("markers"), "color:0xB94F24|30.2669,-97.7689");
  const plain = provider.staticGoogleMapUrl(place, config);
  assert.deepEqual(plain.searchParams.getAll("style"), [], "the editor preview keeps Google's default map");
  assert.equal(plain.searchParams.get("markers"), "color:red|30.2669,-97.7689");
});

test("a pasted map counts as verified imagery, so the slide is not told the place is unverified", () => {
  const images = load("./build-creative-image-prompt.ts", { "server-only": {} }) as typeof import("./build-creative-image-prompt");
  assert.equal(images.slideHasVerifiedImagery({ placeVisual: { generationUse: "panel" } }), true);
  assert.equal(images.slideHasVerifiedImagery({ placeVisual: {} }), false);
});
