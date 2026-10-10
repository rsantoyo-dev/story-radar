import assert from "node:assert/strict";
import test from "node:test";
import { Draft2InputError, Draft2ResponseError, type Draft2Fact } from "./draft2-facts.types";
import {
  carriedDecisions, decidedInventory, entityMaterial, inventoryForModels, parseInventoryAction, parseInventoryEntities, personEntity,
  type Draft2Inventory, type Draft2InventoryEntity,
} from "./draft2-inventory.types";

const facts: Draft2Fact[] = [
  { id: "f1", claim: "Mayor Catherine Fournier opened the new library on Rue Saint-Charles.", evidence: "Mayor Catherine Fournier opened the new library on Rue Saint-Charles", kind: "event", status: "established", importance: 90 },
  { id: "f2", claim: "The library was built by Pomerleau.", evidence: "built by Pomerleau", kind: "name", status: "established", importance: 60 },
  { id: "f3", claim: "Longueuil invested $12 million.", evidence: "Longueuil invested $12 million", kind: "number", status: "established", importance: 70 },
];
const answer = (entities: unknown[]) => JSON.stringify({ entities });
const NOW = new Date("2026-10-10T15:00:00.000Z");

test("Claude's list becomes entities whose names their cited facts contain; unknown fact ids, repeats and unnamed entries are dropped", () => {
  const entities = parseInventoryEntities(answer([
    { name: "Catherine Fournier", kind: "person", role: "subject", description: "Longueuil's mayor, who opened the library", factIds: ["f1", "f9"] },
    { name: "Rue Saint-Charles", kind: "place", role: "secondary", description: "The street of the library", factIds: ["f1"] },
    { name: "Pomerleau", kind: "organization", role: "mentioned", description: "The builder", factIds: ["f2"] },
    { name: "Longueuil", kind: "place", role: "secondary", description: "The city", factIds: ["f3"] },
    { name: "catherine fournier", kind: "person", role: "subject", description: "Again", factIds: ["f1"] },
    { name: "Jean Tremblay", kind: "person", role: "mentioned", description: "Not in any fact", factIds: ["f1"] },
    { name: "The library", kind: "spaceship", role: "subject", description: "", factIds: ["f1"] },
  ]), facts);
  assert.deepEqual(entities.map((entity) => [entity.id, entity.name, entity.kind, entity.factIds.join()]), [
    ["e1", "Catherine Fournier", "person", "f1"], ["e2", "Rue Saint-Charles", "place", "f1"], ["e3", "Pomerleau", "organization", "f2"], ["e4", "Longueuil", "place", "f3"],
  ], "a name the facts do not state is never trusted");
  assert.throws(() => parseInventoryEntities("{}", facts), (error: Error) => error instanceof Draft2ResponseError);
  assert.throws(() => parseInventoryEntities("nope", facts), /not valid JSON/);
});

const person = (status: NonNullable<Draft2InventoryEntity["person"]>["status"]): Draft2InventoryEntity => ({
  id: "e1", name: "Catherine Fournier", kind: "person", role: "subject", description: "Mayor", factIds: ["f1"],
  person: { status, candidates: [{ entityId: "Q3048791", name: "Catherine Fournier", description: "Canadian politician", thumbnailUrl: "https://upload.wikimedia.org/x.jpg", author: "A. Photographer", license: "CC BY-SA 4.0", commonsUrl: "https://commons.wikimedia.org/wiki/File:x.jpg" }] },
});
const inventory = (entities: Draft2InventoryEntity[]): Draft2Inventory => ({ status: "ready", version: 3, entities, storyPhotos: [], characters: "auto", roster: [] });

