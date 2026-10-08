import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";
import * as crypto from "node:crypto";
import ts from "typescript";
import * as policy from "./creative-documentary";
import * as visual from "./creative-place-visual";
import * as evidenceGuardrails from "./creative-evidence-guardrails";
import * as fidelity from "./creative-visual-fidelity";
import * as geometry from "./open-map-geometry";
import * as mapPanel from "./creative-map-panel";
import * as sourceLocation from "./source-location";
import * as quebecRoadMap from "./quebec-road-map";
import * as usageAttribution from "../credits/usage-attribution";
import type { CreativeDraft, CreativeKeyFact, CreativeProfile, CreativeUnit } from "./creative-content.types";

const austin = { municipality: "Austin", region: "Texas", country: "United States", validatedLocationId: null };
const sentence = {
  zilker: "Zilker Park hosts the free Blues on the Green concerts on Wednesday nights.",
  paramount: "The Paramount Theatre screens classic films all summer.",
  barton: "Barton Springs Pool stays open until 10 p.m. during the heat wave.",
  pair: "Both Mueller Lake Park and Pease Park offer free yoga on Saturdays.",
  dallas: "Fair Park in Dallas hosts the State Fair every autumn.",
};
const facts: CreativeKeyFact[] = Object.entries(sentence).map(([id, text]) => ({ id, statement: text, sourceExcerpt: text }) as CreativeKeyFact);
const event = (name: string, excerpt: string, scope: Partial<typeof austin> = {}): policy.PlaceMention => ({ name, kind: "named", role: "event", excerpt, municipality: scope.municipality ?? "", region: scope.region ?? "", country: scope.country ?? "" });
const mentions: policy.PlaceMention[] = [
  event("Zilker Park", sentence.zilker, austin),
  event("Paramount Theatre", sentence.paramount),
  event("Barton Springs Pool", sentence.barton),
  event("Mueller Lake Park", sentence.pair),
  event("Pease Park", sentence.pair),
  event("Fair Park", sentence.dallas, { municipality: "Dallas", region: "Texas", country: "United States" }),
];
const unit = (order: number, factIds: string[], extra: Partial<CreativeUnit> = {}) => ({ id: `u${order}`, order, type: "carousel-slide", role: order === 1 ? "cover" : "content",
  headline: `Slide ${order}`, visualDirection: "Flat editorial illustration of a sunny afternoon", factIds, assetRequest: "generated-image", aspectRatio: "4:5", ...extra }) as CreativeUnit;

test("automatic detection is on only for a carousel or sequence of a brand with a complete area under illustration-editorial", () => {
  assert.equal(visual.autoPlaceDetectionEnabled({ format: "carousel", geoScope: austin, mode: "illustration-editorial" }), true);
  assert.equal(visual.autoPlaceDetectionEnabled({ format: "sequence", geoScope: austin, mode: "illustration-editorial" }), true);
  for (const geoScope of [{ ...austin, municipality: "" }, { ...austin, region: " " }, { ...austin, country: "" }, undefined, null]) {
    assert.equal(visual.autoPlaceDetectionEnabled({ format: "carousel", geoScope, mode: "illustration-editorial" }), false, JSON.stringify(geoScope));
  }
  assert.equal(visual.autoPlaceDetectionEnabled({ format: "meme", geoScope: austin, mode: "illustration-editorial" }), false);
  for (const mode of ["verified-references", "photo-required", undefined]) {
    assert.equal(visual.autoPlaceDetectionEnabled({ format: "carousel", geoScope: austin, mode }), false, String(mode));
  }
  assert.equal(visual.placeFidelityMode("illustration-editorial"), "illustration-editorial");
  assert.equal(visual.placeFidelityMode(undefined), "illustration-editorial", "a missing legacy mode is the default");
  assert.equal(visual.placeFidelityMode("illustration-editorial", { mode: "photo-required", reason: "Official event" }), "photo-required");
  assert.equal(visual.placeFidelityMode("illustration-editorial", { mode: "photo-required", reason: "" }), "photo-required", "an unresolvable override never enables detection");
});

