import "server-only";
import { withCreativeTextBudget } from "../stories/creative-text-meter";
import { generateAnthropicStructuredResponse } from "../stories/anthropic-structured-response";
import { getAnthropicRuntimeConfig, requireAnthropicApiKey } from "../stories/anthropic.config";
import { getCreativeProfile } from "../stories/creative-profile.repository";
import { importCommonsPersonPhoto, searchCommonsPeople } from "../stories/commons-person-photos";
import { documentaryProviders, providerLanguage } from "../stories/creative-documentary-providers";
import { openverseEnabled, openversePlacePhoto } from "../stories/openverse-place-photo";
import { placeScopeComplete } from "../stories/creative-place-visual";
import { resolveGeoContact } from "../stories/creative-geo-contact";
import { googleMapsConfig, googleMapsProvider, selectMatchingGooglePlace, type GoogleMapsConfig } from "../stories/google-maps-provider";
import { providerAddressMatchesStated } from "../stories/place-address-check";
import { listStoryPhotos } from "../stories/story-materials.repository";
import { listCreativeCharacterRoster } from "../stories/creative-characters.repository";
import { bankPhotoOfWikidata, confirmBankSubject, copyBankPhotoToStory, fileStoryPhoto, loadPhotoBank, syncPhotoBankQuietly, untagStoryPhoto, workspaceOfTopic } from "../photo-bank/photo-bank";
import { subjectOfEntity } from "../photo-bank/photo-bank.types";
import { createLogger } from "../observability/logger";
import { activeDraft2Session, claimDraft2Session, getDraft2Session, touchDraft2Session, updateDraft2Session } from "./draft2-session.repository";
import { draft2DevTrace } from "./draft2-dev-trace";
import { traceCost } from "./draft2-trace-cost";
import { comparableText, Draft2BusyError, Draft2InputError, type Draft2Fact, type Draft2TraceEntry } from "./draft2-facts.types";
import { factsSnapshot, failedCall } from "./draft2-funnel";
import {
  DRAFT2_INVENTORY_SCHEMA, INVENTORY_MAX_PEOPLE_LOOKUPS, INVENTORY_MAX_PLACE_LOOKUPS, bankMatches, bankOffer, carriedDecisions, decidedInventory, inventoryEntity, keptPlaceRejections, parseInventoryAction,
  parseInventoryEntities, personEntity, rejectedEntity, reopenedEntity, storyPhotoRightsDiffer, storyPhotosDiffer, withStoryPhoto, withStoryPhotos,
  type Draft2GooglePlace, type Draft2Inventory, type Draft2InventoryEntity, type Draft2InventoryStoryPhoto, type Draft2PlacePhoto,
} from "./draft2-inventory.types";
import { OPENING_STALL_MS } from "./draft2-opening.types";
import { brandBrief, composeInstructions } from "./skills/draft2-skills";
import type { CreativeGeoScope, CreativeProfile } from "../stories/creative-content.types";
import type { PlaceMention } from "../stories/creative-documentary";
import type { Draft2SessionRow } from "@/db/schema";

const log = createLogger("draft2-inventory");
const MAX_OUTPUT_TOKENS = 8_000;
const CALL_TIMEOUT_MS = 120_000;
/** The lookups stop being started past this point, and the providers' requests abort a little later. */
const LOOKUP_BUDGET_MS = 90_000;
const HEARTBEAT_MS = 30_000;

const factsVerified = (session: Draft2SessionRow) => Boolean(session.facts?.length) && (session.step !== "facts" || session.status === "ready");

/** The story photos the editor attached (and Commons portraits they confirmed, and the photo bank's photos given to it), active ones only. */
async function storyPhotos(topicId: string, storyId: string): Promise<Draft2InventoryStoryPhoto[]> {
  const photos = await listStoryPhotos(topicId, storyId);
  return photos.filter((photo) => photo.active).map((photo) => ({
    id: photo.id, name: photo.name, description: photo.description, provenance: photo.provenance, transmissionAllowed: photo.providerTransmissionAllowed, rights: photo.publicationRights,
    ...(photo.bankPhotoId ? { bankPhotoId: photo.bankPhotoId } : {}),
  }));
}

