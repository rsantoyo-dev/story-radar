import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";

// creative-content.config.ts starts with `import "server-only"`, which is a
// bundler-only marker package not installed as a real dependency; running it
// directly under tsx/node:test fails module resolution. Load it the same way
// the rest of this test suite loads server-only modules: transpile and run
// in a vm context with a stub for that one import.
const source = readFileSync(new URL("./creative-content.config.ts", import.meta.url), "utf8");
const code = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
}).outputText;

function loadConfigModule(): { creativeSingleShotConfig: () => { enabled: boolean } } {
  const exports = {} as { creativeSingleShotConfig: () => { enabled: boolean } };
  vm.runInNewContext(code, {
    exports,
    module: { exports },
    process,
    require: (name: string) => {
      if (name === "server-only") return {};
      throw new Error(`unexpected require("${name}") while loading creative-content.config.ts`);
    },
  });
  return exports;
}

test("the single-shot pipeline is disabled unless explicitly enabled", () => {
  const old = process.env.CREATIVE_SINGLE_SHOT_ENABLED;
  try {
    const { creativeSingleShotConfig } = loadConfigModule();
    delete process.env.CREATIVE_SINGLE_SHOT_ENABLED;
    assert.equal(creativeSingleShotConfig().enabled, false);
    process.env.CREATIVE_SINGLE_SHOT_ENABLED = "false";
    assert.equal(creativeSingleShotConfig().enabled, false);
    process.env.CREATIVE_SINGLE_SHOT_ENABLED = "yes";
    assert.equal(creativeSingleShotConfig().enabled, false, "only the literal string \"true\" enables it");
    process.env.CREATIVE_SINGLE_SHOT_ENABLED = "true";
    assert.equal(creativeSingleShotConfig().enabled, true);
  } finally {
    if (old === undefined) delete process.env.CREATIVE_SINGLE_SHOT_ENABLED;
    else process.env.CREATIVE_SINGLE_SHOT_ENABLED = old;
  }
});
