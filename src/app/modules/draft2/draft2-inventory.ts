import "server-only";
import { withCreativeTextBudget } from "../stories/creative-text-meter";
import { generateAnthropicStructuredResponse } from "../stories/anthropic-structured-response";
import { getAnthropicRuntimeConfig, requireAnthropicApiKey } from "../stories/anthropic.config";
import { getCreativeProfile } from "../stories/creative-profile.repository";
import { importCommonsPersonPhoto, searchCommonsPeople } from "../stories/commons-person-photos";
import { documentaryProviders } from "../stories/creative-documentary-providers";
import { openverseEnabled, openversePlacePhoto } from "../stories/openverse-place-photo";
import { placeScopeComplete } from "../stories/creative-place-visual";
import { listStoryPhotos } from "../stories/story-materials.repository";
import { listCreativeCharacterRoster } from "../stories/creative-characters.repository";
import { activeDraft2Session, claimDraft2Session, getDraft2Session, touchDraft2Session, updateDraft2Session } from "./draft2-session.repository";
import { draft2DevTrace } from "./draft2-dev-trace";
import { comparableText, Draft2BusyError, Draft2InputError, type Draft2Fact, type Draft2TraceEntry } from "./draft2-facts.types";
import { factsSnapshot, failedCall } from "./draft2-funnel";
import {
  DRAFT2_INVENTORY_SCHEMA, INVENTORY_MAX_PEOPLE_LOOKUPS, INVENTORY_MAX_PLACE_LOOKUPS, carriedDecisions, decidedInventory, parseInventoryAction, parseInventoryEntities, personEntity,
  type Draft2Inventory, type Draft2InventoryEntity, type Draft2InventoryStoryPhoto, type Draft2PlacePhoto,
} from "./draft2-inventory.types";
import { OPENING_STALL_MS } from "./draft2-opening.types";
import { brandBrief, composeInstructions } from "./skills/draft2-skills";
import type { CreativeProfile } from "../stories/creative-content.types";
import type { Draft2SessionRow } from "@/db/schema";

const MAX_OUTPUT_TOKENS = 8_000;
const CALL_TIMEOUT_MS = 120_000;
/** The lookups stop being started past this point, and the providers' requests abort a little later. */
const LOOKUP_BUDGET_MS = 90_000;
const HEARTBEAT_MS = 30_000;

const factsVerified = (session: Draft2SessionRow) => Boolean(session.facts?.length) && (session.step !== "facts" || session.status === "ready");

/** The story photos the editor attached (and Commons portraits they confirmed), active ones only. */
async function storyPhotos(topicId: string, storyId: string): Promise<Draft2InventoryStoryPhoto[]> {
  const photos = await listStoryPhotos(topicId, storyId);
  return photos.filter((photo) => photo.active).map((photo) => ({ id: photo.id, name: photo.name, description: photo.description, provenance: photo.provenance, transmissionAllowed: photo.providerTransmissionAllowed }));
}

/** The Topic's characters with a reference image, as the visual script may cast them. */
async function roster(topicId: string): Promise<Draft2Inventory["roster"]> {
  return (await listCreativeCharacterRoster(topicId)).map(({ id, name, description }) => ({ id, name, description }));
}

/** A fact excerpt that names the entity, as v1's place lookups expect one. */
const excerptFor = (entity: Draft2InventoryEntity, facts: readonly Draft2Fact[]) =>
  facts.filter((fact) => entity.factIds.includes(fact.id)).map((fact) => fact.evidence).find((evidence) => comparableText(evidence).includes(comparableText(entity.name)))
  ?? facts.find((fact) => entity.factIds.includes(fact.id))?.evidence ?? entity.name;

const note = (error: unknown) => error instanceof Error ? error.message.slice(0, 200) : "The lookup failed.";

/**
 * Looks each entity up the way v1 does, one at a time and within a budget:
 * a person in Wikidata and Commons (candidates for the editor; a decision
 * the editor already made is kept), a place in Wikidata within the Topic's
 * geo scope, with a Commons photo, else an Openverse one, and whether it has
 * coordinates for a map. A failed lookup is recorded on its entity, never
 * fatal.
 */
