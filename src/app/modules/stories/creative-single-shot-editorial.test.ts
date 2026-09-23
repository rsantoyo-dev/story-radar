import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import ts from "typescript";

// Three modules, loaded in dependency order in separate vm contexts (see
// creative-single-shot-generator.test.ts for why: concatenating raw source
// hits an import-hoisting ordering bug across files). Each later module's
// `import ... from "./earlier-module"` is resolved to that module's already
// -populated `exports` object.
const localRequire = createRequire(import.meta.url);
const compileOptions = { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } };
const compile = (path: string, extra = "") =>
  ts.transpileModule(`${readFileSync(new URL(path, import.meta.url), "utf8")}${extra}`, compileOptions).outputText;
const geminiCompiled = compile("./gemini-creative-content-generator.ts");
const singleShotGeneratorCompiled = compile("./creative-single-shot-generator.ts");
const singleShotEditorialCompiled = compile("./creative-single-shot-editorial.ts");

type GeminiParams = { contents: string };
type OpenAiParams = { model: string; schemaName: string; contents: Record<string, unknown> };
type GeminiExports = { CreativeContentResponseError: new (message: string) => Error };
type SingleShotGeneratorExports = Record<string, unknown>;
type Checkpoint = { draft: { singleShotRun?: { stage: string; verdict?: string; callsUsed: number; stopReason?: string } }; callsUsed: number };
type EditorialExports = {
  runSingleShotCreativePipeline: (options: unknown) => Promise<{
    brief: unknown;
    draft: { units: unknown[]; qualityReview?: { status: string }; singleShotRun?: Checkpoint["draft"]["singleShotRun"]; blockedSource?: { reason: string } };
    usage: { totalTokens: number };
    callsUsed: number;
  }>;
};

/**
 * geminiReply drives every @google/genai call (script generation). openAiReply
 * drives every OpenAI structured-response call (audit / repair / verify),
 * keyed by schemaName so a test can give different answers to each role
 * without depending on call order beyond what the pipeline itself imposes.
 */
function harness(
  geminiReply: (attempt: number, contents: Record<string, unknown>) => unknown,
  openAiReply: (call: OpenAiParams, index: number) => unknown,
) {
  const geminiCalls: Record<string, unknown>[] = [];
  const openAiCalls: OpenAiParams[] = [];
  // Defined once so `instanceof` checks inside the transpiled module (which
  // requires this same shim) see one stable class identity.
  class OpenAiEditorialError extends Error {}
  const sharedRequire = (id: string) => {
    if (id === "server-only") return {};
    if (id === "@google/genai") {
      return {
        ApiError: class extends Error {},
        GoogleGenAI: class {
          models = {
            generateContent: async (params: GeminiParams) => {
              const contents = JSON.parse(params.contents) as Record<string, unknown>;
              const attempt = geminiCalls.length;
              geminiCalls.push(contents);
              return {
                text: JSON.stringify(geminiReply(attempt, contents)),
                candidates: [{ finishReason: "STOP" }],
                usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 200, thoughtsTokenCount: 0, totalTokenCount: 300 },
              };
            },
          };
        },
      };
    }
    if (id === "groq-sdk") {
      return class { chat = { completions: { create: async () => { throw new Error("must not call Groq"); } } }; };
    }
    if (id === "./openai-structured-response") {
      return {
        OpenAiEditorialError,
        generateOpenAiStructuredResponse: async (params: OpenAiParams) => {
          const index = openAiCalls.length;
          openAiCalls.push(params);
          const body = openAiReply(params, index);
          if (body instanceof Error) throw new OpenAiEditorialError(body.message);
          return { text: JSON.stringify(body), usage: { promptTokens: 10, outputTokens: 10, thoughtsTokens: 0, totalTokens: 20 } };
        },
      };
    }
    return localRequire(id);
  };
  const sandboxGlobals = {
    Error, AbortController, AbortSignal, Buffer, Date, Map, Set, JSON, setTimeout, clearTimeout,
    console: { info() {}, warn() {}, error() {} },
  };
  const geminiExports = {} as GeminiExports;
  vm.runInNewContext(geminiCompiled, { exports: geminiExports, ...sandboxGlobals, require: sharedRequire });
  const singleShotGeneratorExports = {} as SingleShotGeneratorExports;
  vm.runInNewContext(singleShotGeneratorCompiled, {
    exports: singleShotGeneratorExports,
    ...sandboxGlobals,
    require: (id: string) => (id === "./gemini-creative-content-generator" ? geminiExports : sharedRequire(id)),
  });
  const editorialExports = {} as EditorialExports;
  vm.runInNewContext(singleShotEditorialCompiled, {
    exports: editorialExports,
    ...sandboxGlobals,
    require: (id: string) =>
      id === "./gemini-creative-content-generator" ? geminiExports
      : id === "./creative-single-shot-generator" ? singleShotGeneratorExports
      : sharedRequire(id),
  });
  return { run: editorialExports.runSingleShotCreativePipeline, geminiCalls, openAiCalls };
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

