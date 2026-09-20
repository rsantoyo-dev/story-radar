import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import ts from 'typescript';
import type { GeneratedCreativeDraft } from './creative-content.types';
import { CREATIVE_QUALITY_THRESHOLDS } from './creative-quality';
const localRequire = createRequire(import.meta.url);
const source = readFileSync(new URL('./gemini-creative-content-generator.ts', import.meta.url), 'utf8');
const code = ts.transpileModule(source + '\nexports.targeted = repairAndVerifyEditorialDraft; exports.setReviewer = fn => {runOpenAiEditorialQualityGate = fn;};', { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
const draft: GeneratedCreativeDraft = { concept: 'A form-filling agent', caption: 'The company says its agent can fill forms.', altText: 'A form illustration', hashtags: [], callToAction: 'Follow for explanations of AI tools and their limits.', units: [{ order: 1, type: 'meme-frame', aspectRatio: '4:5', role: 'cover', headline: 'An agent that fills forms', body: 'The company says its agent can fill forms.', factIds: ['fact-1'], visualDirection: 'An abstract form illustration.', characterIds: [], assetRequest: 'generated-image' }], qualityReview: { status: 'needs-review', scores: { ...CREATIVE_QUALITY_THRESHOLDS, hook: 90 }, issues: [{ code: 'WEAK_HOOK', severity: 'warning', unitOrder: 1, message: 'The supported capability should be immediately clear.' }], repairPasses: 0, critic: { provider: 'openai', model: 'terra-test' } } };
for (const malicious of [false, true])
    test(`targeted generator preserves evidence and verifies only validated patches; invalid=${malicious}`, async () => {
        const calls: string[] = [], checkpoints: GeneratedCreativeDraft[] = [];
        const exports = {} as {
            targeted: (...args: unknown[]) => Promise<{
                draft: GeneratedCreativeDraft;
            }>;
            setReviewer: (fn: (args: {
                readOnly: boolean;
                currentDraft: GeneratedCreativeDraft;
                models: {
                    criticModel: string;
                };
            }) => Promise<unknown>) => void;
        };
        vm.runInNewContext(code, { exports, Date, Error, AbortController, AbortSignal, Buffer, Map, Set, JSON, setTimeout, clearTimeout, console,
            require: (name: string) => {
                if (name === 'server-only')
                    return {};
                if (name === './openai-structured-response')
                    return { generateOpenAiStructuredResponse: async (options: {
                            model: string;
                            contents: {
                                editableScopes: number[];
                            };
                        }) => {
                            calls.push(options.model);
                            assert.equal(options.contents.editableScopes.join(','), '1');
                            return { text: JSON.stringify({ patches: [{ unitOrder: 1, field: malicious ? 'factIds' : 'headline', text: malicious ? 'invented-fact' : 'This agent can fill your forms' }] }), usage: { promptTokens: 1, outputTokens: 1, thoughtsTokens: 0, totalTokens: 2 } };
                        } };
                return localRequire(name);
            },
        });
        exports.setReviewer(async (options) => {
            calls.push('audit');
            assert.equal(options.readOnly, true);
            assert.equal(options.models.criticModel, 'terra-test');
            assert.equal(options.currentDraft.units[0].factIds.join(','), 'fact-1');
            assert.ok(options.currentDraft.qualityReview?.issues.some(i => i.code === 'FINAL_COPY_REVIEW_REQUIRED'));
            return { draft: { ...options.currentDraft, qualityReview: { ...draft.qualityReview, status: 'accepted', scores: CREATIVE_QUALITY_THRESHOLDS, issues: [] } }, usage: { promptTokens: 1, outputTokens: 1, thoughtsTokens: 0, totalTokens: 2 } };
        });
        const result = await exports.targeted(structuredClone(draft), {
            openAiApiKey: 'test', openAiEditorialModels: { criticModel: 'terra-test', structuralRepairModel: 'terra-test', severeRepairModel: 'sol-test' },
            brief: { keyFacts: [{ id: 'fact-1', statement: 'The company says its agent can fill forms.', sourceExcerpt: 'The company says its agent can fill forms.' }] },
            format: 'meme', topic: { name: 'AI tools' }, profile: { language: 'English', conversionGoal: 'followers' }, characterRoster: [], outputAspectRatio: '4:5',
        }, Date.now() + 480000, async (value: GeneratedCreativeDraft) => { checkpoints.push(value); });
        assert.equal(result.draft.units[0].factIds.join(','), 'fact-1');
        assert.equal(result.draft.units[0].visualDirection, draft.units[0].visualDirection);
        if (malicious) {
            assert.deepEqual(calls, ['terra-test', 'terra-test', 'sol-test', 'sol-test']);
            assert.match(result.draft.editorialRepair?.lastPatchRejection?.reason ?? '', /field|patch/i);
            assert.equal(result.draft.units[0].headline, draft.units[0].headline);
            assert.notEqual(result.draft.qualityReview?.status, 'accepted');
        }
        else {
            assert.deepEqual(calls, ['terra-test', 'audit']);
            assert.equal(result.draft.qualityReview?.status, 'accepted');
            assert.equal(result.draft.units[0].headline, 'This agent can fill your forms');
        }
        assert.ok(checkpoints.length >= 2);
    });
