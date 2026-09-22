import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import ts from "typescript";
import { hookCopyUnchanged, type CreativeHookSelection } from "./creative-hook-policy";
import { isCreativeDraftReadyForAutomation } from "./creative-quality";
import type { CreativeKeyFact, CreativeQualityIssue, GeneratedCreativeDraft } from "./creative-content.types";

const localRequire = createRequire(import.meta.url);
const source = readFileSync(new URL("./gemini-creative-content-generator.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(`${source}\nexports.review = runOpenAiEditorialQualityGate; exports.useGenerated = (value) => { generateReviewedCreativeDraft = async () => value; };`, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
}).outputText;

const facts: CreativeKeyFact[] = [{ id: "fact-1", statement: "The company says its agent can fill forms.", sourceExcerpt: "The company says its agent can fill forms." }];
const draft: GeneratedCreativeDraft = {
  concept: "Form filling with an AI agent", caption: facts[0].statement, hashtags: [], altText: "A conceptual form-filling illustration.",
  callToAction: "Follow for explanations of AI tools and their limits.",
  units: [{ order: 1, type: "meme-frame", role: "cover", headline: "An agent that can fill forms", body: facts[0].statement,
    visualDirection: "Conceptual form illustration.", factIds: ["fact-1"], aspectRatio: "4:5", assetRequest: "generated-image", characterIds: [] }],
};
const strong = { factuality: 99, hook: 97, curiosity: 96, swipeReward: 96, continuity: 96, relevance: 96, clarity: 96, resolution: 96, cta: 96, overall: 97 };
function selection(factIds = ["fact-1"]): CreativeHookSelection {
  return { selectedIndex: 0, candidates: [draft.units[0].headline, "AI can help with form filling", "An AI agent for filling forms"].map(headline => ({
    headline, subheadline: "", factIds, readerQuestion: "What can this agent do?", payoffUnitOrder: 1, supported: true,
    checks: { clear: true, tension: true, consequence: true, human: true, curiosity: true }, reason: "A concrete, attributed capability.",
  })) };
}

type ReviewResult = { draft: GeneratedCreativeDraft; criticUnavailable?: { reason: string; issues: CreativeQualityIssue[] } };
type CapturedRequest = { model: string; schema: { required: string[]; properties: Record<string, unknown> }; maxOutputTokens: number; reasoningEffort: string; timeoutMs?: number; instructions: string };
function harness(reply: (model: string, index: number) => unknown) {
  const calls: string[] = [];
  const requests: CapturedRequest[] = [];
  const exports = {} as { useGenerated: (value: unknown) => void; review: (options: unknown) => Promise<ReviewResult>; generateCreativeDraft: (options: unknown) => Promise<unknown> };
  class OpenAiEditorialError extends Error {}
  vm.runInNewContext(compiled, { exports, Error, AbortController, AbortSignal, Buffer, Date, Map, Set, JSON, setTimeout, clearTimeout,
    console: { info() {}, warn() {}, error() {} },
    require: (id: string) => {
      if (id === "server-only") return {};
      if (id === "./openai-structured-response") return { OpenAiEditorialError, generateOpenAiStructuredResponse: async (params: CapturedRequest) => {
        const index = calls.length; calls.push(params.model); requests.push(params);
        const body = reply(params.model, index);
        if (body instanceof Error) throw new OpenAiEditorialError(body.message);
        return { text: JSON.stringify(body), usage: { promptTokens: 5, outputTokens: 5, thoughtsTokens: 0, totalTokens: 10 } };
      } };
      return localRequire(id);
    },
  });
  return { review: exports.review, generate: exports.generateCreativeDraft, useGenerated: exports.useGenerated, calls, requests };
}
const options = (extra: Record<string, unknown> = {}) => ({
  apiKey: "test", models: { criticModel: "terra-test", severeRepairModel: "sol-test" }, currentDraft: draft, format: "meme",
  brief: { keyFacts: facts, riskFlags: [] }, topic: { name: "AI tools" },
  profile: { name: "AI tools", language: "English", brandPersonality: [], framingStrategy: "explainer", conversionGoal: "followers" },
  outputAspectRatio: "4:5", characterRoster: [], ...extra,
});