const strongScores = { factuality: 99, hook: 90, curiosity: 88, swipeReward: 88, continuity: 88, relevance: 90, clarity: 90, resolution: 88, cta: 88, overall: 90 };
// The selected candidate must mirror the returned cover exactly, or the review
// is legitimately not accepted (HOOK_REVIEW_INVALID caps the hook score).
const coverUnit = validUnits()[0];
const hookSelection = { selectedIndex: 0, candidates: [
  { headline: coverUnit.headline, subheadline: "", factIds: ["fact-1"] },
  { headline: "Counterfeit bills are under investigation in Laval", subheadline: "", factIds: ["fact-1"] },
  { headline: "The SPL wants your help", subheadline: "", factIds: ["fact-1"] },
].map((c) => ({
  ...c, readerQuestion: "What is the SPL looking into?",
  payoffUnitOrder: 3, supported: true, checks: { clear: true, tension: true, consequence: true, human: true, curiosity: true }, reason: "A concrete appeal.",
})) };

// A review without carouselCraft is treated as incomplete and caps hook,
// swipeReward and resolution below the bar, so an "accepted" fixture must
// supply it with quotes that really appear on each slide.
const carouselCraft = {
  strongestDetailVisible: true, specificReasonToContinue: true,
  openingReason: "The cover names the appeal and its subject.",
  slides: validUnits().map((u, i) => ({
    order: i + 1, answersQuestion: true, addsNewValue: true,
    visibleQuote: u.headline, contribution: "Advances the appeal with its own evidence.",
  })),
  resolvesPromise: true, closingAddsSynthesis: true,
  closingReason: "The closing gives the contact route the cover promised.",
};

const options = (extra: Record<string, unknown> = {}) => ({
  apiKey: "gemini-test", model: "gemini-test", primaryProvider: "google",
  story: { title: "Counterfeit bills", url: "https://example.com/laval", text: sourceText, contentStatus: "full", contentSource: "article" },
  topic: { name: "Salut Laval" },
  profile: { language: "English", conversionGoal: "followers", framingStrategy: "explainer", brandPersonality: [], brandOverlay: { enabled: false } },
  format: "carousel", outputAspectRatio: "4:5", characterRoster: [], acquisitionTaxonomy: taxonomy,
  openAiApiKey: "openai-test", openAiEditorialModels: { criticModel: "terra-test", minorRepairModel: "luna-test", structuralRepairModel: "terra-test", severeRepairModel: "sol-test" },
  deadline: Date.now() + 480_000,
  checkpoint: async () => {},
  ...extra,
});

