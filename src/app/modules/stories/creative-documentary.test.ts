import * as roadEvidence from "./road-notice-evidence";
import * as evidenceGuardrails from "./creative-evidence-guardrails";
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
import * as sourceLocation from "./source-location";
import type { CreativeAssetBatch, CreativeProfile } from "./creative-content.types";
import type { DocumentaryResult } from "./manage-creative-documentary";

function load<T>(file: string, dependencies: Record<string, unknown>, env: Record<string, string> = {}): T {
  const source = readFileSync(resolve("src/app/modules/stories", file), "utf8");
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  const exports = {};
  runInNewContext(code, { exports, Date, Set, Map, Buffer, URL, URLSearchParams, AbortSignal, console, process: { env },
    require: (name: string) => {
      if (name === "server-only") return {};
      if (name === "./road-notice-evidence") return roadEvidence;
      if (name === "./creative-evidence-guardrails") return evidenceGuardrails;
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
      return { text: JSON.stringify(options.extraction ?? { mentions: [mention], purpose: "location" }), model: "test", usage: policy.EMPTY_GEO_USAGE, webSearch: { calls: 1, sources: [{ url: "https://municipality.example/place", title: mention.name, imageUrl: "https://municipality.example/place.jpg" }] } };
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
    assert.equal(result.snapshot?.discovery?.sources.length, extraction.mentions[0].kind === "generic" ? 0 : 1);
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

test("location-only road fragments finish blocked without model, map or photo lookup", async () => {
  const h = harness({ text: "Le repère va du kilomètre 20 au kilomètre 17 à Saint-Sébastien. Le secteur se trouve entre la sortie 39 et la route 104 à Saint-Jean-sur-Richelieu.", material: "map" });
  const result = await h.service.prepareDocumentary("topic", "story");
  assert.equal(result.snapshot?.representation, "blocked");
  assert.equal(h.aiCalls, 0);
  assert.equal(h.resolutions, 0);
  assert.equal(h.approvals, 0);
  assert.ok(result.snapshot?.reasons.some(reason => reason.includes("event evidence")));
});

test("same-draft typography renders saved copy without geographic generation", async () => {
  const renderer = load<typeof import("./creative-documentary-render")>("creative-documentary-render.ts", { sharp });
  const composer = load<typeof import("./creative-draft-typography")>("creative-draft-typography.ts", { sharp, "./creative-documentary-render": renderer });
  const unit = { order: 1, type: "carousel-slide", role: "cover", headline: "Route 35 : entrave majeure", subheadline: "À Saint-Sébastien", body: "Du 8 septembre au 9 octobre.", continuationCue: "Quelle période?", visualDirection: "Carte routière", factIds: [], assetRequest: "generated-image", aspectRatio: "4:5" } as import("./creative-content.types").CreativeUnit;
  const before = JSON.stringify(unit);
  const png = await composer.renderDraftTypography(unit, profile);
  const metadata = await sharp(png).metadata();
  assert.equal(metadata.width, 1080); assert.equal(metadata.height, 1350);
  assert.equal(JSON.stringify(unit), before);
  assert.equal(composer.DRAFT_TYPOGRAPHY_ENDPOINT, "local/draft-typography-v1");
});

test("road-map preparation uses open map geometry without a paid key and rejects mismatched notice IDs", async () => {
  const road = await import("./quebec-road-map");
  const data = JSON.parse(readFileSync(resolve("src/app/modules/stories/fixtures/quebec-road-35.json"), "utf8"));
  const facts = [{ id: "fact-1", statement: "Entrave", sourceExcerpt: "35 À Saint-Jean-sur-Richelieu, entre la sortie 39 (R-104) et la R-104 Entrave Majeure Direction Sud et nord Du 21 juin 2026 à 20 h au 31 octobre 2026 à 6 h" }];
  let calls = 0;
  const service = load<typeof import("./prepare-road-map")>("prepare-road-map.ts", { "node:crypto": crypto, "./quebec-road-map": road, "./open-map-render": { renderOpenMap: async () => Buffer.from("map") }, "./creative-documentary-providers": { fetchDocumentaryResource: async () => { calls++; return Buffer.from(JSON.stringify(data)); } } });
  const result = await service.prepareRoadMap("https://www.511.gouv.qc.ca/fr/Diffusion/EtatReseau/DetailsChantier.aspx?idChantier=168598", facts);
  assert.equal(result.evidence.segment?.id, "168598");
  assert.match(result.evidence.reason, /Official MTMD/);
  assert.equal(result.bytes?.toString(), "map");
  assert.equal(calls, 1);
  const mismatch = await service.prepareRoadMap("https://www.511.gouv.qc.ca/fr/Diffusion/EtatReseau/DetailsChantier.aspx?idChantier=123", facts);
  assert.match(mismatch.evidence.reason, /conflicts/);
  assert.equal(mismatch.evidence.segment, undefined);
});

test("worldwide preparation resolves source-backed places, maps current-state reports and leaves other slides untouched", async () => {
  const visual=await import("./creative-place-visual");
  const geometry=await import("./open-map-geometry");
  let photoCalls=0,mapCalls=0,resolveCalls=0;
  const unit={id:"unit",order:1,role:"cover",factIds:["fact-1"],visualDirection:"Map of place",assetRequest:"generate"};
  const facts=[{id:"fact-1",statement:source,sourceExcerpt:source}];
  const dependencies={
    "./source-location": sourceLocation,
    "./prepare-source-location": { prepareSourceLocation: async () => { throw new Error("No address anchor expected"); } },
    "node:crypto":crypto,"./creative-documentary":policy,"./creative-place-visual":visual,"./open-map-geometry":geometry,
    "./creative-documentary-providers":{documentaryProviders:()=>({resolve:async()=>{resolveCalls++;return place;},photo:async()=>{photoCalls++;return undefined;}})},
    "./open-map-render":{renderOpenMap:async()=>{mapCalls++;return Buffer.from("map");}},
    "./prepare-road-map":{prepareRoadMap:async()=>{throw new Error("Wrong regional adapter");}},
    "./creative-content.config":{getCreativeContentPublicConfig:()=>({maxRunsPerDay:10})},
    "./creative-content.repository":{getCreativeDailyUsage:async()=>({remainingRuns:10}),createCreativeAiRun:async()=>"run",completeCreativeAiRun:async()=>{},failCreativeAiRun:async()=>{}},
    "./openai-structured-response":{generateOpenAiStructuredResponse:async()=>({text:JSON.stringify({purpose:"current-state",mentions:[mention]}),usage:{},model:"test"})},
  };
  const service=load<typeof import("./prepare-place-visuals")>("prepare-place-visuals.ts",dependencies,{OPENAI_API_KEY:"test",CREATIVE_GEO_SOURCE_ADAPTERS:""});
  const draft={units:[unit,{...unit,id:"second",order:2,role:"content",visualDirection:"Typography"}],storyId:"story",briefId:"brief"} as unknown as import("./creative-content.types").CreativeDraft;
  const result=await service.preparePlaceVisuals("topic",draft,profile,facts,"https://example.org/article");
  assert.equal(result.get(1)?.evidence.representation,"map");
  assert.equal(result.get(2)?.evidence.representation,"typography");
  assert.equal(photoCalls,0);assert.equal(mapCalls,1);assert.equal(resolveCalls,1);
  const noAi=load<typeof import("./prepare-place-visuals")>("prepare-place-visuals.ts",dependencies);
  const fallback=await noAi.preparePlaceVisuals("topic",draft,profile,facts,"https://example.org/article");
  assert.equal(fallback.get(1)?.evidence.representation,"typography");
  assert.equal(resolveCalls,1);
});

test("nearby source address maps only its cited slide without AI research or changing the saved carousel", async () => {
  const visual = await import("./creative-place-visual");
  const facts = [{ id: "fact-1", statement: "Harvest event", sourceExcerpt: "La fête se déroule à côté de la bibliothèque Saint-Luc (347, boul. Saint-Luc)." }];
  const units = [1, 2, 3, 4].map(order => ({ id: `unit-${order}`, order, role: order === 1 ? "cover" : "content", headline: order === 4 ? "Rendez-vous près de la bibliothèque Saint-Luc" : "Partagez vos récoltes", body: "", visualDirection: "Pictogrammes de fruits", factIds: ["fact-1"], assetRequest: "generated-image" }));
  const draft = { units, storyId: "story", briefId: "brief" } as unknown as import("./creative-content.types").CreativeDraft;
  const before = JSON.stringify(draft);
  let maps = 0;
  const service = load<typeof import("./prepare-place-visuals")>("prepare-place-visuals.ts", {
    "node:crypto": crypto, "./creative-documentary": policy, "./creative-place-visual": visual,
    "./source-location": sourceLocation, "./open-map-geometry": {}, "./prepare-road-map": {}, "./open-map-render": {},
    "./prepare-source-location": { prepareSourceLocation: async (anchor: sourceLocation.SourceLocation) => { maps++; return { bytes: Buffer.from("map"), evidence: { representation: "map", locationAnchor: anchor } }; } },
    "./creative-documentary-providers": { documentaryProviders: () => ({ resolve: () => { throw new Error("Unexpected general place lookup"); } }) },
    "./creative-content.repository": { getCreativeDailyUsage: async () => ({ remainingRuns: 10 }), createCreativeAiRun: () => { throw new Error("Unexpected model call"); } },
    "./creative-content.config": { getCreativeContentPublicConfig: () => ({ maxRunsPerDay: 10 }) },
    "./openai-structured-response": {},
  }, { OPENAI_API_KEY: "configured" });
  const result = await service.preparePlaceVisuals("topic", draft, profile, facts, "https://example.org/event");
  assert.equal(maps, 1);
  assert.equal(result.size, 4);
  for (const order of [1, 2, 3]) assert.equal(result.get(order)?.bytes, undefined);
  assert.equal(result.get(4)?.evidence.locationAnchor?.relation, "nearby");
  assert.equal(result.get(4)?.bytes?.toString(), "map");
  assert.equal(JSON.stringify(draft), before);
});


test("cultural programme assigns venues per scene without a global current-state veto", async () => {
  const a = "Un concert aura lieu au Domaine Trinity pendant les Journées de la culture.";
  const b = "Une exposition sera présentée au Musée du Haut-Richelieu pendant cette fin de semaine.";
  const mentions: policy.PlaceMention[] = [
    { ...mention, name: "Domaine Trinity", excerpt: a, purpose: "location" },
    { ...mention, name: "Musée du Haut-Richelieu", excerpt: b, purpose: "location" },
  ];
  const extraction: policy.PlaceExtraction = { mentions, purpose: "current-state" };
  const h = harness({ text: `${a} ${b} Des travaux changent un autre bâtiment dans la ville.`, extraction, material: "photo" });
  const result = await h.service.prepareDocumentary("topic", "story", "carousel");
  assert.equal(result.batch?.assets.length, 3);
  assert.equal(h.rendered[0].representation, "photo");
  assert.equal(h.rendered[1].representation, "photo");
  assert.equal(h.rendered[2].representation, "typography");
  assert.equal(h.resolutions, 2);
  assert.equal(h.approvals, 0);
});

test("per-scene location selection preserves physical-state and ambiguity guards", () => {
  const other = { ...mention, name: "Domaine Trinity", purpose: "location" as const };
  const extraction: policy.PlaceExtraction = { mentions: [{ ...mention, purpose: "location" }, other], purpose: "location" };
  assert.equal(policy.canUseLocationVisual(policy.documentarySceneExtraction(extraction, "Concert local", source)), true);
  assert.equal(policy.canUseLocationVisual(policy.documentarySceneExtraction(extraction, "Travaux à la place", source)), false);
  assert.equal(policy.canUseLocationVisual(policy.documentarySceneExtraction(extraction, "Concert", `Des travaux ferment la ${mention.name}.`)), false);
  assert.equal(policy.canUseLocationVisual(policy.documentarySceneExtraction(extraction, "Concert", `${source} Le Domaine Trinity participe aussi.`)), false);
  assert.equal(policy.canUseLocationVisual(policy.documentarySceneExtraction(extraction, "Concert", "Le programme est disponible pour les habitants.")), false);
  assert.equal(policy.reportsChangedPlaceState("Exposición de obras de arte en el museo."), false);
  assert.equal(policy.reportsChangedPlaceState("Obras de construcción en el museo."), true);
});

test("scene selection reaches venue evidence beyond introductory sentences", () => {
  const intro = "La Ville invite les habitants à participer aux activités culturelles.";
  const filler = "Le programme complet est disponible pour toutes les familles.";
  const sentences = [intro, filler, filler + " Gratuit.", source];
  const selected = policy.selectDocumentaryExcerpts(sentences, { purpose: "location", mentions: [mention] });
  assert.equal(selected[0], intro);
  assert.ok(selected.includes(source));
  assert.equal(selected.length, 3);
  assert.ok(selected.every(s => sentences.includes(s)));
});

test("discovery excludes Jean and Cartier name fragments without treating results as photo permission", () => {
  const discovery = policy.relevantPlaceDiscovery({ calls: 1, sources: [
    { title: "Jean Dujardin", url: "https://instagram.com/jeandujardin" },
    { title: "Cartier watches", url: "https://cartier.com" },
    { title: "Place Jacques-Cartier", url: "https://ville.example/place" },
  ] }, [mention]);
  assert.equal(discovery?.calls, 1);
  assert.equal(discovery?.sources.length, 1);
  assert.equal(discovery?.sources[0].title, "Place Jacques-Cartier");
});