test("a hook verdict survives edits outside the cover and its payoff slide", () => {
  const carousel = { units: [
    { ...draft.units[0], order: 1 },
    { ...draft.units[0], order: 2, headline: "The payoff" },
    { ...draft.units[0], order: 3, headline: "Closing", ctaQuestion: "Follow for AI tool explainers." },
  ] };
  const hook = selection(); hook.candidates[0].payoffUnitOrder = 2;
  const closingEdited = structuredClone(carousel); closingEdited.units[2].ctaQuestion = "Follow us to understand AI form tools.";
  assert.equal(hookCopyUnchanged(carousel, closingEdited, hook), true);
  const payoffEdited = structuredClone(carousel); payoffEdited.units[1].headline = "A different payoff";
  assert.equal(hookCopyUnchanged(carousel, payoffEdited, hook), false);
  const coverEdited = structuredClone(carousel); coverEdited.units[0].headline = "A different cover";
  assert.equal(hookCopyUnchanged(carousel, coverEdited, hook), false);
});

test("minor findings stay on Terra instead of spending a Sol escalation", async () => {
  // 84 misses the publishable band (overall >= 85) by one point: still a minor finding, still Terra.
  const h = harness((_model, index) => ({ verdict: "accepted", scores: index ? strong : { ...strong, overall: 84 }, issues: [], draft, hookSelection: selection() }));
  const result = await h.review(options());
  assert.deepEqual(h.calls, ["terra-test", "terra-test"]);
  assert.equal(result.draft.qualityReview?.status, "accepted");
  assert.equal(result.draft.qualityReview?.critic?.model, "terra-test");
});

test("an explicit escalation request still reaches the stronger editor", async () => {
  const h = harness((_model, index) => ({ verdict: index ? "accepted" : "escalate", scores: strong, issues: [], draft, hookSelection: selection() }));
  const result = await h.review(options());
  assert.deepEqual(h.calls, ["terra-test", "sol-test"]);
  assert.equal(result.draft.qualityReview?.status, "accepted");
});

test("no time left means no escalation, with a visible note", async () => {
  const h = harness(() => ({ verdict: "escalate", scores: strong, issues: [], draft, hookSelection: selection() }));
  const result = await h.review(options({ deadline: Date.now() + 1_000 }));
  assert.deepEqual(h.calls, ["terra-test"]);
  assert.ok(result.draft.qualityReview?.issues.some(issue => issue.code === "EDITORIAL_TIME_BUDGET"));
});

test("an invalid selected hook keeps the paid review and asks for a manual opening check", async () => {
  const h = harness(() => ({ verdict: "accepted", scores: strong, issues: [], draft, hookSelection: selection(["unplanned"]) }));
  const result = await h.review(options({ models: { criticModel: "terra-test", severeRepairModel: "terra-test" } }));
  assert.deepEqual(h.calls, ["terra-test"]);
  assert.equal(result.criticUnavailable, undefined);
  assert.equal(result.draft.qualityReview?.critic?.model, "terra-test");
  assert.equal(result.draft.qualityReview?.hookSelection, undefined);
  assert.ok(result.draft.qualityReview?.issues.some(issue => issue.code === "HOOK_REVIEW_INVALID" && /hook comparison was invalid/.test(issue.message)));
  // A review defect is not evidence the opening is weak: the hook score is not capped for it.
  assert.equal(result.draft.qualityReview?.scores.hook, strong.hook);
});

test("when every editor is unavailable the gate hands the draft back for the fallback reviewer", async () => {
  const h = harness(() => new Error("You have no credits remaining"));
  const result = await h.review(options());
  assert.deepEqual(h.calls, ["terra-test", "sol-test"]);
  assert.match(result.criticUnavailable?.reason ?? "", /no credits remaining/);
  assert.equal(result.draft.qualityReview, undefined);
});

