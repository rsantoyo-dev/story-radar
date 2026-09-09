import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import * as crypto from "node:crypto";
import ts from "typescript";
import sharp from "sharp";
import * as policy from "./creative-documentary";
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
  const preview = load("src/app/modules/stories/google-maps-preview.ts", {
    "server-only": {}, sharp, "./google-maps-provider": provider,
    "./creative-documentary-render": { escapeDocumentaryText: (value: string) => value },
  }) as typeof import("./google-maps-preview");
  return { provider, preview };
}
const input = { mode: "google" as const, name: "Place Jacques-Cartier", municipality: "Saint-Jean-sur-Richelieu", region: "Québec", country: "Canada", languageCode: "fr" };
const config = { enabled: true, apiKey: "private-test-key", signingSecret: "", maxPhotos: 2, maxPreviewsPerDay: 10 };
const profile = { name: "Salut St-Jean", brandPalette: [] };
const component = (type: string, longText: string) => ({ types: [type], longText });
function place(overrides: Record<string, unknown> = {}) {
  return { id: "test-id", displayName: { text: input.name }, formattedAddress: "Saint-Jean-sur-Richelieu, QC, Canada",
    location: { latitude: 45.3, longitude: -73.2 }, types: ["point_of_interest"],
    addressComponents: [component("locality", input.municipality), component("administrative_area_level_1", input.region), component("country", input.country)],
    photos: ["photo-one", "photo-two"].map(id => ({ name: `places/test-id/photos/${id}`, authorAttributions: [{ displayName: "Fixture Photographer", uri: "https://www.google.com/maps/contrib/test" }] })), ...overrides };
}
const raster = () => sharp({ create: { width: 540, height: 340, channels: 3, background: "#397862" } }).png().toBuffer();
function transport(image: Buffer, response: unknown = { places: [place()] }) {
  const calls: { url: URL; headers?: Record<string, string>; body?: string }[] = [];
  const fetch: GoogleTransport = async (url, request) => {
    calls.push({ url, headers: request.headers, body: request.body });
    if (url.pathname.endsWith(":searchText")) return Buffer.from(JSON.stringify(response));
    if (url.pathname.endsWith("/media")) return Buffer.from(JSON.stringify({ photoUri: "https://lh3.googleusercontent.com/test-photo" }));
    return image;
  };
  return { calls, fetch };
}

test("Google configuration and input are bounded, disabled by default and preserve international names", () => {
  const { provider: p } = harness();
  assert.equal(p.googleMapsConfig({}).enabled, false);
  assert.equal(p.parseMapsPreviewInput(input).languageCode, "fr");
  assert.equal(p.parseMapsPreviewInput(input).region, "Québec");
  assert.throws(() => p.parseMapsPreviewInput({ ...input, country: "" }), /country/);
  assert.throws(() => p.parseMapsPreviewInput({ ...input, name: "x".repeat(161) }), /name/);
  assert.throws(() => p.parseMapsPreviewInput({ ...input, languageCode: "arbitrary instruction" }), /language code/);
  assert.throws(() => p.googleMapsConfig({ CREATIVE_GOOGLE_MAPS_MAX_PHOTOS: "100" }), /between 1 and 2/);
});

test("Google matching rejects incomplete results, broad locations and mismatched scope", () => {
  const { provider: p } = harness();
  const resolved = p.parseGooglePlaces({ places: [place()] }, input);
  assert.equal(resolved.candidates[0].matchesScope, true);
  assert.equal(resolved.candidates[0].exactName, true);
  assert.equal(p.parseGooglePlaces({ places: [place()], nextPageToken: "more" }, input).incomplete, true);
  assert.equal(p.parseGooglePlaces({ places: Array(6).fill(place()) }, input).candidates.length, 5);
  assert.equal(p.parseGooglePlaces({ places: [place({ types: ["route"] })] }, input).candidates[0].pointSuitable, false);
  assert.equal(p.parseGooglePlaces({ places: [place()] }, { ...input, municipality: "Montréal" }).candidates[0].matchesScope, false);
  assert.equal(p.parseGooglePlaces({ places: [place({ location: { latitude: 999, longitude: 0 } })] }, input).incomplete, true);
});

test("Scope tolerates accents, hyphens and spacing without merging different municipalities or scripts", () => {
  const { provider: p } = harness();
  const typed = { ...input, municipality: "Saint jean sur richelieu", region: "quebec", country: "canada" };
  const candidate = p.parseGooglePlaces({ places: [place()] }, typed).candidates[0];
  assert.equal(candidate.matchesScope, true);
  assert.equal(candidate.exclusions.length, 0);
  assert.equal(p.parseGooglePlaces({ places: [place()] }, { ...typed, municipality: "Saint-Jean-de-Matha" }).candidates[0].matchesScope, false);
  assert.equal(p.parseGooglePlaces({ places: [place({ addressComponents: undefined })] }, typed).candidates[0].matchesScope, false);
  assert.notEqual(p.normalizeGoogleScope("क"), p.normalizeGoogleScope("का"));
});