test("only undeclared image slides are candidates; the declared path keeps its own rules", () => {
  assert.equal(visual.autoPlaceCandidate(unit(2, [])), true);
  assert.equal(visual.autoPlaceCandidate(unit(2, [], { visualNeed: "generic-illustration" })), true);
  assert.equal(visual.autoPlaceCandidate(unit(2, [], { visualNeed: "character-reference" })), true);
  assert.equal(visual.autoPlaceCandidate(unit(2, [], { storyReferences: [{ id: "s", purpose: "style" }] } as Partial<CreativeUnit>)), true, "a style photo is inspiration, not imagery");
  for (const extra of [
    { assetRequest: "typography-only" }, { visualNeed: "typography" }, { visualNeed: "real-photo" }, { visualNeed: "verified-map" },
    { visualDirection: "Carte des fermetures à Austin" },
    { storyReferences: [{ id: "p", purpose: "documentary-portrait" }] }, { storyReferences: [{ id: "p", purpose: "place" }] },
  ] as Partial<CreativeUnit>[]) assert.equal(visual.autoPlaceCandidate(unit(2, [], extra)), false, JSON.stringify(extra));
});

test("an automatic place slide names exactly one source-backed place, and that place fits the brand's area", () => {
  assert.equal(visual.autoPlaceMention(unit(2, ["zilker"]), facts, mentions, austin)?.name, "Zilker Park");
  assert.equal(visual.autoPlaceMention(unit(3, ["paramount"]), facts, mentions, austin)?.name, "Paramount Theatre", "an unstated area is not a mismatch");
  assert.equal(visual.autoPlaceMention(unit(4, ["pair"]), facts, mentions, austin), undefined, "two places: ambiguous");
  assert.equal(visual.autoPlaceMention(unit(5, ["dallas"]), facts, mentions, austin), undefined, "outside the brand's area");
  assert.equal(visual.autoPlaceMention(unit(6, []), facts, mentions, austin), undefined, "no cited place");
  assert.equal(visual.autoPlaceMention(unit(2, ["zilker"]), facts, [...mentions, { ...mentions[0], excerpt: "Zilker Park" }], austin)?.name, "Zilker Park", "the same name twice is one place");
  assert.equal(visual.autoPlaceMention(unit(2, ["zilker"]), facts, mentions.map(m => ({ ...m, kind: "generic" as const })), austin), undefined);
  assert.equal(visual.autoPlaceMention(unit(2, ["zilker"]), facts, mentions.map(m => ({ ...m, role: "secondary" as const })), austin), undefined);
  assert.equal(visual.autoPlaceMention(unit(2, ["zilker"]), facts, mentions, { ...austin, region: "" }), undefined, "an incomplete area never fits");
  assert.equal(visual.isAutoPlaceSlide(unit(2, ["zilker"]), facts, mentions, austin), true);
  assert.equal(visual.isAutoPlaceSlide(unit(2, ["zilker"], { visualNeed: "real-photo" }), facts, mentions, austin), false, "a declared slide is not automatic");
});

test("a slide whose photo is not sent keeps the research trail without any material", () => {
  const evidence: visual.PlaceVisualEvidence = { version: visual.PLACE_VISUAL_VERSION, representation: "photo", preparedAt: "2026-10-08T00:00:00.000Z", detection: "automatic",
    generationUse: "ai-reference", reasons: ["Archive photograph"], sha256: "a".repeat(64), attribution: "Author · CC0", sourceUrl: "https://www.wikidata.org/wiki/Q1" };
  const stripped = visual.evidenceWithoutMaterial(evidence, "Not used.");
  assert.equal(stripped.representation, "typography");
  assert.equal(stripped.generationUse, undefined);
  assert.equal(stripped.sha256, undefined);
  assert.equal(stripped.attribution, undefined);
  assert.equal(stripped.detection, "automatic");
  assert.equal(stripped.sourceUrl, "https://www.wikidata.org/wiki/Q1");
  assert.deepEqual(stripped.reasons, ["Archive photograph", "Not used."]);
  const nothing = { ...stripped, reasons: ["No verifiable photograph for Zilker Park; brand illustration kept."] };
  assert.equal(visual.evidenceWithoutMaterial(nothing, "Not used."), nothing, "evidence without material is kept as it is");
});

function load<T>(file: string, dependencies: Record<string, unknown>, env: Record<string, string>): T {
  const source = readFileSync(resolve("src/app/modules/stories", file), "utf8");
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  const exports = {};
  runInNewContext(code, { exports, Date, Set, Map, Buffer, URL, URLSearchParams, AbortSignal, console, process: { env },
    require: (name: string) => {
      if (name === "server-only") return {};
      if (!(name in dependencies)) throw new Error(`Unexpected server dependency: ${name}`);
      return dependencies[name];
    },
  });
  return exports as T;
}

