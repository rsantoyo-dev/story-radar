import assert from "node:assert/strict";
import test from "node:test";
import * as types from "./draft2-facts.types";
import * as funnel from "./draft2-funnel";
import * as inventoryTypes from "./draft2-inventory.types";
import * as openingTypes from "./draft2-opening.types";
import * as skills from "./skills/draft2-skills";
import { loadInSandbox } from "./draft2-test-sandbox";
import type { Draft2Inventory } from "./draft2-inventory.types";

const topicId = "11111111-1111-4111-8111-111111111111";
const storyId = "22222222-2222-4222-8222-222222222222";
const sessionId = "33333333-3333-4333-8333-333333333333";

const facts: types.Draft2Fact[] = [
  { id: "f1", claim: "Mayor Catherine Fournier opened the new library on Rue Saint-Charles.", evidence: "Mayor Catherine Fournier opened the new library on Rue Saint-Charles", kind: "event", status: "established", importance: 90 },
  { id: "f2", claim: "The library was built by Pomerleau.", evidence: "built by Pomerleau", kind: "name", status: "established", importance: 60 },
  { id: "f3", claim: "The Vieux-Longueuil library reopens Saturday.", evidence: "The Vieux-Longueuil library reopens Saturday", kind: "event", status: "established", importance: 70 },
];
const ENTITIES = [
  { name: "Catherine Fournier", kind: "person", role: "subject", description: "Longueuil's mayor", factIds: ["f1"] },
  { name: "Rue Saint-Charles", kind: "place", role: "secondary", description: "The library's street", factIds: ["f1"] },
  { name: "Vieux-Longueuil", kind: "place", role: "secondary", description: "The neighbourhood", factIds: ["f3"] },
  { name: "Pomerleau", kind: "organization", role: "mentioned", description: "The builder", factIds: ["f2"] },
];
const CANDIDATE = { entityId: "Q3048791", name: "Catherine Fournier", description: "Canadian politician", thumbnailUrl: "https://upload.wikimedia.org/x.jpg", author: "A. Photographer", license: "CC BY-SA 4.0", commonsUrl: "https://commons.wikimedia.org/wiki/File:x.jpg" };
const SCOPE = { municipality: "Longueuil", region: "Québec", country: "Canada", validatedLocationId: null };
const photoEvidence = (provider?: "openverse") => ({ evidence: { placeId: "Q1", sourceUrl: "https://commons.wikimedia.org/wiki/File:y.jpg", resourceUrl: "https://upload.wikimedia.org/y.jpg", author: "B. Lens", license: "CC BY 4.0", licenseUrl: "https://creativecommons.org/licenses/by/4.0/", attribution: "B. Lens · CC BY 4.0", captureDate: "2024", retrievedAt: "2026-10-10T12:00:00.000Z", sha256: "abc", width: 2000, height: 1300, contentType: "image/jpeg", ...(provider ? { provider } : {}) }, bytes: Buffer.from("x") });

type Row = Record<string, unknown> & { inventory: Draft2Inventory | null; trace: types.Draft2TraceEntry[]; updatedAt: Date };

