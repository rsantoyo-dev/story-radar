import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import ts from "typescript";

const requireLocal = createRequire(import.meta.url);
function load(file: string) {
  const exports: Record<string, unknown> = {};
  const code = ts.transpileModule(readFileSync(new URL(file, import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  vm.runInNewContext(code, { exports, console, JSON, Math, Number, String, Array, Object, Set, Map, RegExp, require: (name: string) => name === "server-only" ? {} : requireLocal(name) });
  return exports as unknown as typeof import("./build-creative-image-prompt");
}
const images = load("./build-creative-image-prompt.ts");

const unit = { id: "u1", order: 2, type: "carousel-slide", role: "content", headline: "Le parc reste accessible", body: "Selon la Ville.", factIds: [], visualDirection: "Flat conceptual tree motif.", assetRequest: "generated-image", aspectRatio: "4:5" };
const draft = { format: "carousel", outputAspectRatio: "4:5", concept: "Parc", units: [unit, { ...unit, id: "u2", order: 1 }, { ...unit, id: "u3", order: 3 }] };
const brief = {
  keyFacts: [], tone: { primary: "informative", energy: 60, humor: 10 },
  profileSnapshot: { name: "Salut", platform: "Instagram", audience: "Residents", brandPersonality: ["clear"], language: "french", region: "quebec", visualGuidance: "Matte editorial collage.", brandPalette: [] },
};

test("a slide without a verified photo or map of the place gets the real-place lock", () => {
  const { prompt } = images.buildCreativeImagePrompt({ draft, unit, brief } as never);
  assert.match(prompt, /HARD REAL-PLACE LOCK/);
  assert.ok(prompt.indexOf("HARD REAL-PLACE LOCK") > prompt.indexOf("HARD REAL-PEOPLE LOCK"), "stated right after the people lock");
  const verified = images.buildCreativeImagePrompt({ draft, unit, brief, verifiedImagery: true } as never).prompt;
  assert.doesNotMatch(verified, /HARD REAL-PLACE LOCK/, "a supplied photo or map of the place is the place");
});

test("what counts as a verified image of the story", () => {
  assert.equal(images.slideHasVerifiedImagery({}), false);
  assert.equal(images.slideHasVerifiedImagery({ storyReferences: [{ purpose: "style" }] }), false, "a style photo is inspiration");
  assert.equal(images.slideHasVerifiedImagery({ storyReferences: [{ purpose: "place" }] }), true);
  assert.equal(images.slideHasVerifiedImagery({ documentaryPortrait: { photoId: "p" } }), true);
  assert.equal(images.slideHasVerifiedImagery({ placeVisual: { generationUse: "ai-reference" } }), true);
  assert.equal(images.slideHasVerifiedImagery({ placeVisual: {} }), false, "a place search that found nothing");
  assert.equal(images.withRealPlaceLock(images.withRealPlaceLock("Saved prompt")).split("HARD REAL-PLACE LOCK").length, 2, "added once to a saved prompt");
});
