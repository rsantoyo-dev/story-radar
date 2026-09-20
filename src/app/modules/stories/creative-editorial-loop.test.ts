import assert from 'node:assert/strict';
import test from 'node:test';
import { runEditorialRepairLoop } from './creative-editorial-loop';
import { CREATIVE_QUALITY_THRESHOLDS, creativeQualityThresholdFailures } from './creative-quality';
import type { GeneratedCreativeDraft, CreativeAiUsage } from './creative-content.types';
const usage: CreativeAiUsage = { promptTokens: 1, outputTokens: 1, thoughtsTokens: 0, totalTokens: 2 };
const makeDraft = (hook = 80): GeneratedCreativeDraft => ({ concept: 'A supported finding', caption: 'Original caption', altText: 'Cards', hashtags: [], units: [], qualityReview: { status: hook >= 96 ? 'accepted' : 'needs-review', scores: { ...CREATIVE_QUALITY_THRESHOLDS, hook }, issues: hook >= 96 ? [] : [{ code: 'QUALITY_HOOK_BELOW_THRESHOLD', severity: 'warning', unitOrder: 1, message: 'Hook lacks tension' }], repairPasses: 0, critic: { provider: 'openai', model: 'reviewer' } } });
test('hook requires strictly over 95; every applicable editorial dimension requires 95 and facts 98', () => {
    assert.equal(creativeQualityThresholdFailures({ ...CREATIVE_QUALITY_THRESHOLDS }, 'carousel', true).length, 0);
    for (const key of Object.keys(CREATIVE_QUALITY_THRESHOLDS) as (keyof typeof CREATIVE_QUALITY_THRESHOLDS)[]) {
        const failures = creativeQualityThresholdFailures({ ...CREATIVE_QUALITY_THRESHOLDS, [key]: CREATIVE_QUALITY_THRESHOLDS[key] - 1 }, 'carousel', true);
        assert.ok(failures.some(issue => issue.code === `QUALITY_${key.toUpperCase()}_BELOW_THRESHOLD`), key);
    }
});
test('an accepted initial draft makes no repair calls', async () => {
    const result = await runEditorialRepairLoop({ draft: makeDraft(96), canContinue: () => true, checkpoint: async () => assert.fail(), patch: async () => assert.fail(), verify: async () => assert.fail() });
    assert.equal(result.draft.qualityReview?.status, 'accepted');
});
test('up to two Terra and two Sol patches, each separately verified; counts persist before calls', async () => {
    const calls: string[] = [], checkpoints: GeneratedCreativeDraft[] = [];
    let hook = 80;
    const result = await runEditorialRepairLoop({ draft: makeDraft(), canContinue: () => true,
        checkpoint: async (draft) => { checkpoints.push(structuredClone(draft)); },
        patch: async (draft, tier) => { calls.push(tier); assert.equal(checkpoints.at(-1)?.editorialRepair?.[tier === 'terra' ? 'terraAttempts' : 'solAttempts'], tier === 'terra' ? calls.filter(c => c === 'terra').length : calls.filter(c => c === 'sol').length); return { draft: { ...draft, caption: draft.caption + ' corrected' }, usage }; },
        verify: async (draft) => { calls.push('verify'); hook += 4; return { draft: { ...makeDraft(hook), caption: draft.caption }, usage }; },
    });
    assert.deepEqual(calls, ['terra', 'verify', 'terra', 'verify', 'sol', 'verify', 'sol', 'verify']);
    assert.equal(result.draft.qualityReview?.status, 'accepted');
    assert.equal(result.usage.totalTokens, 16);
    assert.equal(result.draft.editorialRepair?.terraAttempts, 2);
    assert.equal(result.draft.editorialRepair?.solAttempts, 2);
});
test('regression keeps the verified copy and escalates without exhausting the cheaper tier', async () => {
    const calls: string[] = [];
    const result = await runEditorialRepairLoop({ draft: makeDraft(), canContinue: () => true, checkpoint: async () => { },
        patch: async (draft, tier) => { calls.push(tier); assert.equal(draft.caption, 'Original caption'); return { draft: { ...draft, caption: tier }, usage }; },
        verify: async (draft) => ({ draft: { ...makeDraft(draft.caption === 'terra' ? 70 : 96), caption: draft.caption }, usage }),
    });
    assert.deepEqual(calls, ['terra', 'sol']);
    assert.equal(result.draft.caption, 'sol');
    assert.equal(result.draft.editorialRepair?.terraAttempts, 1);
});
test('critic outage resumes verification without repeating the saved patch', async () => {
    let patches = 0;
    let saved: GeneratedCreativeDraft | undefined;
    const input = { draft: makeDraft(), canContinue: () => true, checkpoint: async (draft: GeneratedCreativeDraft) => { saved = structuredClone(draft); },
        patch: async (draft: GeneratedCreativeDraft) => { patches++; return { draft: { ...draft, caption: 'Corrected' }, usage }; },
        verify: async (draft: GeneratedCreativeDraft) => ({ draft, usage, unavailable: true }),
    };
    const first = await runEditorialRepairLoop(input);
    assert.equal(first.draft.editorialRepair?.pendingVerification, true);
    const resumed = await runEditorialRepairLoop({ ...input, draft: saved!, verify: async (draft) => ({ draft: { ...makeDraft(96), caption: draft.caption }, usage }) });
    assert.equal(patches, 1);
    assert.equal(resumed.draft.qualityReview?.status, 'accepted');
    assert.equal(resumed.draft.caption, 'Corrected');
});
test('budget/provider failures preserve copy and consume the reserved attempt', async () => {
    const result = await runEditorialRepairLoop({ draft: makeDraft(), canContinue: () => true, checkpoint: async () => { }, patch: async () => { throw new Error('Budget exhausted'); }, verify: async () => assert.fail() });
    assert.equal(result.draft.caption, 'Original caption');
    assert.equal(result.draft.editorialRepair?.terraAttempts, 1);
    assert.equal(result.draft.qualityReview?.status, 'needs-review');
    assert.match(result.draft.editorialRepair?.stopReason ?? '', /Budget/);
});
test('exhausted persisted attempts cannot restart by resuming the draft', async () => {
    const draft = { ...makeDraft(), editorialRepair: { terraAttempts: 2, solAttempts: 2, pendingVerification: false } };
    const result = await runEditorialRepairLoop({ draft, canContinue: () => true, checkpoint: async () => { }, patch: async () => assert.fail(), verify: async () => assert.fail() });
    assert.match(result.draft.editorialRepair?.stopReason ?? '', /Terra 2\/2 attempts; Sol 2\/2 attempts/);
});
test('no-op corrections escalate once, then stop without needless verification', async () => {
    const calls: string[] = [];
    const result = await runEditorialRepairLoop({ draft: makeDraft(), canContinue: () => true, checkpoint: async () => { }, patch: async (draft, tier) => { calls.push(tier); return { draft, usage }; }, verify: async () => assert.fail() });
    assert.deepEqual(calls, ['terra', 'sol']);
    assert.equal(result.draft.qualityReview?.status, 'needs-review');
});

