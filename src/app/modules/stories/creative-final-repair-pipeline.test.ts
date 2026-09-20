import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import ts from "typescript";
import type { GeneratedCreativeDraftResult } from "./gemini-creative-content-generator";

const localRequire = createRequire(import.meta.url);
const source = readFileSync(new URL("./gemini-creative-content-generator.ts", import.meta.url), "utf8");
const code = ts.transpileModule(source, { compilerOptions: {
  module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true,
} }).outputText;
const cta = "Síguenos para entender los datos sobre empleo y formación de inmigrantes en Canadá.";
const facts = [
  { id: "fact-1", statement: "Recent immigrants can work outside their field of study.", sourceExcerpt: "Recent immigrants can work outside their field of study." },
  { id: "fact-2", statement: "Workers can find jobs through personal connections.", sourceExcerpt: "Workers can find jobs through personal connections." },
];
const draft = {
  // A question concept cannot seed the deterministic follow CTA, so the
  // missing CTA must still reach the targeted provider patch below.
  concept: "¿Coinciden el empleo y la formación de inmigrantes en Canadá?",
  caption: "El empleo de inmigrantes recientes puede no estar relacionado con su formación.",
  altText: "Dos tarjetas sobre empleo y formación.", hashtags: [],
  units: [
    { role: "cover", editorialGoal: "hook", viewerQuestion: "¿El empleo corresponde a la formación?",
      headline: "Trabajar fuera de tu profesión", body: "El empleo y la formación pueden no coincidir.",
      continuationCue: "¿Qué muestra esto sobre el empleo?", visualDirection: "Tarjetas conceptuales.",
      factIds: ["fact-1"], characterIds: [], assetRequest: "generated-image" },
    { role: "conclusion", editorialGoal: "conclude", viewerQuestion: "¿Qué muestra esto sobre el empleo?",
      headline: "Empleo y profesión pueden diferir", body: "Los inmigrantes recientes pueden trabajar fuera de su campo de estudios.",
      ctaQuestion: "Síguenos para entender qué significa para ti cada novedad del tema.",
      visualDirection: "Dos tarjetas conceptuales.", factIds: ["fact-1"], characterIds: [], assetRequest: "generated-image" },
  ],
};
const scores = { factuality: 98, hook: 98, curiosity: 98, swipeReward: 98, continuity: 98,
  relevance: 98, clarity: 98, resolution: 98, cta: 98, overall: 98 };

