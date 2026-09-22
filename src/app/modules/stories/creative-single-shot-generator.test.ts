import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import ts from "typescript";

// gemini-creative-content-generator.ts is transpiled and evaluated in its own
// vm context first (mirroring the rest of this suite's harness for files that
// transitively import "server-only"), so its `exports` object is fully
// populated — with the parsing/grounding helpers this module reuses, per this
// session's export-widening pass — before creative-single-shot-generator.ts's
// own context runs. Its `import ... from "./gemini-creative-content-generator"`
// is then resolved to that already-finished exports object directly, rather
// than concatenating both sources into one script (which hits an import-
// hoisting ordering issue across the two files' require() calls).
const localRequire = createRequire(import.meta.url);
const compileOptions = { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } };
const geminiCompiled = ts.transpileModule(
  readFileSync(new URL("./gemini-creative-content-generator.ts", import.meta.url), "utf8"),
  compileOptions,
).outputText;
const singleShotCompiled = ts.transpileModule(
  `${readFileSync(new URL("./creative-single-shot-generator.ts", import.meta.url), "utf8")}\nexports.testSingleShotSchema = creativeSingleShotDraftSchema;`,
  compileOptions,
).outputText;

type GeminiParams = { contents: string; config?: { maxOutputTokens?: number; systemInstruction?: string } };
type GeminiExports = { CreativeContentResponseError: new (message: string) => Error };
type SingleShotExports = {
  generateSingleShotCreativeScript: (options: unknown) => Promise<{
    brief: { keyFacts: { id: string }[] };
    draft: { units: { visualNeed?: string }[] };
    attempts: number;
    usage: { totalTokens: number };
  }>;
  testSingleShotSchema: (format: string, slideCount: number | undefined, includeCharacterPlan: boolean) => {
    required: string[];
    properties: { units: { items: { required: string[]; properties: Record<string, { type: string; enum?: string[] }> } } };
  };
};

function harness(
  reply: (attempt: number, contents: Record<string, unknown>) => unknown,
  accountBehaviour: { onKey?: (key: string) => void; failFirstAccountWith?: number } = {},
) {
  const calls: Record<string, unknown>[] = [];
  const instructions: string[] = [];
  // One stable class identity: isTransientGeminiError does `instanceof ApiError`
  // against whatever this shim returns, so it must not be re-created per require.
  class ApiError extends Error {
    constructor(readonly status: number) {
      super(`HTTP ${status}`);
    }
  }
  const sharedRequire = (id: string) => {
    if (id === "server-only") return {};
    if (id === "@google/genai") {
      return {
        ApiError,
        GoogleGenAI: class {
          private readonly key: string;
          constructor({ apiKey }: { apiKey: string }) {
            this.key = apiKey;
            accountBehaviour.onKey?.(apiKey);
          }
          models = {
            generateContent: async (params: GeminiParams) => {
              if (accountBehaviour.failFirstAccountWith && this.key === "test-key") {
                throw new ApiError(accountBehaviour.failFirstAccountWith);
              }
              const contents = JSON.parse(params.contents) as Record<string, unknown>;
              const attempt = calls.length;
              calls.push(contents);
              instructions.push(params.config?.systemInstruction ?? "");
              return {
                text: JSON.stringify(reply(attempt, contents)),
                candidates: [{ finishReason: "STOP" }],
                usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 200, thoughtsTokenCount: 0, totalTokenCount: 300 },
              };
            },
          };
        },
      };
    }
    if (id === "./openai-structured-response") {
      return { generateOpenAiStructuredResponse: async () => { throw new Error("single-shot must not call OpenAI to generate"); } };
    }
    if (id === "groq-sdk") {
      return class { chat = { completions: { create: async () => { throw new Error("single-shot must not call Groq to generate"); } } }; };
    }
    return localRequire(id);
  };
  const geminiExports = {} as GeminiExports;
  vm.runInNewContext(geminiCompiled, {
    exports: geminiExports,
    Error, AbortController, AbortSignal, Buffer, Date, Map, Set, JSON, setTimeout, clearTimeout,
    console: { info() {}, warn() {}, error() {} },
    require: sharedRequire,
  });
  const singleShotExports = {} as SingleShotExports;
  vm.runInNewContext(singleShotCompiled, {
    exports: singleShotExports,
    Error, AbortController, AbortSignal, Buffer, Date, Map, Set, JSON, setTimeout, clearTimeout,
    console: { info() {}, warn() {}, error() {} },
    require: (id: string) => (id === "./gemini-creative-content-generator" ? geminiExports : sharedRequire(id)),
  });
  return {
    generate: singleShotExports.generateSingleShotCreativeScript,
    schema: singleShotExports.testSingleShotSchema,
    calls,
    instructions,
    ResponseError: geminiExports.CreativeContentResponseError,
  };
}