/** A bank offer without the photo it gave. */
const withoutLinked = (bank: NonNullable<Draft2InventoryEntity["bank"]>): NonNullable<Draft2InventoryEntity["bank"]> => {
  const { linked, ...rest } = bank;
  void linked;
  return rest;
};

/** A story photo as an entity links it. */
const asLinked = (photo: { id: string; name: string; provenance: string; providerTransmissionAllowed: boolean; publicationRights: Draft2InventoryStoryPhoto["rights"] }) =>
  ({ id: photo.id, name: photo.name, provenance: photo.provenance, transmissionAllowed: photo.providerTransmissionAllowed, ...(photo.publicationRights ? { rights: photo.publicationRights } : {}) });

/**
 * The workspace's photo bank on the story's people and places, before any
 * outside photo (photo-bank.types.ts): first every story photo the bank does
 * not have yet is brought in, then each person or place is matched, offered
 * the bank's photos, and given one on its own where it may (bankOffer), as
 * the story's own copy. The images step prefers an entity's story photo to
 * the Commons or Openverse photo of a place. A failure leaves the people and
 * places as the lookups found them.
 */
async function withPhotoBank(entities: Draft2InventoryEntity[], { topicId, storyId }: { topicId: string; storyId: string }): Promise<{ entities: Draft2InventoryEntity[]; storyPhotos: Draft2InventoryStoryPhoto[] }> {
  try {
    const workspaceId = await workspaceOfTopic(topicId);
    await syncPhotoBankQuietly(workspaceId);
    const bank = await loadPhotoBank(workspaceId);
    let photos = await storyPhotos(topicId, storyId);
    const matches = bankMatches(entities, bank.subjects);
    const storySubjectIds = new Set([...matches.values()].map((match) => match.subject.id));
    const result: Draft2InventoryEntity[] = [];
    for (const entity of entities) {
      const match = matches.get(entity.id);
      if (!match) { const { bank: earlier, ...rest } = entity; void earlier; result.push(rest); continue; }
      const offer = bankOffer(entity, match, bank, { storySubjectIds, storyPhotos: photos });
      if (!offer.take) { result.push({ ...entity, bank: offer.bank }); continue; }
      try {
        const copy = await copyBankPhotoToStory(topicId, storyId, offer.take);
        photos = await storyPhotos(topicId, storyId);
        result.push({ ...entity, storyPhoto: asLinked(copy), bank: { ...offer.bank, linked: { bankPhotoId: offer.take, storyPhotoId: copy.id, by: "program" } } });
      } catch (error) {
        log.warn("photo bank photo not given to the story", { storyId, entity: entity.id, error: note(error) });
        result.push({ ...entity, bank: offer.bank });
      }
    }
    return { entities: result, storyPhotos: photos };
  } catch (error) {
    log.warn("photo bank not read for the story", { storyId, error: note(error) });
    return { entities, storyPhotos: await storyPhotos(topicId, storyId) };
  }
}

/** The Topic's characters with a reference image, as the visual script may cast them. */
async function roster(topicId: string): Promise<Draft2Inventory["roster"]> {
  return (await listCreativeCharacterRoster(topicId)).map(({ id, name, description }) => ({ id, name, description }));
}

/** A fact excerpt that names the entity, as v1's place lookups expect one. */
const excerptFor = (entity: Draft2InventoryEntity, facts: readonly Draft2Fact[]) =>
  facts.filter((fact) => entity.factIds.includes(fact.id)).map((fact) => fact.evidence).find((evidence) => comparableText(evidence).includes(comparableText(entity.name)))
  ?? facts.find((fact) => entity.factIds.includes(fact.id))?.evidence ?? entity.name;

/** A place as v1's Wikidata lookup reads it (documentaryProviders().resolve); the images step resolves it again the same way. */
export function placeMention(entity: Draft2InventoryEntity, facts: readonly Draft2Fact[]): PlaceMention {
  return { name: entity.name, kind: "named", role: entity.role === "subject" ? "event" : "secondary", excerpt: excerptFor(entity, facts), municipality: "", region: "", country: "", purpose: "location" };
}