for (const invalidAudits of [0, 1, 2]) {
test(`OpenAI outage stops without invoking grounding fallback variant ${invalidAudits}`, async () => {
  const calls: string[] = [];
  let auditCount = 0;
  const exports = {} as { generateCreativeDraft: (options: unknown) => Promise<{ draft: GeneratedCreativeDraft }> };
  class OpenAiEditorialError extends Error {}
  class ApiError extends Error {}
  const carouselDraft = {
    concept: draft.concept, caption: draft.caption, altText: draft.altText, hashtags: [],
    units: [
      { role: "cover", editorialGoal: "hook", viewerQuestion: "What can this agent do?", headline: draft.units[0].headline,
        body: facts[0].statement, continuationCue: "What does it fill?", visualDirection: "Conceptual form illustration.",
        factIds: ["fact-1"], characterIds: [], assetRequest: "generated-image" },
      { role: "conclusion", editorialGoal: "conclude", viewerQuestion: "What does it fill?", headline: "It fills forms, the company says",
        body: facts[0].statement, ctaQuestion: "Follow for explanations of AI tools and their limits.",
        visualDirection: "Conceptual form illustration.", factIds: ["fact-1"], characterIds: [], assetRequest: "generated-image" },
    ],
  };
  const hook = selection(); hook.candidates.forEach(candidate => { candidate.payoffUnitOrder = 2; });
  vm.runInNewContext(compiled, { exports, Error, AbortController, AbortSignal, Buffer, Date, Map, Set, JSON, setTimeout, clearTimeout,
    console: { info() {}, warn() {}, error() {} },
    require: (id: string) => {
      if (id === "server-only") return {};
      if (id === "@google/genai") return { ApiError, GoogleGenAI: class {
        models = { generateContent: async (params: { contents: string }) => {
          const input = JSON.parse(params.contents);
          const kind = input.blockers ? "gemini-patch" : input.qualityThresholds ? "gemini-audit" : input.currentDraft ? "gemini-rewrite" : "gemini-draft";
          calls.push(kind);
          if (kind === "gemini-audit") {
            auditCount += 1;
            if (auditCount === 2 && invalidAudits > 0) {
              assert.ok(input.previousFeedback.some((issue: CreativeQualityIssue) => issue.code === "AUDIT_RESPONSE_INVALID"));
            }
          }
          const auditHook = structuredClone(hook);
          if (auditCount <= invalidAudits) auditHook.candidates[0].factIds = ["unplanned"];
          const text = kind === "gemini-audit"
            ? JSON.stringify({ scores: strong, issues: [], hookSelection: auditHook })
            : kind === "gemini-patch" ? JSON.stringify({ patches: [] }) : JSON.stringify(carouselDraft);
          return { text, candidates: [{ finishReason: "STOP" }], usageMetadata: { totalTokenCount: 30 } };
        } };
      } };
      if (id === "./openai-structured-response") return { OpenAiEditorialError, generateOpenAiStructuredResponse: async (params: { model: string }) => {
        calls.push(params.model);
        throw new OpenAiEditorialError("You have no credits remaining");
      } };
      return localRequire(id);
    },
  });
  const result = await exports.generateCreativeDraft({
    apiKey: "test", model: "gemini-test", primaryProvider: "google",
    openAiApiKey: "test", openAiEditorialModels: { criticModel: "terra-test", severeRepairModel: "sol-test" },
    story: { title: "Form agents", url: "https://example.org/story", contentStatus: "full", contentSource: "article" },
    topic: { name: "AI tools" },
    profile: { name: "AI tools", language: "English", conversionGoal: "followers", framingStrategy: "explainer",
      brandPersonality: [], brandOverlay: { enabled: false }, visualGuidance: "Editorial cards" },
    brief: { keyFacts: facts, riskFlags: [], carouselPlan: { slideCount: 2, rationale: "A capability and its limit.",
      slides: carouselDraft.units.map(unit => ({ editorialGoal: unit.editorialGoal, viewerQuestion: unit.viewerQuestion, allowedFactIds: ["fact-1"] })) } },
    format: "carousel", outputAspectRatio: "4:5", characterRoster: [],
  });
  assert.deepEqual(calls, ["gemini-draft", "terra-test", "sol-test"]);
  assert.equal(auditCount, 0, "An outage must not start a non-independent audit loop");
  const review = result.draft.qualityReview!;
  assert.notEqual(review.status, "accepted");
  assert.ok(review.issues.some(issue => issue.code === "CRITIC_UNAVAILABLE"));
  assert.equal(isCreativeDraftReadyForAutomation(result.draft, "carousel", true), false);

});

}

test("successful fallback review retains failure history without an active outage blocker", async () => {
  const h = harness((_model, index) => index === 0 ? new Error("temporarily unavailable") : ({ verdict: "accepted", scores: strong, issues: [], draft, hookSelection: selection() }));
  const result = await h.review(options());
  assert.equal(result.draft.qualityReview?.status, "accepted");
  assert.ok(result.draft.qualityReview?.issues.some(issue => issue.code === "EDITORIAL_REVIEW_RECOVERED"));
  assert.ok(!result.draft.qualityReview?.issues.some(issue => issue.code === "EDITORIAL_REVIEW_ATTEMPT_FAILED"));
});

