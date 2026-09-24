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
type GeminiExports = {
  CreativeContentResponseError: new (message: string) => Error;
  MAX_BRIEF_KEY_FACTS: number;
  creativeBriefSchema: (taxonomy: unknown) => { properties: { keyFacts: { maxItems: number } } };
  parseGroundedCreativeBrief: (
    text: string, sourceText: string, conversionGoal: string, taxonomy: unknown, strict: boolean,
  ) => { keyFacts: { id: string }[] };
};
type SingleShotExports = {
  generateSingleShotCreativeScript: (options: unknown) => Promise<{
    brief: { keyFacts: { id: string; statement?: string }[]; carouselPlan?: { slides: { allowedFactIds: string[] }[] } };
    draft: { units: { visualNeed?: string; body?: string }[] };
    provider: string;
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
  accountBehaviour: {
    onKey?: (key: string) => void;
    failFirstAccountWith?: number;
    /** Set when the test configures carouselWriterModel; otherwise any OpenAI call is a failure. */
    allowOpenAiWriter?: boolean;
  } = {},
) {
  const calls: Record<string, unknown>[] = [];
  const instructions: string[] = [];
  const openAiCalls: { model: string; contents: Record<string, unknown>; schema: Record<string, unknown> }[] = [];
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
      return {
        generateOpenAiStructuredResponse: async (params: { model: string; contents: Record<string, unknown>; schema: Record<string, unknown> }) => {
          if (!accountBehaviour.allowOpenAiWriter) throw new Error("single-shot must not call OpenAI to generate");
          openAiCalls.push({ model: params.model, contents: params.contents, schema: params.schema });
          return {
            text: JSON.stringify(reply(calls.length + openAiCalls.length - 1, params.contents)),
            provider: "openai", model: params.model,
            usage: { promptTokens: 100, outputTokens: 200, thoughtsTokens: 0, totalTokens: 300 },
          };
        },
      };
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
    openAiCalls,
    instructions,
    ResponseError: geminiExports.CreativeContentResponseError,
    briefSchema: geminiExports.creativeBriefSchema,
    maxFacts: geminiExports.MAX_BRIEF_KEY_FACTS,
    parseBrief: geminiExports.parseGroundedCreativeBrief,
  };
}

/** N distinct, grounded facts (no numbers, distinct names) plus the source text that carries every excerpt. */
function manyFacts(count: number) {
  const artists = ["Alice Moreau", "Benoît Tremblay", "Camille Roy", "Daniel Gagnon", "Élise Fortin", "Félix Côté", "Gabrielle Lavoie", "Hugo Bouchard", "Inès Gauthier", "Julien Morin", "Karine Lévesque", "Louis Pelletier", "Marie Bergeron", "Nadia Simard", "Olivier Girard", "Pascale Nadeau"];
  const facts = Array.from({ length: count }, (_, i) => {
    const sentence = `${artists[i]} presents new work at the library gallery this season.`;
    return { id: `fact-${i + 1}`, statement: sentence, sourceExcerpt: sentence, requiredQualifiers: [], attribution: "the city" };
  });
  return { facts, sourceText: facts.map((fact) => fact.sourceExcerpt).join(" ") };
}

/**
 * A 57-word passage used verbatim as source excerpt, fact statement and slide
 * body. It has to be fully grounded: the deterministic fact guard replaces an
 * unsupported body with the fact's statement, which would hide the length
 * check under test.
 */
const LONG_PASSAGE =
  "The SPL says it is looking for people connected to counterfeit-bill transactions reported at several businesses over the past few weeks, and it is asking merchants to check the paper, the print quality, the raised ink and the transparent window before accepting a bill, and to refuse the bill and contact the police if something looks unusual.";
const longStory = {
  title: "Counterfeit bills", url: "https://example.com/laval", contentStatus: "full", contentSource: "article",
  text: `${LONG_PASSAGE} Anyone with information should call 450 662-4636 or 911.`,
};
const longFact = { id: "fact-1", statement: LONG_PASSAGE, sourceExcerpt: LONG_PASSAGE, requiredQualifiers: [], attribution: "SPL" };

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

test("a configured carousel writer writes the script while the brief stays on Gemini", async () => {
  const h = harness(() => validResponse(), { allowOpenAiWriter: true });
  const result = await h.generate(options({ carouselWriterModel: "gpt-5.6-sol", openAiApiKey: "openai-key" }));
  assert.equal(h.calls.length, 1, "only the brief stays on Gemini");
  assert.equal(h.openAiCalls.length, 1, "the script moves to the configured writer");
  assert.equal(h.openAiCalls[0].model, "gpt-5.6-sol");
  assert.equal(result.provider, "openai", "the result names who actually wrote the script");
  assert.equal(result.attempts, 2, "both providers' calls count against the same budget");
  assert.equal(result.usage.totalTokens, 600, "both calls are billed");
  assert.equal(result.draft.units.length, 3);
  // OpenAI strict mode rejects a schema with optional properties, so the
  // Gemini schema has to go through strictCreativeSchema on the way out.
  const schema = h.openAiCalls[0].schema as { additionalProperties?: boolean; required?: string[]; properties?: Record<string, unknown> };
  assert.equal(schema.additionalProperties, false);
  assert.deepEqual([...(schema.required ?? [])], Object.keys(schema.properties ?? {}));
});