const note = (error: unknown) => error instanceof Error ? error.message.slice(0, 200) : "The lookup failed.";

/** Google Maps Platform as v1 configures it, when it is on; a malformed setting reads as off. */
function googleConfig(): GoogleMapsConfig | undefined {
  try {
    const config = googleMapsConfig();
    return config.enabled && config.apiKey ? config : undefined;
  } catch {
    return undefined;
  }
}

/**
 * v1's Google rule (resolve-google-place-map.ts): one name- and scope-matched
 * point, or none, and never one at another street address than the facts
 * state (`otherAddress`). Only the place's identity is kept; the map is
 * drawn when the images are made. One Places text search, billed to the
 * story.
 */
async function googlePlace(maps: ReturnType<typeof googleMapsProvider>, name: string, scope: CreativeGeoScope, language: string, statedText: string): Promise<{ place?: Draft2GooglePlace; otherAddress?: string }> {
  const { candidates, incomplete } = await maps.search({ mode: "google", name, municipality: scope.municipality, region: scope.region, country: scope.country, languageCode: providerLanguage(language) });
  const match = selectMatchingGooglePlace(candidates, incomplete);
  if (!match) return {};
  if (providerAddressMatchesStated(statedText, match.address) === false) return { otherAddress: match.address };
  return { place: { placeId: match.id, name: match.name, address: match.address, latitude: match.latitude, longitude: match.longitude, sourceUrl: match.sourceUrl, exactName: match.exactName } };
}

type PlaceLookup = {
  providers: ReturnType<typeof documentaryProviders> | undefined;
  maps: ReturnType<typeof googleMapsProvider> | undefined;
  profile: CreativeProfile;
  facts: readonly Draft2Fact[];
  topicId: string;
  storyId: string;
  signal: AbortSignal;
  outOfTime: () => boolean;
};

/**
 * One place: Wikidata within the Topic's geo scope, with a Commons photo,
 * else an Openverse one, and a map when it has coordinates; when Wikidata
 * has no match or no coordinates, Google Maps for the map. Verified when
 * either confirms it; otherwise the note says what was checked.
 */
async function lookUpPlace(entity: Draft2InventoryEntity, { providers, maps, profile, facts, topicId, storyId, signal, outOfTime }: PlaceLookup): Promise<NonNullable<Draft2InventoryEntity["place"]>> {
  const scope = profile.geoScope;
  const notes: string[] = [];
  let checked = false;
  let wikidata: { wikidataId: string; sourceUrl: string; photo?: Draft2PlacePhoto; map: boolean } | undefined;
  if (providers) {
    try {
      const evidence = await providers.resolve(placeMention(entity, facts), scope);
      checked = true;
      if (evidence) {
        const found = await providers.photo(evidence).catch(() => undefined)
          ?? (openverseEnabled() && !outOfTime() ? await openversePlacePhoto({ place: evidence, scope, topicId, storyId, signal, contact: profile.geoProviderContact }).catch(() => undefined) : undefined);
        const photo: Draft2PlacePhoto | undefined = found ? {
          source: found.evidence.provider === "openverse" ? "openverse" : "commons", author: found.evidence.author, license: found.evidence.license,
          ...(found.evidence.licenseUrl ? { licenseUrl: found.evidence.licenseUrl } : {}), ...(found.evidence.creditUrl ? { creditUrl: found.evidence.creditUrl } : {}),
          resourceUrl: found.evidence.resourceUrl, width: found.evidence.width, height: found.evidence.height, retrievedAt: found.evidence.retrievedAt,
        } : undefined;
        wikidata = { wikidataId: evidence.id, sourceUrl: evidence.sourceUrl, ...(photo ? { photo } : {}), map: Boolean(evidence.coordinates) };
      } else {
        notes.push("Wikidata has no single match for it within the Topic's geo scope.");
      }
    } catch (error) {
      notes.push(`Wikidata: ${note(error)}`);
    }
  } else {
    notes.push("Wikidata was not checked: add a Wikimedia contact (an email) in the Topic's creative profile.");
  }
  let google: Draft2GooglePlace | undefined;
  if (maps && !wikidata?.map && !outOfTime()) {
    try {
      const stated = facts.filter((fact) => entity.factIds.includes(fact.id)).map((fact) => `${fact.claim} ${fact.evidence}`).join(" ");
      const answer = await googlePlace(maps, entity.name, scope, profile.language, stated);
      checked = true;
      google = answer.place;
      if (answer.otherAddress) notes.push(`Google Maps' match is at ${answer.otherAddress.slice(0, 160)}, not the street address the facts state.`);
      else if (!google) notes.push("Google Maps has no single match for it within the Topic's geo scope.");
    } catch (error) {
      notes.push(`Google Maps: ${note(error)}`);
    }
  }
  // A place only Google confirmed keeps the note on Wikidata: it says why there is no photo.
  if (wikidata || google) return { status: "verified", ...(wikidata ?? {}), ...(google ? { google } : {}), map: Boolean(wikidata?.map || google), ...(!wikidata && notes.length ? { note: notes.join(" ") } : {}) };
  return { status: checked ? "not-found" : "unavailable", map: false, note: notes.join(" ") };
}