function harness({ session, scope = SCOPE, peopleFail = false }: { session?: Record<string, unknown>; scope?: typeof SCOPE | { municipality: string; region: string; country: string; validatedLocationId: null }; peopleFail?: boolean } = {}) {
  const calls: { search: string[]; resolve: string[]; openverse: string[]; imported: string[]; claude: Record<string, unknown>[] } = { search: [], resolve: [], openverse: [], imported: [], claude: [] };
  let row: Row = { id: sessionId, topicId, storyId, step: "deck", status: "ready", facts, inventory: null, error: null, trace: [], updatedAt: new Date(), ...session };
  const profile = { name: "Salut Longueuil", language: "French", region: "Longueuil", platform: "Instagram", audience: "Residents", brandPersonality: [], formality: 30, humor: 40, energy: 60, optimism: 60, provocation: 30, geoScope: scope, geoProviderContact: "editor@example.com" };
  const mocks: Record<string, unknown> = {
    "server-only": {},
    "./draft2-facts.types": types,
    "./draft2-funnel": funnel,
    "./draft2-inventory.types": inventoryTypes,
    "./draft2-opening.types": openingTypes,
    "./skills/draft2-skills": skills,
    "./draft2-dev-trace": { draft2DevTrace: () => undefined },
    "../stories/creative-text-meter": { withCreativeTextBudget: async (_context: unknown, work: () => Promise<unknown>) => work() },
    "../stories/anthropic.config": { getAnthropicRuntimeConfig: () => ({ apiKey: "k", model: "claude-sonnet-5-5" }), requireAnthropicApiKey: () => "k" },
    "../stories/anthropic-structured-response": { generateAnthropicStructuredResponse: async (input: Record<string, unknown>) => {
      calls.claude.push(input);
      return { text: JSON.stringify({ entities: ENTITIES }), provider: "anthropic", model: input.model, usage: { promptTokens: 100, outputTokens: 50, thoughtsTokens: 0, totalTokens: 150 }, cachedInputTokens: 0, cacheWriteTokens: 0, answerCharacters: 400 };
    } },
    "../stories/creative-profile.repository": { getCreativeProfile: async () => profile },
    "../stories/commons-person-photos": {
      searchCommonsPeople: async (_topic: string, _story: string, name: string) => { calls.search.push(name); if (peopleFail) throw new Error("Configure a contact for Wikimedia requests."); return [CANDIDATE]; },
      importCommonsPersonPhoto: async (_topic: string, _story: string, entityId: string, kind: string) => { calls.imported.push(`${entityId}:${kind}`); return { id: "photo-1", name: "Catherine Fournier", description: "Commons portrait", provenance: "Photo: A. Photographer", providerTransmissionAllowed: false, active: true }; },
    },
    "../stories/creative-documentary-providers": { documentaryProviders: () => ({
      resolve: async (mention: { name: string }) => { calls.resolve.push(mention.name); return { id: mention.name === "Rue Saint-Charles" ? "Q111" : "Q222", name: mention.name, sourceUrl: "https://www.wikidata.org/wiki/Q111", revision: 1, scope: SCOPE, hierarchy: [], ...(mention.name === "Rue Saint-Charles" ? { coordinates: { latitude: 45.5, longitude: -73.5 } } : {}) }; },
      photo: async (place: { name: string }) => place.name === "Rue Saint-Charles" ? photoEvidence() : undefined,
    }) },
    "../stories/openverse-place-photo": { openverseEnabled: () => true, openversePlacePhoto: async (input: { place: { name: string } }) => { calls.openverse.push(input.place.name); return photoEvidence("openverse"); } },
    "../stories/creative-place-visual": { placeScopeComplete: (value?: { municipality?: string; region?: string; country?: string }) => Boolean(value?.municipality && value.region && value.country) },
    "../stories/story-materials.repository": { listStoryPhotos: async () => [{ id: "p1", name: "Reading room", description: "The editor's photo", provenance: "Editor", providerTransmissionAllowed: true, active: true }, { id: "p0", name: "Old", description: "", provenance: "", providerTransmissionAllowed: true, active: false }] },
    "../stories/creative-characters.repository": { listCreativeCharacterRoster: async () => [{ id: "char-mia", name: "Mia", description: "An illustrated local presenter", referenceFingerprint: "x" }] },
    "./draft2-session.repository": {
      activeDraft2Session: async () => undefined,
      getDraft2Session: async (topic: string, id: string) => topic === topicId && id === row.id ? row : undefined,
      claimDraft2Session: async (_id: string, patch: Record<string, unknown>) => { row = { ...row, ...patch, status: "running", updatedAt: new Date() }; return row; },
      updateDraft2Session: async (_id: string, patch: Record<string, unknown>) => { row = { ...row, ...patch, updatedAt: new Date() }; return row; },
      touchDraft2Session: async () => undefined,
    },
  };
  const exports = loadInSandbox("./draft2-inventory.ts", mocks, { Date, Buffer, AbortController, setTimeout, clearTimeout, process: { env: {} } }) as Record<string, (...args: unknown[]) => Promise<Row>>;
  return {
    find: () => exports.findDraft2Inventory({ topicId, storyId, sessionId }),
    decide: (input: Record<string, unknown>) => exports.editDraft2Inventory({ topicId, sessionId, input }),
    calls,
    row: () => row,
  };
}

const json = (value: unknown) => JSON.stringify(value);