test("sufficient source, accepted on the first audit: exactly 3 physical calls", async () => {
  const checkpoints: Checkpoint[] = [];
  const h = harness(
    () => validResponse(),
    () => ({ verdict: "accepted", scores: strongScores, issues: [], draft: undefined, hookSelection, carouselCraft }),
  );
  const result = await h.run(options({ checkpoint: async (value: Checkpoint) => { checkpoints.push(value); } }));
  assert.equal(h.geminiCalls.length, 2, "brief and script");
  assert.equal(h.openAiCalls.length, 1, "one audit call, no repair, no verify");
  assert.equal(result.callsUsed, 3);
  assert.equal(result.draft.singleShotRun?.verdict, "accepted");
  assert.equal(result.draft.singleShotRun?.stage, "done");
  assert.ok(checkpoints.some((c) => c.draft.singleShotRun?.stage === "generated"));
});

test("a configured carousel writer reaches the generator with its OpenAI credential", async () => {
  const h = harness(
    () => validResponse(),
    (call) =>
      call.schemaName === "creative_draft"
        ? validResponse()
        : { verdict: "accepted", scores: strongScores, issues: [], draft: undefined, hookSelection, carouselCraft },
  );
  const result = await h.run(options({ carouselWriterModel: "sol-test" }));
  // The orchestrator destructures openAiApiKey out of the options it forwards;
  // when it failed to put it back, the writer threw "requires an OpenAI API
  // key" on every run with the knob set.
  assert.equal(h.geminiCalls.length, 1, "only the brief stays on Gemini");
  assert.equal(h.openAiCalls[0].schemaName, "creative_draft", "the script is written by the configured writer");
  assert.equal(h.openAiCalls[0].model, "sol-test");
  assert.equal(h.openAiCalls[1].schemaName, "creative_editorial_final_audit", "the audit still runs after it");
  assert.equal(result.callsUsed, 3, "the writer's call counts against the same budget");
  assert.equal(result.draft.singleShotRun?.verdict, "accepted");
});

test("one correctable defect: repaired and verified within the call budget", async () => {
  const h = harness(
    () => validResponse(),
    (call, index) => {
      if (index === 0) {
        // initial audit: a fixable copy issue
        return { verdict: "revised", scores: { ...strongScores, overall: 70 }, issues: [
          { unitOrder: 1, code: "WEAK_HEADLINE", severity: "blocker", message: "The cover headline is generic." },
        ], draft: undefined, hookSelection };
      }
      // verify: accepted now
      return { verdict: "accepted", scores: strongScores, issues: [], draft: undefined, hookSelection };
    },
  );
  const result = await h.run(options());
  // The repair is a rewrite by the writer (Gemini here), not an OpenAI patch:
  // it gets the reviewed script and the findings and writes the script again.
  assert.equal(h.geminiCalls.length, 3, "brief, script, and the rewrite");
  assert.equal(h.openAiCalls.length, 2, "audit + verify");
  assert.equal(result.callsUsed, 5);
  const rewrite = h.geminiCalls[2] as { reviewFindings?: { code: string }[]; previousScript?: unknown; story?: { text?: string } };
  // Deterministic findings ride along with the audit's, so the audit's is
  // among them rather than necessarily first.
  assert.ok(rewrite.reviewFindings?.some((f) => f.code === "WEAK_HEADLINE"), "the rewrite is handed the audit's findings");
  assert.ok(rewrite.previousScript, "and the reviewed script to revise");
  assert.equal(rewrite.story?.text, undefined, "and still never the article");
});