const place = (name: string, id: string): policy.PlaceEvidence => ({ id, name, revision: 1, sourceUrl: `https://www.wikidata.org/wiki/${id}`, scope: austin, hierarchy: [],
  coordinates: { latitude: 30.26, longitude: -97.77, precision: 0.00001 } });
const photo = (placeId: string): policy.PhotoEvidence => ({ placeId, sourceUrl: "https://commons.wikimedia.org/wiki/File:Place.jpg", resourceUrl: "https://upload.wikimedia.org/wikipedia/commons/a/ab/Place.jpg",
  author: "Larry D. Moore", license: "CC0", licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/", attribution: "Larry D. Moore · CC0", captureDate: null,
  retrievedAt: new Date().toISOString(), sha256: "b".repeat(64), width: 1600, height: 1067, contentType: "image/jpeg" });

const openversePhoto = (placeId: string): policy.PhotoEvidence => ({ ...photo(placeId), provider: "openverse", sourceUrl: "https://www.flickr.com/photos/someone/1",
  resourceUrl: "https://live.staticflickr.com/1/1_b.jpg", author: "joejungmann", license: "Public domain", licenseUrl: "https://creativecommons.org/publicdomain/mark/1.0/",
  attribution: "joejungmann · Public domain", creditUrl: "https://www.flickr.com/photos/someone/1", width: 1024, height: 683,
  review: { model: "gpt-test", version: "place-photo-review-v1", summary: "The zoo's entrance gate." } });

type Harness = { extraction?: unknown; photos?: Set<string>; places?: Set<string>; google?: boolean; openverse?: Set<string>; profile?: Partial<CreativeProfile>; facts?: CreativeKeyFact[] };
function preparation(options: Harness = {}) {
  const calls = { research: 0, resolve: [] as string[], photo: [] as string[], google: [] as string[], openverse: [] as string[], osm: 0, budgets: [] as unknown[], schema: undefined as unknown };
  const service = load<typeof import("./prepare-place-visuals")>("prepare-place-visuals.ts", {
    "node:crypto": crypto, "../credits/usage-attribution": usageAttribution, "./creative-documentary": policy, "./creative-place-visual": visual,
    "./creative-evidence-guardrails": evidenceGuardrails, "./open-map-geometry": geometry, "./creative-map-panel": mapPanel,
    "./source-location": sourceLocation, "./quebec-road-map": quebecRoadMap,
    "./prepare-source-location": { prepareSourceLocation: async () => { throw new Error("No address anchor expected"); } },
    "./prepare-road-map": { prepareRoadMap: async () => { throw new Error("No regional adapter expected"); } },
    "./open-map-render": { renderOpenMap: async () => { calls.osm++; return Buffer.from("osm-map"); } },
    "./creative-content.config": { getCreativeContentPublicConfig: () => ({ maxRunsPerDay: 10 }) },
    "./creative-content.repository": { getCreativeDailyUsage: async () => ({ remainingRuns: 10 }), createCreativeAiRun: async () => "run", completeCreativeAiRun: async () => {}, failCreativeAiRun: async () => {} },
    "./openai-structured-response": { generateOpenAiStructuredResponse: async (input: { schema: unknown }) => {
      calls.research++; calls.schema = input.schema;
      return { text: JSON.stringify(options.extraction ?? { purpose: "unknown", mentions }), usage: {}, model: "test" };
    } },
    "./creative-documentary-providers": { documentaryProviders: (_signal: AbortSignal, _language: string, _contact: string, budget: unknown) => {
      calls.budgets.push(budget);
      return {
        resolve: async (mention: policy.PlaceMention) => { calls.resolve.push(mention.name); return (options.places ?? new Set([mention.name])).has(mention.name) ? place(mention.name, `Q${calls.resolve.length}`) : undefined; },
        photo: async (found: policy.PlaceEvidence) => { calls.photo.push(found.name); return options.photos?.has(found.name) ? { bytes: Buffer.from(`photo:${found.name}`), evidence: photo(found.id) } : undefined; },
      };
    } },
    "./openverse-place-photo": { openverseEnabled: () => options.openverse !== undefined, openversePlacePhoto: async (input: { place: policy.PlaceEvidence }) => {
      calls.openverse.push(input.place.name);
      return options.openverse?.has(input.place.name) ? { bytes: Buffer.from(`openverse:${input.place.name}`), evidence: openversePhoto(input.place.id) } : undefined;
    } },
    "./resolve-google-place-map": { resolveGooglePlaceMap: async (name: string) => {
      calls.google.push(name);
      return options.google ? { bytes: Buffer.from("google-map"), evidence: { adapter: "google-maps", sourceUrl: "https://maps.google.com/?cid=1", attribution: "Google", sha256: "c".repeat(64), reasons: ["Google-verified place"] } } : undefined;
    } },
  }, { OPENAI_API_KEY: "test", CREATIVE_GEO_SOURCE_ADAPTERS: "" });
  const profile = { name: "Hello Austin", language: "en", geoScope: austin, visualFidelityMode: "illustration-editorial", brandPalette: [], ...options.profile } as CreativeProfile;
  const run = (units: CreativeUnit[], format = "carousel") => service.preparePlaceVisuals("topic", { units, storyId: "story", briefId: "brief", format } as unknown as CreativeDraft,
    profile, options.facts ?? facts, "https://example.org/austin-summer");
  return { run, calls };
}