/**
 * Looks each entity up the way v1 does, one at a time and within a budget:
 * a person in Wikidata and Commons (candidates for the editor; a decision
 * the editor already made is kept), a place in Wikidata within the Topic's
 * geo scope, else in Google Maps (lookUpPlace). A failed lookup is recorded
 * on its entity, never fatal.
 */
async function lookUp(entities: Draft2InventoryEntity[], { topicId, storyId, profile, facts }: { topicId: string; storyId: string; profile: CreativeProfile; facts: readonly Draft2Fact[] }): Promise<Draft2InventoryEntity[]> {
  const started = Date.now();
  const controller = new AbortController();
  const abort = setTimeout(() => controller.abort(), LOOKUP_BUDGET_MS + 15_000);
  const outOfTime = () => Date.now() - started > LOOKUP_BUDGET_MS;
  try {
    const people = entities.filter((entity) => entity.kind === "person" && !entity.person).slice(0, INVENTORY_MAX_PEOPLE_LOOKUPS).map((entity) => entity.id);
    const places = entities.filter((entity) => entity.kind === "place").slice(0, INVENTORY_MAX_PLACE_LOOKUPS).map((entity) => entity.id);
    const scoped = placeScopeComplete(profile.geoScope);
    // Wikidata asks for a contact on every request; without one, v1's lookups would quietly find nothing.
    const contact = resolveGeoContact(profile.geoProviderContact, process.env.CREATIVE_GEO_CONTACT);
    const providers = scoped && contact && places.length ? documentaryProviders(controller.signal, profile.language, profile.geoProviderContact, { places: places.length }) : undefined;
    const google = scoped && places.length ? googleConfig() : undefined;
    const maps = google ? googleMapsProvider(google, controller.signal) : undefined;
    const lookup: PlaceLookup = { providers, maps, profile, facts, topicId, storyId, signal: controller.signal, outOfTime };
    const result: Draft2InventoryEntity[] = [];
    for (const entity of entities) {
      if (people.includes(entity.id)) {
        if (outOfTime()) { result.push({ ...entity, person: { status: "unavailable", candidates: [], note: "The lookups ran out of time; search again." } }); continue; }
        try {
          const candidates = await searchCommonsPeople(topicId, storyId, entity.name, "person");
          result.push({ ...entity, person: { status: candidates.length ? "candidates" : "none", candidates } });
        } catch (error) {
          result.push({ ...entity, person: { status: "unavailable", candidates: [], note: note(error) } });
        }
        continue;
      }
      if (places.includes(entity.id)) {
        if (!scoped) { result.push({ ...entity, place: { status: "unavailable", map: false, note: "The Topic's geo scope (municipality, region and country) is incomplete, so no place can be verified." } }); continue; }
        if (!providers && !maps) { result.push({ ...entity, place: { status: "unavailable", map: false, note: "Add a Wikimedia contact (an email) in the Topic's creative profile so places can be looked up in Wikidata." } }); continue; }
        if (outOfTime()) { result.push({ ...entity, place: { status: "unavailable", map: false, note: "The lookups ran out of time; search again." } }); continue; }
        result.push({ ...entity, place: await lookUpPlace(entity, lookup) });
        continue;
      }
      result.push(entity);
    }
    return result;
  } finally {
    clearTimeout(abort);
  }
}

