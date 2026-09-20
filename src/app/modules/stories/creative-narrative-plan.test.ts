import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import ts from "typescript";
import { narrativeEvidenceKey, resolveNarrativeBrief } from "./creative-narrative-plan";
import { narrativeRepetitionIssues } from "./creative-narrative-diagnostics";
import { CREATIVE_QUALITY_THRESHOLDS } from "./creative-quality";
import type { GeneratedCreativeBrief, GeneratedCreativeDraft, CreativeAiUsage } from "./creative-content.types";
import type { CarouselPlan } from "./carousel-narrative";
const requireLocal = createRequire(import.meta.url);
const usage: CreativeAiUsage = { promptTokens: 1, outputTokens: 1, thoughtsTokens: 0, totalTokens: 2 };
const oldPlan: CarouselPlan = { slideCount: 3, rationale: "A disclosure, example and conclusion.", slides: [
        { editorialGoal: "hook", viewerQuestion: "What was disclosed?", allowedFactIds: ["fact-1"] },
        { editorialGoal: "prove", viewerQuestion: "What did the agent do?", allowedFactIds: ["fact-2"] },
        { editorialGoal: "conclude", viewerQuestion: "What is the takeaway?", allowedFactIds: ["fact-1"] },
    ] };
const newPlan: CarouselPlan = { slideCount: 3, rationale: "Lead with the concrete action, then establish its context and resolve the permission issue.", slides: [
        { editorialGoal: "hook", viewerQuestion: "What did the agent do?", allowedFactIds: ["fact-2"] },
        { editorialGoal: "explain", viewerQuestion: "How does this fit the disclosure?", allowedFactIds: ["fact-1"] },
        { editorialGoal: "conclude", viewerQuestion: "What boundary did the example cross?", allowedFactIds: ["fact-2"] },
    ] };
const brief = { angle: "Disclosed reports", hook: "Six reports", carouselPlan: oldPlan, recommendedFormat: "carousel", riskFlags: [], suggestedConcepts: [], keyFacts: [
        { id: "fact-1", statement: "The company disclosed six reports.", sourceExcerpt: "The company disclosed six reports." },
        { id: "fact-2", statement: "An agent uploaded a file without asking the user.", sourceExcerpt: "An agent uploaded a file without asking the user." },
    ] } as unknown as GeneratedCreativeBrief;
const draft: GeneratedCreativeDraft = { concept: "Reports about an agent", caption: "The company disclosed six reports.", altText: "A three-card explanation", hashtags: [], narrativeRationale: oldPlan.rationale,
    units: oldPlan.slides.map((slide, index) => ({ id: `slide-${index}`, order: index + 1, type: "carousel-slide", role: index === 0 ? "cover" : index === 2 ? "conclusion" : "content", editorialGoal: slide.editorialGoal, viewerQuestion: slide.viewerQuestion, headline: index === 0 ? "The company disclosed six reports" : index === 1 ? "An agent uploaded a file without asking" : "The reports describe agent behaviour", body: brief.keyFacts[index === 1 ? 1 : 0].statement, visualDirection: "A conceptual file diagram.", factIds: slide.allowedFactIds, characterIds: [], assetRequest: "generated-image", aspectRatio: "4:5", ...(index < 2 ? { continuationCue: index === 0 ? "What did the agent do?" : "What boundary did it cross?" } : { ctaQuestion: "Follow for explanations of AI agent actions and permission boundaries." }) })),
    qualityReview: { status: "needs-review", scores: { ...CREATIVE_QUALITY_THRESHOLDS, hook: 70 }, issues: [{ code: "BURIED_HOOK", severity: "warning", unitOrder: 1, message: "The concrete action is buried in slide two." }], repairPasses: 0, critic: { provider: "openai", model: "terra-test" } } };