test("read-only final review cannot replace copy with a provider rewrite and runs once", async () => {
  const h = harness(() => ({ verdict: "accepted", scores: strong, issues: [], draft: { ...draft, caption: "Invented replacement" }, hookSelection: selection() }));
  const result = await h.review(options({ readOnly: true }));
  assert.deepEqual(h.calls, ["terra-test"]);
  assert.equal(result.draft.caption, draft.caption);
  assert.equal(result.draft.qualityReview?.status, "accepted");
  // The initial gate keeps the full audit contract.
  assert.ok(h.requests[0].schema.required.includes("hookSelection"));
  assert.equal(h.requests[0].maxOutputTokens, 4_096);
  assert.equal(h.requests[0].reasoningEffort, "medium");
});

test("a slim verify pass reuses the verified hook comparison, asks for less, and keeps the verify window", async () => {
  const reused = selection();
  const h = harness(() => ({ verdict: "accepted", scores: strong, issues: [] }));
  const deadline = Date.now() + 150_000;
  const result = await h.review(options({ readOnly: true, slim: true, reuseHookSelection: reused, deadline }));
  assert.deepEqual(h.calls, ["terra-test"]);
  const request = h.requests[0];
  assert.ok(!request.schema.required.includes("hookSelection"));
  assert.equal(request.schema.properties.hookSelection, undefined);
  assert.equal(request.maxOutputTokens, 2_560);
  assert.equal(request.reasoningEffort, "low");
  assert.match(request.instructions, /verification pass/);
  assert.ok((request.timeoutMs ?? 0) >= 120_000, `verify must not be capped at 60s (got ${request.timeoutMs})`);
  assert.equal(result.draft.qualityReview?.status, "accepted");
  assert.deepEqual(result.draft.qualityReview?.hookSelection, reused);
  assert.equal(isCreativeDraftReadyForAutomation(result.draft, "meme", true), true);
});

test("invalid hook comparison never earns automated acceptance even with perfect scores", async () => {
  const h = harness(() => ({ verdict: "accepted", scores: strong, issues: [], draft, hookSelection: selection(["unknown"]) }));
  const result = await h.review(options());
  assert.equal(h.calls.length, 2);
  assert.notEqual(result.draft.qualityReview?.status, "accepted");
});

test("automated readiness requires current independent scores, supported hook and exact cover", () => {
  const accepted: GeneratedCreativeDraft = { ...draft, qualityReview: {
    status: "accepted", scores: strong, issues: [], repairPasses: 1,
    critic: { provider: "openai", model: "test" }, hookSelection: selection(),
  } };
  assert.equal(isCreativeDraftReadyForAutomation(accepted, "meme", true), true);
  assert.equal(isCreativeDraftReadyForAutomation(accepted, "meme", false), false);
  for (const change of [
    (d: GeneratedCreativeDraft) => { d.qualityReview!.critic!.provider = "google"; },
    (d: GeneratedCreativeDraft) => { d.qualityReview!.scores.curiosity = 70; },
    (d: GeneratedCreativeDraft) => { d.qualityReview!.hookSelection = undefined; },
    (d: GeneratedCreativeDraft) => { d.units[0].headline = "A different unreviewed opening"; },
    (d: GeneratedCreativeDraft) => { d.qualityReview!.issues.push({ code: "UNSUPPORTED", severity: "blocker", message: "Missing evidence" }); },
  ]) {
    const candidate = structuredClone(accepted);
    change(candidate);
    assert.equal(isCreativeDraftReadyForAutomation(candidate, "meme", true), false);
  }
});

test("a packet of truncated source fragments stops before any paid generation", async () => {
  const h = harness(() => { throw new Error("No provider call expected"); });
  await assert.rejects(h.generate({ brief: { keyFacts: [
    { id: "fact-1", statement: "One in five recent immigrants worked in their…", sourceExcerpt: "One in five recent immigrants worked in their…" },
  ] } }), /complete evidence/);
  assert.equal(h.calls.length, 0);
});

test("duplicate hook alternatives cannot authorize an accepted draft",async()=>{
  const hook=selection(); hook.candidates=[hook.candidates[0],hook.candidates[0],hook.candidates[0]];
  const h=harness(()=>({verdict:"accepted",scores:strong,issues:[],draft,hookSelection:hook}));
  const result=await h.review(options());
  assert.notEqual(result.draft.qualityReview?.status,"accepted");
  assert.equal(isCreativeDraftReadyForAutomation(result.draft,"meme",true),false);
  assert.ok(h.calls.length<=2);
});