async function lookUp(entities: Draft2InventoryEntity[], { topicId, storyId, profile, facts }: { topicId: string; storyId: string; profile: CreativeProfile; facts: readonly Draft2Fact[] }): Promise<Draft2InventoryEntity[]> {
  const started = Date.now();
  const controller = new AbortController();
  const abort = setTimeout(() => controller.abort(), LOOKUP_BUDGET_MS + 15_000);
  const outOfTime = () => Date.now() - started > LOOKUP_BUDGET_MS;
  try {
    const people = entities.filter((entity) => entity.kind === "person" && !entity.person).slice(0, INVENTORY_MAX_PEOPLE_LOOKUPS).map((entity) => entity.id);
    const places = entities.filter((entity) => entity.kind === "place").slice(0, INVENTORY_MAX_PLACE_LOOKUPS).map((entity) => entity.id);
    const scope = profile.geoScope;
    const scoped = placeScopeComplete(scope);
    const providers = scoped && places.length ? documentaryProviders(controller.signal, profile.language, profile.geoProviderContact, { places: places.length }) : undefined;
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
        if (!scoped || !providers) { result.push({ ...entity, place: { status: "unavailable", map: false, note: "The Topic's geo scope (municipality, region and country) is incomplete, so no place can be verified." } }); continue; }
        if (outOfTime()) { result.push({ ...entity, place: { status: "unavailable", map: false, note: "The lookups ran out of time; search again." } }); continue; }
        try {
          const evidence = await providers.resolve({ name: entity.name, kind: "named", role: entity.role === "subject" ? "event" : "secondary", excerpt: excerptFor(entity, facts), municipality: "", region: "", country: "", purpose: "location" }, scope);
          if (!evidence) { result.push({ ...entity, place: { status: "not-found", map: false, note: "Wikidata has no single match for it within the Topic's geo scope." } }); continue; }
          const found = await providers.photo(evidence).catch(() => undefined)
            ?? (openverseEnabled() && !outOfTime() ? await openversePlacePhoto({ place: evidence, scope, topicId, storyId, signal: controller.signal, contact: profile.geoProviderContact }).catch(() => undefined) : undefined);
          const photo: Draft2PlacePhoto | undefined = found ? {
            source: found.evidence.provider === "openverse" ? "openverse" : "commons", author: found.evidence.author, license: found.evidence.license,
            ...(found.evidence.licenseUrl ? { licenseUrl: found.evidence.licenseUrl } : {}), ...(found.evidence.creditUrl ? { creditUrl: found.evidence.creditUrl } : {}),
            resourceUrl: found.evidence.resourceUrl, width: found.evidence.width, height: found.evidence.height, retrievedAt: found.evidence.retrievedAt,
          } : undefined;
          result.push({ ...entity, place: { status: "verified", wikidataId: evidence.id, sourceUrl: evidence.sourceUrl, ...(photo ? { photo } : {}), map: Boolean(evidence.coordinates) } });
        } catch (error) {
          result.push({ ...entity, place: { status: "unavailable", map: false, note: note(error) } });
        }
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
 * them up. Decisions the editor already made on a person, and the
 * characters choice, carry over to a new search.
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
      trace.push({ at, step: "inventory", round: 1, provider: "anthropic", model, operation: "draft2_inventory", durationMs: Date.now() - begin, usage: answered.usage, cachedInputTokens: answered.cachedInputTokens, ...(answered.cacheWriteTokens ? { cacheWriteTokens: answered.cacheWriteTokens } : {}), answerCharacters: answered.text.length, outcome: "ok", skillVersions });
      draft2DevTrace({ step: "inventory", round: 1, provider: "anthropic", model, operation: "draft2_inventory", phase: "response", durationMs: Date.now() - begin, detail: { usage: answered.usage, answer: answered.text } });
      const entities = carriedDecisions(parseInventoryEntities(answered.text, facts), earlier);
      return { entities: await lookUp(entities, { topicId, storyId, profile, facts }), storyPhotos: await storyPhotos(topicId, storyId), roster: await roster(topicId) };
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
 * image model, only pasted as a documentary portrait), reject them all,
 * reopen the choice, or say whether the brand's characters may narrate
 * (which reads the roster again).
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
  } else {
    const entity = personEntity(inventory, action.entityId);
    if (action.action === "confirm") {
      const candidate = entity.person!.candidates.find((entry) => entry.entityId === action.candidateId);
      if (!candidate) throw new Draft2InputError(`${action.candidateId} is not one of the Commons candidates for ${entity.name}.`);
      const photo = await importCommonsPersonPhoto(topicId, session.storyId, candidate.entityId, "person");
      next = decidedInventory(inventory, entity.id, (current) => ({ ...current, person: { ...current.person!, status: "confirmed", confirmed: { ...candidate, storyPhotoId: photo.id } } }), now);
      next = { ...next, storyPhotos: [...next.storyPhotos.filter((entry) => entry.id !== photo.id), { id: photo.id, name: photo.name, description: photo.description, provenance: photo.provenance, transmissionAllowed: photo.providerTransmissionAllowed }] };
    } else if (action.action === "reject") {
      next = decidedInventory(inventory, entity.id, (current) => ({ ...current, person: { ...current.person!, status: "rejected", confirmed: undefined } }), now);
    } else {
      next = decidedInventory(inventory, entity.id, (current) => ({ ...current, person: { ...current.person!, status: current.person!.candidates.length ? "candidates" : "none", confirmed: undefined } }), now);
    }
  }
  const updated = await updateDraft2Session(session.id, { inventory: next });
  if (!updated) throw new Draft2InputError("This Draft 2 session was not found. Reload the canvas.");
  return updated;
}