test("an undeclared slide naming one place in the brand's area gets a verified photo as an AI identity reference, never a map", async () => {
  for (const purpose of ["location", "current-state", "unknown"]) {
    const h = preparation({ photos: new Set(["Zilker Park"]), google: true, extraction: { purpose, mentions } });
    const result = await h.run([unit(1, []), unit(2, ["zilker"])]);
    const evidence = result.get(2)!.evidence;
    assert.equal(evidence.representation, "photo", purpose);
    assert.equal(evidence.generationUse, "ai-reference", "identity grounding in the brand's style, whatever the extraction purpose");
    assert.equal(evidence.detection, "automatic");
    assert.equal(evidence.photo?.license, "CC0");
    assert.match(evidence.attribution ?? "", /Larry D\. Moore · CC0/);
    assert.ok(evidence.reasons.some(reason => reason.includes("not evidence of current conditions")));
    assert.equal(result.get(2)!.bytes?.toString(), "photo:Zilker Park");
    assert.equal(h.calls.google.length, 0, "no Google call for an automatic slide");
    assert.equal(h.calls.osm, 0);
    assert.equal(h.calls.research, 1, "one research call per draft");
    // The cover cites no place: it stays the creative illustration.
    assert.equal(result.get(1)!.bytes, undefined);
    assert.equal(result.get(1)!.evidence.detection, undefined);
  }
});

test("an automatic slide with nothing verifiable keeps the brand illustration: no bytes, no map, a recorded reason", async () => {
  const h = preparation({ google: true });
  const result = await h.run([unit(2, ["barton"])]);
  const evidence = result.get(2)!.evidence;
  assert.equal(result.get(2)!.bytes, undefined);
  assert.equal(evidence.representation, "typography");
  assert.equal(evidence.detection, "automatic");
  assert.equal(evidence.generationUse, undefined);
  assert.ok(evidence.reasons.includes("No verifiable photograph for Barton Springs Pool; brand illustration kept."));
  assert.deepEqual(h.calls.photo, ["Barton Springs Pool"]);
  assert.equal(h.calls.google.length, 0, "a resolved place with coordinates still never becomes a Google map");
  assert.equal(h.calls.osm, 0, "nor an OSM map");
  const unknown = preparation({ places: new Set() });
  const unresolved = (await unknown.run([unit(2, ["barton"])])).get(2)!.evidence;
  assert.equal(unresolved.representation, "typography");
  assert.ok(unresolved.reasons.some(reason => reason.includes("Identity could not be established")));
  assert.ok(unresolved.reasons.includes("No verifiable photograph for Barton Springs Pool; brand illustration kept."));
  assert.deepEqual(unknown.calls.photo, []);
});