const taxonomy = { taxonomyVersion: 17, lenses: [{ key: "general", enabled: true, isFallback: true }] };
const sourceText =
  "The Service de police de Laval says it is looking for people connected to counterfeit-bill transactions. Anyone with information should call 450 662-4636 or 911.";

function validUnits(overrides: Record<string, unknown>[] = []) {
  const base = [
    { role: "cover", editorialGoal: "hook", viewerQuestion: "What is the SPL looking into?", ctaQuestion: "",
      headline: "The SPL is looking for people tied to counterfeit-bill transactions", subheadline: "", body: "",
      continuationCue: "What should you check before accepting cash?", visualDirection: "A generic bill icon with a magnifying glass.",
      factIds: ["fact-1"], assetRequest: "generated-image", characterIds: [], visualNeed: "generic-illustration" },
    { role: "content", editorialGoal: "explain", viewerQuestion: "What should you check before accepting cash?", ctaQuestion: "",
      headline: "Check the bill before accepting it", subheadline: "", body: "The SPL recommends checking a bill's security features before accepting cash.",
      continuationCue: "Who should you call?", visualDirection: "A generic bill icon with security-feature checkmarks.",
      factIds: ["fact-1"], assetRequest: "generated-image", characterIds: [], visualNeed: "generic-illustration" },
    { role: "conclusion", editorialGoal: "conclude", viewerQuestion: "Who should you call?", ctaQuestion: "Follow for local safety notices.",
      headline: "Anyone with information can call the SPL", subheadline: "", body: "The SPL says anyone with information should call 450 662-4636 or 911.",
      continuationCue: "", visualDirection: "A generic phone icon.",
      factIds: ["fact-1"], assetRequest: "generated-image", characterIds: [], visualNeed: "generic-illustration" },
  ];
  return base.map((unit, index) => ({ ...unit, ...overrides[index] }));
}

function validResponse(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const units = (overrides.units as Record<string, unknown>[] | undefined) ?? validUnits();
  return {
    recommendedFormat: "carousel", fallbackFormat: "meme",
    formatScores: [
      { format: "carousel", score: 80, reason: "Needs three distinct beats." },
      { format: "meme", score: 40, reason: "Too much detail for one frame." },
    ],
    confidence: 80, targetAudience: "Laval residents", keyMessage: "The SPL wants tips on counterfeit-bill transactions.",
    angle: "A police appeal for information.",
    editorialAngle: {
      angle: "general", taxonomyVersion: 17, reason: "A local safety appeal.",
      audienceStake: "Residents may have relevant information.", hookPromise: "What the SPL is looking for.",
    },
    hook: "The SPL is looking for people tied to counterfeit-bill transactions.",
    tone: { primary: "informative", energy: 40, humor: 0, reason: "A factual safety notice." },
    contentSufficiency: "sufficient",
    keyFacts: [{
      id: "fact-1", statement: "The SPL is looking for people connected to counterfeit-bill transactions.",
      sourceExcerpt: "The Service de police de Laval says it is looking for people connected to counterfeit-bill transactions.",
      requiredQualifiers: [], attribution: "SPL",
    }],
    carouselPlan: {
      slideCount: 3, rationale: "One slide raises the appeal, one explains what to check, one gives the call to action.",
      slides: [
        { editorialGoal: "hook", viewerQuestion: "What is the SPL looking into?", allowedFactIds: ["fact-1"] },
        { editorialGoal: "explain", viewerQuestion: "What should you check before accepting cash?", allowedFactIds: ["fact-1"] },
        { editorialGoal: "conclude", viewerQuestion: "Who should you call?", allowedFactIds: ["fact-1"] },
      ],
    },
    riskFlags: [],
    suggestedConcepts: [
      { format: "carousel", title: "Counterfeit-bill appeal", concept: "A three-slide appeal for information." },
      { format: "meme", title: "Counterfeit-bill appeal", concept: "A single-frame appeal for information." },
    ],
    concept: "A three-slide appeal for information about counterfeit-bill transactions.",
    narrativeRationale: "One slide raises the appeal, one explains what to check, one gives the call to action.",
    caption: "The SPL is looking for people connected to counterfeit-bill transactions. Call 450 662-4636 or 911 with information.",
    callToAction: "",
    hashtags: ["#Laval", "#SPL"],
    altText: "Three slides about a police appeal for counterfeit-bill information.",
    openingExploration: {
      selectedIndex: 0,
      candidates: [
        "The SPL is looking for people tied to counterfeit-bill transactions",
        "Counterfeit bills are under investigation in Laval",
        "The SPL wants your help",
      ].map((headline) => ({
        headline, subheadline: "", factIds: ["fact-1"], readerQuestion: "What is the SPL looking into?",
        payoffUnitOrder: 3, supported: true,
        checks: { clear: true, tension: true, consequence: true, human: true, curiosity: true },
        reason: "A concrete, attributed appeal.",
      })),
    },
    units,
    ...overrides,
  };
}