const options = { openAiApiKey: "test", openAiEditorialModels: { criticModel: "terra-test", structuralRepairModel: "terra-test", severeRepairModel: "sol-test" }, brief, format: "carousel", profile: { name: "Test", language: "English", conversionGoal: "followers", brandPersonality: [], brandOverlay: { enabled: false } }, topic: { name: "Test" }, characterRoster: [], outputAspectRatio: "4:5" };
function harness(response: unknown | ((input: Record<string, unknown>, attempt: number) => unknown)) {
    const calls: string[] = [];
    const exports = {} as {
        preflight: (brief: GeneratedCreativeBrief, options: unknown) => Promise<{
            brief: GeneratedCreativeBrief; usage: CreativeAiUsage;
        }>;
        repair: (...args: unknown[]) => Promise<{
            draft: GeneratedCreativeDraft;
        }>;
        recover: (...args: unknown[]) => Promise<{draft: GeneratedCreativeDraft}>;
        parsePlan: (value: unknown, ids: Set<string>, goal: string, defer?: boolean) => CarouselPlan;
        setReviewer: (fn: (options: {
            currentDraft: GeneratedCreativeDraft;
            brief: GeneratedCreativeBrief;
        }) => Promise<unknown>) => void;
    };
    const source = readFileSync(new URL("./gemini-creative-content-generator.ts", import.meta.url), "utf8");
    const code = ts.transpileModule(source + '\nexports.preflight=reviewNarrativePlan;exports.repair=repairAndVerifyEditorialDraft;exports.recover=recoverCreativeDraft;exports.parsePlan=parseCarouselPlan;exports.setReviewer=fn=>{runOpenAiEditorialQualityGate=fn;};', { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
    vm.runInNewContext(code, { exports, Date, Error, AbortController, AbortSignal, Buffer, Map, Set, JSON, setTimeout, clearTimeout, console,
        require: (name: string) => name === "server-only" ? {} : name === "./openai-structured-response" ? { generateOpenAiStructuredResponse: async (input: {
                schemaName: string;
            }) => { calls.push(input.schemaName); return { text: JSON.stringify(typeof response === "function" ? response(input, calls.length) : response), usage }; } } : requireLocal(name) });
    return { api: exports, calls };
}
test("preflight keeps a sound plan without silently accepting proposed changes", async () => {
    const { api, calls } = harness({ decision: "keep", reason: "Each step adds evidence.", angle: "changed", hook: "changed", plan: newPlan });
    const result = await api.preflight(brief, options);
    assert.equal(result.brief.hook, brief.hook);
    assert.deepEqual(result.brief.carouselPlan?.slides, oldPlan.slides);
    assert.equal(result.brief.carouselPlan?.review?.decision, "keep");
    await api.preflight(result.brief, options);
    assert.equal(calls.length, 1, "saved preflight is not paid again");
});
test("preflight revises assignments once while preserving original plan and every evidence field", async () => {
    const { api } = harness({ decision: "revise", reason: "Move the concrete example to the opening.", angle: "Permission boundary", hook: "An agent uploaded a file without asking", plan: newPlan });
    const result = await api.preflight(brief, options);
    assert.equal(result.brief.carouselPlan?.slides[0].allowedFactIds[0], "fact-2");
    assert.deepEqual(result.brief.keyFacts, brief.keyFacts);
    assert.deepEqual(result.brief.carouselPlan?.review?.original.plan, oldPlan);
    assert.equal(brief.carouselPlan?.slides[0].allowedFactIds[0], "fact-1");
});
test("invented fact IDs in a revised plan are rejected, never repaired into plausible IDs", async () => {
    const invalid = structuredClone(newPlan);
    invalid.slides[0].allowedFactIds = ["invented"];
    const { api } = harness({ decision: "revise", reason: "New plan", angle: "New", hook: "New", plan: invalid });
    await assert.rejects(api.preflight(brief, options), /unknown fact ID/);
});
test("structural repair reassigns approved facts, retains history, and audits the revised plan", async () => {
    const revised = { ...structuredClone(draft), narrativeRationale: newPlan.rationale, units: draft.units.map((unit, index) => ({ ...unit, ...newPlan.slides[index], factIds: newPlan.slides[index].allowedFactIds, headline: index === 0 ? "An agent uploaded a file without asking" : index === 1 ? "The company disclosed six reports" : "The agent acted without asking the user", body: brief.keyFacts[index === 1 ? 0 : 1].statement })) };
    const { api, calls } = harness({ reason: "The action belongs on the cover.", angle: "Permission boundary", hook: revised.units[0].headline, plan: newPlan, draft: revised });
    api.setReviewer(async ({ currentDraft, brief: resolved }) => {
        calls.push("audit");
        assert.equal(resolved.carouselPlan?.slides[0].allowedFactIds[0], "fact-2");
        return { draft: { ...currentDraft, qualityReview: { ...draft.qualityReview, status: "accepted", issues: [], scores: CREATIVE_QUALITY_THRESHOLDS } }, usage };
    });
    const result = await api.repair(draft, options, Date.now() + 480000, async () => { });
    assert.deepEqual(calls, ["creative_narrative_replan", "audit"]);
    assert.equal(result.draft.narrativeRevision?.previousDraft.units[0].headline, draft.units[0].headline);
    assert.equal(result.draft.editorialRepair?.terraAttempts, 1);
    assert.equal(result.draft.editorialRepair?.narrativeReplanAttempted, true);
    assert.equal(result.draft.units[0].id, draft.units[0].id);
    assert.equal(resolveNarrativeBrief(brief, result.draft).carouselPlan?.slides[0].allowedFactIds[0], "fact-2");
    assert.throws(() => resolveNarrativeBrief({ ...brief, keyFacts: [{ ...brief.keyFacts[0], statement: "Changed evidence" }, brief.keyFacts[1]] }, result.draft), /different evidence/);
});
test("evidence binding is stable across object-key order and exact repetition has concrete findings", () => {
    assert.equal(narrativeEvidenceKey(brief), narrativeEvidenceKey({ ...brief, keyFacts: brief.keyFacts.map(f => ({ sourceExcerpt: f.sourceExcerpt, statement: f.statement, id: f.id })) }));
    const repeated = structuredClone(draft);
    repeated.units[0].body = repeated.units[0].headline;
    repeated.units[0].body = "The company disclosed several reports about unexpected behaviour in its agents.";
    repeated.units[2].body = repeated.units[0].body;
    assert.ok(narrativeRepetitionIssues(repeated).some(issue => issue.code === "PLAN_REPETITIVE_CLOSING"));
});

test("a rejected reviewer plan is repaired with its exact response and shared policy, without rewriting evidence", async () => {
    const invalid: CarouselPlan = {...newPlan, slideCount: 4, slides: [newPlan.slides[0], newPlan.slides[1], newPlan.slides[1], newPlan.slides[2]]};
    const {api, calls} = harness((input: Record<string, unknown>, attempt: number) => {
        const contents = input.contents as {facts: unknown; carouselNarrativePolicy: {rules: string[]}; previousResponse?: string; validationFeedback?: {reason: string}[]};
        assert.deepEqual(contents.facts, brief.keyFacts);
        assert.ok(contents.carouselNarrativePolicy.rules.some(rule => rule.toLowerCase().includes("consecutive")));
        if (attempt === 2) {
            assert.deepEqual(JSON.parse(contents.previousResponse!).plan, invalid);
            assert.match(contents.validationFeedback![0].reason, /slides 2 and 3 reuse evidence/);
        }
        return {decision: "revise", reason: "Each slide has distinct evidence.", angle: brief.angle, hook: brief.hook, plan: attempt === 1 ? invalid : newPlan};
    });
    const result = await api.preflight(brief, options);
    assert.equal(calls.length, 2);
    assert.equal(result.usage.totalTokens, 4);
    assert.equal(result.brief.carouselPlan?.review?.repairAttempts?.terra, 2);
    assert.equal(result.brief.carouselPlan?.slideCount, 3);
    assert.deepEqual(result.brief.keyFacts, brief.keyFacts);
});

test("planning escalates within the shared four-attempt allowance and records the failed proposals", async () => {
    const models: unknown[] = [];
    const {api, calls} = harness((input: Record<string, unknown>, attempt: number) => {
        models.push(input.model);
        return attempt < 4 ? {decision: "invalid"} : {decision: "revise", reason: "Move the example first.", angle: brief.angle, hook: brief.hook, plan: newPlan};
    });
    const result = await api.preflight(brief, options);
    assert.deepEqual(models, ["terra-test", "terra-test", "sol-test", "sol-test"]);
    assert.equal(result.brief.carouselPlan?.review?.repairAttempts?.terra, 2);
    assert.equal(result.brief.carouselPlan?.review?.repairAttempts?.sol, 2);
    assert.equal(result.brief.carouselPlan?.review?.rejectedAttempts?.length, 3);
    await api.preflight(result.brief, options);
    assert.equal(calls.length, 4);
});

test("keep cannot approve an invalid original plan and quota failures do not trigger editorial retries", async () => {
    const invalid = {...brief, carouselPlan: {...newPlan, slideCount: 4 as const, slides: [newPlan.slides[0], newPlan.slides[1], newPlan.slides[1], newPlan.slides[2]]}};
    const service = harness({decision: "keep", reason: "Keep", angle: brief.angle, hook: brief.hook, plan: newPlan});
    await assert.rejects(service.api.preflight(invalid, options), /Terra 2\/2 and Sol 2\/2[\s\S]*slides 2 and 3/);
    assert.equal(service.calls.length, 4);
    const outage = harness(() => { throw new Error("Quota exhausted"); });
    await assert.rejects(outage.api.preflight(brief, options), /Quota exhausted/);
    assert.equal(outage.calls.length, 1);
});

test("a structurally valid revision cannot invent numbers in the hook", async () => {
    const service = harness({decision: "revise", reason: "New hook", angle: brief.angle, hook: "The company disclosed 999 reports", plan: newPlan});
    await assert.rejects(service.api.preflight(brief, options), /999/);
    assert.equal(service.calls.length, 4);
});

test("only an explicit preflight boundary defers structural errors; keep still cannot bypass them", async () => {
    const invalid = {...newPlan, slideCount: 4 as const, slides: [newPlan.slides[0], newPlan.slides[1], newPlan.slides[1], newPlan.slides[2]]};
    const {api} = harness({decision: "revise", reason: "Remove the duplicate middle slide.", angle: brief.angle, hook: brief.hook, plan: newPlan});
    const ids = new Set(brief.keyFacts.map(f => f.id));
    assert.throws(() => api.parsePlan(invalid, ids, "followers"), /reuse evidence/);
    const pending = api.parsePlan(invalid, ids, "followers", true);
    const result = await api.preflight({...brief, carouselPlan: pending}, options);
    assert.equal(result.brief.carouselPlan?.slideCount, 3);
    assert.throws(() => api.parsePlan({...invalid, slideCount: 99}, ids, "followers", true), /invalid carousel slide count/);
});

for (const current of [true, false]) test(`recovery reuses only a confirmed current independent review; current=${current}`, async () => {
    const saved = {...draft, editorialRepair: {terraAttempts: 2, solAttempts: 2, pendingVerification: false}};
    const {api, calls} = harness(() => assert.fail("Exhausted drafts must not be rewritten"));
    let audits = 0;
    api.setReviewer(async ({currentDraft}) => { audits++; return {draft: currentDraft, usage}; });
    const result = await api.recover({...options, currentDraft: saved, currentReviewIsCurrent: current,
        checkpoint: {stage: "patched", draft: saved, usage}, onCheckpoint: async () => {}});
    assert.equal(audits, current ? 0 : 1);
    assert.equal(calls.length, 0);
    assert.equal(result.draft.units[0].headline, saved.units[0].headline);
});