test("post-review edits outside the hook invalidate the complete copy review",async()=>{
  const changed={...draft,caption:`${draft.caption} This unfinished clause`};
  const h=harness(()=>({verdict:"accepted",scores:strong,issues:[],draft:changed,hookSelection:selection()}));
  const result=await h.review(options());
  assert.notEqual(result.draft.caption,changed.caption);
  assert.ok(result.draft.qualityReview?.issues.some(issue=>issue.code==="FINAL_COPY_REVIEW_REQUIRED"));
  assert.notEqual(result.draft.qualityReview?.status,"accepted");
  assert.equal(isCreativeDraftReadyForAutomation(result.draft,"meme",true),false);
  assert.ok(h.calls.length<=2);
});


test("a pending inner copy correction triggers final audit even when outer repair changes nothing",async()=>{
  const h=harness(()=>({verdict:"accepted",scores:strong,issues:[],hookSelection:selection()}));
  const pending={...draft,qualityReview:{status:"needs-review",scores:strong,repairPasses:1,issues:[{code:"FINAL_COPY_REVIEW_REQUIRED",severity:"blocker",message:"Copy changed"}]}};
  h.useGenerated({draft:pending,provider:"google",model:"test",usage:{promptTokens:0,outputTokens:0,thoughtsTokens:0,totalTokens:0}});
  const result=await h.generate({...options(),openAiApiKey:"test",openAiEditorialModels:{criticModel:"terra-test",severeRepairModel:"sol-test"},story:{title:"Source"}}) as ReviewResult;
  assert.deepEqual(h.calls,["terra-test"]);
  assert.equal(result.draft.qualityReview?.status,"accepted");
  assert.ok(!result.draft.qualityReview?.issues.some(issue=>issue.code==="FINAL_COPY_REVIEW_REQUIRED"));
});

test("an initially missing headline can be repaired but still needs a valid independent verdict",async()=>{
 const incomplete={...draft,units:[{...draft.units[0],headline:"",body:undefined,subheadline:undefined}]};
 const h=harness(()=>({verdict:"accepted",scores:strong,issues:[],draft,hookSelection:selection()}));
 const result=await h.review(options({currentDraft:incomplete}));
 assert.equal(result.draft.units[0].headline,draft.units[0].headline);
 assert.equal(result.draft.qualityReview?.status,"accepted");
 assert.equal(isCreativeDraftReadyForAutomation(result.draft,"meme",true),true);
});

test("an uncorrected missing headline cannot become publication ready",async()=>{
 const incomplete={...draft,units:[{...draft.units[0],headline:"",body:undefined,subheadline:undefined}]};
 const h=harness(()=>({verdict:"accepted",scores:strong,issues:[],draft:incomplete,hookSelection:selection()}));
 const result=await h.review(options({currentDraft:incomplete}));
 assert.equal(isCreativeDraftReadyForAutomation(result.draft,"meme",true),false);
 assert.ok(result.criticUnavailable);
 assert.ok(h.calls.length<=2);
});


test("malformed final audit recovers once without replacing final copy", async () => {
  const h = harness((_model, index) => index === 0
    ? {verdict:"invalid"}
    : {verdict:"accepted", scores:strong, issues:[], hookSelection:selection(), draft:{...draft, caption:"Do not apply this rewrite"}});
  const result = await h.review(options({readOnly:true}));
  assert.deepEqual(h.calls, ["terra-test", "sol-test"]);
  assert.equal(result.draft.caption, draft.caption);
  assert.equal(result.draft.qualityReview?.status, "accepted");
  assert.ok(result.draft.qualityReview?.issues.some(issue => issue.code === "EDITORIAL_REVIEW_RECOVERED"));
});

test("unavailable final audit stops after two calls and never authorizes automation", async () => {
  const h = harness(() => new Error("Provider unavailable"));
  const result = await h.review(options({readOnly:true}));
  assert.deepEqual(h.calls, ["terra-test", "sol-test"]);
  assert.ok(result.criticUnavailable);
  assert.deepEqual(result.draft, draft);
  assert.equal(isCreativeDraftReadyForAutomation(result.draft, "meme", true), false);
});
