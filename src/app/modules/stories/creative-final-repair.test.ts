import assert from "node:assert/strict";
import test from "node:test";
import { applyFinalCreativePatches, repairRemainingCreativeBlockers } from "./creative-final-repair";
import { deterministicCreativeQualityIssues, repairDeterministicCreativeCopy } from "./creative-quality";
import type { GeneratedCreativeDraft, CreativeKeyFact } from "./creative-content.types";

const facts: CreativeKeyFact[] = [{
  id: "fact-1",
  statement: "Recent immigrants can work outside their field of study.",
  sourceExcerpt: "Recent immigrants can work outside their field of study.",
}];
const context = {
  format: "carousel" as const, keyFacts: facts, language: "Spanish",
  conversionGoal: "followers" as const, framingStrategy: "reader-consequence" as const,
  topic: { name: "Canada en Breve" },
};
const usage = { promptTokens: 10, outputTokens: 20, thoughtsTokens: 5, totalTokens: 35 };
const specificCta = "Síguenos para entender los datos sobre empleo y formación de inmigrantes en Canadá.";
function fixture(): GeneratedCreativeDraft {
  return {
    concept: "El empleo y la formación de inmigrantes en Canadá",
    caption: "El empleo de inmigrantes recientes puede no estar relacionado con su formación.",
    altText: "Dos tarjetas sobre empleo y formación.", hashtags: [],
    units: [
      { order: 1, type: "carousel-slide", role: "cover", editorialGoal: "hook",
        viewerQuestion: "¿El empleo corresponde a la formación?", headline: "Trabajar fuera de tu profesión",
        body: "El empleo y la formación pueden no coincidir.", continuationCue: "¿Qué muestra esto sobre el empleo?",
        visualDirection: "Tarjetas conceptuales de empleo y formación.", factIds: ["fact-1"],
        characterIds: ["jo"], aspectRatio: "4:5", assetRequest: "generated-image" },
      { order: 2, type: "carousel-slide", role: "conclusion", editorialGoal: "conclude",
        viewerQuestion: "¿Qué muestra esto sobre el empleo?", headline: "Empleo y profesión pueden diferir",
        body: "Los inmigrantes recientes pueden trabajar fuera de su campo de estudios.",
        ctaQuestion: "Síguenos para entender qué significa para ti cada novedad del tema.",
        visualDirection: "Dos tarjetas conceptuales.", factIds: ["fact-1"],
        characterIds: ["jo"], aspectRatio: "4:5", assetRequest: "generated-image" },
    ],
  };
}
const patches = (items: unknown[]) => JSON.stringify({ patches: items });
const ctaPatch = { unitOrder: 2, field: "ctaQuestion", text: specificCta };
const response = (text = patches([ctaPatch])) => ({ text, usage, provider: "google", model: "test-gemini" });
const inspect = (draft: GeneratedCreativeDraft) => deterministicCreativeQualityIssues(
  draft, context.format, facts, context.language, context.conversionGoal, context.framingStrategy,
);

test("final repair fixes the immigrant carousel CTA once without rewriting slides or evidence", async () => {
  const draft = fixture();
  const snapshot = structuredClone(draft);
  let calls = 0;
  const result = await repairRemainingCreativeBlockers(draft, context, async (contents) => {
    calls++;
    assert.equal(contents.facts, facts);
    assert.ok(!JSON.stringify(contents).includes("characterIds"));
    return response();
  });
  assert.equal(calls, 1);
  assert.equal(result.draft.units[1].ctaQuestion, specificCta);
  assert.deepEqual(result.draft.units[0], snapshot.units[0]);
  assert.deepEqual(result.draft.units[1], { ...snapshot.units[1], ctaQuestion: specificCta });
  assert.deepEqual(draft, snapshot);
  assert.deepEqual(result.usage, usage);
  assert.equal(result.draft.qualityReview?.status, "needs-review");
  assert.ok(!inspect(result.draft).some((issue) => issue.severity === "blocker"));
  assert.equal(result.draft.qualityReview?.scores.overall, 0, "Do not invent a critic score");
});