test("invalid patches get a bounded follow-up with persisted diagnostic feedback", async () => {
    const calls: string[] = [];
    const result = await runEditorialRepairLoop({draft: makeDraft(), canContinue: () => true, checkpoint: async () => {},
        patch: async (draft, tier) => {
            calls.push(tier);
            if(calls.length === 2) assert.equal(draft.editorialRepair?.lastPatchRejection?.reason, "Unsupported field");
            return {draft, usage, rejectionReason: "Unsupported field"};
        }, verify: async () => assert.fail("Rejected copy must not reach the critic")});
    assert.deepEqual(calls, ["terra", "terra", "sol", "sol"]);
    assert.match(result.draft.editorialRepair?.stopReason ?? "", /Unsupported field/);
    assert.match(result.draft.editorialRepair?.stopReason ?? "", /hook 80\/96/);
    assert.equal(result.draft.caption, "Original caption");
});

test("legacy silent patch failures may use remaining attempts without resetting their counters", async () => {
    const calls: string[] = [];
    const draft = {...makeDraft(), editorialRepair: {terraAttempts:1, solAttempts:1, terraStopped:true, solStopped:true, pendingVerification:false, stopReason:"The editorial target remains unmet after the bounded Terra/Sol repair attempts."}};
    const result = await runEditorialRepairLoop({draft, canContinue:()=>true, checkpoint:async()=>{},
        patch:async(draft,tier)=>{calls.push(tier);return {draft,usage};}, verify:async()=>assert.fail()});
    assert.deepEqual(calls,["terra","sol"]);
    assert.equal(result.draft.editorialRepair?.terraAttempts,2);
    assert.equal(result.draft.editorialRepair?.solAttempts,2);
    await runEditorialRepairLoop({draft:result.draft,canContinue:()=>true,checkpoint:async()=>{},patch:async()=>assert.fail("Exhausted attempts cannot restart"),verify:async()=>assert.fail()});
});

test("invalid structural proposals use remaining repair slots without falling back to incompatible copy patches", async () => {
    const draft=makeDraft();draft.qualityReview!.issues=[{code:'BURIED_HOOK',severity:'warning',unitOrder:1,message:'Strong detail appears too late.'}];
    let replans=0,patches=0;
    const run=(value:GeneratedCreativeDraft)=>runEditorialRepairLoop({draft:value,canContinue:()=>true,checkpoint:async()=>{},
      replan:async(current)=>{replans++;return {draft:current,usage,rejectionReason:'Plan invalid'};},
      patch:async(current)=>{patches++;return {draft:current,usage};},verify:async()=>assert.fail()});
    const result=await run(draft);
    assert.equal(replans,4);assert.equal(patches,0);assert.equal(result.draft.editorialRepair?.terraAttempts,2);
    await run(result.draft);assert.equal(replans,4);
});