test("Claude lists who and where from the cached facts; the program looks each up as v1 does and keeps what it found", async () => {
  const h = harness();
  const session = await h.find();
  const [claude] = h.calls.claude;
  assert.equal(json(claude.context), json({ verifiedFacts: funnel.factsSnapshot(facts) }));
  assert.equal(json([claude.schemaName, claude.effort]), json(["draft2_inventory", "medium"]));
  assert.ok(String(claude.instructions).startsWith(skills.DRAFT2_ROLES["people-finder"]));
  const inventory = session.inventory!;
  assert.equal(json([inventory.status, inventory.version, inventory.characters]), json(["ready", 1, "auto"]));
  const [fournier, street, quarter, builder] = inventory.entities;
  assert.equal(json([fournier.person?.status, fournier.person?.candidates.length]), json(["candidates", 1]), "the editor confirms the person");
  assert.equal(json([street.place?.status, street.place?.photo?.source, street.place?.map]), json(["verified", "commons", true]));
  assert.equal(json([quarter.place?.status, quarter.place?.photo?.source, quarter.place?.map]), json(["verified", "openverse", false]), "Openverse when Commons has no eligible photo");
  assert.equal(builder.person ?? builder.place, undefined, "an organization is never looked up");
  assert.equal(json(h.calls.resolve), json(["Rue Saint-Charles", "Vieux-Longueuil"]));
  assert.equal(json(inventory.storyPhotos.map((photo) => photo.id)), json(["p1"]), "active story photos only");
  assert.equal(json(inventory.roster), json([{ id: "char-mia", name: "Mia", description: "An illustrated local presenter" }]));
  assert.equal(json([session.step, session.status]), json(["inventory", "ready"]));
  const [entry] = session.trace;
  assert.equal(json([entry.step, entry.operation, entry.outcome, entry.answerCharacters]), json(["inventory", "draft2_inventory", "ok", JSON.stringify({ entities: ENTITIES }).length]));
});

test("an incomplete geo scope or a failed lookup is recorded on its entity, never fatal", async () => {
  const h = harness({ scope: { municipality: "", region: "Québec", country: "Canada", validatedLocationId: null }, peopleFail: true });
  const session = await h.find();
  const [fournier, street] = session.inventory!.entities;
  assert.equal(json([fournier.person?.status, fournier.person?.note]), json(["unavailable", "Configure a contact for Wikimedia requests."]));
  assert.equal(street.place?.status, "unavailable");
  assert.match(String(street.place?.note), /geo scope \(municipality, region and country\) is incomplete/);
  assert.deepEqual(h.calls.resolve, [], "no place is looked up outside a complete scope");
  assert.equal(session.status, "ready");
});

test("the editor confirms a person's photo (a portrait-only story photo), rejects, reopens, and chooses whether a character narrates", async () => {
  const h = harness();
  await h.find();
  const confirmed = await h.decide({ action: "confirm", entityId: "e1", candidateId: "Q3048791" });
  assert.deepEqual(h.calls.imported, ["Q3048791:person"]);
  assert.equal(json([confirmed.inventory?.entities[0].person?.status, confirmed.inventory?.entities[0].person?.confirmed?.storyPhotoId, confirmed.inventory?.version]), json(["confirmed", "photo-1", 2]));
  assert.equal(confirmed.inventory?.storyPhotos.find((photo) => photo.id === "photo-1")?.transmissionAllowed, false, "never sent to an image model");
  assert.equal((await h.decide({ action: "reopen", entityId: "e1" })).inventory?.entities[0].person?.status, "candidates");
  assert.equal((await h.decide({ action: "reject", entityId: "e1" })).inventory?.entities[0].person?.status, "rejected");
  const off = await h.decide({ action: "characters", characters: "off" });
  assert.equal(json([off.inventory?.characters, off.inventory?.version]), json(["off", 5]));
  await assert.rejects(h.decide({ action: "confirm", entityId: "e1", candidateId: "Q999" }), /Q999 is not one of the Commons candidates/);
  await assert.rejects(h.decide({ action: "confirm", entityId: "e2", candidateId: "Q1" }), /e2 is not one of this story's people/);
});

test("a new search keeps the editor's decisions and the characters choice", async () => {
  const h = harness();
  await h.find();
  await h.decide({ action: "confirm", entityId: "e1", candidateId: "Q3048791" });
  await h.decide({ action: "characters", characters: "on" });
  const again = await h.find();
  assert.equal(json([again.inventory?.entities[0].person?.status, again.inventory?.characters, again.inventory?.version]), json(["confirmed", "on", 4]));
  assert.deepEqual(h.calls.search, ["Catherine Fournier"], "a confirmed person is not searched again");
});

test("people and places are found only in verified facts, and decided only once found", async () => {
  await assert.rejects(harness({ session: { step: "facts", status: "needs-review" } }).find(), (error: Error) => error instanceof types.Draft2InputError && /verified facts/.test(error.message));
  await assert.rejects(harness({ session: { storyId: "44444444-4444-4444-8444-444444444444" } }).find(), /not found for the story/);
  await assert.rejects(harness().decide({ action: "characters", characters: "on" }), /Find the people and places first/);
  const searching = harness({ session: { status: "running", inventory: { status: "running", version: 1, entities: [], storyPhotos: [], characters: "auto", roster: [] } } });
  await assert.rejects(searching.decide({ action: "characters", characters: "on" }), (error: Error) => error instanceof types.Draft2BusyError);
});