test("deterministic CTA cleanup is idempotent and the final layer supplies the missing specific CTA", async () => {
  const clean = repairDeterministicCreativeCopy(fixture(), "carousel", facts, "Spanish", "followers");
  assert.equal(clean.units[1].ctaQuestion, undefined);
  assert.deepEqual(repairDeterministicCreativeCopy(clean, "carousel", facts, "Spanish", "followers"), clean);
  const result = await repairRemainingCreativeBlockers(clean, context, async () => response());
  assert.equal(result.draft.units[1].ctaQuestion, specificCta);
});

test("a safe draft skips the final provider call", async () => {
  const draft = fixture(); draft.units[1].ctaQuestion = specificCta;
  const result = await repairRemainingCreativeBlockers(draft, context, async () => { throw new Error("must not call"); });
  assert.equal(result.draft, draft);
  assert.equal(result.usage.totalTokens, 0);
});

test("patches cannot change facts, characters, roles, order or unrequested scopes", () => {
  const draft = fixture();
  for (const field of ["factIds", "characterIds", "role", "order", "assetRequest", "__proto__"]) {
    assert.throws(() => applyFinalCreativePatches(draft, patches([{ ...ctaPatch, field }]), [2]));
  }
  assert.throws(() => applyFinalCreativePatches(draft, patches([{ ...ctaPatch, unitOrder: 1 }]), [2]));
  assert.throws(() => applyFinalCreativePatches(draft, patches([ctaPatch, ctaPatch]), [2]));
  assert.throws(() => applyFinalCreativePatches(draft, patches([{ ...ctaPatch, field: "headline", text: "" }]), [2]));
  assert.throws(() => applyFinalCreativePatches(draft, patches([{ ...ctaPatch, field: "caption", text: "x" }]), [2]));
  assert.throws(() => applyFinalCreativePatches(draft, patches([{ ...ctaPatch, field: "continuationCue" }]), [2]));
  assert.throws(() => applyFinalCreativePatches(draft, patches([{ ...ctaPatch, unitOrder: 1 }]), [1]));
  const meme = { ...draft, units: [{ ...draft.units[1], order: 1, type: "meme-frame" as const }] };
  assert.throws(() => applyFinalCreativePatches(meme, patches([{ ...ctaPatch, unitOrder: 1 }]), [1]));
});

test("new unsupported claims reject the whole patch while counting provider usage", async () => {
  const draft = fixture();
  const result = await repairRemainingCreativeBlockers(draft, context, async () => response(patches([
    ctaPatch, { unitOrder: 2, field: "body", text: "El 99% de los inmigrantes encontró empleo en 2028." },
  ])));
  assert.deepEqual(result.draft.units, draft.units);
  assert.equal(result.draft.qualityReview?.status, "rejected");
  assert.equal(result.usage.totalTokens, 70);
});

test("unavailable or malformed final repair preserves blockers without recursion", async () => {
  for (const request of [async () => { throw new Error("secret provider payload"); }, async () => response("invalid JSON")]) {
    let calls = 0;
    const draft = fixture();
    const result = await repairRemainingCreativeBlockers(draft, context, async () => { calls++; return request(); });
    assert.equal(calls, 1);
    assert.deepEqual(result.draft.units, draft.units);
    assert.equal(result.draft.qualityReview?.status, "rejected");
    assert.ok(!JSON.stringify(result.draft).includes("secret provider payload"));
  }
});

test("fixing a deterministic CTA cannot erase a separate unresolved factual critic finding", async () => {
  const draft = fixture();
  draft.qualityReview = {
    status: "rejected", repairPasses: 2,
    scores: { factuality: 90, hook: 95, curiosity: 95, swipeReward: 95, continuity: 95, relevance: 95, clarity: 95, resolution: 95, cta: 74, overall: 87 },
    issues: [...inspect(draft),
      { code: "UNSUPPORTED_INFERENCE", severity: "blocker", unitOrder: 2, message: "Independent evidence must be checked." },
      { code: "QUALITY_CTA_BELOW_THRESHOLD", severity: "warning", message: "CTA scored 74." },
      { code: "EDITORIAL_QUALITY_TARGET_NOT_MET", severity: "warning", message: "Two blockers remain." }],
  };
  const result = await repairRemainingCreativeBlockers(draft, context, async () => response());
  assert.equal(result.draft.units[1].ctaQuestion, specificCta);
  assert.equal(result.draft.qualityReview?.status, "rejected");
  assert.ok(result.draft.qualityReview?.issues.some((issue) => issue.code === "UNSUPPORTED_INFERENCE"));
  assert.equal(result.draft.qualityReview?.repairPasses, 3);
  assert.ok(!result.draft.qualityReview?.issues.some((issue) => issue.code === "EDITORIAL_QUALITY_TARGET_NOT_MET"));
  assert.match(result.draft.qualityReview?.issues.find((issue) => issue.code === "QUALITY_CTA_BELOW_THRESHOLD")?.message ?? "", /Previous critic score/);
});