/**
 * Finds the people, places and organizations the verified facts name and
 * what verified images exist of them. One Claude call lists them (the
 * program keeps only names the cited facts contain), then the program looks
 * them up. The editor's decisions (a person confirmed or rejected, a place
 * set aside, a story photo linked) and the characters choice carry over to
 * a new search.
 */
export async function findDraft2Inventory({ topicId, storyId, sessionId }: { topicId: string; storyId: string; sessionId: string }): Promise<Draft2SessionRow> {
  const session = await getDraft2Session(topicId, sessionId);
  if (!session || session.storyId !== storyId) throw new Draft2InputError("This Draft 2 session was not found for the story. Reload the canvas.");
  if (await activeDraft2Session(topicId, storyId)) throw new Draft2BusyError("A Draft 2 run is already in progress for this story.");
  if (!factsVerified(session)) throw new Draft2InputError("People and places are found only in verified facts. Verify the facts first.");
  const facts = session.facts ?? [];
  const apiKey = requireAnthropicApiKey();
  const model = getAnthropicRuntimeConfig().model;
  const earlier = session.inventory ?? undefined;
  const running: Draft2Inventory = { ...(earlier ?? { version: 0, entities: [], storyPhotos: [], characters: "auto", roster: [] }), status: "running", error: undefined };
  const claimed = await claimDraft2Session(session.id, { step: "inventory", inventory: running, error: null });
  if (!claimed) throw new Draft2BusyError("A Draft 2 run is already in progress for this story.");
  const trace: Draft2TraceEntry[] = [...session.trace];
  const heartbeat = setInterval(() => { void touchDraft2Session(session.id).catch(() => undefined); }, HEARTBEAT_MS);
  try {
    const found = await withCreativeTextBudget({ topicId, storyId, runId: session.id }, async () => {
      const profile = await getCreativeProfile(topicId);
      const { instructions, skillVersions } = composeInstructions("people-finder", [], brandBrief(profile));
      const contents = { task: "people-and-places" };
      const at = new Date().toISOString();
      const begin = Date.now();
      draft2DevTrace({ step: "inventory", round: 1, provider: "anthropic", model, operation: "draft2_inventory", phase: "request", detail: { instructions, context: { verifiedFacts: `${facts.length} facts (cached)` }, contents } });
      let answered: Awaited<ReturnType<typeof generateAnthropicStructuredResponse>>;
      try {
        answered = await generateAnthropicStructuredResponse({
          apiKey, model, instructions, context: { verifiedFacts: factsSnapshot(facts) }, contents,
          schema: DRAFT2_INVENTORY_SCHEMA, schemaName: "draft2_inventory", maxOutputTokens: MAX_OUTPUT_TOKENS, effort: "medium", timeoutMs: CALL_TIMEOUT_MS,
          auditContext: { runId: session.id, topicId, storyId },
        });
      } catch (error) {
        trace.push({ at, step: "inventory", round: 1, provider: "anthropic", model, operation: "draft2_inventory", durationMs: Date.now() - begin, outcome: "error", note: note(error), ...failedCall(error), skillVersions });
        throw error;
      }
      trace.push({ at, step: "inventory", round: 1, provider: "anthropic", model, operation: "draft2_inventory", durationMs: Date.now() - begin, usage: answered.usage, cachedInputTokens: answered.cachedInputTokens, ...(answered.cacheWriteTokens ? { cacheWriteTokens: answered.cacheWriteTokens } : {}), answerCharacters: answered.text.length, outcome: "ok", skillVersions, effort: "medium", ...traceCost("anthropic", model, answered.usage, answered.cachedInputTokens, answered.cacheWriteTokens) });
      draft2DevTrace({ step: "inventory", round: 1, provider: "anthropic", model, operation: "draft2_inventory", phase: "response", durationMs: Date.now() - begin, detail: { usage: answered.usage, answer: answered.text } });
      const photos = await storyPhotos(topicId, storyId);
      const entities = carriedDecisions(parseInventoryEntities(answered.text, facts), earlier, photos);
      const found = keptPlaceRejections(await lookUp(entities, { topicId, storyId, profile, facts }), earlier);
      // The photo bank first: what earlier stories gave the same places and people.
      const banked = await withPhotoBank(found, { topicId, storyId });
      return { entities: banked.entities, storyPhotos: banked.storyPhotos, roster: await roster(topicId) };
    });
    const now = new Date().toISOString();
    const inventory: Draft2Inventory = {
      status: "ready", version: (earlier?.version ?? 0) + 1, entities: found.entities, storyPhotos: found.storyPhotos, characters: earlier?.characters ?? "auto", roster: found.roster,
      foundBy: { provider: "anthropic", model }, foundAt: now, updatedAt: now,
    };
    return (await updateDraft2Session(session.id, { inventory, trace, status: "ready", error: null })) ?? claimed;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Finding people and places failed.";
    await updateDraft2Session(session.id, { inventory: { ...running, status: "failed", error: message }, trace, status: "failed", error: message }).catch(() => undefined);
    throw error;
  } finally {
    clearInterval(heartbeat);
  }
}

