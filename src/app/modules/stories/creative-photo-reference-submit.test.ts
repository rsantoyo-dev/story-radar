import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { creativeImageModel, assertCreativeImageModelSupports } from "./creative-image-models";

test("a text-incompatible model fails before reading references or submitting a paid request", async () => {
  const source = readFileSync("src/app/modules/stories/manage-creative-assets.ts", "utf8");
  const code = source.slice(source.indexOf("async function submitStoredAsset("), source.indexOf("async function syncPendingCreativeAssetBatches(")) + "\nexports.run = submitStoredAsset;";
  const exports: { run?: (...args: unknown[]) => Promise<void> } = {};
  let failure = "";
  runInNewContext(ts.transpileModule(code, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, {
    exports, assertCreativeImageModelSupports,
    falModelForAsset: () => ({ descriptor: creativeImageModel("flux-pro"), endpoint: "fal-ai/flux-pro/v1.1" }),
    getCreativeAssetGenerationReferences: () => assert.fail("Must not read references"),
    submitFalImage: () => assert.fail("Must not submit a paid request"),
    failCreativeAsset: async (_id: string, message: string) => { failure = message; },
    errorMessage: String,
  });
  await exports.run!({ id: "asset", expectedText: "A headline" }, {});
  assert.match(failure, /text-capable model/);
});

test("a verified map reference is read by the map loader, never the photo loader, and goes last", async () => {
  const source = readFileSync("src/app/modules/stories/manage-creative-assets.ts", "utf8");
  const code = source.slice(source.indexOf("async function submitStoredAsset("), source.indexOf("async function syncPendingCreativeAssetBatches(")) + "\nexports.run = submitStoredAsset;";
  const brand = new File(["brand"], "brand.png");
  const map = new File(["map"], "map.png");
  const evidence = { generationUse: "ai-reference", representation: "map" };
  let submitted = false;
  const exports: { run?: (...args: unknown[]) => Promise<void> } = {};
  runInNewContext(ts.transpileModule(code, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, {
    exports, assertCreativeImageModelSupports,
    getCreativeAssetGenerationReferences: async () => ({ characters: [], brand: [], story: [] }),
    charactersForImageGeneration: () => [], readPrivateR2ImageFile: async () => assert.fail("no character images"),
    assertBrandReferenceEligibility: async () => {}, loadStoryReferenceImages: async () => [], loadBrandGenerationImages: async () => [brand],
    readDocumentaryPhotoReference: async () => assert.fail("A map must not be read as a photo"),
    readDocumentaryMapReference: async (value: unknown) => { assert.equal(value, evidence); return map; },
    falModelForAsset: () => ({ descriptor: creativeImageModel("gpt-image"), endpoint: "openai/gpt-image-2/edit" }),
    submitFalImage: async (input: { referenceImages: File[] }) => { assert.deepEqual(Array.from(input.referenceImages), [brand, map]); submitted = true; return "request"; },
    setCreativeAssetRequest: async () => {}, failCreativeAsset: async (_id: string, message: string) => assert.fail(message), errorMessage: String,
  });
  await exports.run!({ id: "asset", prompt: "Use the map", unitSnapshot: { placeVisual: evidence } }, {});
  assert.ok(submitted);
});

for (const withStoryPhoto of [false, true]) test(`fal receives character, brand, ${withStoryPhoto ? "story photo, " : ""}documentary files in prompt order`, async () => {
  const source = readFileSync("src/app/modules/stories/manage-creative-assets.ts", "utf8");
  const code = source.slice(source.indexOf("async function submitStoredAsset("),
    source.indexOf("async function syncPendingCreativeAssetBatches(")) + "\nexports.run = submitStoredAsset;";
  const character = new File(["character"], "character.png");
  const brand = new File(["brand"], "brand.png");
  const storyPhoto = new File(["dish"], "dish.webp");
  const photo = new File(["museum"], "museum.jpg");
  const evidence = { generationUse: "ai-reference" };
  let submitted = false;
  const exports: { run?: (...args: unknown[]) => Promise<void> } = {};
  runInNewContext(ts.transpileModule(code, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
  } }).outputText, {
    exports,
    assertCreativeImageModelSupports,
    getCreativeAssetGenerationReferences: async () => ({ characters: [], brand: [], story: withStoryPhoto ? ["story-photo"] : [] }),
    charactersForImageGeneration: () => [{ referenceImages: [{ objectKey: "character" }] }],
    readPrivateR2ImageFile: async () => character,
    assertBrandReferenceEligibility: async () => {},
    loadStoryReferenceImages: async (refs: string[]) => { assert.equal(refs.length, withStoryPhoto ? 1 : 0); return withStoryPhoto ? [storyPhoto] : []; },
    loadBrandGenerationImages: async () => [brand],
    readDocumentaryPhotoReference: async (value: unknown) => { assert.equal(value, evidence); return photo; },
    // The model is now pinned by the asset's stored endpoint.
    falModelForAsset: () => ({
      descriptor: creativeImageModel("gpt-image"),
      endpoint: "openai/gpt-image-2/edit",
    }),
    submitFalImage: async (input: { referenceImages: File[]; endpoint: string }) => {
      assert.deepEqual(Array.from(input.referenceImages), [character, brand, ...(withStoryPhoto ? [storyPhoto] : []), photo]);
      assert.equal(input.endpoint, "openai/gpt-image-2/edit");
      submitted = true; return "request";
    },
    setCreativeAssetRequest: async () => {},
    failCreativeAsset: async (_id: string, message: string) => assert.fail(message),
    errorMessage: String,
  });
  await exports.run!({ id: "asset", prompt: "Use reference", unitSnapshot: { placeVisual: evidence } }, {});
  assert.ok(submitted);
});