test("a new search keeps the editor's decision on each person still named, and nothing else", () => {
  const earlier = inventory([{ ...person("confirmed"), person: { ...person("confirmed").person!, confirmed: { ...person("candidates").person!.candidates[0], storyPhotoId: "photo-1" } } }]);
  const fresh = parseInventoryEntities(answer([{ name: "Catherine Fournier", kind: "person", role: "subject", description: "Mayor", factIds: ["f1"] }]), facts);
  assert.equal(carriedDecisions(fresh, earlier)[0].person?.status, "confirmed");
  assert.equal(carriedDecisions(fresh, inventory([person("candidates")]))[0].person, undefined, "candidates are searched again");
  assert.equal(carriedDecisions(fresh, undefined)[0].person, undefined);
});

test("an editor decision is a contract: confirm a Wikidata id, reject, reopen, or the characters choice", () => {
  assert.deepEqual(parseInventoryAction({ action: "confirm", entityId: "e1", candidateId: "Q3048791" }), { action: "confirm", entityId: "e1", candidateId: "Q3048791" });
  assert.deepEqual(parseInventoryAction({ action: "characters", characters: "off" }), { action: "characters", characters: "off" });
  assert.deepEqual(parseInventoryAction({ action: "reject", entityId: "e2" }), { action: "reject", entityId: "e2" });
  for (const bad of [{ action: "confirm", entityId: "e1", candidateId: "42" }, { action: "confirm", entityId: "x", candidateId: "Q1" }, { action: "characters", characters: "maybe" }, { action: "delete", entityId: "e1" }]) {
    assert.throws(() => parseInventoryAction(bad), (error: Error) => error instanceof Draft2InputError);
  }
  assert.throws(() => personEntity(inventory([person("candidates")]), "e9"), /e9 is not one of this story's people/);
  const decided = decidedInventory(inventory([person("candidates")]), "e1", (entity) => ({ ...entity, person: { ...entity.person!, status: "rejected" } }), NOW);
  assert.equal(json([decided.version, decided.entities[0].person?.status, decided.updatedAt]), json([4, "rejected", NOW.toISOString()]));
  assert.equal(decidedInventory(inventory([]), undefined, (entity) => entity, NOW, "on").characters, "on");
});

const json = (value: unknown) => JSON.stringify(value);

test("what the visual script may show: a confirmed portrait, a verified place's photo or map, never an organization", () => {
  const confirmed = { ...person("confirmed"), person: { ...person("confirmed").person!, confirmed: { ...person("candidates").person!.candidates[0], storyPhotoId: "photo-1" } } };
  const place: Draft2InventoryEntity = { id: "e2", name: "Rue Saint-Charles", kind: "place", role: "secondary", description: "", factIds: ["f1"], place: { status: "verified", wikidataId: "Q1", map: true, photo: { source: "commons", author: "B", license: "CC BY 4.0", resourceUrl: "https://upload.wikimedia.org/y.jpg", width: 2000, height: 1300, retrievedAt: NOW.toISOString() } } };
  assert.deepEqual(entityMaterial(confirmed), { portrait: true, photo: false, map: false });
  assert.deepEqual(entityMaterial(person("candidates")), { portrait: false, photo: false, map: false }, "a candidate waiting for the editor shows nothing");
  assert.deepEqual(entityMaterial(place), { portrait: false, photo: true, map: true });
  const forModels = inventoryForModels({ ...inventory([confirmed, person("candidates"), place, { id: "e4", name: "Pomerleau", kind: "organization", role: "mentioned", description: "", factIds: ["f2"] }]), storyPhotos: [{ id: "p1", name: "Opening day", description: "", provenance: "Editor", transmissionAllowed: true }, { id: "photo-1", name: "Fournier", description: "", provenance: "Commons", transmissionAllowed: false }] });
  assert.deepEqual(forModels.entities.map((entity) => entity.verifiedMaterial), [
    ["documentary portrait (a real photo pasted unchanged)"], ["none: never depict them; tell the story without showing them"], ["verified place photo", "verified map"], ["none: organizations are never drawn, no logos"],
  ]);
  assert.deepEqual(forModels.storyPhotos.map((photo) => photo.id), ["p1"], "a portrait travels with its person, never as a story photo the model may read");
});
