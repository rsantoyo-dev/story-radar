import assert from "node:assert/strict";
import test from "node:test";
import * as types from "./draft2-facts.types";
import * as geoContact from "../stories/creative-geo-contact";
import * as addressCheck from "../stories/place-address-check";
import * as funnel from "./draft2-funnel";
import * as inventoryTypes from "./draft2-inventory.types";
import * as openingTypes from "./draft2-opening.types";
import * as skills from "./skills/draft2-skills";
import * as bankTypes from "../photo-bank/photo-bank.types";
import { loadInSandbox } from "./draft2-test-sandbox";
import type { Draft2Inventory } from "./draft2-inventory.types";
import type { PhotoBankPhoto, PhotoBankSubject, PhotoBankView } from "../photo-bank/photo-bank.types";

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
type StoryPhoto = { id: string; name: string; description: string; provenance: string; providerTransmissionAllowed: boolean; active: boolean; publicationRights?: string; bankPhotoId?: string };
const STORY_PHOTOS: StoryPhoto[] = [{ id: "p1", name: "Reading room", description: "The editor's photo", provenance: "Editor", providerTransmissionAllowed: true, active: true, publicationRights: "own" }, { id: "p0", name: "Old", description: "", provenance: "", providerTransmissionAllowed: true, active: false }];
/** A Google Places match (google-maps-provider.ts, GooglePlaceCandidate). */
const googleMatch = (name: string, address: string) => ({ id: "gp-1", name, address, sourceUrl: "https://www.google.com/maps/search/?api=1&query=x", latitude: 45.53, longitude: -73.51, matchesScope: true, exactName: true, pointSuitable: true, namedPoint: true, photos: [], attributions: [], exclusions: [] });

