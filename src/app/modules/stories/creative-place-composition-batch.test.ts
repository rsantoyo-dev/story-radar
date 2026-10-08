import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";

test("the assets GET recognizes place-composition batches with or without a mode marker", () => {
  const source = readFileSync("src/app/modules/stories/manage-creative-assets.ts", "utf8");
  const start = source.indexOf("function isPlaceCompositionBatch(");
  const code = source.slice(start, source.indexOf("\n}", start) + 2) + "\nexports.run = isPlaceCompositionBatch;";
  const exports: { run?: (value: string) => boolean } = {};
  runInNewContext(ts.transpileModule(code, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, { exports });
  for (const version of [
    "integrated-portrait-4x5-v13:place-visual-v4:4f53cda18c2baa0c0354bb5f",
    "integrated-portrait-4x5-v13:place-visual-v5:4f53cda18c2baa0c0354bb5f",
    "integrated-portrait-4x5-v13:place-visual-v4+map-ai:4f53cda18c2baa0c0354bb5f",
    // A digit in the mode marker (map-ai-v2, added for the identity-photo
    // feature) is exactly the case that slipped through once already today.
    "integrated-portrait-4x5-v13:place-visual-v4+map-ai-v2:4f53cda18c2baa0c0354bb5f",
    // Automatic place detection's batches, in either map-reference mode.
    "integrated-portrait-4x5-v13:place-visual-v4+map-ai-v6:4f53cda18c2baa0c0354bb5f",
    // The map inset with a lively scene around it.
    "integrated-portrait-4x5-v13:place-visual-v4+map-ai-v7:4f53cda18c2baa0c0354bb5f",
    "integrated-portrait-4x5-v13:place-visual-v4+map-ai-v8:4f53cda18c2baa0c0354bb5f",
    // Archive photos as identity references, generic scenes for unresolved places.
    "integrated-portrait-4x5-v13:place-visual-v4+map-ai-v9:4f53cda18c2baa0c0354bb5f",
    "integrated-portrait-4x5-v13:place-visual-v4+local-v2:4f53cda18c2baa0c0354bb5f:story-refs-v3-abc",
  ]) assert.equal(exports.run!(version), true, version);
  for (const version of ["integrated-portrait-4x5-v13", "integrated-portrait-4x5-v13:place-visual-v3:abc", "place-visual-v4"]) assert.equal(exports.run!(version), false, version);
});
