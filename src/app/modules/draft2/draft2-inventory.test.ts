import assert from "node:assert/strict";
import test from "node:test";
import * as types from "./draft2-facts.types";
import * as geoContact from "../stories/creative-geo-contact";
import * as addressCheck from "../stories/place-address-check";
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
type StoryPhoto = { id: string; name: string; description: string; provenance: string; providerTransmissionAllowed: boolean; active: boolean; publicationRights?: string };
const STORY_PHOTOS: StoryPhoto[] = [{ id: "p1", name: "Reading room", description: "The editor's photo", provenance: "Editor", providerTransmissionAllowed: true, active: true, publicationRights: "own" }, { id: "p0", name: "Old", description: "", provenance: "", providerTransmissionAllowed: true, active: false }];
/** A Google Places match (google-maps-provider.ts, GooglePlaceCandidate). */
const googleMatch = (name: string, address: string) => ({ id: "gp-1", name, address, sourceUrl: "https://www.google.com/maps/search/?api=1&query=x", latitude: 45.53, longitude: -73.51, matchesScope: true, exactName: true, pointSuitable: true, namedPoint: true, photos: [], attributions: [], exclusions: [] });

function harness({ session, scope = SCOPE, peopleFail = false, contact = "editor@example.com", google = false, wikidataMisses = [], googlePlaces = {}, storyFacts = facts }: {
  session?: Record<string, unknown>;
  scope?: typeof SCOPE | { municipality: string; region: string; country: string; validatedLocationId: null };
  peopleFail?: boolean;
  /** The Topic's Wikimedia contact; none in the environment. */
  contact?: string;
  /** Whether Google Maps Platform is configured. */
  google?: boolean;
  /** Places Wikidata has no match for. */
  wikidataMisses?: string[];
  googlePlaces?: Record<string, ReturnType<typeof googleMatch>>;
  storyFacts?: types.Draft2Fact[];
} = {}) {
  const calls: { search: string[]; resolve: string[]; openverse: string[]; imported: string[]; google: string[]; claude: Record<string, unknown>[] } = { search: [], resolve: [], openverse: [], imported: [], google: [], claude: [] };
  let row: Row = { id: sessionId, topicId, storyId, step: "deck", status: "ready", facts: storyFacts, inventory: null, error: null, trace: [], updatedAt: new Date(), ...session };
  let photos = STORY_PHOTOS;
  let characters = [{ id: "char-mia", name: "Mia", description: "An illustrated local presenter", referenceFingerprint: "x" }];
  const profile = { name: "Salut Longueuil", language: "French", region: "Longueuil", platform: "Instagram", audience: "Residents", brandPersonality: [], formality: 30, humor: 40, energy: 60, optimism: 60, provocation: 30, geoScope: scope, geoProviderContact: contact };
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
      importCommonsPersonPhoto: async (_topic: string, _story: string, entityId: string, kind: string) => { calls.imported.push(`${entityId}:${kind}`); return { id: "photo-1", name: "Catherine Fournier", description: "Commons portrait", provenance: "Photo: A. Photographer", providerTransmissionAllowed: false, active: true, publicationRights: "licensed" }; },
    },
    "../stories/creative-documentary-providers": { providerLanguage: () => "fr", documentaryProviders: () => ({
      resolve: async (mention: { name: string }) => {
        calls.resolve.push(mention.name);
        if (wikidataMisses.includes(mention.name)) return undefined;
        return { id: mention.name === "Rue Saint-Charles" ? "Q111" : "Q222", name: mention.name, sourceUrl: "https://www.wikidata.org/wiki/Q111", revision: 1, scope: SCOPE, hierarchy: [], ...(mention.name === "Rue Saint-Charles" ? { coordinates: { latitude: 45.5, longitude: -73.5 } } : {}) };
      },
      photo: async (place: { name: string }) => place.name === "Rue Saint-Charles" ? photoEvidence() : undefined,
    }) },
    "../stories/creative-geo-contact": geoContact,
    "../stories/place-address-check": addressCheck,
    "../stories/google-maps-provider": {
      googleMapsConfig: () => ({ enabled: google, apiKey: google ? "g-key" : "", signingSecret: "", maxPhotos: 2, maxPreviewsPerDay: 10 }),
      googleMapsProvider: () => ({ search: async (input: { name: string }) => { calls.google.push(input.name); return { candidates: googlePlaces[input.name] ? [googlePlaces[input.name]] : [], incomplete: false }; } }),
      selectMatchingGooglePlace: (candidates: { matchesScope: boolean }[], incomplete: boolean) => incomplete ? undefined : candidates.find((candidate) => candidate.matchesScope),
    },
    "../stories/openverse-place-photo": { openverseEnabled: () => true, openversePlacePhoto: async (input: { place: { name: string } }) => { calls.openverse.push(input.place.name); return photoEvidence("openverse"); } },
    "../stories/creative-place-visual": { placeScopeComplete: (value?: { municipality?: string; region?: string; country?: string }) => Boolean(value?.municipality && value.region && value.country) },
    "../stories/story-materials.repository": { listStoryPhotos: async () => photos },
    "../stories/creative-characters.repository": { listCreativeCharacterRoster: async () => characters },
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
    /** The story's photos from now on, as the editor added or removed some. */
    setPhotos: (next: StoryPhoto[]) => { photos = next; },
    /** The brand's characters with a reference image from now on, as the editor added one. */
    setCharacters: (next: typeof characters) => { characters = next; },
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