test("the configured writer is held to the same no-article-text rule as Gemini", async () => {
  const h = harness(() => validResponse(), { allowOpenAiWriter: true });
  await h.generate(options({ carouselWriterModel: "gpt-5.6-sol", openAiApiKey: "openai-key" }));
  const contents = h.openAiCalls[0].contents as { story?: { text?: string }; creativeBrief?: { keyFacts: unknown[] } };
  assert.equal(contents.story?.text, undefined, "AGENTS.md §20 holds on both writer routes");
  assert.ok(!JSON.stringify(contents).includes(sourceText));
  assert.ok(contents.creativeBrief?.keyFacts.length, "it writes from the brief's selected evidence");
});

test("a configured writer without an OpenAI key fails before spending anything", async () => {
  const h = harness(() => validResponse());
  await assert.rejects(
    () => h.generate(options({ carouselWriterModel: "gpt-5.6-sol" })),
    (error: Error) => error instanceof h.ResponseError && /OpenAI API key/.test(error.message),
  );
  assert.equal(h.calls.length, 0, "the misconfiguration surfaces before the brief call is billed");
});

test("formats other than carousel ignore the carousel writer", async () => {
  const h = harness(() => validResponse());
  const result = await h.generate(options({ format: "sequence", carouselWriterModel: "gpt-5.6-sol", openAiApiKey: "openai-key" }));
  assert.equal(h.calls.length, 2, "other formats stay entirely on Gemini, as in the legacy pipeline");
  assert.equal(h.openAiCalls.length, 0);
  assert.equal(result.provider, "google");
});

test("the brief may carry as many facts as the story warrants, and the instruction says so", () => {
  const h = harness(() => ({}));
  // 6 was a hard ceiling: the writer never sees the article, so a 13-item
  // programme capped at 6 facts could never pay off "which one to start with?".
  // The upper end is set by Gemini's schema validator, not by us — see the
  // constant's comment and scripts/creative-schema-check.mts before raising it.
  assert.ok(h.maxFacts >= 12, `expected a generous ceiling, got ${h.maxFacts}`);
  assert.equal(h.briefSchema(taxonomy).properties.keyFacts.maxItems, h.maxFacts);
});

test("the parser accepts every fact count the schema allows, and rejects one past it", () => {
  const h = harness(() => ({}));
  // The schema ceiling was raised while the parser kept a hardcoded 6, so a
  // response the provider was allowed to produce was thrown away as "invalid
  // keyFacts" — twice, live, at the cost of the call and its retry.
  const atCeiling = manyFacts(h.maxFacts);
  const parsed = h.parseBrief(
    JSON.stringify(validResponse({ keyFacts: atCeiling.facts })), atCeiling.sourceText, "followers", taxonomy, false,
  );
  assert.equal(parsed.keyFacts.length, h.maxFacts);
  const pastCeiling = manyFacts(h.maxFacts + 1);
  assert.throws(
    () => h.parseBrief(JSON.stringify(validResponse({ keyFacts: pastCeiling.facts })), pastCeiling.sourceText, "followers", taxonomy, false),
    /keyFacts/,
  );
});

/**
 * Three grounded facts where the practical one (whom to call) is extracted
 * but, in the first plan, seated on no slide before the closing — the shape a
 * live listings story took: "free, schedules at …" left unused while the
 * ending repeated a middle slide.
 */
