import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import ts from "typescript";
import * as cost from "./creative-text-cost";
import * as usageAttribution from "../credits/usage-attribution";
const requireLocal = createRequire(import.meta.url);
function fixture(rejectReservation = false) {
    const calls: {
        reserved: number;
        limit: number;
    }[] = [], settlements: (number | null)[] = [], recorded: { costMicros: number | null; operation: string }[] = [];
    const exports = {} as typeof import("./creative-text-meter");
    vm.runInNewContext(ts.transpileModule(readFileSync(new URL('./creative-text-meter.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, {
        exports, Buffer, Date, Error, require: (name: string) => {
            if (name.startsWith('node:'))
                return requireLocal(name);
            if (name === '../credits/usage-attribution')
                return usageAttribution;
            if (name === '../credits/usage-recorder')
                return { recordAttributedUsage: async (charge: { costMicros: number | null; operation: string }) => { recorded.push(charge); } };
            if (name === './creative-text-cost')
                return { ...cost, textRate: () => ({ input: 1, output: 2, cached: 0, version: 'test' }) };
            if (name === './creative-text-accounting.repository')
                return {
                    reserveTextCall: async (input: {
                        reserved: number;
                        limit: number;
                    }) => { calls.push(input); if (rejectReservation)
                        throw new cost.CreativeTextBudgetError('Budget exhausted'); },
                    finishTextCall: async (_id: string, _context: unknown, value: number | null) => settlements.push(value),
                };
            throw new Error(name);
        },
    });
    return { api: exports, calls, settlements, recorded };
}
const context = { topicId: 'topic', storyId: 'story', runId: 'run' };
const input = { provider: 'openai', model: 'test', operation: 'test', payload: { text: 'private' }, maxOutputTokens: 100 };
const usage = { promptTokens: 100, outputTokens: 50, thoughtsTokens: 20, totalTokens: 150 };
test('no scope leaves unrelated provider workflows untouched', async () => {
    const { api, calls } = fixture();
    assert.equal(await api.meterCreativeText(input, async () => 42, () => undefined), 42);
    assert.equal(calls.length, 0);
});
test('budget is reserved before the provider is invoked', async () => {
    const { api, calls, settlements } = fixture(true);
    let requests = 0;
    await assert.rejects(api.withCreativeTextBudget(context, () => api.meterCreativeText(input, async () => { requests++; return usage; }, v => v)), cost.CreativeTextBudgetError);
    assert.equal(requests, 0);
    assert.equal(calls.length, 1);
    assert.equal(settlements.length, 0);
});
test('actual usage settles the maximum reservation once, including cached input', async () => {
    const { api, calls, settlements } = fixture();
    await api.withCreativeTextBudget(context, () => api.meterCreativeText(input, async () => usage, v => ({ ...v, cachedInputTokens: 50 })));
    assert.ok(calls[0].reserved > 150);
    assert.deepEqual(settlements, [150]);
});
test('timeouts and missing usage retain reservations; explicit rejection releases it', async () => {
    for (const [error, expected] of [[new Error('timeout'), null], [Object.assign(new Error('quota'), { status: 429 }), 0], [Object.assign(new Error('parse'), { usage }), 200]] as const) {
        const { api, settlements } = fixture();
        await assert.rejects(api.withCreativeTextBudget(context, () => api.meterCreativeText(input, async () => { throw error; }, () => undefined)));
        assert.deepEqual(settlements, [expected]);
    }
    const { api, settlements } = fixture();
    await api.withCreativeTextBudget(context, () => api.meterCreativeText(input, async () => 42, () => undefined));
    assert.deepEqual(settlements, [null]);
});
test('outside Creative Studio, a finished call is recorded once as attributed usage; a self-metered call is not', async () => {
    const { api, calls, recorded } = fixture();
    await usageAttribution.withUsageAttribution({ topicId: 'topic' }, async () => {
        await api.meterCreativeText(input, async () => 1, () => usage);
        await api.meterCreativeText({ ...input, selfMetered: true }, async () => 2, () => usage);
        await api.meterCreativeText(input, async () => 3, () => undefined);
    });
    assert.equal(calls.length, 0, 'no Story budget is reserved outside the studio');
    // 100 input tokens at 1 + 50 output tokens at 2 micros each; reasoning is not extra for this rate.
    assert.deepEqual(recorded.map((charge) => [charge.operation, charge.costMicros]), [['test', 200]]);
});
test('the Creative Studio scope also attributes non-text spend to its Topic and Story', async () => {
    const { api } = fixture();
    const seen = await api.withCreativeTextBudget(context, async () => usageAttribution.currentUsageAttribution());
    assert.deepEqual({ ...seen }, { topicId: 'topic', storyId: 'story' });
});