test("a place Wikidata has no match or no coordinates for is looked up in Google Maps for its map, never one at another street address than the facts state", async () => {
  const h = harness({ google: true, wikidataMisses: ["Vieux-Longueuil"], googlePlaces: { "Vieux-Longueuil": googleMatch("Vieux-Longueuil", "Vieux-Longueuil, Longueuil, QC, Canada") } });
  const [, street, quarter] = (await h.find()).inventory!.entities;
  assert.equal(json([street.place?.status, street.place?.map, street.place?.google]), json(["verified", true, undefined]), "Wikidata's coordinates are enough for a map");
  assert.equal(json([quarter.place?.status, quarter.place?.map, quarter.place?.google?.placeId, quarter.place?.wikidataId]), json(["verified", true, "gp-1", undefined]));
  assert.equal(quarter.place?.note, "Wikidata has no single match for it within the Topic's geo scope.", "it says why there is no photo");
  assert.deepEqual(h.calls.google, ["Vieux-Longueuil"]);
  const stated: types.Draft2Fact[] = [...facts.slice(0, 2), { ...facts[2], claim: "The Vieux-Longueuil library at 100 rue Saint-Laurent reopens Saturday.", evidence: "The Vieux-Longueuil library at 100 rue Saint-Laurent reopens Saturday" }];
  const elsewhere = harness({ google: true, storyFacts: stated, wikidataMisses: ["Vieux-Longueuil"], googlePlaces: { "Vieux-Longueuil": googleMatch("Vieux-Longueuil", "250 Rue Saint-Charles O, Longueuil, QC") } });
  const moved = (await elsewhere.find()).inventory!.entities[2];
  assert.equal(json([moved.place?.status, moved.place?.map]), json(["not-found", false]));
  assert.match(String(moved.place?.note), /Google Maps' match is at 250 Rue Saint-Charles O, Longueuil, QC, not the street address the facts state\./);
});

test("without a Wikimedia contact, Wikidata is not asked and the note says so; Google Maps still is, and with neither a place is not checked", async () => {
  const h = harness({ contact: "", google: true, googlePlaces: { "Vieux-Longueuil": googleMatch("Vieux-Longueuil", "Vieux-Longueuil, Longueuil, QC, Canada") } });
  const [, street, quarter] = (await h.find()).inventory!.entities;
  assert.deepEqual(h.calls.resolve, [], "no Wikidata request without a contact");
  assert.equal(json([street.place?.status, street.place?.note]), json(["not-found", "Wikidata was not checked: add a Wikimedia contact (an email) in the Topic's creative profile. Google Maps has no single match for it within the Topic's geo scope."]));
  assert.equal(json([quarter.place?.status, quarter.place?.google?.name, quarter.place?.map]), json(["verified", "Vieux-Longueuil", true]));
  const neither = await harness({ contact: "", google: false }).find();
  assert.equal(json(neither.inventory!.entities[1].place), json({ status: "unavailable", map: false, note: "Add a Wikimedia contact (an email) in the Topic's creative profile so places can be looked up in Wikidata." }));
});

test("the editor gives a person or place one of the story's photos and takes it back; the photos are read again after one is added or removed", async () => {
  const h = harness({ wikidataMisses: ["Vieux-Longueuil"] });
  await h.find();
  const linked = await h.decide({ action: "photo", entityId: "e3", storyPhotoId: "p1" });
  const quarter = linked.inventory!.entities[2];
  assert.equal(json([quarter.storyPhoto, linked.inventory!.version]), json([{ id: "p1", name: "Reading room", provenance: "Editor", transmissionAllowed: true, rights: "own" }, 2]));
  assert.equal(json(inventoryTypes.entityMaterial(quarter)), json({ portrait: false, photo: true, map: false }), "a place Wikidata missed shows the editor's photo");
  const portrait = await h.decide({ action: "photo", entityId: "e1", storyPhotoId: "p1" });
  assert.equal(inventoryTypes.entityMaterial(portrait.inventory!.entities[0]).portrait, true);
  assert.equal(json(inventoryTypes.referencePhotos(portrait.inventory!)), json([]), "a person's photo is only ever their portrait");
  const unlinked = await h.decide({ action: "photo", entityId: "e1", storyPhotoId: null });
  assert.equal(json([unlinked.inventory!.entities[0].storyPhoto, unlinked.inventory!.version]), json([undefined, 4]));
  assert.equal((await h.decide({ action: "photos" })).inventory!.version, 4, "nothing changed: the version a visual script follows stays");
  h.setPhotos([{ id: "p1", name: "Reading room", description: "", provenance: "Editor", providerTransmissionAllowed: true, active: false }, { id: "p2", name: "Front door", description: "The entrance", provenance: "Editor", providerTransmissionAllowed: false, active: true }]);
  const refreshed = await h.decide({ action: "photos" });
  assert.equal(json([refreshed.inventory!.version, refreshed.inventory!.storyPhotos.map((photo) => photo.id), refreshed.inventory!.entities[2].storyPhoto]), json([5, ["p2"], undefined]), "a removed photo's link is dropped");
  await assert.rejects(h.decide({ action: "photo", entityId: "e3", storyPhotoId: "p1" }), /not one of the story's photos/);
  await assert.rejects(h.decide({ action: "photo", entityId: "e4", storyPhotoId: "p2" }), /e4 is not one of this story's people or places/);
});

test("a photo the editor declares reference only is never shown: the declaration alone keeps the version, and declaring it again brings it back", async () => {
  const h = harness({ wikidataMisses: ["Vieux-Longueuil"] });
  await h.find();
  const linked = await h.decide({ action: "photo", entityId: "e3", storyPhotoId: "p1" });
  assert.equal(inventoryTypes.entityMaterial(linked.inventory!.entities[2]).photo, true);
  h.setPhotos([{ ...STORY_PHOTOS[0], publicationRights: "reference" }]);
  const declared = await h.decide({ action: "photos" });
  assert.equal(json([declared.inventory!.version, declared.inventory!.storyPhotos[0].rights, declared.inventory!.entities[2].storyPhoto?.rights]), json([2, "reference", "reference"]), "the same photos: the version a visual script follows stays");
  assert.equal(json([inventoryTypes.entityMaterial(declared.inventory!.entities[2]).photo, inventoryTypes.referencePhotos(declared.inventory!)]), json([false, []]), "reference only: neither the place's photo nor a photo of its own");
  assert.equal((await h.decide({ action: "photos" })).inventory!.version, 2, "nothing changed");
  h.setPhotos([{ ...STORY_PHOTOS[0], publicationRights: "own" }]);
  assert.equal(inventoryTypes.entityMaterial((await h.decide({ action: "photos" })).inventory!.entities[2]).photo, true);
});

test("the editor sets a wrong place aside and takes it back; a new search keeps it aside while it finds the same match, and keeps the photos given", async () => {
  const h = harness();
  await h.find();
  const aside = await h.decide({ action: "reject", entityId: "e2" });
  assert.equal(json([aside.inventory!.entities[1].place?.status, inventoryTypes.entityMaterial(aside.inventory!.entities[1])]), json(["rejected", { portrait: false, photo: false, map: false }]));
  await h.decide({ action: "photo", entityId: "e3", storyPhotoId: "p1" });
  const again = await h.find();
  assert.equal(json([again.inventory!.entities[1].place?.status, again.inventory!.entities[2].storyPhoto?.id]), json(["rejected", "p1"]), "the same Wikidata item comes back: still aside");
  const back = await h.decide({ action: "reopen", entityId: "e2" });
  assert.equal(back.inventory!.entities[1].place?.status, "verified");
  await assert.rejects(h.decide({ action: "reopen", entityId: "e2" }), /has no decision to take back/);
  await assert.rejects(h.decide({ action: "reject", entityId: "e4" }), /e4 is not one of this story's people or places/);
});

test("the brand's characters are read again after the editor adds one, and the version a visual script follows stays", async () => {
  const h = harness();
  const found = await h.find();
  const version = found.inventory!.version;
  assert.equal(await h.decide({ action: "roster" }), h.row(), "nothing new: the session as it was");
  h.setCharacters([{ id: "char-mia", name: "Mia", description: "An illustrated local presenter", referenceFingerprint: "x" }, { id: "char-elvis", name: "Elvis", description: "An illustrated music fan", referenceFingerprint: "y" }]);
  const read = await h.decide({ action: "roster" });
  assert.equal(json([read.inventory!.roster.map((character) => character.name), read.inventory!.version]), json([["Mia", "Elvis"], version]), "a new character is a new choice: nothing made so far goes stale");
});