test("ambiguous, out-of-area and incomplete-area slides are not automatic and look nothing up", async () => {
  const h = preparation({ photos: new Set(["Mueller Lake Park", "Pease Park", "Fair Park"]), google: true });
  const result = await h.run([unit(3, ["pair"]), unit(4, ["dallas"]), unit(5, ["zilker"], { visualNeed: "typography" })]);
  for (const order of [3, 4, 5]) {
    assert.equal(result.get(order)!.bytes, undefined);
    assert.equal(result.get(order)!.evidence.detection, undefined);
  }
  assert.deepEqual(h.calls.resolve, []);
  assert.deepEqual(h.calls.google, []);
  assert.equal(h.calls.research, 1, "the undeclared slides were researched");
  for (const geoScope of [{ ...austin, region: "" }, { ...austin, country: "" }]) {
    const off = preparation({ photos: new Set(["Zilker Park"]), profile: { geoScope } });
    const plain = await off.run([unit(2, ["zilker"])]);
    assert.equal(plain.get(2)!.bytes, undefined);
    assert.equal(plain.get(2)!.evidence.detection, undefined);
    assert.equal(off.calls.research, 0, "an incomplete area adds no research");
    assert.deepEqual(off.calls.resolve, []);
  }
  const strict = preparation({ photos: new Set(["Zilker Park"]), profile: { visualFidelityMode: "photo-required" } });
  assert.equal((await strict.run([unit(2, ["zilker"])])).get(2)!.evidence.detection, undefined, "the strict policies keep today's rules");
  assert.equal(strict.calls.research, 0);
  const meme = preparation({ photos: new Set(["Zilker Park"]) });
  assert.equal((await meme.run([unit(2, ["zilker"])], "meme")).get(2)!.evidence.detection, undefined);
});

test("a declared real-photo slide tries the verified Commons photo before the Google map, and the map only when no photo is eligible", async () => {
  const photoFirst = preparation({ photos: new Set(["Paramount Theatre"]), google: true });
  const withPhoto = (await photoFirst.run([unit(2, ["paramount"], { visualNeed: "real-photo" })])).get(2)!;
  assert.equal(withPhoto.evidence.representation, "photo");
  assert.equal(withPhoto.evidence.generationUse, "ai-reference");
  assert.equal(withPhoto.evidence.detection, undefined, "declared, not automatic");
  assert.deepEqual(photoFirst.calls.google, [], "Google is not called once a photo is found");
  const noPhoto = preparation({ google: true });
  const mapped = (await noPhoto.run([unit(2, ["paramount"], { visualNeed: "real-photo" })])).get(2)!;
  assert.deepEqual(noPhoto.calls.photo, ["Paramount Theatre"]);
  assert.deepEqual(noPhoto.calls.google, ["Paramount Theatre"]);
  assert.equal(mapped.evidence.representation, "map");
  assert.equal(mapped.evidence.adapter, "google-maps");
  assert.equal(noPhoto.calls.osm, 0);
  const osm = preparation({});
  const pointMap = (await osm.run([unit(2, ["paramount"], { visualNeed: "real-photo" })])).get(2)!;
  assert.deepEqual(osm.calls.resolve, ["Paramount Theatre"], "the identity resolved for the photo is reused for the OSM point");
  assert.equal(pointMap.evidence.representation, "map");
  assert.equal(pointMap.evidence.attribution, geometry.OSM_ATTRIBUTION);
});

test("Openverse is the second photo source: only for a verified place without a Commons photo, and only as an identity reference", async () => {
  // An automatic slide: Commons has nothing, Openverse has a reviewed photo.
  const auto = preparation({ openverse: new Set(["Barton Springs Pool"]) });
  const found = (await auto.run([unit(2, ["barton"])])).get(2)!;
  assert.equal(found.evidence.representation, "photo");
  assert.equal(found.evidence.generationUse, "ai-reference");
  assert.equal(found.evidence.photo?.provider, "openverse");
  assert.equal(found.bytes?.toString(), "openverse:Barton Springs Pool");
  assert.match(found.evidence.attribution ?? "", /joejungmann · Public domain/);
  assert.ok(!found.evidence.reasons.some(reason => reason.startsWith("No verifiable photograph")), "the unverified note is withdrawn");
  assert.ok(found.evidence.reasons.some(reason => reason.includes("Openverse photograph (Flickr)")));
  assert.deepEqual(auto.calls.openverse, ["Barton Springs Pool"]);

  // A Commons photo wins, and an unverified identity never reaches Openverse.
  const commons = preparation({ photos: new Set(["Zilker Park"]), openverse: new Set(["Zilker Park"]) });
  assert.equal((await commons.run([unit(2, ["zilker"])])).get(2)!.evidence.photo?.provider, undefined);
  assert.deepEqual(commons.calls.openverse, []);
  const unknown = preparation({ places: new Set(), openverse: new Set(["Barton Springs Pool"]) });
  assert.equal((await unknown.run([unit(2, ["barton"])])).get(2)!.bytes, undefined);
  assert.deepEqual(unknown.calls.openverse, []);

  // A declared real-photo slide that fell back to a Google map gets the photo it asked for.
  const declared = preparation({ google: true, openverse: new Set(["Paramount Theatre"]) });
  const replaced = (await declared.run([unit(2, ["paramount"], { visualNeed: "real-photo" })])).get(2)!;
  assert.equal(replaced.evidence.representation, "photo");
  assert.equal(replaced.evidence.adapter, undefined, "the map's provider no longer applies");
  assert.equal(replaced.evidence.photo?.provider, "openverse");
  assert.equal(replaced.evidence.place?.name, "Paramount Theatre", "the photo keeps the verified place it is read back against");
  assert.ok(policy.eligiblePhoto(replaced.evidence.photo!, replaced.evidence.place!));
  assert.ok(!replaced.evidence.reasons.includes("Google-verified place"), "the replaced map's reasons are withdrawn");

  // Nothing found, or Openverse switched off: the slide stays as it was.
  const none = preparation({ openverse: new Set() });
  assert.equal((await none.run([unit(2, ["barton"])])).get(2)!.bytes, undefined);
  const off = preparation({});
  await off.run([unit(2, ["barton"])]);
  assert.deepEqual(off.calls.openverse, [], "disabled Openverse is never called");
});

