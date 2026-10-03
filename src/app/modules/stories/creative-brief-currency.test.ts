import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";

// briefHashMatches is internal to a server-only module; run its exact source.
const source = readFileSync("src/app/modules/stories/manage-creative-content.ts", "utf8");
const start = source.indexOf("function briefHashMatches(");
const end = source.indexOf("\n}\n", start) + 3;
const exports: { run?: (brief: unknown, profile: unknown, hashFor: (profile: Record<string, unknown>) => string) => boolean } = {};
runInNewContext(ts.transpileModule(`${source.slice(start, end)}\nexports.run = briefHashMatches;`, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, { exports, JSON });
const briefHashMatches = exports.run!;

const hashFor = (profile: Record<string, unknown>) => JSON.stringify(profile);
const saved = { name: "Salut", tone: "warm", audience: "Old audience", visualGuidance: "old guide", creativeIdentity: null, brandPalette: ["#111111"] };
const brief = { inputHash: hashFor(saved), profileSnapshot: saved };

test("an audience or visual identity edit keeps the brief and its approved scripts current", () => {
  assert.equal(briefHashMatches(brief, { ...saved, audience: "Brossard residents: REM commuters, families…" }, hashFor), true);
  assert.equal(briefHashMatches(brief, { ...saved, visualGuidance: "new guide", brandPalette: ["#222222"] }, hashFor), true);
});

test("an editorial edit still makes the brief outdated", () => {
  assert.equal(briefHashMatches(brief, { ...saved, tone: "formal" }, hashFor), false);
});
