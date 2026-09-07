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