const threeFactSource = `${sourceText} The service reminds merchants to check each bill.`;
const threeFactStory = { title: "Counterfeit bills", url: "https://example.com/laval", text: threeFactSource, contentStatus: "full", contentSource: "article" };
const threeFacts = [
  { id: "fact-1", statement: "The SPL is looking for people connected to counterfeit-bill transactions.", sourceExcerpt: "The Service de police de Laval says it is looking for people connected to counterfeit-bill transactions.", requiredQualifiers: [], attribution: "SPL" },
  { id: "fact-2", statement: "Anyone with information should call 450 662-4636 or 911.", sourceExcerpt: "Anyone with information should call 450 662-4636 or 911.", requiredQualifiers: [], attribution: "SPL" },
  { id: "fact-3", statement: "The service reminds merchants to check each bill.", sourceExcerpt: "The service reminds merchants to check each bill.", requiredQualifiers: [], attribution: "SPL" },
];
function unseatedFactResponse(seatFactTwo = false) {
  return validResponse({
    keyFacts: threeFacts,
    carouselPlan: {
      slideCount: 3, rationale: "Appeal, what to check, what to do.",
      slides: [
        { editorialGoal: "hook", viewerQuestion: "What is the SPL looking into?", allowedFactIds: ["fact-1"] },
        { editorialGoal: "explain", viewerQuestion: "What should you check before accepting cash?", allowedFactIds: seatFactTwo ? ["fact-3", "fact-2"] : ["fact-3"] },
        { editorialGoal: "conclude", viewerQuestion: "Who should you call?", allowedFactIds: ["fact-1", "fact-3"] },
      ],
    },
    units: validUnits([
      { factIds: ["fact-1"] },
      { factIds: ["fact-3"], body: "The service reminds merchants to check each bill." },
      { factIds: ["fact-1", "fact-3"], body: "The service reminds merchants to check each bill." },
    ]),
  });
}

test("a brief that seats a fact on no slide before the closing is sent back once with the fact named", async () => {
  const h = harness((attempt) => (attempt === 0 ? unseatedFactResponse() : unseatedFactResponse(true)));
  const result = await h.generate(options({ story: threeFactStory }));
  assert.equal(h.calls.length, 3, "brief, one brief rewrite, then the script");
  const retry = h.calls[1] as { previousValidationError?: string };
  assert.match(retry.previousValidationError ?? "", /fact-2/, "the rewrite is told which fact has no seat");
  assert.equal(result.brief.keyFacts.length, 3);
  assert.ok(result.brief.carouselPlan?.slides[1]?.allowedFactIds.includes("fact-2"), "the rewritten plan seats it before the closing");
});

test("a fact still unseated after the rewrite is accepted, not fatal", async () => {
  const h = harness(() => unseatedFactResponse());
  const result = await h.generate(options({ story: threeFactStory }));
  assert.equal(h.calls.length, 3, "one rewrite, then generation proceeds with the plan as returned");
  assert.equal(result.brief.keyFacts.length, 3, "the evidence is kept for the independent review to weigh");
});

/** The fixture's fact with a person added to the statement that its excerpt never names. */
function namedFactResponse(leak: boolean) {
  const fact = (validResponse().keyFacts as Record<string, unknown>[])[0]!;
  return validResponse({
    keyFacts: [{
      ...fact,
      ...(leak ? { statement: "The SPL is looking for people connected to counterfeit-bill transactions, according to Chief Pierre Brochet." } : {}),
    }],
  });
}

test("a fact whose statement names someone its excerpt does not is sent back once with the name", async () => {
  const h = harness((attempt) => namedFactResponse(attempt === 0));
  const result = await h.generate(options());
  assert.equal(h.calls.length, 3, "brief, one brief rewrite, then the script");
  const retry = h.calls[1] as { previousValidationError?: string };
  assert.match(retry.previousValidationError ?? "", /Pierre Brochet/, "the rewrite is told which name lacks evidence");
  assert.match(result.brief.keyFacts[0]?.statement ?? "", /^The SPL is looking/, "the corrected statement is kept whole");
});

test("a name still unsupported after the rewrite is cut back to the excerpt and never reaches the writer", async () => {
  const h = harness(() => namedFactResponse(true));
  const result = await h.generate(options());
  assert.equal(h.calls.length, 3, "one rewrite, then generation proceeds");
  assert.ok(!/Brochet/.test(result.brief.keyFacts[0]?.statement ?? ""), "the ungrounded name is gone from the fact");
  assert.ok(!JSON.stringify(h.calls[2]).includes("Brochet"), "and it is absent from the script call");
});

/** The fixture's plan with its questions replaced by the goal templates (the live defect) or kept story-specific. */
function templatedPlanResponse(templated: boolean) {
  const plan = validResponse().carouselPlan as { slides: { viewerQuestion: string }[] };
  const templates = ["What happened, and why should I care?", "How is this happening?", "What is the essential takeaway?"];
  return validResponse({
    carouselPlan: {
      ...plan,
      slides: plan.slides.map((slide, index) => ({ ...slide, viewerQuestion: templated ? templates[index]! : slide.viewerQuestion })),
    },
  });
}

test("a plan whose questions are the goal templates is sent back once with the slides named", async () => {
  const h = harness((attempt) => templatedPlanResponse(attempt === 0));
  await h.generate(options());
  assert.equal(h.calls.length, 3, "brief, one brief rewrite, then the script");
  const retry = h.calls[1] as { previousValidationError?: string };
  assert.match(retry.previousValidationError ?? "", /template questions/);
  assert.match(retry.previousValidationError ?? "", /slides 1, 2, 3/);
  assert.match(retry.previousValidationError ?? "", /in English/, "the rewrite is told the profile language");
});

