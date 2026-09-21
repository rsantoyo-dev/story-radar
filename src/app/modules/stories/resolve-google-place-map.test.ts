import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import * as crypto from "node:crypto";
import ts from "typescript";
import sharp from "sharp";
import * as policy from "./creative-documentary";
import { PLACE_VISUAL_VERSION } from "./creative-place-visual";
import type { GoogleTransport } from "./google-maps-provider";

function load(file: string, imports: Record<string, unknown>) {
  const code = ts.transpileModule(readFileSync(file, "utf8"), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true,
  } }).outputText;
  const exports = {};
  runInNewContext(code, { exports, Buffer, URL, URLSearchParams, AbortSignal, Response, Date, Set, process: { env: {} },
    require: (name: string) => { if (!(name in imports)) throw new Error(`Unexpected dependency: ${name}`); return imports[name]; } });
  return exports;
}
function harness() {
  const provider = load("src/app/modules/stories/google-maps-provider.ts", {
    "server-only": {}, "node:crypto": crypto, "./creative-documentary": policy,
    "node:https": { request: () => { throw new Error("No real network in tests"); } },
    "../sources/rss/fetch-rss-feed": { lookupPublicAddress: () => {} },
  }) as typeof import("./google-maps-provider");
  const resolver = load("src/app/modules/stories/resolve-google-place-map.ts", {
    "server-only": {}, sharp, "node:crypto": crypto, "./google-maps-provider": provider,
    "./creative-documentary-providers": { providerLanguage: (value: string) => (value || "en").slice(0, 2).toLowerCase() },
    "./creative-place-visual": { PLACE_VISUAL_VERSION },
  }) as typeof import("./resolve-google-place-map");
  return { provider, resolver };
}
const scope = { municipality: "Saint-Jean-sur-Richelieu", region: "Québec", country: "Canada", validatedLocationId: null };
const config = { enabled: true, apiKey: "private-test-key", signingSecret: "", maxPhotos: 2, maxPreviewsPerDay: 10 };
const component = (type: string, longText: string) => ({ types: [type], longText });
function place(overrides: Record<string, unknown> = {}) {
  return { id: "test-id", displayName: { text: "Place Jacques-Cartier" }, formattedAddress: "Saint-Jean-sur-Richelieu, QC, Canada",
    location: { latitude: 45.3, longitude: -73.2 }, types: ["point_of_interest"],
    addressComponents: [component("locality", scope.municipality), component("administrative_area_level_1", scope.region), component("country", scope.country)],
    photos: [], ...overrides };
}
const raster = () => sharp({ create: { width: 540, height: 340, channels: 3, background: "#397862" } }).png().toBuffer();
function transport(image: Buffer, response: unknown = { places: [place()] }) {
  const calls: URL[] = [];
  const fetch: GoogleTransport = async (url) => {
    calls.push(url);
    if (url.pathname.endsWith(":searchText")) return Buffer.from(JSON.stringify(response));
    return image;
  };
  return { calls, fetch };
}

test("a confirmed place returns a real static map with Google provenance", async () => {
  const { resolver } = harness();
  const image = await raster();
  const { fetch } = transport(image);
  const result = await resolver.resolveGooglePlaceMap(
    "Place Jacques-Cartier", scope, "fr", AbortSignal.timeout(1000), config, { maxPerDay: 100 }, fetch,
  );
  assert.equal(result?.evidence.representation, "map");
  assert.equal(result?.evidence.adapter, "google-maps");
  assert.match(result?.evidence.attribution ?? "", /Google Maps/);
  assert.match(result?.evidence.sourceUrl ?? "", /google\.com\/maps\/search/);
  assert.equal(result?.bytes.toString("hex"), image.toString("hex"));
});

test("an ambiguous or unmatched result falls through with no map, not a guess", async () => {
  const { resolver } = harness();
  const image = await raster();
  for (const response of [
    { places: [place({ addressComponents: [component("locality", "Somewhere Else")] })] },
    { places: [place(), place({ id: "other" })] },
    { places: [] },
  ]) {
    const { fetch } = transport(image, response);
    const result = await resolver.resolveGooglePlaceMap(
      "Place Jacques-Cartier", scope, "fr", AbortSignal.timeout(1000), config, { maxPerDay: 100 }, fetch,
    );
    assert.equal(result, undefined);
  }
});

test("disabled config, missing key, exhausted budget and transport errors all fall through quietly", async () => {
  const { resolver } = harness();
  const image = await raster();
  const { fetch } = transport(image);
  assert.equal(await resolver.resolveGooglePlaceMap("X", scope, "fr", AbortSignal.timeout(1000), { ...config, enabled: false }, { maxPerDay: 100 }, fetch), undefined);
  assert.equal(await resolver.resolveGooglePlaceMap("X", scope, "fr", AbortSignal.timeout(1000), { ...config, apiKey: "" }, { maxPerDay: 100 }, fetch), undefined);
  assert.equal(await resolver.resolveGooglePlaceMap("X", scope, "fr", AbortSignal.timeout(1000), config, { maxPerDay: 0 }, fetch), undefined);
  const broken: GoogleTransport = async () => { throw new Error("network down"); };
  assert.equal(await resolver.resolveGooglePlaceMap("X", scope, "fr", AbortSignal.timeout(1000), config, { maxPerDay: 100 }, broken), undefined);
});

test("the daily generation budget is separate per call count and does not silently exceed its cap", async () => {
  const { resolver } = harness();
  const image = await raster();
  let calls = 0;
  const counting: GoogleTransport = async (url, request) => {
    calls++;
    const { fetch } = transport(image);
    return fetch(url, request);
  };
  const attempt = () => resolver.resolveGooglePlaceMap("Place Jacques-Cartier", scope, "fr", AbortSignal.timeout(1000), config, { maxPerDay: 1 }, counting);
  const first = await attempt();
  assert.equal(first?.evidence.representation, "map");
  const second = await attempt();
  assert.equal(second, undefined);
  // The second call never reached the network once the daily cap was spent.
  assert.equal(calls, 2);
});