const options = (extra: Record<string, unknown> = {}) => ({
  apiKey: "test-key", model: "gemini-test", primaryProvider: "google",
  story: { title: "Counterfeit bills", url: "https://example.com/laval", text: sourceText, contentStatus: "full", contentSource: "article" },
  topic: { name: "Salut Laval" },
  profile: { language: "English", conversionGoal: "followers", framingStrategy: "explainer", brandPersonality: [], brandOverlay: { enabled: false } },
  format: "carousel", outputAspectRatio: "4:5", characterRoster: [], acquisitionTaxonomy: taxonomy,
  ...extra,
});

test("the script schema pins the slide count and keeps visualNeed enum-free", () => {
  const h = harness(() => ({}));
  const built = h.schema("carousel", 3, false);
  assert.ok(built.required.includes("concept") && built.required.includes("units"));
  assert.ok(built.properties.units.items.required.includes("visualNeed"));
  // Gemini rejects the whole schema (400 INVALID_ARGUMENT) when visualNeed
  // carries an enum, so the allowlist lives in the prompt and in
  // attachVisualNeeds instead. Asserting its absence keeps that deliberate.
  assert.equal(built.properties.units.items.properties.visualNeed.type, "string");
  assert.equal(built.properties.units.items.properties.visualNeed.enum, undefined);
  const units = built.properties.units as unknown as { minItems: number; maxItems: number };
  assert.equal(units.minItems, 3, "the brief's slide count is known by now, so units is pinned to it");
  assert.equal(units.maxItems, 3);
});

test("sufficient source produces a matched brief and script in two Gemini calls", async () => {
  const h = harness(() => validResponse());
  const result = await h.generate(options());
  assert.equal(h.calls.length, 2, "one brief call and one script call");
  assert.equal(result.attempts, 2);
  assert.equal(result.brief.keyFacts[0].id, "fact-1");
  assert.equal(result.draft.units.length, 3);
  assert.equal(result.draft.units[0].visualNeed, "generic-illustration");
  assert.equal(result.usage.totalTokens, 600, "both calls are billed");
});

test("the script call receives the brief's plan and its pinned slide count", async () => {
  const h = harness(() => validResponse());
  await h.generate(options());
  const scriptContents = h.calls[1] as { carouselPlan?: { slideCount: number }; constraints?: { units?: number }; creativeBrief?: { keyFacts: unknown[] } };
  assert.equal(scriptContents.carouselPlan?.slideCount, 3);
  assert.equal(scriptContents.constraints?.units, 3);
  assert.ok(scriptContents.creativeBrief?.keyFacts.length, "the script writes from the brief's facts, not raw source alone");
});

test("the script call never receives the raw article text", async () => {
  const h = harness(() => validResponse());
  await h.generate(options());
  const briefStory = (h.calls[0] as { story?: { text?: string } }).story;
  const scriptStory = (h.calls[1] as { story?: { text?: string } }).story;
  assert.ok(briefStory?.text?.includes("counterfeit"), "the brief call extracts evidence, so it gets the article");
  assert.equal(scriptStory?.text, undefined, "the writer works from selected excerpts only (AGENTS.md §20)");
  assert.ok(!JSON.stringify(h.calls[1]).includes(sourceText), "no copy of the article reaches the writing call by another route");
});

test("the script call carries the brief's full projection, including evidence reach", async () => {
  const h = harness(() => validResponse());
  await h.generate(options());
  const brief = (h.calls[1] as { creativeBrief?: Record<string, unknown> }).creativeBrief ?? {};
  // contentSufficiency tells the writer how far the evidence reaches;
  // suggestedConcepts carry the brief's proposed directions. Both were missing
  // from an earlier hand-rolled projection.
  for (const field of ["keyFacts", "hook", "angle", "keyMessage", "targetAudience", "tone", "riskFlags", "contentSufficiency", "suggestedConcepts"]) {
    assert.ok(field in brief, `the writer needs ${field}`);
  }
});

test("the chosen acquisition lens steers the hook in the script instruction", async () => {
  const h = harness(() => validResponse());
  await h.generate(options());
  const instruction = h.instructions[1] ?? "";
  assert.match(instruction, /Acquisition angle already decided/, "the lens and its reading promise steer the opening");
  assert.match(instruction, /What the SPL is looking for/, "the brief's hookPromise is carried into the writing call");
  assert.match(instruction, /answered by a later unit/, "the cover's promise must be paid off later in the carousel");
});