test("partial headline repair gets one follow-up with the remaining CTA blocker", async () => {
  const draft = fixture();
  draft.units[1].headline = "";
  draft.units[1].ctaQuestion = undefined;
  let calls = 0;
  const result = await repairRemainingCreativeBlockers(draft, context, async (contents) => {
    calls++;
    if (calls === 1) return response(patches([
      { unitOrder: 2, field: "headline", text: "Empleo y profesión pueden diferir" },
    ]));
    assert.ok(!JSON.stringify(contents.blockers).includes("MISSING_HEADLINE"));
    assert.equal((contents.draft as GeneratedCreativeDraft).units[1].headline, "Empleo y profesión pueden diferir");
    return response();
  });
  assert.equal(calls, 2);
  assert.equal(result.draft.units[1].ctaQuestion, specificCta);
  assert.equal(result.usage.totalTokens, usage.totalTokens * 2);
  assert.equal(result.draft.qualityReview?.repairPasses, 2);
  assert.ok(!inspect(result.draft).some((issue) => issue.severity === "blocker"));
  assert.equal(draft.units[1].headline, "");
});

test("failed follow-up preserves the safe partial repair and remaining blockers", async () => {
  const draft = fixture();
  draft.units[1].headline = "";
  let calls = 0;
  const result = await repairRemainingCreativeBlockers(draft, context, async () => {
    if (++calls === 2) throw new Error("provider unavailable");
    return response(patches([{ unitOrder: 2, field: "headline", text: "Empleo y profesión pueden diferir" }]));
  });
  assert.equal(calls, 2);
  assert.equal(result.draft.units[1].headline, "Empleo y profesión pueden diferir");
  assert.equal(result.draft.qualityReview?.status, "rejected");
  assert.ok(result.draft.qualityReview?.issues.some((issue) => issue.code === "FINAL_REPAIR_UNRESOLVED"));
  assert.ok(!result.draft.qualityReview?.issues.some((issue) => issue.code === "FINAL_REPAIR_APPLIED"));
});


test("rejected first attempt feeds validator findings into a safe second attempt", async () => {
  const draft = fixture();
  let calls = 0;
  const result = await repairRemainingCreativeBlockers(draft, context, async (contents) => {
    if (++calls === 1) return response(patches([
      ctaPatch, { unitOrder: 2, field: "body", text: "El 99% de los inmigrantes encontró empleo en 2028." },
    ]));
    assert.ok(contents.previousAttempt);
    const feedback = contents.previousAttempt as { issues: unknown[]; rejectedPatches: string };
    assert.ok(feedback.issues.length > 0);
    assert.match(feedback.rejectedPatches, /99%/);
    assert.equal((contents.draft as GeneratedCreativeDraft).units[1].body, draft.units[1].body);
    return response();
  });
  assert.equal(calls, 2);
  assert.equal(result.draft.units[1].ctaQuestion, specificCta);
  assert.equal(result.draft.units[1].body, draft.units[1].body);
  assert.equal(result.usage.totalTokens, 70);
  assert.equal(result.draft.qualityReview?.status, "needs-review");
});

test("empty copy response receives one bounded follow-up without removing blockers", async () => {
  let calls = 0;
  const result = await repairRemainingCreativeBlockers(fixture(), context, async (contents) => {
    if (++calls === 2) assert.ok(contents.previousAttempt);
    return response(patches([]));
  });
  assert.equal(calls, 2);
  assert.equal(result.draft.qualityReview?.status, "rejected");
  assert.match(result.draft.qualityReview?.issues.find((i) => i.code === "FINAL_REPAIR_UNRESOLVED")?.message ?? "", /no copy changes/);
});