test("template questions that survive the rewrite are accepted and left to the independent review", async () => {
  const h = harness(() => templatedPlanResponse(true));
  const result = await h.generate(options());
  assert.equal(h.calls.length, 3);
  assert.equal(result.draft.units.length, 3);
});

test("the script call states the framing the brief applied, in the writer's own terms", async () => {
  const h = harness(() => validResponse());
  await h.generate(options({
    profile: { language: "English", conversionGoal: "followers", framingStrategy: "reader-consequence", brandPersonality: [], brandOverlay: { enabled: false } },
  }));
  // The brief call always carried a framing instruction; the script call only
  // had the strategy as one JSON field, and a live reader-consequence cover
  // led with a closure's duration instead of the reader's trip.
  assert.ok(h.instructions[1]?.includes("FRAMING FOR THE SCRIPT: reader-consequence"));
  assert.ok(!h.instructions[1]?.includes("REVISION:"), "a first draft is not a revision");
});

test("a revision rewrites the script against the same brief with the review in hand, in exactly one call", async () => {
  const h = harness(() => validResponse());
  const first = await h.generate(options());
  const findings = [{ code: "WEAK_HEADLINE", severity: "blocker", message: "The cover headline is generic.", unitOrder: 1 }];
  const revised = await h.generate(options({
    existingBrief: first.brief, maxAttempts: 1,
    revision: { previousDraft: first.draft, findings, scores: { overall: 70 }, thresholds: { overall: 85 } },
  }));
  assert.equal(h.calls.length, 3, "brief, script, and one rewrite — no brief call for the revision");
  assert.equal(revised.attempts, 1);
  const rewrite = h.calls[2] as { previousScript?: { units: unknown[] }; reviewFindings?: { code: string }[]; slidesToRevise?: number[]; story?: { text?: string } };
  assert.equal(rewrite.previousScript?.units.length, 3, "the reviewed script goes with it");
  assert.equal(rewrite.reviewFindings?.[0]?.code, "WEAK_HEADLINE");
  assert.deepEqual([...(rewrite.slidesToRevise ?? [])], [1]);
  assert.equal(rewrite.story?.text, undefined, "a revision never sees the article either");
  assert.ok(h.instructions[2]?.includes("REVISION:"));
});

test("the brief instruction asks for every load-bearing fact, not a fixed handful", async () => {
  const h = harness(() => validResponse());
  await h.generate(options());
  const briefInstruction = h.instructions[0] ?? "";
  assert.ok(!/\b1-6\b/.test(briefInstruction), "the old '1-6' guidance must be gone");
  assert.ok(briefInstruction.includes(`up to ${h.maxFacts}`));
  assert.ok(/one fact per item/i.test(briefInstruction), "enumerated lists must be extracted item by item");
});

test("an over-length slide body is rewritten once locally, before the audit ever sees it", async () => {
  const h = harness((attempt) =>
    attempt === 1
      ? validResponse({ keyFacts: [longFact], units: validUnits([{}, { body: LONG_PASSAGE }]) })
      : validResponse({ keyFacts: [longFact] }),
  );
  const result = await h.generate(options({ story: longStory }));
  assert.equal(h.calls.length, 3, "brief, script, and exactly one rewrite");
  const retry = h.calls[2] as { previousValidationError?: string };
  assert.match(retry.previousValidationError ?? "", /45/, "the rewrite is told the limit and the slide");
  assert.ok(result.draft.units[1].body!.split(/\s+/).length <= 45, "the rewrite is the draft that goes forward");
});

test("an over-length body that survives the rewrite is accepted, not fatal", async () => {
  const h = harness(() => validResponse({ keyFacts: [longFact], units: validUnits([{}, { body: LONG_PASSAGE }]) }));
  const result = await h.generate(options({ story: longStory }));
  assert.equal(h.calls.length, 3, "one rewrite, then the audit decides");
  assert.ok(result.draft.units[1].body!.split(/\s+/).length > 45, "the stubborn copy reaches the independent review instead of sinking the run");
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

test("the script instruction tells the writer what a publish-ready caption looks like, without reopening the single-CTA rule", async () => {
  const h = harness(() => validResponse());
  await h.generate(options());
  const instruction = h.instructions[1] ?? "";
  assert.match(instruction, /copy someone would paste straight into a post/, "caption must read as social copy, not a formal recap");
  assert.match(instruction, /its own short line or clause/, "distinct practical consequences get their own line, generically — not a hardcoded example");
  assert.match(instruction, /never add a second, different action such as a save or share nudge/, "the single-CTA rule is reinforced, not loosened, for caption");
  assert.doesNotMatch(instruction, /🚧|Pont Gouin|Saint-Jean/i, "the guidance names no topic, place or emoji — domain-agnostic per AGENTS.md");
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
