import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import * as placeVisual from "./creative-place-visual";

/** Automatic place detection: the draft's format, the brand's area, extra undeclared slides and what research returns for them. */
/** The one eligible Commons photo the fixtures share; storage is checked by reference. */
const commonsPhotoBytes = Buffer.from("commons-photo");
type AutoFixture ={ format: string; geoScope: Record<string, string | null>; units: { id: string; order: number; role: string; type: string; assetRequest: string; headline: string; visualDirection: string; visualNeed?: string }[]; research: Map<number, unknown> };

async function compose(mode = "illustration-editorial", photoTest = false, includeUnresolvedGeoUnit = false, mapMode?: "ai" | "local", includeUnresolvedRealPhotoUnit = false, includeIdentityPhotoUnit = false, coverTypographyOnly = false, includeDocumentaryPortraitUnit = false, mapAdapter = "quebec511", closingTypographyOnly = false, auto?: AutoFixture) {
  const source = readFileSync("src/app/modules/stories/manage-creative-assets.ts", "utf8");
  const start = source.indexOf("async function composeDraftPlaceVisuals(");
  const end = source.indexOf("async function recomposePlaceAsset(", start);
  const code = source.slice(start, end) + "\nexports.run = composeDraftPlaceVisuals;";
  const submitted: number[] = [], rendered: number[] = [], storedMaps: string[] = [];
  let researched: number[] = [];
  let assets: Record<string, unknown>[] = [];
  const photo = Buffer.from("verified-photo");
  const map = Buffer.from("verified-map");
  const identityPhotoBytes = commonsPhotoBytes;
  const storedPhotos: string[] = [];
  const prepared = new Map<number, unknown>([[3, { bytes: photo, evidence: { representation: "photo", reasons: ["Archive photograph from an eligible source; not evidence of the event."], place: { name: "Museum" }, photo: { author: "Yource", license: "CC BY-SA 4.0", licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0/" } } }]]);
  if (mapMode) prepared.set(2, { bytes: map, evidence: { representation: "map", adapter: mapAdapter, sha256: "map-sha", attribution: "MTMD · CC BY 4.0 · © OpenStreetMap contributors", reasons: ["Official MTMD segment rendered as location context"], adapterEvidence: { reason: "matched", segment: { id: "172650", chantier: "319446" } } } });
  // A visualNeed-declared slide whose own direction never mentions a map, so
  // only the declaration — not requestsGeographicReconstruction — routes it;
  // research found nothing, matching a failed Wikidata/Commons resolution.
  if (includeUnresolvedRealPhotoUnit) prepared.set(6, { evidence: { representation: "typography", reasons: ["Identity could not be established from provider records and geographic scope."] } });
  // real-photo on a closure: identity resolved, no map precise enough, but an
  // eligible CC-licensed archive photo grounds the place's identity only.
  if (includeIdentityPhotoUnit) prepared.set(7, { bytes: identityPhotoBytes, evidence: { representation: "photo", generationUse: "ai-reference", reasons: ["Archive photograph from an eligible source, used only to ground the place's identity in an AI-assisted adaptation; not evidence of current conditions."], place: { name: "pont Gouin" }, photo: { author: "Pierre cb", license: "CC0", licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/", contentType: "image/jpeg" } } });
  type TestUnit = { id: string; order: number; role: string; type: string; assetRequest: string; headline: string; visualDirection: string; visualNeed?: string; storyReferences?: { id: string; purpose: string }[] };
  const draft = { id: "draft", version: 3, storyId: "story", ...(auto ? { format: auto.format } : {}),
    units: ([1, 2, 3, 4].map(order => ({ id: String(order), order, role: order === 1 ? "cover" : "content",
      type: "carousel-slide", assetRequest: (coverTypographyOnly && order === 1) || (closingTypographyOnly && order === 4) ? "typography-only" : "generated-image", headline: "Headline", visualDirection: "Editorial illustration" })) as TestUnit[])
      .concat(includeUnresolvedGeoUnit ? [{ id: "5", order: 5, role: "content", type: "carousel-slide",
        assetRequest: "generated-image", headline: "Headline", visualDirection: "Public square rally" }] : [])
      .concat(includeUnresolvedRealPhotoUnit ? [{ id: "6", order: 6, role: "content", type: "carousel-slide",
        assetRequest: "generated-image", headline: "Headline", visualNeed: "real-photo", visualDirection: "Abstract paper-collage motif, no bridge drawn" }] : [])
      .concat(includeIdentityPhotoUnit ? [{ id: "7", order: 7, role: "content", type: "carousel-slide",
        assetRequest: "generated-image", headline: "Headline", visualNeed: "real-photo", visualDirection: "Abstract paper-collage motif, no bridge drawn" }] : [])
      .concat(includeDocumentaryPortraitUnit ? [{ id: "8", order: 8, role: "content", type: "carousel-slide",
        assetRequest: "generated-image", headline: "Person", visualDirection: "Photograph of the person", storyReferences: [{ id: "photo-id", purpose: "documentary-portrait" }] }] : [])
      .concat(auto?.units ?? [])};
  // Research returns the reusable originals plus whatever it found for the automatic slides.
  const researchResults = new Map([...prepared, ...(auto?.research ?? [])]);
  const exports: { run?: (...args: unknown[]) => Promise<unknown> } = {};
  runInNewContext(ts.transpileModule(code, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
  } }).outputText, {
    exports, Map, Set, Buffer,
    placeCompositionVersion: () => photoTest ? "place-visual-v5" : "place-visual-v4",
    documentaryPortraitIdentity: () => "portrait-hash",
    mapReferenceMode: () => mapMode ?? "local",
    MAP_REFERENCE_VISUAL_DIRECTION: "Composition around the provided official map panel",
    storeDocumentaryMapReference: async (topic: string, bytes: Buffer) => { assert.equal(topic, "topic"); assert.equal(bytes, map); storedMaps.push("map-sha"); return "map-sha"; },
    storeDocumentaryPhotoReference: async (topic: string, bytes: Buffer, contentType: string) => { assert.equal(topic, "topic"); assert.equal(bytes, identityPhotoBytes); assert.equal(contentType, "image/jpeg"); storedPhotos.push("photo-sha"); return "photo-sha"; },
    CreativeAssetValidationError: Error,
    // The endpoint pair now comes from the model catalog.
    resolveDefaultCreativeImageModel: () => "gpt-image",
    creativeImageModel: () => ({ textToImageEndpoint: "fal/text", referenceEndpoint: "fal/edit" }),
    creativeImageEndpoint: (model: { textToImageEndpoint: string; referenceEndpoint: string }, mode: string) =>
      mode === "reference-guided" ? model.referenceEndpoint : model.textToImageEndpoint,
    outputAspectRatioForDraft: () => "4:5",
    requireNarrativeQuality: () => {},
    assertEditorialEvidence: async () => {},
    getFalImageRuntimeConfig: () => ({ promptVersion: "base", provider: "fal", model: "image", apiKey: "fixture" }),
    documentaryVisualInputHash: () => "photo-hash",
    resolveCreativeBrandGeneration: async () => ({ inputHash: "brand", snapshot: { brand: true }, carouselChromeSnapshot: { chrome: true }, visual: { name: "Brand", brandPalette: [] } }),
    findCurrentCreativeAssetBatch: async () => undefined,
    getCreativeProfile: async () => (auto ? { geoScope: auto.geoScope } : {}),
    autoPlaceDetectionEnabled: placeVisual.autoPlaceDetectionEnabled,
    autoPlaceCandidate: placeVisual.autoPlaceCandidate,
    evidenceWithoutMaterial: placeVisual.evidenceWithoutMaterial,
    // Sequential, so the submission order stays deterministic.
    mapWithConcurrency: async <T,>(values: T[], _concurrency: number, task: (value: T) => Promise<void>) => { for (const value of values) await task(value); },
    getDailyDraftStory: async (topic: string, story: string, run: unknown, workspace: boolean) => {
      assert.equal(topic, "topic");
      assert.equal(story, "story");
      assert.equal(run, undefined);
      assert.equal(workspace, true);
      return { url: "https://example.org/story" };
    },
    getTopicVisualFidelityMode: async () => mode,
    resolveEffectiveVisualFidelity: () => ({ mode }),
    requestsGeographicReconstruction: (direction: string) => direction === "Public square rally",
    requestsPlacePhotograph: (direction: string) => /photographie réelle/iu.test(direction),
    requiresVerifiedGeography: (unit: { visualDirection: string; visualNeed?: string }) => unit.visualNeed === "verified-map" || unit.visualNeed === "real-photo" || unit.visualDirection === "Public square rally",
    GEOGRAPHIC_FALLBACK_VISUAL_DIRECTION: "Conceptual fallback, no verified place",
    preparePlaceVisuals: async (_topic: string, selected: typeof draft) => {
      researched = selected.units.map(u => u.order); return researchResults;
    },
    assertGenerativeImageryAllowed: () => { assert.equal(mode, "illustration-editorial"); },
    snapshotsForCreativeUnits: async () => new Map(),
    assertCharacterSnapshotsForDraft: () => {},
    charactersForImageGeneration: () => [],
    uniqueCharacterSnapshots: () => [],
    resolveStoryReferences: async (_topic: string, _story: string, selections?: { purpose: string }[]) => selections?.some(ref => ref.purpose === "documentary-portrait") ? [{ id: "photo-id", purpose: "documentary-portrait", sha256: "photo-sha", name: "Person", description: "Verified portrait", provenance: "Author · CC BY 4.0 · source", objectKey: "private/key" }] : [],
    loadStoryReferenceImages: async () => [new File([Buffer.from("portrait-bytes")], "portrait.webp", { type: "image/webp" })],
    storyReferencePrompt: () => "",
    resolveBrandGenerationReferences: async () => ["brand-reference"],
    snapshotsForUnit: () => [],
    buildCreativeImagePrompt: (input: { unit: { visualDirection: string } }) => ({ prompt: `Creative prompt [${input.unit.visualDirection}]`, expectedText: "Headline" }),
    brandReferencePrompt: () => " with brand",
    MAX_CREATIVE_IMAGE_PROMPT_CHARACTERS: 30000,
    assetInputForUnit: (characters: unknown[], refs: unknown, story: unknown[] = []) => ({
      providerEndpoint: "fal/edit", generationMode: "reference-guided", referenceSnapshot: refs,
      characterInputs: characters, storyInputs: story,
    }),
    PORTRAIT_ZONE_PROMPT: "\n<DOCUMENTARY_PHOTO_ZONE>reserved</DOCUMENTARY_PHOTO_ZONE>",
    portraitLayoutForSlide: (order: number) => `layout-${order}`,
    portraitZonePrompt: (layout: string) => `\n<DOCUMENTARY_PHOTO_ZONE>${layout}</DOCUMENTARY_PHOTO_ZONE>`,
    portraitAccent: () => "#168C91",
    normalizePalette: () => [],
    mapPaletteFromBrand: () => ({ surface: "#FFF9F0", primary: "#173F43", accent: "#B94F24" }),
    MAP_PANEL_VISUAL_DIRECTION: "Calm layout around the pasted map",
    PLACE_FREE_SCENE_DIRECTION: "Generic scene of the activity, no place shown",
    mapInsetVisualDirection: (direction: string) => `${direction} Lively scene around the map inset`,
    mapPanelLayout: (evidence?: { panelLayout?: string }) => evidence?.panelLayout === "inset" ? "inset" : "band",
    mapPanelZonePrompt: () => "\n<VERIFIED_MAP_ZONE>reserved</VERIFIED_MAP_ZONE>",
    storyReferenceBatchTag: () => ":story-refs-v3-refs-hash",
    photoLedVisualDirection: (direction: string) => direction,
    shouldApplyCreativeBrandOverlay: () => true,
    DRAFT_TYPOGRAPHY_ENDPOINT: "local/composition",
    createCreativeAssetBatch: async (input: { assets: Record<string, unknown>[] }) => {
      assets = input.assets.map((asset, i) => ({ ...asset, id: i + 1 }));
      return { id: "batch", assets };
    },
    submitStoredAsset: async (asset: { unitOrder: number }) => { submitted.push(asset.unitOrder); },
    renderDraftTypography: async (unit: { order: number }, _profile: unknown, bytes: unknown) => {
      if (unit.order === 3) assert.equal(bytes, photo);
      if (unit.order === 8) assert.equal((bytes as Buffer).toString(), "portrait-bytes");
      rendered.push(unit.order); return Buffer.from("render");
    },
    uploadComposedImage: async () => ({}),
    completeCreativeAsset: async () => {},
    failCreativeAsset: async () => assert.fail("Unexpected render failure"),
    refreshCreativeAssetBatchStatus: async () => ({ id: "batch", assets }),
    publicConfiguration: () => ({}),
  });
  await exports.run!("topic", draft, { keyFacts: [], profileSnapshot: {} }, "high", prepared);
  return { submitted, rendered, researched, assets, storedMaps, storedPhotos };
}

test("a verified map slide is generated with the stored map as its last reference, and composed locally when the mode says so", async () => {
  const ai = await compose("illustration-editorial", false, false, "ai");
  assert.deepEqual(ai.submitted, [1, 2, 4]);
  assert.deepEqual(ai.rendered, [3]);
  assert.deepEqual(ai.storedMaps, ["map-sha"]);
  const slide = ai.assets.find(a => a.unitOrder === 2)!;
  assert.equal(slide.generationMode, "reference-guided");
  assert.equal(slide.providerEndpoint, "fal/edit");
  assert.match(String(slide.prompt), /LAST input image is the verified official road map/);
  assert.match(String(slide.prompt), /MTMD · CC BY 4\.0/);
  const evidence = (slide.unitSnapshot as { placeVisual: { generationUse: string; representation: string; referenceTopicId: string; sha256: string; reasons: string[]; adapterEvidence: { segment: { id: string } } } }).placeVisual;
  assert.equal(evidence.generationUse, "ai-reference");
  assert.equal(evidence.representation, "map");
  assert.equal(evidence.referenceTopicId, "topic");
  assert.equal(evidence.sha256, "map-sha");
  assert.equal(evidence.adapterEvidence.segment.id, "172650");
  assert.match(evidence.reasons.join(" "), /compare the map panel with the original/);
  const local = await compose("illustration-editorial", false, false, "local");
  assert.deepEqual(local.submitted, [1, 4]);
  assert.deepEqual(local.rendered, [2, 3]);
  assert.deepEqual(local.storedMaps, []);
  // A strict topic never sends the map to a generator, whatever the mode says.
  const strict = await compose("photo-required", false, false, "ai");
  assert.deepEqual(strict.submitted, []);
  assert.deepEqual(strict.storedMaps, []);
});

test("a Google map is never sent to the model: the slide reserves a band and the stored map is pasted there", async () => {
  const result = await compose("illustration-editorial", false, false, "ai", false, false, false, false, "google-maps");
  assert.deepEqual(result.submitted, [1, 2, 4]);
  assert.deepEqual(result.storedMaps, ["map-sha"], "the exact map is stored for the paste");
  const slide = result.assets.find(a => a.unitOrder === 2)!;
  assert.doesNotMatch(String(slide.prompt), /LAST input image/, "no reference instruction");
  assert.match(String(slide.prompt), /VERIFIED_MAP_ZONE/);
  assert.match(String(slide.prompt), /Lively scene around the map inset/, "the slide's own scene lives around the small map inset");
  const evidence = (slide.unitSnapshot as { placeVisual: { generationUse: string; panelColor: string; referenceTopicId: string; sha256: string; reasons: string[] } }).placeVisual;
  assert.equal(evidence.generationUse, "panel");
  assert.equal((evidence as { panelLayout?: string }).panelLayout, "inset", "new batches use the small inset");
  assert.equal(evidence.panelColor, "#173F43");
  assert.equal(evidence.referenceTopicId, "topic");
  assert.equal(evidence.sha256, "map-sha");
  assert.match(evidence.reasons.join(" "), /pasted unaltered/);
});

test("a documentary portrait slide is designed by the AI around a reserved zone, and the photo is never an input", async () => {
  const result = await compose("illustration-editorial", false, false, undefined, false, false, false, true);
  assert.deepEqual(result.submitted, [1, 2, 4, 8]);
  assert.deepEqual(result.rendered, [3]);
  assert.deepEqual(result.researched, [3], "a portrait slide is never place research");
  const portrait = result.assets.find(asset => asset.unitOrder === 8)!;
  assert.notEqual(portrait.providerEndpoint, "local/composition");
  assert.match(String(portrait.prompt), /DOCUMENTARY_PHOTO_ZONE/);
  assert.equal((portrait.storyInputs as unknown[]).length, 0, "the photo is not a model reference");
  assert.equal((portrait.characterInputs as unknown[]).length, 0, "no fictional character joins a real person's slide");
  assert.doesNotMatch(JSON.stringify(portrait.referenceSnapshot), /photo-id|photo-sha/);
  // Recorded so the post-processor pastes these exact, verified pixels.
  assert.equal((portrait.unitSnapshot as { documentaryPortrait: { sha256: string } }).documentaryPortrait.sha256, "photo-sha");
  // The slide's layout is chosen once, sent to the model and kept for every later paste.
  assert.match(String(portrait.prompt), /<DOCUMENTARY_PHOTO_ZONE>layout-8</);
  assert.equal((portrait.unitSnapshot as { documentaryPortrait: { layout: string } }).documentaryPortrait.layout, "layout-8");
  assert.doesNotMatch(JSON.stringify(portrait.unitSnapshot), /private\/key/);
});

test("under a strict photo policy a documentary portrait stays a local composition with no model request", async () => {
  const result = await compose("photo-required", false, false, undefined, false, false, false, true);
  assert.ok(!result.submitted.includes(8));
  assert.ok(result.rendered.includes(8));
  const portrait = result.assets.find(asset => asset.unitOrder === 8)!;
  assert.equal(portrait.providerEndpoint, "local/composition");
  assert.match(String(portrait.prompt), /no image-model request/);
});

test("recomposing a documentary portrait keeps its saved photo and does not replace it with place imagery", async () => {
  const source = readFileSync("src/app/modules/stories/manage-creative-assets.ts", "utf8");
  const start = source.indexOf("async function recomposePlaceAsset(");
  const code = source.slice(start) + "\nexports.run = recomposePlaceAsset;";
  const exports: { run?: (...args: unknown[]) => Promise<unknown> } = {};
  const portrait = { photoId: "photo-id", sha256: "photo-sha", name: "Person", description: "Verified portrait", provenance: "Author · CC BY 4.0 · source" };
  let rendered = false;
  runInNewContext(ts.transpileModule(code, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, {
    exports, Buffer,
    assertCurrentAsset: () => {}, assertEditorialEvidence: async () => {}, requireNarrativeQuality: () => {},
    resolveCreativeBrandGeneration: async () => ({ inputHash: "brand", carouselChrome: {} }),
    assertCurrentBrandConfiguration: () => {},
    CreativeContentConflictError: Error,
    resolveStoryReferences: async () => [{ id: "photo-id", purpose: "documentary-portrait", sha256: "photo-sha" }],
    getDailyDraftStory: async () => assert.fail("Portrait recompose must not research a place"),
    getCreativeProfile: async () => ({}),
    reuseDocumentaryVisuals: async () => assert.fail("Portrait recompose must not reuse place imagery"),
    preparePlaceVisuals: async () => assert.fail("Portrait recompose must not prepare place imagery"),
    insertRegeneratedCreativeAsset: async ({ unitSnapshot }: { unitSnapshot: Record<string, unknown> }) => ({ id: "new-asset", unitSnapshot }),
    getFalImageRuntimeConfig: () => ({ apiKey: "fixture" }),
    loadStoryReferenceImages: async () => [new File([Buffer.from("same-portrait")], "portrait.webp", { type: "image/webp" })],
    renderDraftTypography: async (unit: { documentaryPortrait: typeof portrait }, _profile: unknown, bytes: Buffer) => {
      assert.deepEqual(unit.documentaryPortrait, portrait);
      assert.equal(bytes.toString(), "same-portrait");
      rendered = true;
      return Buffer.from("composed");
    },
    uploadComposedImage: async () => ({ url: "https://example.org/composed.png" }),
    completeCreativeAsset: async () => {}, failCreativeAsset: async () => assert.fail("Unexpected composition failure"),
    refreshCreativeAssetBatchStatus: async () => ({ id: "batch" }), publicConfigurationForBatch: () => ({}),
  });
  await exports.run!("topic", { asset: { id: "asset", prompt: "local", unitOrder: 2, unitSnapshot: { documentaryPortrait: portrait } }, batch: { id: "batch", imageQuality: "high" } },
    { id: "draft", version: 2, storyId: "story", units: [{ order: 2, storyReferences: [{ id: "photo-id", purpose: "documentary-portrait" }] }] },
    { keyFacts: [], profileSnapshot: {} });
  assert.equal(rendered, true);
});

test("museum photo is composed only on its slide; other slides use creative prompts and brand references", async () => {
  const result = await compose();
  assert.deepEqual(result.submitted, [1, 2, 4]);
  assert.deepEqual(result.rendered, [3]);
  assert.deepEqual(Array.from(result.researched), [3]);
  for (const asset of result.assets.filter(a => a.unitOrder !== 3)) {
    assert.equal(asset.prompt, "Creative prompt [Editorial illustration] with brand");
    assert.equal(asset.providerEndpoint, "fal/edit");
    assert.equal((asset.referenceSnapshot as string[])[0], "brand-reference");
    assert.ok(asset.brandOverlaySnapshot);
    assert.ok(asset.carouselChromeSnapshot);
    assert.equal((asset.unitSnapshot as { placeVisual?: unknown }).placeVisual, undefined);
  }
});

test("photo-required policy never falls back to generative imagery", async () => {
  const result = await compose("photo-required");
  assert.deepEqual(result.submitted, []);
  assert.deepEqual(result.rendered, [1, 2, 3, 4]);
});


test("opt-in experiment sends the museum slide through creative generation with explicit photo evidence", async () => {
  const result = await compose("illustration-editorial", true);
  assert.deepEqual(result.submitted, [1, 2, 3, 4]);
  assert.deepEqual(result.rendered, []);
  const museum = result.assets.find(a => a.unitOrder === 3)!;
  assert.equal(museum.providerEndpoint, "fal/edit");
  const unit = museum.unitSnapshot as { placeVisual: { generationUse: string; referenceTopicId: string } };
  assert.equal(unit.placeVisual.generationUse, "ai-reference");
  assert.equal(unit.placeVisual.referenceTopicId, "topic");
  assert.match(String(museum.prompt), /LAST input image.*Museum/);
  // The credit is published in the caption (batchPhotoCredits), never drawn on the image.
  assert.doesNotMatch(String(museum.prompt), /Yource/);
  assert.match(String(museum.prompt), /Draw no credit, caption, source name, licence or URL anywhere on the image/);
  const strict = await compose("photo-required", true);
  assert.deepEqual(strict.submitted, []);
});

test("a real-photo slide on a closure story is composed from an identity-only archive photo, stored, credited and marked never as evidence of the event — governed by the same map-reference dial, no photoReferenceTest flag needed", async () => {
  // Shares mapReferenceMode with the verified-map feature: one operator dial
  // for every kind of geo material composed as an AI reference vs. locally.
  const result = await compose("illustration-editorial", false, false, "ai", false, true);
  // mapMode left undefined (not "local"): passing any truthy mode would also
  // add slide 2's unrelated map fixture, which this test does not want.
  const local = await compose("illustration-editorial", false, false, undefined, false, true);
  assert.deepEqual(local.submitted, [1, 2, 4]);
  assert.deepEqual(local.rendered, [3, 7]);
  assert.deepEqual(local.storedPhotos, []);
  assert.deepEqual(result.submitted, [1, 2, 4, 7]);
  assert.deepEqual(result.rendered, [3]);
  assert.deepEqual(result.storedPhotos, ["photo-sha"]);
  const bridge = result.assets.find(a => a.unitOrder === 7)!;
  assert.equal(bridge.generationMode, "reference-guided");
  assert.equal(bridge.providerEndpoint, "fal/edit");
  assert.match(String(bridge.prompt), /LAST input image is the verified archive photograph of pont Gouin/);
  assert.doesNotMatch(String(bridge.prompt), /Pierre cb/, "the credit goes in the caption, not on the image");
  assert.match(String(bridge.prompt), /never invent its interior, its exhibits, artworks or stage, or an event held there/);
  assert.match(String(bridge.prompt), /not evidence of current conditions/);
  assert.match(String(bridge.prompt), /Do not invent damage, closures, barriers, detour signage or changes not shown in the photograph itself\. When the slide's facts describe something people do there.*when the facts describe a closure, works or damage, show no crowd or celebration/);
  const snapshot = bridge.unitSnapshot as { placeVisual: { generationUse: string; referenceTopicId: string; reasons: string[]; photo: { license: string } } };
  assert.equal(snapshot.placeVisual.generationUse, "ai-reference");
  assert.equal(snapshot.placeVisual.referenceTopicId, "topic");
  assert.equal(snapshot.placeVisual.photo.license, "CC0");
  assert.match(snapshot.placeVisual.reasons.join(" "), /used only to ground the place's identity/);
  assert.match(snapshot.placeVisual.reasons.join(" "), /not evidence of current conditions/);
});

test("a slide requesting a real place with no verified evidence generates a conceptual illustration instead of failing or rendering text-only", async () => {
  const result = await compose("illustration-editorial", false, true);
  // Slide 5 asked for a real place (a public square) but preparePlaceVisuals
  // found nothing for it; it must reach normal generation, not the local
  // typography renderer, and assertGenerativeImageryAllowed must not block it.
  assert.deepEqual(result.submitted, [1, 2, 4, 5]);
  assert.deepEqual(result.rendered, [3]);
  const fallback = result.assets.find(a => a.unitOrder === 5)!;
  // The prompt never repeats the unverified "public square" request; it uses
  // the neutral, conceptual direction instead.
  assert.match(String(fallback.prompt), /Conceptual fallback, no verified place/);
  assert.doesNotMatch(String(fallback.prompt), /Public square rally/);
});

test("a strict photo-required topic still refuses a real-place slide with no verified evidence", async () => {
  const result = await compose("photo-required", false, true);
  assert.deepEqual(result.submitted, []);
  assert.deepEqual(result.rendered, [1, 2, 3, 4, 5]);
});

test("a typography-only slide after the cover is designed by the image model too, never the bare local text card", async () => {
  const result = await compose("illustration-editorial", false, false, undefined, false, false, false, false, "quebec511", true);
  assert.ok(result.submitted.includes(4), "the typography-only closing slide is sent to the model");
  assert.ok(!result.rendered.includes(4), "and not rendered as a local text card");
  const strict = await compose("photo-required", false, false, undefined, false, false, false, false, "quebec511", true);
  assert.ok(!strict.submitted.includes(4), "a strict photo policy still keeps it local");
});

test("a cover marked typography-only is still generated by the image model; only the strict photo policy keeps it local", async () => {
  // Live regression: a saved, approved list carousel whose writer marked the
  // cover typography-only came back as the bare local text card while every
  // other slide was generated. A cover can never be that card.
  const result = await compose("illustration-editorial", false, false, undefined, false, false, true);
  assert.deepEqual(result.submitted, [1, 2, 4]);
  assert.deepEqual(result.rendered, [3]);
  assert.equal(result.assets.find(a => a.unitOrder === 1)!.providerEndpoint, "fal/edit");

  const strict = await compose("photo-required", false, false, undefined, false, false, true);
  assert.deepEqual(strict.submitted, []);
  assert.deepEqual(strict.rendered, [1, 2, 3, 4]);
});

test("a real-photo slide with no map language in its own direction still keeps its research reasons when nothing resolves, and its own (already-safe) direction is never overridden", async () => {
  const result = await compose("illustration-editorial", false, false, undefined, true);
  assert.deepEqual(result.submitted, [1, 2, 4, 6]);
  assert.deepEqual(result.rendered, [3]);
  const unresolved = result.assets.find(a => a.unitOrder === 6)!;
  // Before the fix, only a direction matching requestsGeographicReconstruction
  // kept its placeVisual; a visualNeed-only trigger silently dropped it.
  const snapshot = unresolved.unitSnapshot as { placeVisual?: { reasons: string[] } };
  assert.ok(snapshot.placeVisual, "the research reasons must survive on the persisted asset");
  assert.match(snapshot.placeVisual!.reasons.join(" "), /Identity could not be established/);
  // The writer's own direction is kept, and the slide still shows what happens
  // there as a generic scene instead of abstract shapes alone.
  assert.match(String(unresolved.prompt), /\[Abstract paper-collage motif, no bridge drawn\. Generic scene of the activity, no place shown\]/);
  assert.doesNotMatch(String(unresolved.prompt), /Conceptual fallback, no verified place/);
});

test("a changed story-photo use makes the next image version rebuild instead of replaying old references", () => {
  const source = readFileSync("src/app/modules/stories/manage-creative-assets.ts", "utf8");
  const start = source.indexOf("export function storyReferenceSelectionsChanged(");
  const code = source.slice(start, source.indexOf("function batchMatchesDraftGenerationModes(", start)).replace("export function", "function") + "\nexports.run = storyReferenceSelectionsChanged;";
  const exports: { run?: (draft: unknown, batch: unknown) => boolean } = {};
  runInNewContext(ts.transpileModule(code, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, { exports, JSON });
  const changed = exports.run!;
  const portraitAsset = { unitOrder: 4, version: 1, unitSnapshot: { documentaryPortrait: { photoId: "mont" } } };
  const plainAsset = { unitOrder: 1, version: 1, unitSnapshot: {} };
  const batch = { assets: [plainAsset, portraitAsset] };
  // Unchanged: the documentary photo is still the slide's only selection.
  assert.equal(changed({ units: [{ order: 1 }, { order: 4, storyReferences: [{ id: "mont", purpose: "documentary-portrait" }] }] }, batch), false);
  // Documentary photo → AI-adapted place: the stored prompt no longer matches.
  assert.equal(changed({ units: [{ order: 1 }, { order: 4, storyReferences: [{ id: "mont", purpose: "place" }] }] }, batch), true);
  // A photo newly added to a slide that had none.
  assert.equal(changed({ units: [{ order: 1, storyReferences: [{ id: "canal", purpose: "place" }] }, { order: 4, storyReferences: [{ id: "mont", purpose: "documentary-portrait" }] }] }, batch), true);
  // Same references reported by a reference-guided asset.
  const guided = { assets: [{ unitOrder: 1, version: 2, unitSnapshot: {}, storyPhotoReferences: [{ id: "canal", purpose: "place" }] }] };
  assert.equal(changed({ units: [{ order: 1, storyReferences: [{ id: "canal", purpose: "place" }] }] }, guided), false);
});

test("only transient network/provider failures are retried when submitting an image", () => {
  const source = readFileSync("src/app/modules/stories/manage-creative-assets.ts", "utf8");
  const start = source.indexOf("export function isTransientFalSubmitError(");
  const end = source.indexOf("\n}\n", start) + 3;
  const exports: { run?: (error: unknown) => boolean } = {};
  runInNewContext(ts.transpileModule(source.slice(start, end).replace("export function", "function") + "\nexports.run = isTransientFalSubmitError;",
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, { exports, Error, String });
  const transient = exports.run!;
  for (const message of ["fetch failed", "HTTP 408: Request Timeout", "HTTP 429: Too Many Requests", "HTTP 503: Service Unavailable", "The operation timed out", "socket hang up"]) {
    assert.equal(transient(new Error(message)), true, message);
  }
  for (const message of ["HTTP 400: Bad Request", "HTTP 422: content policy violation", "The combined references exceed 16 images."]) {
    assert.equal(transient(new Error(message)), false, message);
  }
});

test("a documentary-portrait slide generated text-to-image still matches its batch: the portrait is never a model reference", () => {
  const source = readFileSync("src/app/modules/stories/manage-creative-assets.ts", "utf8");
  const start = source.indexOf("function batchMatchesDraftGenerationModes(");
  const end = source.indexOf("\n}\n", start) + 3;
  const exports: { run?: (batch: unknown, draft: unknown) => boolean } = {};
  const models: Record<string, { mode: string }> = { "edit": { mode: "reference-guided" }, "t2i": { mode: "text-to-image" } };
  runInNewContext(ts.transpileModule(source.slice(start, end) + "\nexports.run = batchMatchesDraftGenerationModes;", { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText,
    { exports, Map, Boolean, DRAFT_TYPOGRAPHY_ENDPOINT: "typography", findCreativeImageModelByEndpoint: (endpoint: string) => models[endpoint] });
  const matches = exports.run!;
  const portraitUnit = { order: 3, storyReferences: [{ id: "p", purpose: "documentary-portrait" }] };
  const asset = (generationMode: string, providerEndpoint: string) => ({ unitOrder: 3, generationMode, providerEndpoint, unitSnapshot: {} });
  assert.equal(matches({ assets: [asset("text-to-image", "t2i")] }, { units: [portraitUnit] }), true);
  // A photo the model adapts is a real reference and needs reference-guided generation.
  assert.equal(matches({ assets: [asset("text-to-image", "t2i")] }, { units: [{ order: 3, storyReferences: [{ id: "p", purpose: "place" }] }] }), false);
});

const austin = { municipality: "Austin", region: "Texas", country: "United States", validatedLocationId: null };
const autoUnit = (order: number, extra: Record<string, unknown> = {}) => ({ id: String(order), order, role: "content", type: "carousel-slide",
  assetRequest: "generated-image", headline: `Venue ${order}`, visualDirection: "Flat editorial illustration of a sunny afternoon", ...extra });
const automaticPhoto = { bytes: commonsPhotoBytes, evidence: { representation: "photo", detection: "automatic", generationUse: "ai-reference", version: "place-visual-v2", preparedAt: "2026-10-08T00:00:00.000Z",
  reasons: ["Archive photograph from an eligible source, used only to ground the place's identity in an AI-assisted adaptation; not evidence of current conditions."],
  place: { name: "Zilker Park" }, photo: { author: "Larry D. Moore", license: "CC BY-SA 4.0", licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0/", contentType: "image/jpeg" } } };
const automaticUnverified = { evidence: { representation: "typography", detection: "automatic", version: "place-visual-v2", preparedAt: "2026-10-08T00:00:00.000Z",
  reasons: ["Identity could not be established from provider records and geographic scope.", "No verifiable photograph for Barton Springs Pool; brand illustration kept."] } };

test("automatic place detection researches every undeclared image slide only for a brand with a complete area", async () => {
  const units = [autoUnit(10), autoUnit(11, { assetRequest: "typography-only" }), autoUnit(12, { visualNeed: "typography" })];
  const on = await compose("illustration-editorial", false, false, undefined, false, false, false, false, "quebec511", false, { format: "carousel", geoScope: austin, units, research: new Map() });
  assert.deepEqual(on.researched, [1, 2, 3, 4, 10], "undeclared image slides join research; typography slides never do");
  for (const scope of [{ ...austin, region: "" }, { ...austin, municipality: "" }, { ...austin, country: "" }]) {
    const off = await compose("illustration-editorial", false, false, undefined, false, false, false, false, "quebec511", false, { format: "carousel", geoScope: scope, units, research: new Map() });
    assert.deepEqual(off.researched, [3], "an incomplete area keeps today's research set");
  }
  const meme = await compose("illustration-editorial", false, false, undefined, false, false, false, false, "quebec511", false, { format: "meme", geoScope: austin, units, research: new Map() });
  assert.deepEqual(meme.researched, [3]);
  // Nothing found: every undeclared slide is the same creative illustration as without places.
  assert.deepEqual(on.submitted, [1, 2, 4, 10, 11, 12]);
  assert.deepEqual(on.rendered, [3]);
});

test("an automatic place slide with an eligible photo is an AI identity reference in the brand's style, stored and credited", async () => {
  const result = await compose("illustration-editorial", false, false, "ai", false, false, false, false, "quebec511", false,
    { format: "carousel", geoScope: austin, units: [autoUnit(10)], research: new Map([[10, automaticPhoto]]) });
  assert.ok(result.submitted.includes(10));
  assert.ok(!result.rendered.includes(10), "never a local photo card");
  assert.deepEqual(result.storedPhotos, ["photo-sha"]);
  const slide = result.assets.find(a => a.unitOrder === 10)!;
  assert.equal(slide.generationMode, "reference-guided");
  assert.match(String(slide.prompt), /LAST input image is the verified archive photograph of Zilker Park/);
  assert.doesNotMatch(String(slide.prompt), /Larry D\. Moore/, "the credit goes in the caption, not on the image");
  assert.match(String(slide.prompt), /\[Flat editorial illustration of a sunny afternoon\]/, "the writer's own direction is kept");
  const evidence = (slide.unitSnapshot as { placeVisual: { generationUse: string; detection: string; referenceTopicId: string; sha256: string } }).placeVisual;
  assert.equal(evidence.generationUse, "ai-reference");
  assert.equal(evidence.detection, "automatic");
  assert.equal(evidence.referenceTopicId, "topic");
  assert.equal(evidence.sha256, "photo-sha");
});

test("where references are composed locally, an automatic photo is not used: the slide stays a creative illustration, never a photo card", async () => {
  const result = await compose("illustration-editorial", false, false, "local", false, false, false, false, "quebec511", false,
    { format: "carousel", geoScope: austin, units: [autoUnit(10)], research: new Map([[10, automaticPhoto]]) });
  assert.ok(result.submitted.includes(10));
  assert.ok(!result.rendered.includes(10));
  assert.deepEqual(result.storedPhotos, []);
  const slide = result.assets.find(a => a.unitOrder === 10)!;
  assert.doesNotMatch(String(slide.prompt), /LAST input image/);
  const evidence = (slide.unitSnapshot as { placeVisual: { representation: string; generationUse?: string; photo?: unknown; sha256?: string; reasons: string[] } }).placeVisual;
  assert.equal(evidence.representation, "typography");
  assert.equal(evidence.generationUse, undefined);
  assert.equal(evidence.photo, undefined);
  assert.equal(evidence.sha256, undefined);
  assert.match(evidence.reasons.join(" "), /brand illustration kept/);
});

test("a place slide whose direction asks for a real photograph of the venue gets the generic scene instead", async () => {
  // The October 2026 Saint-Jean writer asked for the hall of a named theatre.
  const unresolved = { evidence: { representation: "typography", version: "place-visual-v2", preparedAt: "2026-10-08T00:00:00.000Z", reasons: ["Identity could not be established from provider records and geographic scope."] } };
  const result = await compose("illustration-editorial", false, false, "ai", false, false, false, false, "quebec511", false,
    { format: "carousel", geoScope: austin, units: [autoUnit(10, { visualNeed: "real-photo", visualDirection: "Photographie réelle de la grande salle du Théâtre des Deux Rives" })], research: new Map([[10, unresolved]]) });
  const slide = result.assets.find(a => a.unitOrder === 10)!;
  assert.equal(slide.prompt, "Creative prompt [Generic scene of the activity, no place shown] with brand");
});

test("an automatic place slide with nothing verifiable keeps the normal creative illustration and records why", async () => {
  const result = await compose("illustration-editorial", false, false, "ai", false, false, false, false, "quebec511", false,
    { format: "carousel", geoScope: austin, units: [autoUnit(10)], research: new Map([[10, automaticUnverified]]) });
  assert.ok(result.submitted.includes(10), "generated by the model");
  assert.ok(!result.rendered.includes(10), "no typography placeholder");
  const slide = result.assets.find(a => a.unitOrder === 10)!;
  assert.equal(slide.prompt, "Creative prompt [Flat editorial illustration of a sunny afternoon] with brand");
  assert.notEqual(slide.providerEndpoint, "local/composition");
  const evidence = (slide.unitSnapshot as { placeVisual: { representation: string; generationUse?: string; reasons: string[] } }).placeVisual;
  assert.equal(evidence.representation, "typography");
  assert.equal(evidence.generationUse, undefined, "never counted as verified imagery");
  assert.match(evidence.reasons.join(" "), /No verifiable photograph for Barton Springs Pool; brand illustration kept\./);
});
