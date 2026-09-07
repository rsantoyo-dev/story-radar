import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import ts from "typescript";
import sharp from "sharp";
import { createHash } from "node:crypto";
import * as metadata from "./creative-brand-reference-metadata";
const localRequire = createRequire(import.meta.url);

function load(file: string, mocks: Record<string, unknown>) {
  const exports: Record<string, (...args: never[]) => Promise<unknown>> = {};
  const code = ts.transpileModule(readFileSync(new URL(file, import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  vm.runInNewContext(code, { exports, Buffer, Date, Map, Set, JSON, AbortSignal, setTimeout, clearTimeout, console, require: (id: string) => {
    if (id === "server-only") return {};
    if (id in mocks) return mocks[id];
    return localRequire(id);
  } });
  return exports;
}

test("upload preserves exact original bytes alongside the normalized provider reference", async () => {
  const original = await sharp({ create: { width: 128, height: 128, channels: 4, background: { r: 25, g: 90, b: 31, alpha: 0.5 } } }).png().toBuffer();
  const stored = new Map<string, Uint8Array>();
  let record: Record<string, unknown> | undefined;
  const service = load("./manage-creative-brand-references.ts", {
    "./creative-brand-reference-metadata": metadata,
    "./creative-brand-references.repository": { createCreativeBrandReference: async (value: Record<string, unknown>) => { record = value; return value; } },
    "./r2-storage": { buildCreativeBrandReferenceObjectKey: () => "private/reference.webp", putPrivateR2Object: async ({ objectKey, body }: {objectKey: string;body: Uint8Array}) => stored.set(objectKey, body), deletePrivateR2Object: async (key: string) => stored.delete(key) },
  });
  const upload = service.uploadCreativeBrandReference as unknown as (input: unknown) => Promise<unknown>;
  await upload({ topicId: "topic", name: "Stickers", image: new File([original], "stickers.png", { type: "image/png" }) });
  const snapshot = record!.originalSnapshot as { objectKey: string; sha256: string };
  assert.equal(Buffer.compare(Buffer.from(stored.get(snapshot.objectKey)!), original), 0);
  assert.equal(snapshot.sha256, createHash("sha256").update(original).digest("hex"));
  const normalized = await sharp(Buffer.from(stored.get(record!.objectKey as string)!)).metadata();
  assert.equal(normalized.format, "webp");
  assert.equal(normalized.hasAlpha, true);
});

test("provider analysis refuses unconsented images before quota reservation or file reads", async () => {
  let sends = 0, reservations = 0, reads = 0;
  const service = load("./analyze-brand-reference.ts", {
    "@google/genai": { GoogleGenAI: class { models = { generateContent: async () => { sends++; return { text: "{}" }; } }; } },
    "./brand-analyzer.config": { getBrandAnalyzerConfig: () => ({ model: "test", apiKey: "test", timeoutMs: 100 }), brandAnalysisCacheHash: () => "hash", MAX_BRAND_ANALYSES_PER_DAY: 2 },
    "./creative-brand-references.repository": { findCreativeBrandReference: async () => ({ isActive: true, providerTransmissionAllowed: false }), reserveBrandAnalysisAttempt: async () => { reservations++; return true; } },
    "./r2-storage": { readPrivateR2ImageFile: async () => { reads++; return new File(["x"], "x.webp"); } },
  });
  await assert.rejects(service.analyzeBrandReference({ topicId: "topic", referenceId: "ref" } as never), /not authorized/);
  assert.deepEqual({ sends, reservations, reads }, { sends: 0, reservations: 0, reads: 0 });
});

test("failed analysis attempts still consume the reserved daily budget", async () => {
  let sends = 0, reservations = 0;
  const service = load("./analyze-brand-reference.ts", {
    "@google/genai": { GoogleGenAI: class { models = { generateContent: async () => { sends++; return { text: "" }; } }; } },
    "./brand-analyzer.config": { getBrandAnalyzerConfig: () => ({ model: "test", apiKey: "test", timeoutMs: 100 }), brandAnalysisCacheHash: () => "hash", MAX_BRAND_ANALYSES_PER_DAY: 2 },
    "./creative-brand-references.repository": { findCreativeBrandReference: async () => ({ isActive: true, providerTransmissionAllowed: true }), reserveBrandAnalysisAttempt: async () => ++reservations <= 2 },
    "./r2-storage": { readPrivateR2ImageFile: async () => new File(["x"], "x.webp") },
  });
  for (let i = 0; i < 3; i++) await assert.rejects(service.analyzeBrandReference({ topicId: "topic", referenceId: "ref" } as never));
  assert.equal(sends, 2);
});

test("Fal receives character, brand and edit-base image files in the documented order", async () => {
  const uploads: string[] = []; let request: { input: { image_urls: string[] } } | undefined; let endpoint = "";
  const service = load("./fal-image-client.ts", {
    "@fal-ai/client": { fal: { config: () => undefined,
      storage: { upload: async (file: File) => { uploads.push(file.name); return `https://example.invalid/${file.name}`; } },
      queue: { submit: async (name: string, value: {input: {image_urls: string[]}}) => { endpoint = name; request = value; return { request_id: "test" }; } },
    } },
  });
  await service.submitFalImage({ apiKey: "test", prompt: "The last input is the edit base", width: 1080, height: 1350, imageQuality: "low",
    endpoint: "openai/gpt-image-2/edit", referenceImages: ["character.png", "sheet.png", "base.png"].map(name => new File(["test"], name)), retention: "30d" } as never);
  assert.deepEqual(uploads, ["character.png", "sheet.png", "base.png"]);
  assert.equal(endpoint, "openai/gpt-image-2/edit");
  assert.equal(request!.input.image_urls[2], "https://example.invalid/base.png");
});