test("an archive photo the research calls context is still the model's identity reference under illustration-editorial", async () => {
  const location = { purpose: "location", mentions };
  const designed = preparation({ photos: new Set(["Paramount Theatre"]), extraction: location });
  const photo = (await designed.run([unit(2, ["paramount"], { visualNeed: "real-photo" })])).get(2)!;
  assert.equal(photo.evidence.representation, "photo");
  assert.equal(photo.evidence.generationUse, "ai-reference", "the model designs the slide around it, not a local photo card");
  // A strict photo policy keeps the photograph as direct, unaltered evidence.
  const strict = preparation({ photos: new Set(["Paramount Theatre"]), extraction: location, profile: { visualFidelityMode: "verified-references" } });
  const direct = (await strict.run([unit(2, ["paramount"], { visualNeed: "real-photo" })])).get(2)!;
  assert.equal(direct.evidence.representation, "photo");
  assert.equal(direct.evidence.generationUse, undefined);
});

test("a declared verified-map slide keeps the Google map first", async () => {
  const h = preparation({ photos: new Set(["Zilker Park"]), google: true });
  const result = (await h.run([unit(2, ["zilker"], { visualNeed: "verified-map" })])).get(2)!;
  assert.equal(result.evidence.representation, "map");
  assert.equal(result.evidence.adapter, "google-maps");
  assert.deepEqual(h.calls.google, ["Zilker Park"]);
  assert.deepEqual(h.calls.resolve, [], "no provider lookup after a Google map");
  assert.deepEqual(h.calls.photo, []);
});

test("a list of 18 venues is extracted in one call and each venue slide is grounded, with a lookup budget sized to the list", async () => {
  const venues = Array.from({ length: 18 }, (_, i) => `Venue Hall ${String.fromCharCode(65 + i)}`);
  const listFacts = venues.map((name, i) => ({ id: `v${i}`, statement: `${name} is on the list.`, sourceExcerpt: `${name} is on the list.` }) as CreativeKeyFact);
  const listMentions = venues.map(name => event(name, `${name} is on the list.`));
  const h = preparation({ facts: listFacts, photos: new Set(venues), extraction: { purpose: "location", mentions: listMentions } });
  const result = await h.run(venues.map((_, i) => unit(i + 2, [`v${i}`])));
  assert.equal(h.calls.research, 1);
  assert.equal((h.calls.schema as { properties: { mentions: { maxItems: number } } }).properties.mentions.maxItems, 20);
  assert.equal((h.calls.budgets[0] as { places: number }).places, 18);
  for (let order = 2; order < 20; order++) {
    assert.equal(result.get(order)!.evidence.generationUse, "ai-reference", `slide ${order}`);
    assert.equal(result.get(order)!.evidence.detection, "automatic");
  }
  const tooMany = preparation({ facts: listFacts, photos: new Set(venues), extraction: { purpose: "location", mentions: [...listMentions, listMentions[0], listMentions[1], listMentions[2]] } });
  const rejected = await tooMany.run([unit(2, ["v0"])]);
  assert.equal(rejected.get(2)!.bytes, undefined, "more than 20 mentions is an invalid extraction");
  assert.ok(rejected.get(2)!.evidence.reasons.some(reason => reason.includes("Place research unavailable or evidence invalid")));
});

