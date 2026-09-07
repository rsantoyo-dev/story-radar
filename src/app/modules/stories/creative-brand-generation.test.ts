import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { createHash } from "node:crypto";
import { brandReferencePrompt, enforceBrandReferencePrompt, decodeGenerationReferences, type BrandGenerationReference } from "./creative-brand-generation";

const body = new Uint8Array([1, 2, 3]);
const reference: BrandGenerationReference = {
  id: "brand", topicId: "topic", version: 1, configVersion: 1, function: "motif", reason: "stickers",
  name: "St Jean", objectKey: "private/key", sha256: createHash("sha256").update(body).digest("hex"),
  fileName: "sheet.webp", contentType: "image/webp", contribution: { aspects: ["motif"], guidance: "paper stickers", avoid: "copying headlines" },
};
function harness(overrides: Record<string, unknown> = {}) {
  let reads = 0;
  const row = { ...reference, isActive: true, activatedForJourney: true, providerTransmissionAllowed: true, ...overrides };
  const exports: Record<string, (...args: unknown[]) => Promise<unknown>> = {};
  const compiled = ts.transpileModule(readFileSync(new URL("./resolve-brand-generation.ts", import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(compiled, { exports, Buffer, AbortSignal, require: (id: string) => {
    if (id === "server-only") return {};
    if (id === "node:crypto") return { createHash };
    if (id === "./creative-brand-references.repository") return { findCreativeBrandReference: async (topic: string) => topic === "topic" ? row : undefined };
    if (id === "./creative-brand-reference-metadata") return { parseCreativeBrandContribution: (x: unknown) => x, brandContributionIsConfigured: () => true };
    if (id === "./select-brand-references") return { getBrandReferenceSelectionBudget: () => ({ maxPerUnit: 2, maxUnitReferenceImages: 4 }) };
    if (id === "./r2-storage") return { readPrivateR2ImageFile: async () => { reads++; return new File([body], "sheet.webp"); } };
    throw new Error(id);
  }});
  return { api: exports, reads: () => reads };
}

test("legacy character snapshots and new brand envelopes remain separate", () => {
  assert.deepEqual(decodeGenerationReferences([]).brand, []);
  const envelope = { schema: 1 as const, characters: [], brand: [reference] };
  assert.equal(decodeGenerationReferences(envelope), envelope);
  assert.throws(() => decodeGenerationReferences({ schema: 2 }));
});
test("prompt maps real image positions without leaking private storage", () => {
  const prompt = brandReferencePrompt([reference], 2);
  assert.match(prompt, /"image":3/);
  assert.match(prompt, /paper stickers/);
  assert.doesNotMatch(prompt, /private\/key/);
  assert.equal(brandReferencePrompt([], 0), "");
});
test("resolves selected snapshots only in their topic and version", async () => {
  const { api } = harness();
  const resolved = await api.resolveBrandGenerationReferences("topic", { selected: [reference] }) as BrandGenerationReference[];
  assert.equal(resolved[0].sha256, reference.sha256);
  await assert.rejects(api.resolveBrandGenerationReferences("other", { selected: [reference] }));
  await assert.rejects(harness({ configVersion: 2 }).api.resolveBrandGenerationReferences("topic", { selected: [reference] }));
});
test("loads actual bytes, keeping frozen guidance when live guidance changes", async () => {
  const { api, reads } = harness({ configVersion: 2 });
  const files = await api.loadBrandGenerationImages([reference], 1) as File[];
  assert.equal(files.length, 1);
  assert.equal(reads(), 1);
  assert.deepEqual(new Uint8Array(await files[0].arrayBuffer()), body);
});
test("revoked permission and combined reference budget fail before reading files", async () => {
  for (const overrides of [{ providerTransmissionAllowed: false }, { isActive: false }, { activatedForJourney: false }]) {
    const { api, reads } = harness(overrides);
    await assert.rejects(api.loadBrandGenerationImages([reference], 1));
    assert.equal(reads(), 0);
  }
  const { api, reads } = harness();
  await assert.rejects(api.loadBrandGenerationImages([reference], 4));
  assert.equal(reads(), 0);
});
test("modified original bytes are rejected", async () => {
  const invalid = { ...reference, sha256: "mismatch" };
  await assert.rejects(harness({ sha256: "mismatch" }).api.loadBrandGenerationImages([invalid], 0));
});

test("regeneration keeps edits after the stored brand contract and restores its frozen guidance", () => {
  const original = "Story prompt" + brandReferencePrompt([reference], 1);
  const next = enforceBrandReferencePrompt(original + "\nMake the background lighter", [reference], 1);
  assert.match(next, /Make the background lighter/);
  assert.equal(next.match(/BRAND VISUAL REFERENCES v1/g)?.length, 1);
});
