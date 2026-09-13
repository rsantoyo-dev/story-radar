import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import ts from "typescript";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import * as schema from "../../../db/schema";
import * as input from "./story-materials.types";
import { storyReferencePrompt, enforceStoryReferencePrompt, type StoryGenerationReference } from "./story-reference-generation";
import { canCarryImageUnits } from "./creative-image-text-sync";
import type { CreativeUnit } from "./creative-content.types";
import { createHash } from "node:crypto";

const id = "00000000-0000-4000-8000-000000000001";
const other = "00000000-0000-4000-8000-000000000002";
const ref: StoryGenerationReference = { id, topicId: id, storyId: id, name: "Actual dish", description: "Corn arepas", provenance: "Author's photo", purpose: "result", objectKey: "private/photo", sha256: "hash", contentType: "image/webp", fileName: "photo.webp", active: true, providerTransmissionAllowed: true };

test("content edits require a bounded title, body and optimistic revision", () => {
  assert.throws(() => input.parseContentEdit({ title: "Title", text: "Body" }), /revision/);
  assert.throws(() => input.parseContentEdit({ title: "Title", text: " ", expectedRevision: 0 }), /Content/);
  assert.throws(() => input.parseContentEdit({ title: "Title", text: "x".repeat(100001), expectedRevision: 0 }), /Content/);
  assert.deepEqual(input.parseContentEdit({ title: " Title ", text: " Body ", expectedRevision: 2 }), { title: "Title", text: "Body", expectedRevision: 2 });
});
test("photo selection is bounded, purpose-validated and rejects duplicate IDs", () => {
  assert.deepEqual(input.parseStoryReferences(undefined), []);
  assert.throws(() => input.parseStoryReferences([{ id, purpose: "unknown" }]), /Invalid/);
  assert.throws(() => input.parseStoryReferences([{ id, purpose: "result" }, { id, purpose: "step" }]), /duplicate/);
  assert.throws(() => input.parseStoryReferences(Array(4).fill({ id, purpose: "result" })), /three/);
});
test("selected photo order follows characters and brand; retry replaces old guidance", () => {
  const prompt = storyReferencePrompt([ref], 3);
  assert.match(prompt, /"image":4/);
  assert.match(prompt, /"purpose":"result"/);
  assert.match(prompt, /not an unchanged documentary/);
  const replaced = enforceStoryReferencePrompt(`Task${prompt}`, [{ ...ref, purpose: "step" }], 1);
  assert.equal(replaced.split("STORY PHOTO REFERENCES v1").length, 2);
  assert.match(replaced, /"image":2/);
  assert.doesNotMatch(replaced, /"purpose":"result"/);
});
test("changing a photo or its use invalidates image carry, a copy edit does not", () => {
  const unit: CreativeUnit = { id, order: 1, type: "carousel-slide", role: "cover", headline: "Dish", visualDirection: "Food", factIds: [], assetRequest: "generated-image", aspectRatio: "4:5", storyReferences: [{ id, purpose: "result" }] };
  assert.ok(canCarryImageUnits([unit], [{ ...unit, headline: "New hook" }]));
  assert.equal(canCarryImageUnits([unit], [{ ...unit, storyReferences: [{ id, purpose: "step" }] }]), false);
  assert.equal(canCarryImageUnits([unit], [{ ...unit, storyReferences: [] }]), false);
});
const requireLocal = createRequire(import.meta.url);
function load(file: string, mocks: Record<string, unknown>) {
  const exports: Record<string, (...args: unknown[]) => Promise<unknown>> = {};
  const code = ts.transpileModule(readFileSync(new URL(file, import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  vm.runInNewContext(code, { exports, Buffer, File, FormData, Date, Map, Set, JSON, console, require: (name: string) => name === "server-only" ? {} : name in mocks ? mocks[name] : requireLocal(name) });
  return exports;
}
test("migration and repository preserve topic-private originals, history and concurrent edits", async () => {
  const client = new PGlite();
  try {
    await client.exec(`CREATE TABLE topic_stories (id uuid, topic_id uuid, story_id uuid, review_decision text DEFAULT 'approved', UNIQUE(topic_id,story_id)); CREATE TABLE creative_units(id uuid); INSERT INTO topic_stories(id,topic_id,story_id) VALUES ('${id}','${id}','${id}'),('${other}','${other}','${id}');`);
    await client.exec(readFileSync(new URL("../../../../drizzle/0069_wet_lake.sql", import.meta.url), "utf8"));
    const repository = load("./story-materials.repository.ts", { "@/db/client": { db: drizzle(client) }, "@/db/schema": schema, "./story-materials.types": input });
    const original = { title: "Publisher title", text: "Publisher article" };
    await client.exec(`CREATE TABLE stories(id uuid PRIMARY KEY, title text, original_url text, content_text text, content_status text);
      CREATE TABLE story_content_enrichments(story_id uuid, status text, method text, content_text text, word_count int, resolved_url text, article_title text, byline text, attempts int, error text, fetched_at timestamptz, updated_at timestamptz);
      INSERT INTO stories VALUES ('${id}', 'Publisher title', 'https://example.org/article', 'Publisher article', 'full');`);
    const content = load("./story-content.repository.ts", { "@/db/client": { db: drizzle(client) }, "@/db/schema": schema, "./story-materials.repository": repository });
    const results = await Promise.allSettled([1, 2].map(number => repository.saveStoryContentRevision(id, id, { title: `Edit ${number}`, text: "Working text", expectedRevision: 0 }, original)));
    assert.equal(results.filter(result => result.status === "fulfilled").length, 1);
    assert.equal(await repository.latestContentRevision(other, id), undefined);
    await repository.saveStoryContentRevision(id, id, { title: "Second edit", text: "New body", expectedRevision: 1 }, { title: "Should not replace original", text: "Changed" });
    const latest = await repository.latestContentRevision(id, id) as { revision: number; original: typeof original };
    assert.equal(latest.revision, 2);
    const edited = await content.getSelectedStoryContent(id, id) as { title: string; text: string; editorial: { revision: number } };
    assert.equal(edited.title, "Second edit");
    assert.equal(edited.text, "New body");
    assert.equal(edited.editorial.revision, 2);
    const untouched = await content.getStoryContent(other, id) as { title: string; text: string; editorial?: unknown };
    assert.equal(untouched.title, original.title);
    assert.equal(untouched.text, original.text);
    assert.equal(untouched.editorial, undefined);
    assert.deepEqual(latest.original, original);
    assert.equal((await repository.contentRevisionHistory(id, id) as unknown[]).length, 2);
    await assert.rejects(repository.saveStoryContentRevision(id, other, { title: "Cross story", text: "Body", expectedRevision: 0 }, original), /not in this topic/);
  } finally { await client.close(); }
});
test("photo loading rejects cross-story IDs, revoked consent and mismatched bytes before provider use", async () => {
  let allowed = true;
  let bytes = "photo";
  let reads = 0;
  const reference = { ...ref, sha256: createHash("sha256").update(bytes).digest("hex") };
  const service = load("./manage-story-photos.ts", {
    "@/db/client": {}, "@/db/schema": schema, "./story-materials.types": input,
    "./story-materials.repository": {
      findStoryPhoto: async (topicId: string, storyId: string) => topicId === id && storyId === id ? { ...reference, providerTransmissionAllowed: allowed } : undefined,
      publicStoryPhoto: (row: unknown) => row,
    },
    "./r2-storage": { readPrivateR2ImageFile: async () => { reads++; return new File([bytes], "photo.webp"); } },
  });
  await assert.rejects(service.resolveStoryReferences(id, other, [{ id, purpose: "result" }]), /unavailable/);
  allowed = false;
  await assert.rejects(service.loadStoryReferenceImages([reference]), /permission/);
  assert.equal(reads, 0);
  allowed = true;
  bytes = "tampered";
  await assert.rejects(service.loadStoryReferenceImages([reference]), /snapshot/);
  bytes = "photo";
  assert.equal((await service.loadStoryReferenceImages([reference]) as File[]).length, 1);
});

test("a story photo alone selects the reference endpoint and freezes its snapshot", () => {
  const source = readFileSync(new URL("./manage-creative-assets.ts", import.meta.url), "utf8");
  const code = source.slice(source.indexOf("function assetInputForUnit("), source.indexOf("function referenceInputHash(")) + "\nexports.run = assetInputForUnit;";
  const exports: { run?: (...args: unknown[]) => { generationMode: string; providerEndpoint: string; referenceSnapshot: { story: unknown[] } } } = {};
  vm.runInNewContext(ts.transpileModule(code, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, {
    exports, createHash, FAL_REFERENCE_GUIDED_ENDPOINT: "fal/edit", FAL_TEXT_TO_IMAGE_ENDPOINT: "fal/text", referenceInputHash: () => "characters",
  });
  const result = exports.run!([], [], [ref]);
  assert.equal(result.generationMode, "reference-guided");
  assert.equal(result.providerEndpoint, "fal/edit");
  assert.equal(result.referenceSnapshot.story[0], ref);
});

test("upload normalizes real image bytes privately and never returns an object key", async () => {
  const sharp = (await import("sharp")).default;
  const original = await sharp({ create: { width: 128, height: 96, channels: 3, background: "red" } }).png().toBuffer();
  let stored: Uint8Array | undefined;
  let row: Record<string, unknown> = {};
  const service = load("./manage-story-photos.ts", {
    "@/db/client": { db: { insert: () => ({ values: (value: Record<string, unknown>) => { row = value; return { returning: async () => [{ ...value, active: true }] }; } }) } },
    "@/db/schema": schema, "./story-materials.types": input,
    "./story-materials.repository": {
      requireStoryMembership: async () => {},
      publicStoryPhoto: (value: Record<string, unknown>) => ({ id: value.id, name: value.name }),
    },
    "./r2-storage": {
      buildStoryReferenceObjectKey: () => "private/story/photo.webp",
      putPrivateR2Object: async ({ body }: { body: Uint8Array }) => { stored = body; },
      deletePrivateR2Object: async () => {},
    },
  });
  const form = new FormData();
  form.set("image", new File([original], "dish.png", { type: "image/png" }));
  form.set("name", "Dish"); form.set("description", "Actual dish"); form.set("provenance", "My photograph");
  await assert.rejects(service.uploadStoryPhoto(id, id, form), /Confirm permission/);
  assert.equal(stored, undefined);
  form.set("providerTransmissionAllowed", "true");
  const result = await service.uploadStoryPhoto(id, id, form) as Record<string, unknown>;
  assert.equal(result.objectKey, undefined);
  assert.equal((await sharp(Buffer.from(stored!)).metadata()).format, "webp");
  assert.equal(row.sha256, createHash("sha256").update(stored!).digest("hex"));
});

test("photo identity takes priority over generic scene styling, while style-only inputs remain inspiration", () => {
  const prompt = storyReferencePrompt([ref, { ...ref, id: other, purpose: "place" }], 0);
  assert.match(prompt, /PHOTO-LED COMPOSITION/);
  assert.match(prompt, /Preserve physical identity over brand styling/);
  assert.match(prompt, /EDITORIAL RESTORATION/);
  assert.match(prompt, /not literal pixel reproduction/);
  assert.match(prompt, /relative arrangement of food/);
  assert.match(prompt, /replace nonessential background/);
  assert.match(prompt, /keep the referenced physical subjects photographic/);
  assert.match(prompt, /actual finished result as the principal subject/);
  assert.match(prompt, /setting or equipment's visible geometry/);
  const style = storyReferencePrompt([{ ...ref, purpose: "style" }], 0);
  assert.doesNotMatch(style, /PHOTO-LED COMPOSITION/);
  assert.match(style, /Do not copy their subjects/);
});