test("an invalid script gets exactly one bounded retry with the validation error as feedback", async () => {
  // call 0 = brief (valid), call 1 = script with too few units, call 2 = retry.
  const h = harness((attempt) =>
    attempt === 1 ? validResponse({ units: validUnits().slice(0, 2) }) : validResponse(),
  );
  const result = await h.generate(options());
  assert.equal(h.calls.length, 3, "brief, rejected script, one bounded script retry");
  assert.equal(result.attempts, 3);
  assert.ok(typeof h.calls[2].previousValidationError === "string" && (h.calls[2].previousValidationError as string).length > 0);
  assert.equal(result.draft.units.length, 3, "the retry's valid response is what gets returned");
  assert.equal(result.usage.totalTokens, 900, "every billed call is counted, including the rejected one");
});

test("grounding still rejects a fact whose sourceExcerpt is not in the source", async () => {
  const bad = validResponse({
    keyFacts: [{
      id: "fact-1", statement: "The SPL recovered ten thousand dollars in counterfeit bills.",
      sourceExcerpt: "The SPL recovered ten thousand dollars in counterfeit bills.",
      requiredQualifiers: [], attribution: "SPL",
    }],
  });
  const h = harness(() => bad);
  await assert.rejects(h.generate(options()), h.ResponseError);
  assert.equal(h.calls.length, 2, "the brief's bounded retry is spent, but grounding is never bypassed");
  assert.ok(!h.calls.some((c) => "carouselPlan" in c), "no script call is made once the brief cannot be grounded");
});

test("regenerating a script reuses the reviewed brief instead of paying to extract it again", async () => {
  // What the "regenerate draft" button means: keep the evidence, angle and
  // plan the editor already reviewed, rewrite only the visible copy. Doing it
  // any other way silently drops the editor onto a different engine.
  const h = harness(() => validResponse());
  const brief = {
    recommendedFormat: "carousel", fallbackFormat: "meme",
    formatScores: [], confidence: 80, targetAudience: "Laval residents",
    keyMessage: "The SPL wants tips.", angle: "A police appeal.",
    hook: "The SPL is looking for people tied to counterfeit-bill transactions.",
    tone: { primary: "informative", energy: 40, humor: 0, reason: "Factual." },
    contentSufficiency: "sufficient",
    keyFacts: [{
      id: "fact-1",
      statement: "The SPL is looking for people connected to counterfeit-bill transactions.",
      sourceExcerpt: "The Service de police de Laval says it is looking for people connected to counterfeit-bill transactions.",
    }],
    carouselPlan: {
      slideCount: 3, rationale: "Appeal, check, contact.",
      slides: [
        { editorialGoal: "hook", viewerQuestion: "What is the SPL looking into?", allowedFactIds: ["fact-1"] },
        { editorialGoal: "explain", viewerQuestion: "What should you check before accepting cash?", allowedFactIds: ["fact-1"] },
        { editorialGoal: "conclude", viewerQuestion: "Who should you call?", allowedFactIds: ["fact-1"] },
      ],
    },
    riskFlags: [], suggestedConcepts: [],
  };
  const result = await h.generate(options({ existingBrief: brief, acquisitionTaxonomy: undefined }));
  assert.equal(h.calls.length, 1, "only the script is written; the brief call is skipped entirely");
  assert.equal(result.attempts, 1);
  assert.equal(result.brief.keyFacts[0].id, "fact-1", "the reviewed brief is returned unchanged");
  assert.equal(result.draft.units.length, 3);
  assert.ok((h.calls[0] as { carouselPlan?: unknown }).carouselPlan, "the reviewed plan drives the rewrite");
});

test("generation never falls back to Groq or OpenAI", async () => {
  const h = harness(() => validResponse());
  await h.generate(options());
  assert.equal(h.calls.length, 2);
});

test("an overloaded Gemini account retries on the second Gemini account, not another vendor", async () => {
  const keys: string[] = [];
  const h = harness(() => validResponse(), {
    onKey: (key) => keys.push(key),
    // Fail the first account with a 503 the way Gemini reports an overload.
    failFirstAccountWith: 503,
  });
  const result = await h.generate(options({ paidGeminiApiKey: "paid-key" }));
  assert.deepEqual(keys, ["test-key", "paid-key", "paid-key"], "brief retries on the paid account, then the script uses it too");
  assert.equal(result.attempts, 3, "the failed attempt counts against the call budget");
  assert.equal(result.draft.units.length, 3);
});

test("a non-transient Gemini failure is not re-sent to the second account", async () => {
  const keys: string[] = [];
  const h = harness(() => validResponse(), {
    onKey: (key) => keys.push(key),
    // 400 is a rejected request: it fails identically on the other account.
    failFirstAccountWith: 400,
  });
  await assert.rejects(h.generate(options({ paidGeminiApiKey: "paid-key" })));
  assert.deepEqual(keys, ["test-key"], "no pointless second charge for a request the API refuses");
});