function harness({ session, scope = SCOPE, peopleFail = false, contact = "editor@example.com", google = false, wikidataMisses = [], googlePlaces = {}, storyFacts = facts, bank = { subjects: [], photos: [] }, bankWikidata = {}, bankFails = false, found = ENTITIES, taxa = {} }: {
  /** What the finder lists. */
  found?: Record<string, unknown>[];
  /** Names Wikidata knows as a taxon or a thing, not a person. */
  taxa?: Record<string, { kind: "taxon" | "thing"; label: string; wikidataId: string }>;
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
  /** The workspace's photo bank, as loadPhotoBank reads it. */
  bank?: PhotoBankView;
  /** Bank photos of people Wikidata knows, by Wikidata id. */
  bankWikidata?: Record<string, string>;
  bankFails?: boolean;
} = {}) {
  const calls: { search: string[]; things: string[]; resolve: string[]; openverse: string[]; imported: string[]; google: string[]; claude: Record<string, unknown>[]; bank: unknown[][] } = { search: [], things: [], resolve: [], openverse: [], imported: [], google: [], claude: [], bank: [] };
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
      return { text: JSON.stringify({ entities: found }), provider: "anthropic", model: input.model, usage: { promptTokens: 100, outputTokens: 50, thoughtsTokens: 0, totalTokens: 150 }, cachedInputTokens: 0, cacheWriteTokens: 0, answerCharacters: 400 };
    } },
    "../stories/creative-profile.repository": { getCreativeProfile: async () => profile },
    "../stories/commons-person-photos": {
      searchCommonsPeople: async (_topic: string, _story: string, name: string) => { calls.search.push(name); if (peopleFail) throw new Error("Configure a contact for Wikimedia requests."); return name === "Catherine Fournier" ? [CANDIDATE] : []; },
      wikidataThing: async (_topic: string, _story: string, name: string) => { calls.things.push(name); return taxa[name]; },
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
    "../photo-bank/photo-bank.types": bankTypes,
    "../observability/logger": { createLogger: () => ({ debug: () => undefined, info: () => undefined, warn: () => undefined, error: () => undefined }) },
    "../photo-bank/photo-bank": {
      workspaceOfTopic: async () => "default",
      syncPhotoBankQuietly: async (workspaceId: string) => { calls.bank.push(["sync", workspaceId]); },
      loadPhotoBank: async () => { if (bankFails) throw new Error("R2 is down"); return bank; },
      // The story's copy of a bank photo: one of its photos, naming the bank photo.
      copyBankPhotoToStory: async (_topic: string, _story: string, bankPhotoId: string) => {
        calls.bank.push(["copy", bankPhotoId]);
        const source = bank.photos.find((entry) => entry.id === bankPhotoId);
        const copy = { id: `copy-${bankPhotoId}`, name: source?.name ?? bankPhotoId, description: "", provenance: source?.provenance ?? "", providerTransmissionAllowed: source?.transmissionAllowed ?? false, active: true, publicationRights: source?.rights ?? "licensed", bankPhotoId };
        photos = [...photos.filter((entry) => entry.id !== copy.id), copy];
        return copy;
      },
      fileStoryPhoto: async (_topic: string, _story: string, storyPhotoId: string, subject: unknown) => { calls.bank.push(["file", storyPhotoId, subject]); },
      untagStoryPhoto: async (_topic: string, _story: string, storyPhotoId: string, subject: unknown) => { calls.bank.push(["untag", storyPhotoId, subject]); },
      confirmBankSubject: async (_topic: string, subjectId: string, options: unknown) => { calls.bank.push(["confirm", subjectId, options]); },
      bankPhotoOfWikidata: async (_topic: string, _kind: string, wikidataId: string) => bankWikidata[wikidataId],
    },
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
  assert.equal(json([street.place?.status, street.place?.note]), json(["not-found", "Wikidata was not checked: add a Wikimedia contact email in the brand's Creative identity → Profile (\"Wikimedia contact email\"). Google Maps has no single match for it within the Topic's geo scope."]));
  assert.equal(json([quarter.place?.status, quarter.place?.google?.name, quarter.place?.map]), json(["verified", "Vieux-Longueuil", true]));
  const neither = await harness({ contact: "", google: false }).find();
  assert.equal(json(neither.inventory!.entities[1].place), json({ status: "unavailable", map: false, note: "Add a Wikimedia contact email in the brand's Creative identity → Profile (\"Wikimedia contact email\") so places can be looked up in Wikidata." }));
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

const bankSubject = (n: number, overrides: Partial<PhotoBankSubject>): PhotoBankSubject => ({ id: `00000000-0000-4000-8000-00000000010${n}`, kind: "place", name: "x", aliases: [], consent: false, confirmed: false, ...overrides });
const bankPhoto = (id: string, subjectIds: string[], overrides: Partial<PhotoBankPhoto> = {}): PhotoBankPhoto => ({
  id, name: id, description: "", provenance: "Ricardo Santoyo", rights: "own", transmissionAllowed: true, source: "upload", subjectIds, uses: 0, retired: false, createdAt: "2026-10-13T00:00:00.000Z", ...overrides,
});
const STREET = bankSubject(1, { name: "Rue Saint-Charles", wikidataId: "Q111" });
const MAYOR = bankSubject(2, { kind: "person", name: "Catherine Fournier", wikidataId: "Q3048791" });
const BANK: PhotoBankView = {
  subjects: [STREET, MAYOR],
  photos: [
    bankPhoto("b-street", [STREET.id], { uses: 1 }),
    bankPhoto("b-street-ref", [STREET.id], { rights: "reference" }),
    bankPhoto("b-mayor", [MAYOR.id], { rights: "licensed", transmissionAllowed: false, source: "commons", provenance: "Photo: A. Photographer · via Wikimedia Commons" }),
  ],
};

test("the photo bank first: a place matched by its Wikidata id takes the bank's photo on its own, as the story's copy, before the Commons photo; a person's wait for the editor", async () => {
  const h = harness({ bank: BANK });
  const session = await h.find();
  assert.equal(json(h.calls.bank.slice(0, 2)), json([["sync", "default"], ["copy", "b-street"]]), "the story photos the bank lacks come in first; then the street takes its photo");
  const [mayor, street, quarter] = session.inventory!.entities;
  assert.equal(json([street.place?.status, street.place?.photo?.source, street.storyPhoto?.id, street.bank?.by, street.bank?.linked]), json(["verified", "commons", "copy-b-street", "wikidata", { bankPhotoId: "b-street", storyPhotoId: "copy-b-street", by: "program" }]));
  assert.equal(json(street.bank?.photos.map((photo) => [photo.id, photo.hold ?? ""])), json([["b-street-ref", "reference only: declare it your own or licensed to publish it"], ["b-street", ""]]), "every photo offered, unused first, with why the program would not give it");
  assert.equal(inventoryTypes.entityMaterial(street).photo, true);
  assert.ok(session.inventory!.storyPhotos.some((photo) => photo.id === "copy-b-street" && photo.bankPhotoId === "b-street"), "the copy is one of the story's photos");
  assert.equal(json([mayor.person?.status, mayor.storyPhoto, mayor.bank?.by, mayor.bank?.photos.map((photo) => photo.id), mayor.bank?.needsConsent]), json(["candidates", undefined, "wikidata", ["b-mayor"], undefined]), "Wikidata knows her: no consent to record, but the editor confirms her once");
  assert.equal(quarter.bank, undefined, "the bank has nothing of it");
});

test("the editor uses a bank photo: the story's copy, the person confirmed once (their next stories take it on their own), consent asked for a person Wikidata does not know", async () => {
  const h = harness({ bank: BANK });
  await h.find();
  const used = await h.decide({ action: "bank", entityId: "e1", bankPhotoId: "b-mayor" });
  const mayor = used.inventory!.entities[0];
  assert.equal(json([mayor.storyPhoto?.id, mayor.bank?.linked, inventoryTypes.entityMaterial(mayor).portrait, used.inventory!.version]), json(["copy-b-mayor", { bankPhotoId: "b-mayor", storyPhotoId: "copy-b-mayor", by: "editor" }, true, 2]));
  assert.equal(json(h.calls.bank.at(-1)), json(["confirm", MAYOR.id, { input: { kind: "person", name: "Catherine Fournier" }, consent: false }]));
  assert.equal(inventoryTypes.awaitsConfirmation(mayor), false, "the autopilot does not wait for her any more");
  await assert.rejects(h.decide({ action: "bank", entityId: "e3", bankPhotoId: "b-mayor" }), /not one the photo bank offers for Vieux-Longueuil/);
  const PRIVATE = { ...BANK, subjects: [STREET, { ...MAYOR, wikidataId: undefined }] };
  const p = harness({ bank: PRIVATE, peopleFail: true });
  const found = await p.find();
  assert.equal(found.inventory!.entities[0].bank?.needsConsent, true);
  await assert.rejects(p.decide({ action: "bank", entityId: "e1", bankPhotoId: "b-mayor" }), /Record that Catherine Fournier agreed to appear in your posts/);
  const consented = await p.decide({ action: "bank", entityId: "e1", bankPhotoId: "b-mayor", consent: true });
  assert.equal(json([consented.inventory!.entities[0].bank?.needsConsent, p.calls.bank.at(-1)]), json([undefined, ["confirm", MAYOR.id, { input: { kind: "person", name: "Catherine Fournier" }, consent: true }]]));
});

test("the editor's choices teach the bank: a photo given is filed under its place, one taken back is forgotten there, and the bank's photo taken off is not given again", async () => {
  const h = harness({ bank: BANK, wikidataMisses: ["Vieux-Longueuil"] });
  await h.find();
  await h.decide({ action: "photo", entityId: "e3", storyPhotoId: "p1" });
  assert.equal(json(h.calls.bank.at(-1)), json(["file", "p1", { kind: "place", name: "Vieux-Longueuil" }]));
  await h.decide({ action: "photo", entityId: "e3", storyPhotoId: null });
  assert.equal(json(h.calls.bank.at(-1)), json(["untag", "p1", { kind: "place", name: "Vieux-Longueuil" }]));
  const calls = h.calls.bank.length;
  const off = await h.decide({ action: "photo", entityId: "e2", storyPhotoId: null });
  const street = off.inventory!.entities[1];
  assert.equal(json([street.storyPhoto, street.bank?.declined, street.bank?.linked]), json([undefined, true, undefined]));
  assert.equal(h.calls.bank.length, calls, "the bank's own photo is not forgotten: only not given here");
  const again = await h.find();
  assert.equal(json([again.inventory!.entities[1].storyPhoto, again.inventory!.entities[1].bank?.declined]), json([undefined, true]), "a new search does not give it again");
  const back = await h.decide({ action: "bank", entityId: "e2", bankPhotoId: "b-street" });
  assert.equal(json([back.inventory!.entities[1].storyPhoto?.id, back.inventory!.entities[1].bank?.declined]), json(["copy-b-street", undefined]), "the editor may still choose it");
});

test("a portrait an earlier story imported from Commons comes from the bank; a bank that cannot be read leaves the lookups as they were", async () => {
  const h = harness({ bankWikidata: { Q3048791: "b-mayor" }, bank: BANK });
  await h.find();
  const confirmed = await h.decide({ action: "confirm", entityId: "e1", candidateId: "Q3048791" });
  assert.deepEqual(h.calls.imported, [], "Commons is not asked again");
  assert.equal(json([confirmed.inventory!.entities[0].person?.status, confirmed.inventory!.entities[0].person?.confirmed?.storyPhotoId]), json(["confirmed", "copy-b-mayor"]));
  const down = await harness({ bank: BANK, bankFails: true }).find();
  assert.equal(json([down.status, down.inventory!.entities.map((entity) => entity.bank ?? null), down.inventory!.entities[1].place?.photo?.source]), json(["ready", [null, null, null, null], "commons"]));
});

test("a name the finder lists as a person that no human carries and Wikidata knows as a species is a thing: drawn generic, never \"never depicted\"; the editor can say so too, and take it back", async () => {
  const tree = { name: "Asiminier trilobé", kind: "person", role: "mentioned", description: "Arbre fruitier indigène", factIds: ["f4"] };
  const storyFacts = [...facts, { id: "f4", claim: "La plantation comprendra l'Asiminier trilobé.", evidence: "Asiminier trilobé", kind: "event" as const, status: "established" as const, importance: 70 }];
  const h = harness({ storyFacts, found: [...ENTITIES, tree], taxa: { "Asiminier trilobé": { kind: "taxon", label: "Asimina triloba", wikidataId: "Q1234" } } });
  const session = await h.find();
  const [fournier, , , , asiminier] = session.inventory!.entities;
  assert.equal(json([asiminier.name, asiminier.kind, asiminier.person, asiminier.note]), json(["Asiminier trilobé", "thing", undefined, "Wikidata knows it as a species (Asimina triloba, Q1234), not a person: it may be drawn, generic."]));
  assert.equal(json([h.calls.search, h.calls.things]), json([["Catherine Fournier", "Asiminier trilobé"], ["Asiminier trilobé"]]), "asked only when no human carries the name");
  assert.equal(json([fournier.kind, fournier.person?.status]), json(["person", "candidates"]));
  // The editor's word on a person the lookups kept: a thing, kept by a new search; taken back, a person to look up again.
  const decided = await h.decide({ action: "thing", entityId: "e1" });
  const [thing] = decided.inventory!.entities;
  assert.equal(json([decided.inventory!.version, thing.kind, thing.decidedThing, thing.note]), json([2, "thing", true, "The editor: not a person, a thing the facts name."]));
  const back = await h.decide({ action: "reopen", entityId: "e1" });
  assert.equal(json([back.inventory!.version, back.inventory!.entities[0].kind, back.inventory!.entities[0].person?.status]), json([3, "person", "none"]));
  await assert.rejects(h.decide({ action: "thing", entityId: "e2" }), /is not listed as a person/);
});