test("A school query returning an address explains the name mismatch, not a false scope mismatch", async () => {
  const { preview } = harness();
  const typed = { ...input, name: "vision school", municipality: "Saint jean sur richelieu", region: "quebec", country: "canada" };
  const response = { places: [place({ displayName: { text: "618 Rue Garneau" }, types: ["street_address"] })] };
  const t = transport(await raster(), response);
  const result = await preview.prepareGoogleMapsPreview("topic-a", typed, profile, { config, transport: t.fetch });
  assert.equal(result.candidates[0].matchesScope, true);
  assert.equal(result.cards.length, 0);
  assert.equal(t.calls.length, 1);
  assert.match(result.reasons[0], /geographic scope matches/);
  assert.match(result.candidates[0].exclusions[0], /not the requested name/);
  const address = await preview.prepareGoogleMapsPreview("topic-a", { ...typed, name: "618 Rue Garneau" }, profile, { config, transport: t.fetch });
  assert.equal(address.status, "candidate");
  assert.equal(address.cards[0].kind, "map");
});

test("Google resource destinations and photo references cannot request arbitrary hosts or paths", () => {
  const { provider: p } = harness();
  for (const url of ["http://maps.googleapis.com/x", "https://localhost/x", "https://lh3.googleusercontent.com.evil.test/x", "https://user:pass@maps.googleapis.com/x", "https://maps.googleapis.com:444/x"]) {
    assert.throws(() => p.assertGoogleResourceUrl(new URL(url)), /destination/);
  }
  const photos = p.parseGooglePlaces({ places: [place({ photos: [{ name: "places/test-id/photos/../../secret" }, { name: "places/other/photos/a" }] })] }, input).candidates[0].photos;
  assert.equal(photos.length, 0);
});

test("Google composition retrieves map and two original photos with attribution, bounded requests and no credential leakage", async () => {
  const { preview } = harness();
  const bytes = await raster(), t = transport(bytes);
  const result = await preview.prepareGoogleMapsPreview("topic-a", input, profile, { config, transport: t.fetch });
  assert.equal(result.status, "candidate"); assert.equal(result.exportable, false);
  assert.equal(result.cards.length, 3); assert.equal(result.requests, 6);
  assert.equal(JSON.parse(t.calls[0].body!).languageCode, "fr");
  assert.equal(t.calls[0].headers?.["X-Goog-Api-Key"], config.apiKey);
  assert.equal(t.calls[1].url.searchParams.get("markers"), "color:red|45.3,-73.2");
  for (const call of t.calls.filter(call => call.url.hostname === "lh3.googleusercontent.com")) assert.equal(call.headers, undefined);
  for (const card of result.cards) assert.deepEqual(Buffer.from(card.image.split(",")[1], "base64"), bytes);
  assert.equal(result.cards[1].attributions[0].name, "Fixture Photographer");
  assert.ok(!JSON.stringify(result).includes(config.apiKey));
  assert.ok(!JSON.stringify(result).includes("photo-one"));
  assert.equal(Date.parse(result.expiresAt) - Date.parse(result.preparedAt), 15 * 60_000);
});

test("Ambiguous, incomplete and out-of-scope places never fetch a map or photographs", async () => {
  const { preview } = harness();
  for (const response of [{ places: [place(), place({ id: "other-id" })] }, { places: [place()], nextPageToken: "more" }, { places: [place({ addressComponents: [component("locality", "Montréal")] })] }]) {
    const t = transport(await raster(), response);
    const result = await preview.prepareGoogleMapsPreview("topic-a", input, profile, { config, transport: t.fetch });
    assert.equal(result.status, "ambiguous"); assert.equal(result.cards.length, 0); assert.equal(t.calls.length, 1);
  }
});

test("A unique named school search result can be previewed without claiming identity or changing its name", async () => {
  const { preview } = harness();
  const t = transport(await raster(), { places: [place({ displayName: { text: "École Trilingue Vision St-Jean" }, types: ["school", "establishment", "point_of_interest"] })] });
  const result = await preview.prepareGoogleMapsPreview("topic-a", { ...input, name: "vision school" }, profile, { config, transport: t.fetch });
  assert.equal(result.status, "candidate");
  assert.equal(result.place?.nameMatch, "search-candidate");
  assert.equal(result.place?.name, "École Trilingue Vision St-Jean");
  assert.equal(result.cards.length, 3);
  assert.equal(result.exportable, false);
  assert.match(result.reasons[0], /identity .* is not verified/);
});

test("Named-result preview never chooses between multiple local candidates, addresses or incomplete results", async () => {
  const { preview } = harness();
  const named = place({ displayName: { text: "École Vision" }, types: ["school", "point_of_interest"] });
  for (const response of [{ places: [named, { ...named, id: "other" }] }, { places: [named], nextPageToken: "more" }, { places: [named, place({ types: ["street_address"], displayName: { text: "618 Rue Garneau" } })] }]) {
    const t = transport(await raster(), response);
    const result = await preview.prepareGoogleMapsPreview("topic-a", { ...input, name: "vision school" }, profile, { config, transport: t.fetch });
    assert.equal(result.cards.length, 0);
    assert.equal(t.calls.length, 1);
  }
});

