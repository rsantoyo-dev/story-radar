import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";
import postcss from "postcss";
const require = createRequire(import.meta.url);
const sourceOnly = require("../../postcss-uxdsl-source.cjs");

test("configured plugins resolve from the Turbopack worker directory", async () => {
  const { default: config } = await import(pathToFileURL(path.resolve("postcss.config.mjs")).href);
  const workerRequire = createRequire(path.resolve(".next/dev/build/chunks/postcss-worker.cjs"));
  const pluginName = Object.keys(config.plugins).find((name) => name.endsWith("postcss-uxdsl-source.cjs"));
  assert.ok(pluginName);
  assert.ok(path.isAbsolute(pluginName));
  assert.equal(typeof workerRequire(pluginName), "function");
});

test("composite tokens are declared again where a topic overrides the palette", async () => {
  const theme = [
    ":root { --uxdsl__palette__primary-main: #7c3aed; --uxdsl__border__primary: 1px solid var(--uxdsl__palette__primary-main); --uxdsl__surface__card-border: var(--uxdsl__border__primary); --uxdsl__space__1: 0.125rem; }",
    "@media (min-width: 768px) { :root { --uxdsl__button__primary-base-bg: var(--uxdsl__palette__primary-dark); } }",
  ].join("\n");
  const result = await postcss([sourceOnly({ includeTheme: false })]).process(theme, { from: path.resolve("src/app/uxdsl.css") });
  const scoped = result.root.nodes.filter((node) => node.type === "rule" && (node as postcss.Rule).selector === '[style*="--uxdsl__palette__"]') as postcss.Rule[];
  assert.equal(scoped.length, 1);
  const props = scoped[0]!.nodes.map((decl) => (decl as postcss.Declaration).prop);
  assert.deepEqual(props, ["--uxdsl__border__primary", "--uxdsl__surface__card-border"], "palette-dependent composites only, never the palette or spacing");
  assert.match(result.css, /@media \(min-width: 768px\) \{\s*\[style\*="--uxdsl__palette__"\] \{ --uxdsl__button__primary-base-bg/);
  // A CSS Module never gets the scoped block.
  const moduleResult = await postcss([sourceOnly({})]).process(".a { color: red; }", { from: "a.generated.module.css" });
  assert.doesNotMatch(moduleResult.css, /style\*=/);
});

test("global density tokens do not leak into already-compiled CSS Modules", async () => {
  const global = await postcss([sourceOnly({})]).process("@theme { density-1: space(1); }", { from: "globals.css" });
  assert.match(global.css, /:root/);
  const compiledModule = await postcss([sourceOnly({})]).process(".card { padding: var(--density-1); }", { from: "card.generated.module.css" });
  assert.doesNotMatch(compiledModule.css, /:root/);
  assert.match(compiledModule.css, /var\(--density-1\)/);
});

test("token blocks the UXDSL CLI writes into a compiled CSS Module are stripped, class rules are not", async () => {
  // Reproduces what `uxdsl build` emits per entry since 0.5.0-beta.0: global
  // token blocks the theme build already provides, which CSS Modules reject.
  const compiled = [
    ":root { --density-1: var(--space-1); }",
    "@media (min-width: 768px) { :root { --density-1: var(--space-2); } }",
    "@media (min-width: 768px) { .card { padding: var(--density-2); } }",
    ".card { padding: var(--surface-flat-padding); }",
  ].join("\n");
  const result = await postcss([sourceOnly({})]).process(compiled, { from: "card.generated.module.css" });
  assert.doesNotMatch(result.css, /:root/);
  // An @media that only wrapped tokens goes with them; one with real rules stays.
  assert.equal(result.css.match(/@media/gu)?.length, 1);
  assert.match(result.css, /\.card \{ padding: var\(--density-2\); \}/);
  assert.match(result.css, /\.card \{ padding: var\(--surface-flat-padding\); \}/);
});
