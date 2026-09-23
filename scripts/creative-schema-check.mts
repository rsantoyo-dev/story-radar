/**
 * One live Gemini request with the real brief schema, to confirm the provider
 * accepts it after a change. Unit tests mock the client and cannot catch a
 * schema rejection: Gemini answers with a bare 400 INVALID_ARGUMENT and no
 * field detail, and it does so for reasons that are not documented — the
 * merged brief+draft schema, an enum on visualNeed, and keyFacts.maxItems above
 * 15 (verified 2026-09-22: 6/10/12/14/15 accepted, 16/20 refused) all trip it.
 *
 * Run it after any change to creativeBriefSchema or to the constants it
 * embeds. A rejected request costs nothing; an accepted one a fraction of a
 * cent. It uses GEMINI_PAID_API_KEY and never touches the database.
 *
 *   npx tsx --env-file=.env.local scripts/creative-schema-check.mts       # what the code sends
 *   npx tsx --env-file=.env.local scripts/creative-schema-check.mts 16    # probe another ceiling
 */
import { readFileSync } from "node:fs";
import Module, { createRequire } from "node:module";
import vm from "node:vm";
import ts from "typescript";

const loader = Module as unknown as { _load: (request: string, parent: unknown, isMain: boolean) => unknown };
const originalLoad = loader._load;
loader._load = function patchedLoad(request, parent, isMain) {
  if (request === "server-only") return {};
  return originalLoad.call(this, request, parent, isMain);
};

const localRequire = createRequire(process.cwd() + "/src/app/modules/stories/dummy.js");
const compiled = ts.transpileModule(readFileSync("src/app/modules/stories/gemini-creative-content-generator.ts", "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
}).outputText;

const gemini: Record<string, unknown> = {};
vm.runInNewContext(compiled, {
  exports: gemini,
  Error, AbortController, AbortSignal, Buffer, Date, Map, Set, JSON, setTimeout, clearTimeout, console, process, fetch, URL, TextEncoder, TextDecoder,
  require: (id: string) => {
    if (id === "server-only") return {};
    if (id === "./creative-text-meter") {
      return {
        meterCreativeText: async (_m: unknown, run: () => Promise<unknown>) => run(),
        withCreativeTextBudget: (_s: unknown, run: () => Promise<unknown>) => run(),
      };
    }
    return localRequire(id);
  },
});

const creativeBriefSchema = gemini.creativeBriefSchema as (t: unknown) => { properties: { keyFacts: { maxItems: number } } };
const generateGeminiJson = gemini.generateGeminiJson as (o: unknown) => Promise<{ usage: { promptTokens: number; outputTokens: number } }>;

const schema = creativeBriefSchema({ taxonomyVersion: 1, lenses: [{ key: "general", enabled: true, isFallback: true }] });
// Optional override, so a control run (the old value) and a bisection can use
// the same script: `schema-check.mts 6`.
if (process.argv[2]) schema.properties.keyFacts.maxItems = Number(process.argv[2]);
console.log("keyFacts.maxItems in the schema being sent:", schema.properties.keyFacts.maxItems);

const apiKey = process.env.GEMINI_PAID_API_KEY;
if (!apiKey) throw new Error("GEMINI_PAID_API_KEY is not set");
try {
  const response = await generateGeminiJson({
    apiKey,
    model: process.env.CREATIVE_GEMINI_MODEL ?? "gemini-3.8-flash",
    systemInstruction: "Return the smallest object that satisfies the schema.",
    schema,
    contents: { story: { title: "Park", text: "The city opened a new park on Monday." } },
    maxOutputTokens: 12_288,
  });
  console.log(`ACCEPTED — prompt ${response.usage.promptTokens} / output ${response.usage.outputTokens} tokens`);
} catch (error) {
  console.log("REJECTED —", error instanceof Error ? error.message.slice(0, 300) : error);
  process.exitCode = 1;
}