test("A rejected photo host keeps the successful map and does not fetch that host", async () => {
  const { preview } = harness(), t = transport(await raster());
  const result = await preview.prepareGoogleMapsPreview("topic-a", input, profile, { config, transport: async (url, request) => {
    if (url.pathname.endsWith("/media")) return Buffer.from(JSON.stringify({ photoUri: "https://127.0.0.1/private" }));
    return t.fetch(url, request);
  } });
  assert.equal(result.cards.length, 1); assert.equal(result.cards[0].kind, "map");
  assert.ok(result.reasons.some(reason => reason.includes("unsupported photo host")));
  assert.ok(t.calls.every(call => call.url.hostname !== "127.0.0.1"));
});

test("Demo produces explicit placeholders without credentials or provider calls; raster validation rejects unsuitable bytes", async () => {
  const { preview } = harness();
  const options = { config: { ...config, enabled: false, apiKey: "" }, transport: async () => { throw new Error("must not call Google"); } };
  const result = await preview.prepareGoogleMapsPreview("topic-a", { ...input, mode: "demo" }, profile, options);
  assert.equal(result.status, "demo"); assert.equal(result.requests, 0); assert.equal(result.cards.length, 2);
  assert.equal(result.cards[0].width, 1080); assert.match(result.cards[0].label, /not a real place/);
  await assert.rejects(preview.prepareGoogleMapsPreview("topic-a", input, profile, options), /API_KEY/);
  await assert.rejects(preview.previewRaster(Buffer.from("not an image")));
  await assert.rejects(preview.previewRaster(await sharp({ create: { width: 10, height: 10, channels: 3, background: "white" } }).png().toBuffer()), /not a suitable/);
});

test("Daily limits and per-topic concurrency are enforced before provider requests and released on failure", async () => {
  const { preview } = harness();
  let release!: (value: Buffer) => void;
  const blocked: GoogleTransport = () => new Promise(resolve => { release = resolve; });
  const pending = preview.prepareGoogleMapsPreview("topic-a", input, profile, { config, transport: blocked });
  await assert.rejects(preview.prepareGoogleMapsPreview("topic-a", input, profile, { config, transport: blocked }), /already running/);
  release(Buffer.from("invalid json")); await assert.rejects(pending, /invalid JSON/);
  await assert.rejects(preview.prepareGoogleMapsPreview("topic-b", input, profile, { config: { ...config, maxPreviewsPerDay: 1 }, transport: blocked }), /daily/);
  const t = transport(await raster(), { places: [] });
  assert.equal((await preview.prepareGoogleMapsPreview("topic-a", input, profile, { config, transport: t.fetch })).status, "not-found");
});

test("Static map signatures cover the exact path and query sent to Google", () => {
  const { provider: p } = harness();
  const signingSecret = Buffer.from("test signing secret").toString("base64url");
  const url = p.staticGoogleMapUrl(p.parseGooglePlaces({ places: [place()] }, input).candidates[0], { ...config, signingSecret });
  const signature = url.searchParams.get("signature"); url.searchParams.delete("signature");
  assert.equal(signature, crypto.createHmac("sha1", Buffer.from(signingSecret, "base64url")).update(url.pathname + url.search).digest("base64url"));
});

test("Preview API authenticates, bounds streamed input and exposes only configuration flags", async () => {
  const { provider } = harness(); let calls = 0;
  const route = load("src/app/api/radar/creative/maps-preview/route.ts", {
    "@/app/api/radar/radar-api-auth": { authorizeRadarCollector: (r: Request) => r.headers.get("Authorization") === "Bearer test" ? undefined : new Response(null, { status: 401 }) },
    "@/app/api/radar/radar-topic": { requireActiveRequestTopic: async () => "topic-a", topicRequestErrorResponse: () => undefined },
    "@/app/modules/stories/creative-profile.repository": { getCreativeProfile: async () => profile },
    "@/app/modules/stories/google-maps-provider": { ...provider, googleMapsConfig: () => config },
    "@/app/modules/stories/google-maps-preview": { prepareGoogleMapsPreview: async (topic: string) => { calls++; assert.equal(topic, "topic-a"); return { status: "demo" }; } },
  }) as typeof import("../../api/radar/creative/maps-preview/route");
  assert.equal((await route.POST(new Request("https://local/test", { method: "POST" }))).status, 401);
  const headers = { Authorization: "Bearer test" };
  const settings = await route.GET(new Request("https://local/test", { headers }));
  assert.equal(settings.headers.get("Cache-Control"), "private, no-store, max-age=0");
  assert.ok(!(await settings.text()).includes(config.apiKey));
  assert.equal((await route.POST(new Request("https://local/test", { method: "POST", headers, body: "x".repeat(4097) }))).status, 413);
  assert.equal(calls, 0);
  assert.equal((await route.POST(new Request("https://local/test", { method: "POST", headers, body: JSON.stringify(input) }))).status, 200);
  assert.equal(calls, 1);
});