test("a warning-only review below the bar is repaired, not called accepted", async () => {
  // The regression this guards: every finding Terra returned was severity
  // "warning" (weak hook, redundant closing, unsupported CTA), so a
  // "no blockers means accepted" gate marked a draft scoring 70/85 overall as
  // accepted and skipped the repair the audit had just argued for.
  const below = { ...strongScores, hook: 76, resolution: 55, cta: 62, overall: 70 };
  const h = harness(
    () => validResponse(),
    (call, index) => {
      if (index === 0) {
        return { verdict: "revised", scores: below, issues: [
          { unitOrder: 3, code: "REDUNDANT_CLOSING", severity: "warning", message: "The closing repeats the cover's number." },
          { unitOrder: 1, code: "FRAMING_STRATEGY_NOT_FOLLOWED", severity: "warning", message: "The cover opens with the commodity, not the reader's cost." },
        ], draft: undefined, hookSelection, carouselCraft };
      }
      return { verdict: "accepted", scores: strongScores, issues: [], draft: undefined, hookSelection, carouselCraft };
    },
  );
  const result = await h.run(options());
  assert.equal(h.openAiCalls.length, 2, "audit, then the verify of the rewrite those warnings called for");
  assert.equal(h.geminiCalls.length, 3, "the rewrite is the writer's third call");
  const sentToRewrite = h.geminiCalls[2] as { reviewFindings?: { code: string }[] };
  const codes = sentToRewrite.reviewFindings?.map((b) => b.code) ?? [];
  for (const code of ["REDUNDANT_CLOSING", "FRAMING_STRATEGY_NOT_FOLLOWED"]) {
    assert.ok(codes.includes(code), `the repair is asked to fix ${code}`);
  }
  assert.notEqual(result.draft.singleShotRun?.verdict, undefined);
});

test("a script that never validates stops without touching the audit's budget", async () => {
  // Generation is capped so a retry storm can never leave the run unable to
  // afford its own quality gate — the failure that shipped an unaudited draft.
  let geminiCalls = 0;
  const h = harness(
    () => { geminiCalls += 1; return validResponse({ units: validUnits().slice(0, 2) }); },
    () => ({ verdict: "accepted", scores: strongScores, issues: [], draft: undefined, hookSelection, carouselCraft }),
  );
  await assert.rejects(h.run(options()));
  assert.ok(geminiCalls <= 4, `generation stays within its cap; spent ${geminiCalls}`);
  assert.equal(h.openAiCalls.length, 0, "no editorial spend once generation cannot produce a script");
});

test("an unavailable audit checkpoints the generated script for recovery, without regenerating", async () => {
  const h = harness(
    () => validResponse(),
    () => new Error("no credits remaining"),
  );
  const result = await h.run(options());
  assert.equal(h.geminiCalls.length, 2, "the script is generated exactly once, never twice");
  assert.equal(h.openAiCalls.length, 1);
  assert.equal(result.draft.singleShotRun?.stage, "generated");
  assert.match(result.draft.singleShotRun?.stopReason ?? "", /no credits remaining/);
  assert.ok(!result.draft.qualityReview, "no unverified quality verdict is attached");
});

test("a rewrite that fails validation is rejected; the pre-repair audited draft stays current", async () => {
  const h = harness(
    // The rewrite (the writer's third call) comes back with the wrong slide
    // count, so it fails local validation; with one attempt it is rejected.
    (attempt) => (attempt === 2 ? validResponse({ units: validUnits().slice(0, 2) }) : validResponse()),
    (call, index) => {
      if (index === 0) {
        return { verdict: "revised", scores: { ...strongScores, overall: 70 }, issues: [
          { unitOrder: 1, code: "WEAK_HEADLINE", severity: "blocker", message: "The cover headline is generic." },
        ], draft: undefined, hookSelection };
      }
      return { verdict: "accepted", scores: strongScores, issues: [], draft: undefined, hookSelection };
    },
  );
  const result = await h.run(options());
  assert.equal(h.geminiCalls.length, 3, "brief, script, and exactly one rejected rewrite — no second attempt");
  assert.equal(h.openAiCalls.length, 1, "audit only; no verify is spent on a rejected rewrite");
  assert.equal(result.callsUsed, 4);
  assert.equal(result.draft.singleShotRun?.stage, "audited");
  assert.equal(result.draft.singleShotRun?.verdict, "correctable");
});