/**
 * One editor decision, with no model call: confirm a person's Commons
 * candidate (the photo is imported as a story photo that is never sent to an
 * image model, only pasted as a documentary portrait), reject a person's
 * candidates or a place's match, take that back, link one of the story's
 * photos to a person or place (or unlink it), read the story's photos again
 * after the editor added one, or say whether the brand's characters may
 * narrate (which reads the roster again), or read the brand's characters
 * again after the editor added one. A decision that changes nothing keeps the
 * version, which a visual script records; so does a roster read again, since
 * a new character is a new choice, not a change to what the steps read.
 */
export async function editDraft2Inventory({ topicId, sessionId, input }: { topicId: string; sessionId: string; input: unknown }): Promise<Draft2SessionRow> {
  const action = parseInventoryAction(input);
  const session = await getDraft2Session(topicId, sessionId);
  if (!session) throw new Draft2InputError("This Draft 2 session was not found. Reload the canvas.");
  const inventory = session.inventory;
  if (!inventory || (inventory.status === "failed" && !inventory.entities.length)) throw new Draft2InputError("Find the people and places first.");
  const searching = inventory.status === "running" && session.status === "running" && Date.now() - new Date(session.updatedAt).getTime() < OPENING_STALL_MS;
  if (searching) throw new Draft2BusyError("People and places are still being found; decide when the search finishes.");
  const now = new Date();
  let next: Draft2Inventory;
  if (action.action === "characters") {
    next = { ...decidedInventory(inventory, undefined, (entity) => entity, now, action.characters), roster: await roster(topicId) };
  } else if (action.action === "roster") {
    const fresh = await roster(topicId);
    if (JSON.stringify(fresh) === JSON.stringify(inventory.roster)) return session;
    next = { ...inventory, roster: fresh, updatedAt: now.toISOString() };
  } else if (action.action === "photos") {
    const refreshed = withStoryPhotos(inventory, await storyPhotos(topicId, session.storyId));
    // A declaration of rights alone keeps the version: the steps read the same photos, and the image step refuses one that may not be published.
    if (!storyPhotosDiffer(refreshed, inventory)) {
      if (!storyPhotoRightsDiffer(refreshed, inventory)) return session;
      next = { ...refreshed, updatedAt: now.toISOString() };
    } else next = { ...refreshed, version: inventory.version + 1, updatedAt: now.toISOString() };
  } else if (action.action === "photo") {
    const entity = inventoryEntity(inventory, action.entityId);
    const photos = await storyPhotos(topicId, session.storyId);
    const photo = action.storyPhotoId === null ? null : photos.find((entry) => entry.id === action.storyPhotoId);
    if (photo === undefined) throw new Draft2InputError("That photo is not one of the story's photos (a removed photo cannot be used). Reload the canvas.");
    const bank = entity.bank;
    // The bank's photo taken off: none is given on its own again. Another photo given: the bank's no longer is.
    const fromBank = bank?.linked && entity.storyPhoto?.id === bank.linked.storyPhotoId;
    const bankAfter = !bank ? undefined
      : photo === null && fromBank ? { ...withoutLinked(bank), declined: true as const }
        : photo && photo.bankPhotoId && bank.photos.some((entry) => entry.id === photo.bankPhotoId) ? { ...bank, linked: { bankPhotoId: photo.bankPhotoId, storyPhotoId: photo.id, by: "editor" as const } }
          : withoutLinked(bank);
    next = decidedInventory(withStoryPhotos(inventory, photos), entity.id, (current) => ({ ...withStoryPhoto(current, photo), ...(bankAfter ? { bank: bankAfter } : {}) }), now);
    // The bank learns which photo shows this place or person, and forgets it when the editor takes back a photo given here.
    const subject = subjectOfEntity(entity);
    if (subject) {
      if (photo) await fileStoryPhoto(topicId, session.storyId, photo.id, subject).catch((error) => log.warn("story photo not filed in the photo bank", { entity: entity.id, error: note(error) }));
      else if (entity.storyPhoto && !fromBank) await untagStoryPhoto(topicId, session.storyId, entity.storyPhoto.id, subject).catch((error) => log.warn("photo bank tag not removed", { entity: entity.id, error: note(error) }));
    }
  } else if (action.action === "bank") {
    const entity = inventoryEntity(inventory, action.entityId);
    const bank = entity.bank;
    const offered = bank?.photos.find((entry) => entry.id === action.bankPhotoId);
    if (!bank || !offered) throw new Draft2InputError(`That photo is not one the photo bank offers for ${entity.name}. Search the people and places again.`);
    if (bank.needsConsent && !action.consent) throw new Draft2InputError(`Record that ${bank.name} agreed to appear in your posts before using their photo.`);
    const copy = await copyBankPhotoToStory(topicId, session.storyId, offered.id);
    const subject = subjectOfEntity(entity);
    if (subject) await confirmBankSubject(topicId, bank.subjectId, { input: subject, consent: action.consent });
    const photos = await storyPhotos(topicId, session.storyId);
    const { needsConsent, declined, ...rest } = bank;
    void declined;
    const chosen = { ...rest, ...(needsConsent && !action.consent ? { needsConsent } : {}), linked: { bankPhotoId: offered.id, storyPhotoId: copy.id, by: "editor" as const } };
    next = decidedInventory(withStoryPhotos(inventory, photos), entity.id, (current) => ({ ...withStoryPhoto(current, asLinked(copy)), bank: chosen }), now);
  } else if (action.action === "confirm") {
    const entity = personEntity(inventory, action.entityId);
    const candidate = entity.person!.candidates.find((entry) => entry.entityId === action.candidateId);
    if (!candidate) throw new Draft2InputError(`${action.candidateId} is not one of the Commons candidates for ${entity.name}.`);
    // A portrait an earlier story imported is in the photo bank: the story takes its copy, without asking Commons again.
    const banked = await bankPhotoOfWikidata(topicId, "person", candidate.entityId).catch(() => undefined);
    const photo = banked ? await copyBankPhotoToStory(topicId, session.storyId, banked) : await importCommonsPersonPhoto(topicId, session.storyId, candidate.entityId, "person");
    next = decidedInventory(inventory, entity.id, (current) => ({ ...current, person: { ...current.person!, status: "confirmed", confirmed: { ...candidate, storyPhotoId: photo.id } } }), now);
    next = { ...next, storyPhotos: [...next.storyPhotos.filter((entry) => entry.id !== photo.id), { id: photo.id, name: photo.name, description: photo.description, provenance: photo.provenance, transmissionAllowed: photo.providerTransmissionAllowed, rights: photo.publicationRights, ...(photo.bankPhotoId ? { bankPhotoId: photo.bankPhotoId } : {}) }] };
  } else {
    const entity = inventoryEntity(inventory, action.entityId);
    next = decidedInventory(inventory, entity.id, action.action === "reject" ? rejectedEntity : reopenedEntity, now);
  }
  const updated = await updateDraft2Session(session.id, { inventory: next });
  if (!updated) throw new Draft2InputError("This Draft 2 session was not found. Reload the canvas.");
  return updated;
}
