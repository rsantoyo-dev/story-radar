import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";

async function compose(mode = "illustration-editorial", photoTest = false) {
  const source = readFileSync("src/app/modules/stories/manage-creative-assets.ts", "utf8");
  const start = source.indexOf("async function composeDraftPlaceVisuals(");
  const end = source.indexOf("async function recomposePlaceAsset(", start);
  const code = source.slice(start, end) + "\nexports.run = composeDraftPlaceVisuals;";
  const submitted: number[] = [], rendered: number[] = [];
  let researched: number[] = [];
  let assets: Record<string, unknown>[] = [];
  const photo = Buffer.from("verified-photo");
  const prepared = new Map([[3, { bytes: photo, evidence: { representation: "photo", place: { name: "Museum" }, photo: { author: "Yource", license: "CC BY-SA 4.0", licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0/" } } }]]);
  const draft = { id: "draft", version: 3, storyId: "story",
    units: [1, 2, 3, 4].map(order => ({ id: String(order), order, role: order === 1 ? "cover" : "content",
      type: "carousel-slide", assetRequest: "generated-image", headline: "Headline", visualDirection: "Editorial illustration" })) };
  const exports: { run?: (...args: unknown[]) => Promise<unknown> } = {};
  runInNewContext(ts.transpileModule(code, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
  } }).outputText, {
    exports, Map, Set,
    placeCompositionVersion: () => photoTest ? "place-visual-v5" : "place-visual-v4",
    FAL_REFERENCE_GUIDED_ENDPOINT: "fal/edit",
    outputAspectRatioForDraft: () => "4:5",
    requireNarrativeQuality: () => {},
    assertEditorialEvidence: async () => {},
    getFalImageRuntimeConfig: () => ({ promptVersion: "base", provider: "fal", model: "image", apiKey: "fixture" }),
    documentaryVisualInputHash: () => "photo-hash",
    resolveCreativeBrandGeneration: async () => ({ inputHash: "brand", snapshot: { brand: true }, carouselChromeSnapshot: { chrome: true } }),
    findCurrentCreativeAssetBatch: async () => undefined,
    getCreativeProfile: async () => ({}),
    getSelectedStoryContent: async () => ({ url: "https://example.org/story" }),
    getTopicVisualFidelityMode: async () => mode,
    resolveEffectiveVisualFidelity: () => ({ mode }),
    requestsGeographicReconstruction: () => false,
    preparePlaceVisuals: async (_topic: string, selected: typeof draft) => {
      researched = selected.units.map(u => u.order); return prepared;
    },
    assertGenerativeImageryAllowed: () => { assert.equal(mode, "illustration-editorial"); },
    snapshotsForCreativeUnits: async () => new Map(),
    assertCharacterSnapshotsForDraft: () => {},
    charactersForImageGeneration: () => [],
    uniqueCharacterSnapshots: () => [],
    resolveBrandGenerationReferences: async () => ["brand-reference"],
    snapshotsForUnit: () => [],
    buildCreativeImagePrompt: () => ({ prompt: "Creative prompt", expectedText: "Headline" }),
    brandReferencePrompt: () => " with brand",
    MAX_CREATIVE_IMAGE_PROMPT_CHARACTERS: 30000,
    assetInputForUnit: (_characters: unknown, refs: unknown) => ({
      providerEndpoint: "fal/edit", generationMode: "reference-guided", referenceSnapshot: refs,
    }),
    shouldApplyCreativeBrandOverlay: () => true,
    DRAFT_TYPOGRAPHY_ENDPOINT: "local/composition",
    createCreativeAssetBatch: async (input: { assets: Record<string, unknown>[] }) => {
      assets = input.assets.map((asset, i) => ({ ...asset, id: i + 1 }));
      return { id: "batch", assets };
    },
    submitStoredAsset: async (asset: { unitOrder: number }) => { submitted.push(asset.unitOrder); },
    renderDraftTypography: async (unit: { order: number }, _profile: unknown, bytes: unknown) => {
      if (unit.order === 3) assert.equal(bytes, photo);
      rendered.push(unit.order); return Buffer.from("render");
    },
    uploadComposedImage: async () => ({}),
    completeCreativeAsset: async () => {},
    failCreativeAsset: async () => assert.fail("Unexpected render failure"),
    refreshCreativeAssetBatchStatus: async () => ({ id: "batch", assets }),
    publicConfiguration: () => ({}),
  });
  await exports.run!("topic", draft, { keyFacts: [], profileSnapshot: {} }, "high", prepared);
  return { submitted, rendered, researched, assets };
}

test("museum photo is composed only on its slide; other slides use creative prompts and brand references", async () => {
  const result = await compose();
  assert.deepEqual(result.submitted, [1, 2, 4]);
  assert.deepEqual(result.rendered, [3]);
  assert.deepEqual(Array.from(result.researched), [3]);
  for (const asset of result.assets.filter(a => a.unitOrder !== 3)) {
    assert.equal(asset.prompt, "Creative prompt with brand");
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
  assert.match(String(museum.prompt), /Yource/);
  const strict = await compose("photo-required", true);
  assert.deepEqual(strict.submitted, []);
});
