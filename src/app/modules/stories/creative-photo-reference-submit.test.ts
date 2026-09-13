import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";

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
    getCreativeAssetGenerationReferences: async () => ({ characters: [], brand: [], story: withStoryPhoto ? ["story-photo"] : [] }),
    charactersForImageGeneration: () => [{ referenceImages: [{ objectKey: "character" }] }],
    readPrivateR2ImageFile: async () => character,
    assertBrandReferenceEligibility: async () => {},
    loadStoryReferenceImages: async (refs: string[]) => { assert.equal(refs.length, withStoryPhoto ? 1 : 0); return withStoryPhoto ? [storyPhoto] : []; },
    loadBrandGenerationImages: async () => [brand],
    readDocumentaryPhotoReference: async (value: unknown) => { assert.equal(value, evidence); return photo; },
    falEndpointForAsset: () => "openai/gpt-image-2/edit",
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