test("an invented excerpt anywhere in a long list still invalidates the whole extraction", async () => {
  const venues = Array.from({ length: 9 }, (_, i) => `Venue Hall ${String.fromCharCode(65 + i)}`);
  const listFacts = venues.map((name, i) => ({ id: `v${i}`, statement: name, sourceExcerpt: `${name} is on the list.` }) as CreativeKeyFact);
  const listMentions = venues.map(name => event(name, `${name} is on the list.`));
  listMentions[8] = event(venues[8], `${venues[8]} was invented by the model.`);
  const h = preparation({ facts: listFacts, photos: new Set(venues), extraction: { purpose: "location", mentions: listMentions } });
  const result = await h.run([unit(2, ["v0"])]);
  assert.equal(result.get(2)!.bytes, undefined);
  assert.deepEqual(h.calls.resolve, []);
});

test("the assets request routes a draft into place composition for automatic detection only when it applies", async () => {
  const source = readFileSync(resolve("src/app/modules/stories/manage-creative-assets.ts"), "utf8");
  const start = source.indexOf("export async function generateCreativeDraftAssets(");
  const helper = source.indexOf("async function detectsPlacesAutomatically(");
  const code = source.slice(start, source.indexOf("export async function generateNextCreativeDraftAssetVersion(", start)) +
    source.slice(helper, source.indexOf("\n}\n", helper) + 3) + "\nexports.run = generateCreativeDraftAssets;";
  const route = async (draft: Record<string, unknown>, geoScope: object = austin, mode = "illustration-editorial") => {
    const reads: string[] = [];
    const exports: { run?: (...args: unknown[]) => Promise<unknown> } = {};
    runInNewContext(ts.transpileModule(code, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, {
      exports, Error,
      requireCreativeDraft: async () => ({ id: "draft", status: "approved", units: [], ...draft }),
      assertStoryEditionCurrent: async () => {}, requireApprovedDraft: () => {},
      requireCreativeBrief: async () => ({ keyFacts: [] }), reuseDocumentaryVisuals: async () => new Map(),
      composeDraftPlaceVisuals: async () => "composed",
      assertGenerativeImageryAllowed: () => { throw new Error("normal generation"); },
      requiresVerifiedGeography: evidenceGuardrails.requiresVerifiedGeography,
      resolveEffectiveVisualFidelity: fidelity.resolveEffectiveVisualFidelity,
      autoPlaceFormat: visual.autoPlaceFormat, autoPlaceCandidate: visual.autoPlaceCandidate, autoPlaceDetectionEnabled: visual.autoPlaceDetectionEnabled,
      outputAspectRatioForDraft: (d: { outputAspectRatio?: string }) => d.outputAspectRatio ?? "4:5",
      getTopicVisualFidelityMode: async () => { reads.push("mode"); return mode; },
      getCreativeProfile: async () => { reads.push("profile"); return { geoScope }; },
    });
    const outcome = await exports.run!("topic", "draft", "high").catch((error: Error) => error.message);
    return { outcome, reads };
  };
  const units = [unit(1, []), unit(2, [])];
  assert.equal((await route({ format: "carousel", units })).outcome, "composed");
  assert.equal((await route({ format: "sequence", units })).outcome, "composed");
  assert.equal((await route({ format: "carousel", units }, { ...austin, region: "" })).outcome, "normal generation");
  assert.equal((await route({ format: "carousel", units }, austin, "verified-references")).outcome, "normal generation");
  const meme = await route({ format: "meme", units: [unit(1, [])] });
  assert.equal(meme.outcome, "normal generation");
  assert.equal(meme.reads.includes("profile"), false, "a meme reads no profile for detection");
  const story = await route({ format: "carousel", outputAspectRatio: "9:16", units });
  assert.equal(story.outcome, "normal generation", "place composition is 4:5 only");
  assert.equal(story.reads.includes("profile"), false);
  assert.equal((await route({ format: "carousel", units: [unit(1, [], { assetRequest: "typography-only" })] })).outcome, "normal generation", "no candidate slide");
});