for (const finalAvailable of [true, false]) {
test(`final corrected copy is independently checked; final reviewer available: ${finalAvailable}`, async () => {
  const calls: string[] = [];
  const exports = {} as { generateCreativeDraft: (options: unknown) => Promise<GeneratedCreativeDraftResult> };
  class OpenAiEditorialError extends Error {}
  class ApiError extends Error {}
  vm.runInNewContext(code, { exports, AbortController, AbortSignal, Buffer, Date, Map, Set, JSON, setTimeout, clearTimeout,
    console: { info() {}, warn() {}, error() {} },
    require: (id: string) => {
      if (id === "server-only") return {};
      if (id === "@google/genai") return { ApiError, GoogleGenAI: class {
        models = { generateContent: async (params: { contents: string }) => {
          const input = JSON.parse(params.contents);
          calls.push(input.blockers ? "gemini-patch" : "gemini-draft");
          if (input.blockers) assert.deepEqual(input.editableScopes, [2]);
          const text = input.blockers
            ? JSON.stringify({ patches: [{ unitOrder: 2, field: "ctaQuestion", text: cta }] })
            : JSON.stringify(draft);
          return { text, candidates: [{ finishReason: "STOP" }], usageMetadata: { totalTokenCount: 30 } };
        } };
      } };
      if (id === "./openai-structured-response") return {
        OpenAiEditorialError,
        generateOpenAiStructuredResponse: async (params: { model: string; schema: { properties: { draft?: unknown } }; contents: {
          draft: typeof draft; previousFeedback: { message: string }[];
        } }) => {
          calls.push(params.model);
          const revised = structuredClone(params.contents.draft);
          if (!params.schema.properties.draft) {
            if (!finalAvailable) throw new OpenAiEditorialError("Final reviewer unavailable");
            assert.equal(revised.units[1].ctaQuestion, cta);
          } else if (params.model === "terra-test") revised.units[1].factIds = ["fact-2"];
          else {
            assert.ok(params.contents.previousFeedback.some((issue) =>
              issue.message.includes("OpenAI terra-test used an unplanned fact on carousel slide 2; allowed facts: fact-1")));
            revised.units[1].ctaQuestion = draft.units[1].ctaQuestion;
          }
          return { text: JSON.stringify({ verdict: params.schema.properties.draft ? "revised" : "accepted", scores, issues: [], draft: revised, hookSelection: {
            selectedIndex: 0, candidates: [revised.units[0].headline, "Tu empleo puede diferir de tu formación", "Empleo y formación no siempre coinciden"].map(headline => ({
              headline, subheadline: "", factIds: ["fact-1"], supported: true,
              checks: { clear: true, tension: true, consequence: true, human: true, curiosity: true },
              readerQuestion: "¿Cómo se relacionan empleo y formación?", payoffUnitOrder: 2, reason: "Una distinción respaldada por la fuente.",
            })),
          } }),
            usage: { promptTokens: 5, outputTokens: 5, thoughtsTokens: 0, totalTokens: 10 } };
        },
      };
      return localRequire(id);
    },
  });
  const result = await exports.generateCreativeDraft({
    apiKey: "test", model: "gemini-test", primaryProvider: "google",
    openAiApiKey: "test", openAiEditorialModels: { criticModel: "terra-test", severeRepairModel: "sol-test" },
    story: { title: "Employment and qualifications", url: "https://example.org/story", contentStatus: "full", contentSource: "article" },
    topic: { name: "Canada en Breve" },
    profile: { name: "Canada en Breve", language: "Spanish", conversionGoal: "followers", framingStrategy: "reader-consequence",
      brandPersonality: [], brandOverlay: { enabled: false }, visualGuidance: "Editorial cards" },
    brief: { keyFacts: facts, riskFlags: [], carouselPlan: { slideCount: 2, rationale: "One finding and its consequence.",
      slides: draft.units.map((unit) => ({ editorialGoal: unit.editorialGoal, viewerQuestion: unit.viewerQuestion, allowedFactIds: ["fact-1"] })) } },
    format: "carousel", outputAspectRatio: "4:5", characterRoster: [],
  });
  assert.deepEqual(calls, ["gemini-draft", "terra-test", "sol-test", "gemini-patch", "terra-test"]);
  assert.equal(result.draft.units[0].headline, draft.units[0].headline);
  assert.equal(result.draft.units[1].ctaQuestion, cta);
  assert.equal(result.draft.units[1].factIds.join(","), "fact-1");
  assert.equal(result.usage.totalTokens, finalAvailable ? 90 : 80);
  assert.equal(result.draft.qualityReview?.status, "needs-review", "Fixing a CTA must not conceal a redundant closing");
  if (finalAvailable) {
    assert.ok(result.draft.qualityReview?.issues.some(issue => issue.code === "QUALITY_RESOLUTION_BELOW_THRESHOLD"));
    assert.ok(!result.draft.qualityReview?.issues.some(issue => issue.code === "FINAL_COPY_REVIEW_REQUIRED"));
    assert.ok(result.draft.qualityReview?.hookSelection, "Final verification reassesses the corrected copy and its hook payoff");
    assert.ok(!result.draft.qualityReview?.issues.some((issue) => issue.severity === "blocker"));
  } else {
    assert.ok(result.draft.qualityReview?.issues.some(issue => issue.code === "FINAL_COPY_REVIEW_REQUIRED"));
    assert.ok(result.draft.qualityReview?.issues.some(issue => issue.code === "FINAL_REVIEW_UNAVAILABLE"));
    assert.equal(result.draft.qualityReview?.hookSelection, undefined);
  }
});

}
