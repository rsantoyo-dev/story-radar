import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import * as crypto from "node:crypto";
import ts from "typescript";
import * as policy from "./creative-documentary";
import * as visuals from "./creative-place-visual";
import { mapViewport } from "./open-map-geometry";
import type { CreativeDraft, CreativeKeyFact } from "./creative-content.types";

const original = Buffer.from("original verified map");
function harness(options: { approved?: boolean; token?: string; corrupt?: boolean; photo?: boolean } = {}) {
  const snapshot = { version: policy.DOCUMENTARY_VERSION, inputHash: "hash", sourceToken: options.token ?? "current", reasons: [],
    review: { decision: "approved" }, preparedAt: new Date().toISOString(),
    places: [{ id: "Q1", name: "Domaine Trinity", sourceUrl: "https://www.wikidata.org/wiki/Q1" }],
    ...(options.photo ? { photo: {
      placeId: "Q1", author: "Yource", license: "CC BY-SA 4.0",
      licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0/",
      attribution: "Yource · CC BY-SA 4.0", sourceUrl: "https://commons.wikimedia.org/wiki/File:Museum.jpg",
      retrievedAt: new Date().toISOString(), width: 1080, height: 1350, contentType: "image/jpeg",
      sha256: crypto.createHash("sha256").update(original).digest("hex"),
    } } : {}),
    map: { sha256: crypto.createHash("sha256").update(original).digest("hex"), attribution: "OpenStreetMap" } };
  const dependencies: Record<string, unknown> = {
    "server-only": {}, "node:crypto": crypto, "./creative-documentary": policy, "./creative-place-visual": visuals,
    "./creative-documentary.repository": {
      latestDocumentaryBatch: async (topicId: string, storyId: string) => {
        assert.equal(topicId, "topic"); assert.equal(storyId, "story");
        return { allApproved: options.approved ?? true, status: "completed", assets: [{ unitSnapshot: { documentary: snapshot } }] };
      }, documentarySourceToken: async () => "current",
    },
    "./r2-storage": { buildDocumentaryObjectKey: (topic: string) => { assert.equal(topic, "topic"); return "private"; },
      readPrivateR2ImageFile: async () => new File([options.corrupt ? Buffer.from("changed") : original], "map.png") },
  };
  const exports = {};
  runInNewContext(ts.transpileModule(readFileSync("src/app/modules/stories/reuse-documentary-visuals.ts", "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, { exports, Buffer, Date, Map, Set, require: (name: string) => dependencies[name] });
  return exports as typeof import("./reuse-documentary-visuals");
}
const facts = [{ id: "f1", sourceExcerpt: "Concert au Domaine Trinity." }] as CreativeKeyFact[];
const draft = { storyId: "story", units: [{ order: 1, factIds: ["f1"], assetRequest: "generated-image" },
  { order: 2, factIds: ["other"], assetRequest: "generated-image" }] } as CreativeDraft;

test("only the slide citing the approved place receives its exact original bytes", async () => {
  const result = await harness().reuseDocumentaryVisuals("topic", draft, facts);
  assert.equal(result.size, 1);
  assert.deepEqual(result.get(1)?.bytes, original);
  assert.equal(result.get(1)?.evidence.representation, "map");
  assert.equal(result.has(2), false);
});

test("unapproved, source-stale and altered originals cannot be reused", async () => {
  for (const options of [{ approved: false }, { token: "old" }, { corrupt: true }]) {
    assert.equal((await harness(options).reuseDocumentaryVisuals("topic", draft, facts)).size, 0);
  }
});

test("venue maps show a tighter neighborhood than city context maps", () => {
  const target = { kind: "point" as const, name: "Museum", points: [[-73.2, 45.3] as [number, number]] };
  const venue = mapViewport(target).bbox;
  const city = mapViewport({ ...target, context: "city" }).bbox;
  assert.ok(venue[2] - venue[0] < (city[2] - city[0]) / 2);
  assert.deepEqual(mapViewport(target).pixel(target.points[0]), [472, 230]);
});


test("composition identity changes when a prepared map is replaced by a photo", async () => {
  const api = harness();
  const maps = await api.reuseDocumentaryVisuals("topic", draft, facts);
  const map = maps.get(1)!;
  const photos = new Map([[1, { ...map, evidence: {
    ...map.evidence, representation: "photo" as const, sha256: "new-photo",
    attribution: "Yource · CC BY-SA 4.0",
  } }]]);
  assert.notEqual(api.documentaryVisualInputHash(maps), api.documentaryVisualInputHash(photos));
  assert.notEqual(api.documentaryVisualInputHash(), api.documentaryVisualInputHash(photos));
  assert.equal(api.documentaryVisualInputHash(new Map([[2, map], [1, map]])),
    api.documentaryVisualInputHash(new Map([[1, map], [2, map]])));
  assert.notEqual(api.documentaryVisualInputHash(photos),
    api.documentaryVisualInputHash(new Map([[1, { ...photos.get(1)!, evidence: {
      ...photos.get(1)!.evidence, attribution: "Corrected credit",
    } }]])));
});


test("approved CC BY-SA original is passed to composition with photo credits", async () => {
  const result = await harness({ photo: true }).reuseDocumentaryVisuals("topic", draft, facts);
  assert.equal(result.get(1)?.evidence.representation, "photo");
  assert.deepEqual(result.get(1)?.bytes, original);
  assert.match(result.get(1)!.evidence.attribution!, /Yource.*CC BY-SA 4.0/);
  assert.match(result.get(1)!.evidence.attribution!, /creativecommons.org/);
});

test("AI reference loader returns approved original bytes and rejects corrupted or expired photos", async () => {
  const api = harness({ photo: true });
  const originals = await api.reuseDocumentaryVisuals("topic", draft, facts);
  const evidence = { ...originals.get(1)!.evidence, generationUse: "ai-reference" as const, referenceTopicId: "topic" };
  const file = await api.readDocumentaryPhotoReference(evidence);
  assert.deepEqual(Buffer.from(await file.arrayBuffer()), original);
  await assert.rejects(harness({ photo: true, corrupt: true }).readDocumentaryPhotoReference(evidence));
  await assert.rejects(api.readDocumentaryPhotoReference({
    ...evidence, photo: { ...evidence.photo!, retrievedAt: "2020-01-01" },
  }));
});
