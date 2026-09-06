import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";
import * as crypto from "node:crypto";
import * as orm from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import sharp from "sharp";
import ts from "typescript";
import * as policy from "./creative-documentary";
import type { CreativeAssetBatch, CreativeProfile } from "./creative-content.types";
import type { DocumentaryResult } from "./manage-creative-documentary";

function load<T>(file: string, dependencies: Record<string, unknown>, env: Record<string, string> = {}): T {
  const source = readFileSync(resolve("src/app/modules/stories", file), "utf8");
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  const exports = {};
  runInNewContext(code, { exports, Date, Set, Map, Buffer, URL, URLSearchParams, AbortSignal, console, process: { env },
    require: (name: string) => {
      if (name === "server-only") return {};
      if (!(name in dependencies)) throw new Error(`Unexpected server dependency: ${name}`);
      return dependencies[name];
    },
  });
  return exports as T;
}
const scope = { municipality: "Saint-Jean-sur-Richelieu", region: "Québec", country: "Canada", validatedLocationId: null };
const source = "Un concert aura lieu place Jacques-Cartier dans la ville samedi soir.";
const mention: policy.PlaceMention = { name: "place Jacques-Cartier", kind: "named", role: "event", excerpt: source, municipality: "", region: "", country: "" };
const place: policy.PlaceEvidence = { id: "Q123", name: mention.name, revision: 123, sourceUrl: "https://www.wikidata.org/wiki/Q123", scope, hierarchy: [], coordinates: { latitude: 45.3, longitude: -73.2, precision: 0.00001 } };
const profile = { name: "salut.st.jean", language: "fr", geoScope: scope, audience: "Residents", brandPalette: [{ name: "Green", color: "#246b4a" }], visualFidelityMode: "photo-required" } as CreativeProfile;
const photo = (): policy.PhotoEvidence => ({ placeId: place.id, sourceUrl: "https://commons.wikimedia.org/wiki/File:Place.jpg", resourceUrl: "https://upload.wikimedia.org/wikipedia/commons/a/ab/Place.jpg", author: "Photographer", license: "CC0", licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/", attribution: "Photographer · CC0", captureDate: null, retrievedAt: new Date().toISOString(), sha256: "a".repeat(64), width: 1080, height: 640, contentType: "image/png" });

test("extraction preserves accents and rejects fabricated evidence, inferred names and model coordinates", () => {
  const valid = { mentions: [mention], purpose: "location" };
  assert.equal(policy.parsePlaceExtraction(valid, source).mentions[0].name, mention.name);
  for (const alteration of [{ excerpt: "Invented evidence" }, { name: "Une autre place" }, { coordinates: [1, 2] }]) {
    assert.throws(() => policy.parsePlaceExtraction({ ...valid, mentions: [{ ...mention, ...alteration }] }, source));
  }
  assert.equal(policy.mentionFitsScope({ ...mention, municipality: "Montréal" }, scope), false);
  assert.equal(policy.mentionFitsScope(mention, { ...scope, country: "" }), false);
});

test("generic, multiple, unknown and current-state mentions exclude location imagery", () => {
  assert.equal(policy.canUseLocationVisual({ mentions: [mention], purpose: "location" }), true);
  for (const extraction of [
    { mentions: [{ ...mention, kind: "generic" as const }], purpose: "location" as const },
    { mentions: [mention, { ...mention, role: "secondary" as const }], purpose: "location" as const },
    { mentions: [mention], purpose: "current-state" as const },
    { mentions: [mention], purpose: "unknown" as const },
  ]) assert.equal(policy.canUseLocationVisual(extraction), false);
});

test("photo eligibility checks identity, explicit rights, dimensions and bounded freshness independently", () => {
  assert.equal(policy.eligiblePhoto(photo(), place), true);
  for (const change of [{ placeId: "Q999" }, { licenseUrl: "https://unknown.invalid" }, { width: 400 }, { retrievedAt: "invalid" }, { retrievedAt: "2020-01-01" }]) {
    assert.equal(policy.eligiblePhoto({ ...photo(), ...change }, place), false);
  }
});

function harness(options: { extraction?: unknown; unavailable?: boolean; providerFailure?: boolean; material?: "photo" | "map"; changed?: boolean; storageFailure?: boolean; text?: string; apiKey?: boolean } = {}) {
  let batch: CreativeAssetBatch | undefined;
  let draft: Record<string, unknown> | undefined;
  let tokens = 0; let aiCalls = 0; let resolutions = 0; let approvals = 0;
  const rendered: policy.DocumentarySnapshot[] = [];
  const service = load<typeof import("./manage-creative-documentary")>("manage-creative-documentary.ts", {
    "node:crypto": crypto,
    "./creative-content.config": { getCreativeContentPublicConfig: () => ({ maxRunsPerDay: 20 }) },
    "./creative-documentary": policy,
    "./creative-profile.repository": { getCreativeProfile: async () => profile },
    "./story-content.repository": { getSelectedStoryContent: async () => ({ storyId: "story", title: "Concert local", text: options.text ?? source, url: "https://news.example/story" }) },
    "./creative-content.repository": {
      getCreativeDailyUsage: async () => ({ remainingRuns: 10 }),
      createCreativeAiRun: async () => "run", completeCreativeAiRun: async () => {}, failCreativeAiRun: async () => {},
      insertCreativeBrief: async () => ({ id: "brief" }),
      insertCreativeDraft: async (input: Record<string, unknown>) => { draft = { ...input, id: "draft", status: "draft", version: 1 }; return draft; },
      findCreativeDraftById: async () => draft,
    },
    "./openai-structured-response": { generateOpenAiStructuredResponse: async (input: { webSearch?: boolean }) => {
      assert.equal(input.webSearch, true);
      aiCalls++; if (options.unavailable) throw new Error("Provider outage");
      return { text: JSON.stringify(options.extraction ?? { mentions: [mention], purpose: "location" }), model: "test", usage: policy.EMPTY_GEO_USAGE, webSearch: { calls: 1, sources: [{ url: "https://municipality.example/place", title: "Place publique", imageUrl: "https://municipality.example/place.jpg" }] } };
    } },
    "./creative-documentary-providers": { documentaryProviders: () => ({
      resolve: async () => { resolutions++; if (options.providerFailure) throw new Error("Timeout"); return place; },
      photo: async () => options.material === "photo" ? { bytes: Buffer.from("photo"), evidence: photo() } : undefined,
      map: async () => options.material === "map" ? Buffer.from("map") : undefined,
    }) },
    "./creative-documentary-render": { renderDocumentary: async (snapshot: policy.DocumentarySnapshot) => { rendered.push(snapshot); return Buffer.from("rendered"); } },
    "./creative-documentary.repository": {
      documentarySourceToken: async () => { tokens++; return options.changed && tokens > 1 ? "new" : "old"; },
      latestDocumentaryBatch: async () => batch, documentaryLibrary: async () => [],
      reviewDocumentaryBatch: async () => { approvals++; return true; },
    },
    "./r2-storage": { buildDocumentaryObjectKey: (...args: string[]) => args.join("/"), putPrivateR2Object: async () => { if (options.storageFailure) throw new Error("R2 unavailable"); }, readPrivateR2ImageFile: async () => { throw new Error("No existing file"); } },
    "./manage-creative-content": { CreativeContentConflictError: class Conflict extends Error {}, CreativeContentNotFoundError: class NotFound extends Error {} },
    "./creative-assets.repository": {
      createCreativeAssetBatch: async (input: { draftId: string; draftVersion: number; assets: { unitSnapshot: object; unitOrder: number }[] }) => {
        batch = { ...input, id: "batch", provider: policy.DOCUMENTARY_PROVIDER, status: "queued", totalAssets: input.assets.length, assets: input.assets.map(asset => ({ ...asset, id: `asset-${asset.unitOrder}`, status: "queued" })), allApproved: false } as CreativeAssetBatch;
        return batch;
      },
      completeCreativeAsset: async (id: string, image: { url: string }) => { const asset = batch!.assets.find(a => a.id === id)!; asset.status = "generated"; asset.imageUrl = image.url; },
      failCreativeAsset: async (id: string) => { batch!.assets.find(a => a.id === id)!.status = "failed"; },
      refreshCreativeAssetBatchStatus: async () => { batch!.status = batch!.assets.some(a => a.status === "failed") ? "failed" : "completed"; return batch; },
      findCreativeAssetById: async () => undefined,
    },
  }, options.apiKey === false ? {} : { OPENAI_API_KEY: "test" });
  return { service, rendered, get aiCalls() { return aiCalls; }, get resolutions() { return resolutions; }, get approvals() { return approvals; }, get draft() { return draft; } };
}

for (const material of ["photo", "map", undefined] as const) test(`automatic ${material || "typography"} preparation has no intermediate approval`, async () => {
  const h = harness({ material });
  const result = await h.service.prepareDocumentary("topic", "story");
  assert.equal(result.snapshot?.representation, material || "typography");
  assert.equal(result.batch?.status, "completed");
  assert.equal(h.approvals, 0);
  assert.equal(h.draft?.status, "draft");
  assert.equal(result.batch?.assets[0].approvedAt, undefined);
  assert.equal(h.aiCalls, 1);
  const cached = await h.service.prepareDocumentary("topic", "story");
  assert.equal(cached.batch?.id, result.batch?.id); assert.equal(h.aiCalls, 1);
});

test("model failure or absent configuration completes typography without prompts or retrying outages", async () => {
  for (const options of [{ unavailable: true }, { apiKey: false }]) {
    const h = harness(options); const result = await h.service.prepareDocumentary("topic", "story");
    assert.equal(result.snapshot?.representation, "typography"); assert.equal(h.resolutions, 0); assert.equal(h.approvals, 0);
    assert.ok(h.aiCalls <= 1);
  }
});

test("malformed extraction retries once and cannot authorize an image", async () => {
  const h = harness({ extraction: { mentions: [{ ...mention, excerpt: "invented" }], purpose: "location" } });
  const result = await h.service.prepareDocumentary("topic", "story");
  assert.equal(h.aiCalls, 2); assert.equal(h.resolutions, 0); assert.equal(result.snapshot?.representation, "typography");
});

test("changed-state reporting rejects a model's location-only recommendation", async () => {
  const text = `Des travaux changent le bâtiment pour les habitants. ${source}`;
  const h = harness({ text, material: "photo" });
  const result = await h.service.prepareDocumentary("topic", "story");
  assert.equal(result.snapshot?.representation, "typography"); assert.equal(h.resolutions, 0);
});

test("provider timeout falls back; missing facts and storage failures remain unapproved blocked results", async () => {
  const provider = harness({ providerFailure: true });
  assert.equal((await provider.service.prepareDocumentary("topic", "story")).snapshot?.representation, "typography");
  const missing = harness({ text: "" });
  assert.equal((await missing.service.prepareDocumentary("topic", "story")).snapshot?.representation, "blocked");
  const storage = harness({ storageFailure: true });
  assert.equal((await storage.service.prepareDocumentary("topic", "story")).batch?.status, "failed");
  assert.equal(storage.approvals, 0);
});

test("late source changes leave preparation stale and prevent final approval", async () => {
  const h = harness({ changed: true });
  const result = await h.service.prepareDocumentary("topic", "story");
  assert.equal(result.stale, true);
  await assert.rejects(() => h.service.reviewDocumentary("topic", "story", "batch", result.snapshot!.inputHash, "Reviewer", "approved"), /changed/);
  assert.equal(h.approvals, 0);
});

test("carousel units keep explicit snapshots and do not silently reuse a photo on another excerpt", async () => {
  const h = harness({ material: "photo", text: `${source} Les visiteurs peuvent consulter le programme sur le site de la ville.` });
  const result = await h.service.prepareDocumentary("topic", "story", "carousel");
  assert.equal(result.batch?.assets.length, 2);
  assert.equal(h.rendered[0].representation, "photo"); assert.equal(h.rendered[1].representation, "typography");
});

test("final approval SQL conditionally updates the script and all assets together", async () => {
  const queries: orm.SQL[] = [];
  const repo = load<typeof import("./creative-documentary.repository")>("creative-documentary.repository.ts", {
    "drizzle-orm": orm, "@/db/schema": {}, "@/db/client": { db: { execute: async (query: orm.SQL) => { queries.push(query); return { rows: [] }; } } },
    "./creative-assets.repository": {}, "./creative-documentary": policy,
  });
  assert.equal(await repo.reviewDocumentaryBatch({ topicId: "topic", storyId: "story", draftId: "draft", draftVersion: 2, batchId: "batch", inputHash: "hash", sourceToken: "token", actor: "Reviewer", decision: "approved" }), false);
  const query = new PgDialect().sqlToQuery(queries[0]);
  assert.match(query.sql, /FOR UPDATE/); assert.match(query.sql, /version = \$/);
  assert.match(query.sql, /EXISTS \(SELECT 1 FROM changed_draft\)/);
  assert.match(query.sql, /sourceToken/); assert.match(query.sql, /newer.created_at > b.created_at/);
  assert.ok(query.params.some(v => typeof v === "string" && v.includes('"actor":"Reviewer"')));
});

test("deterministic compositor renders 4:5 and preserves the original picture's pixels", async () => {
  const h = harness({ material: "photo" });
  const result: DocumentaryResult = await h.service.prepareDocumentary("topic", "story");
  const renderer = load<typeof import("./creative-documentary-render")>("creative-documentary-render.ts", { sharp });
  const original = await sharp({ create: { width: 1080, height: 640, channels: 3, background: "#ed3412" } }).png().toBuffer();
  const output = await renderer.renderDocumentary(result.snapshot!, profile, original);
  const metadata = await sharp(output).metadata();
  assert.equal(metadata.width, 1080); assert.equal(metadata.height, 1350);
  const region = await sharp(output).extract({ left: 0, top: 330, width: 1080, height: 640 }).removeAlpha().raw().toBuffer();
  const expected = await sharp(original).raw().toBuffer(); assert.deepEqual(region, expected);
  assert.equal(renderer.escapeDocumentaryText('<b>&"'), "&lt;b&gt;&amp;&quot;");
  writeFileSync("/tmp/geo-documentary-render-test.png", output);
});

test("corrections cannot introduce text absent from the article", async () => {
  const h = harness();
  await assert.rejects(() => h.service.prepareDocumentary("topic", "story", "meme", true, "Invented construction details that are not in the source article."), /copied exactly/);
  assert.equal(h.aiCalls, 0);
});

test("private documentary images cannot be read through another topic", async () => {
  const service = load<typeof import("./manage-creative-documentary")>("manage-creative-documentary.ts", {
    "node:crypto": crypto, "./creative-content.config": {}, "./creative-documentary": policy,
    "./creative-assets.repository": { findCreativeAssetById: async () => ({ asset: {}, batch: { provider: policy.DOCUMENTARY_PROVIDER, draftId: "other-topic-draft" } }) },
    "./creative-content.repository": { findCreativeDraftById: async () => undefined },
    "./creative-profile.repository": {}, "./story-content.repository": {}, "./openai-structured-response": {},
    "./creative-documentary-providers": {}, "./creative-documentary-render": {}, "./creative-documentary.repository": {},
    "./r2-storage": { readPrivateR2ImageFile: async () => { assert.fail("Cross-topic private read"); } },
    "./manage-creative-content": { CreativeContentNotFoundError: class NotFound extends Error {} },
  });
  await assert.rejects(() => service.documentaryImage("wrong-topic", "story", "asset"), /not found/);
});


test("web discovery survives generic and changed-state exclusions without approving candidate photographs", async () => {
  for (const extraction of [
    { mentions: [{ ...mention, kind: "generic" }], purpose: "location" },
    { mentions: [mention], purpose: "current-state" },
  ]) {
    const h = harness({ extraction });
    const result = await h.service.prepareDocumentary("topic", "story");
    assert.equal(result.snapshot?.discovery?.calls, 1);
    assert.equal(result.snapshot?.discovery?.sources[0].imageUrl, "https://municipality.example/place.jpg");
    assert.equal(result.snapshot?.representation, "typography");
    assert.equal(result.snapshot?.photo, undefined);
    assert.equal(h.approvals, 0);
  }
});

test("discovery accepts tool results only, deduplicates and rejects unsafe links", () => {
  const api = load<typeof import("./openai-structured-response")>("openai-structured-response.ts", {});
  const result = api.extractWebSearchSources([
    { type: "message", content: [{ type: "output_text", text: "https://invented.example" }] },
    { type: "web_search_call", status: "failed", action: { sources: [{ url: "https://failed.example" }] } },
    { type: "web_search_call", status: "completed", action: { sources: [
      { url: "https://city.example/place", title: "Place" },
      { url: "https://city.example/place", title: "Duplicate" },
      { url: "javascript:alert(1)" }, { url: "https://localhost/path" }, { url: "https://user:password@city.example/" },
    ] }, results: [{ type: "image_result", image_url: "https://city.example/photo.jpg", source_website_url: "https://city.example/place", caption: "The place" }] },
  ]);
  assert.equal(result.calls, 2);
  assert.equal(result.sources.length, 2);
  assert.equal(result.sources[1].imageUrl, "https://city.example/photo.jpg");
});


test("web search is opt-in and bounded in the actual Responses request", async () => {
  const bodies: Record<string, unknown>[] = [];
  const exports: Partial<typeof import("./openai-structured-response")> = {};
  const source = readFileSync(resolve("src/app/modules/stories/openai-structured-response.ts"), "utf8");
  runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, {
    exports, URL, Set, AbortController, setTimeout, clearTimeout,
    require: () => ({}),
    fetch: async (_url: string, input: { body: string }) => {
      bodies.push(JSON.parse(input.body));
      return { ok: true, text: async () => JSON.stringify({ output_text: '{"mentions":[]}', output: [{ type: "web_search_call", status: "completed", action: { sources: [{ url: "https://city.example/place" }] } }] }) };
    },
  });
  const input = { apiKey: "test", model: "gpt-5.6-luna", instructions: "Extract", contents: {}, schema: {}, schemaName: "test", maxOutputTokens: 100 };
  const ordinary = await exports.generateOpenAiStructuredResponse!(input);
  const searched = await exports.generateOpenAiStructuredResponse!({ ...input, webSearch: true });
  assert.equal(bodies[0].tools, undefined);
  assert.equal(ordinary.webSearch, undefined);
  assert.equal(bodies[1].max_tool_calls, 3);
  assert.equal(bodies[1].tool_choice, "required");
  assert.equal(searched.webSearch?.sources[0].url, "https://city.example/place");
});
