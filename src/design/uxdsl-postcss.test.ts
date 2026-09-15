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
