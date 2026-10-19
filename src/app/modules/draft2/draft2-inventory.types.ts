import { comparableText, Draft2InputError, Draft2ResponseError, type Draft2Fact } from "./draft2-facts.types";
import type { Draft2Provider } from "./draft2-models";
import { publishablePhoto, type StoryPhotoRights } from "../stories/story-materials.types";
import {
  matchSubject, mayShow, photoHold, photoToTake, photosInOrder, queryOfEntity, takesPhotoOnItsOwn,
  type PhotoBankMatch, type PhotoBankMatchBy, type PhotoBankSubject, type PhotoBankView,
} from "../photo-bank/photo-bank.types";

/**
 * People and places, the Draft 2 step before the visual script: who and
 * where the story involves, and what verified images exist of them. Claude
 * lists the people, places and organizations the verified facts name; the
 * program keeps only names its cited facts contain, then looks them up the
 * way v1 does: a person in Wikidata and Commons (candidates the editor
 * confirms, used only as a documentary portrait pasted unchanged, never
 * generated), a place in Wikidata within the Topic's geo scope with a
 * Commons or Openverse photo and its coordinates, else in Google Maps for
 * its map. When the lookups find nothing, the editor links one of the
 * story's own photos (uploaded, or found on Commons under another name) to
 * the person or place. Before any of that, the workspace's photo bank
 * (photo-bank.types.ts) offers the photos earlier stories gave the same place
 * or person, and gives one on its own where it may. Organizations are never
 * drawn (no logos). The editor also says whether the brand's characters may
 * narrate. Everything here is pure: contracts, the schema, parsing, the
 * editor's decisions and what the visual script may use.
 */
/** thing (2026-10-18): a plant, an animal, a dish, a product or an object the facts name; never looked up, drawn generically. A name listed as a person that Wikidata knows as a taxon or a thing becomes one; the editor can say so too. */
export const INVENTORY_KINDS = ["person", "place", "organization", "thing"] as const;
export const INVENTORY_ROLES = ["subject", "secondary", "mentioned"] as const;
export const INVENTORY_CHARACTER_CHOICES = ["auto", "on", "off"] as const;
export const INVENTORY_MAX_ENTITIES = 16;
/** Commons lookups are polite and slow: the people and places a carousel can show. */
export const INVENTORY_MAX_PEOPLE_LOOKUPS = 8;
export const INVENTORY_MAX_PLACE_LOOKUPS = 6;
const DESCRIPTION_MAX_CHARACTERS = 200;

export type Draft2InventoryKind = (typeof INVENTORY_KINDS)[number];
export type Draft2InventoryRole = (typeof INVENTORY_ROLES)[number];
/** auto: each visual script decides whether a brand character narrates; on: one must; off: none may. */
export type Draft2CharacterChoice = (typeof INVENTORY_CHARACTER_CHOICES)[number];

/** A Commons candidate for a person (commons-person-photos.ts, CommonsPersonCandidate). */
export type Draft2PersonCandidate = {
  entityId: string;
  name: string;
  description?: string;
  birthYear?: number;
  thumbnailUrl: string;
  author: string;
  license: string;
  commonsUrl: string;
  /** Commons warns of personality rights; the editor reads it before confirming. */
  personalityRights?: true;
};

/** A verified photo of a place: who took it, under which license, from where. Checked again before any image is made (24 h). */
export type Draft2PlacePhoto = {
  source: "commons" | "openverse";
  author: string;
  license: string;
  licenseUrl?: string;
  creditUrl?: string;
  resourceUrl: string;
  width: number;
  height: number;
  retrievedAt: string;
};

/**
 * A place Google Maps matched where Wikidata could not confirm or map it:
 * v1's rule (selectMatchingGooglePlace), one name- and scope-matched point.
 * Only its identity is kept; the map is drawn when the images are made.
 */
export type Draft2GooglePlace = {
  placeId: string;
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  sourceUrl: string;
  /** Google's name is the story's; otherwise it was the one named point in scope, and the editor checks it is the same place. */
  exactName: boolean;
};

/**
 * A photo already attached to the story, by the editor or from Commons, with
 * what the publication may do with it: only one that is its own or licensed
 * appears in a published image. A snapshot taken before the declaration has
 * no rights and reads as reference only.
 */
export type Draft2InventoryStoryPhoto = {
  id: string; name: string; description: string; provenance: string; transmissionAllowed: boolean; rights?: StoryPhotoRights;
  /** The photo bank's photo it is, or is a copy of. */
  bankPhotoId?: string;
};
/** A story photo as it is linked to a person or place. */
export type Draft2LinkedPhoto = Pick<Draft2InventoryStoryPhoto, "id" | "name" | "provenance" | "transmissionAllowed" | "rights">;

/** A photo the workspace's photo bank offers a story's person or place. */
export type Draft2BankPhoto = {
  id: string;
  name: string;
  provenance: string;
  rights: StoryPhotoRights;
  transmissionAllowed: boolean;
  /** The other places and people it shows, by the bank's names. */
  alsoShows: string[];
  /** The stories that have it. */
  uses: number;
  /** Why the program does not give it on its own (reference only, someone not in the story in it…); absent when it may. */
  hold?: string;
};

/**
 * What the photo bank has of a story's person or place: the place or person
 * it matched (by Google Maps or Wikidata id, or by name) and its photos in the
 * order they are offered.
 */
export type Draft2BankMatch = {
  subjectId: string;
  /** The bank's name for them. */
  name: string;
  by: PhotoBankMatchBy;
  photos: Draft2BankPhoto[];
  /** A person Wikidata does not know whose consent to appear is not recorded: the editor records it when choosing their photo. */
  needsConsent?: true;
  /** The bank photo the story has for them (the story's copy), and who gave it. */
  linked?: { bankPhotoId: string; storyPhotoId: string; by: "program" | "editor" };
  /** The editor took the bank's photo off: none is given on its own again. */
  declined?: true;
};

export type Draft2InventoryEntity = {
  /** e1, e2…, stable while the story's names do not change. */
  id: string;
  name: string;
  kind: Draft2InventoryKind;
  role: Draft2InventoryRole;
  /** Who or what it is in this story, in one line. */
  description: string;
  factIds: string[];
  /** Why it is a thing: what Wikidata knows it as, or the editor's word. */
  note?: string;
  /** The editor said it is a thing, not a person: a new search keeps it so. */
  decidedThing?: true;
  /**
   * A person: Commons candidates for the editor to confirm. The confirmed
   * one is stored as a story photo and can only appear as a documentary
   * portrait, pasted unchanged; a person is never generated.
   */
  person?: {
    status: "candidates" | "none" | "confirmed" | "rejected" | "unavailable";
    candidates: Draft2PersonCandidate[];
    confirmed?: Draft2PersonCandidate & { storyPhotoId: string };
    note?: string;
  };
  /**
   * A place: its identity within the Topic's geo scope (Wikidata, else
   * Google Maps), a verified photo, and whether a map can be drawn
   * (coordinates). "rejected": the editor said the match is another place.
   */
  place?: {
    status: "verified" | "not-found" | "unavailable" | "rejected";
    wikidataId?: string;
    sourceUrl?: string;
    photo?: Draft2PlacePhoto;
    google?: Draft2GooglePlace;
    map: boolean;
    note?: string;
  };
  /**
   * One of the story's photos the editor says shows them: a person's is only
   * ever a documentary portrait, pasted unchanged; a place's is its photo.
   * A photo the bank gave is one too: the story's copy of it.
   */
  storyPhoto?: Draft2LinkedPhoto;
  /** What the workspace's photo bank has of them. */
  bank?: Draft2BankMatch;
};

export type Draft2Inventory = {
  status: "running" | "ready" | "failed";
  /** One more on every search and every editor decision; a visual script records the version it followed. */
  version: number;
  entities: Draft2InventoryEntity[];
  storyPhotos: Draft2InventoryStoryPhoto[];
  characters: Draft2CharacterChoice;
  /** The Topic's characters with a reference image, as they were read; refreshed on every search and characters choice. */
  roster: { id: string; name: string; description: string }[];
  foundBy?: { provider: Draft2Provider; model: string };
  foundAt?: string;
  updatedAt?: string;
  error?: string;
};

/** Claude's answer: the people, places and organizations the facts name. */
export const DRAFT2_INVENTORY_SCHEMA: Record<string, unknown> = {
  type: "object",
  properties: {
    entities: {
      type: "array",
      maxItems: INVENTORY_MAX_ENTITIES,
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          kind: { type: "string", enum: [...INVENTORY_KINDS] },
          role: { type: "string", enum: [...INVENTORY_ROLES] },
          description: { type: "string" },
          factIds: { type: "array", maxItems: 10, items: { type: "string" } },
        },
        required: ["name", "kind", "role", "description", "factIds"],
        additionalProperties: false,
      },
    },
  },
  required: ["entities"],
  additionalProperties: false,
};

const record = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};

/**
 * Claude's answer as entities. A name its cited facts do not contain is
 * dropped (the program never trusts a name the facts do not state), and so
 * is a repeat of the same name and kind; unknown fact ids are dropped. A
 * malformed answer is a response error, never persisted.
 */
export function parseInventoryEntities(answer: string, facts: readonly Draft2Fact[]): Draft2InventoryEntity[] {
  let parsed: unknown;
  try { parsed = JSON.parse(answer); } catch { throw new Draft2ResponseError("The people-and-places answer is not valid JSON"); }
  const body = record(parsed);
  if (!Array.isArray(body.entities)) throw new Draft2ResponseError("The people-and-places answer has no entities");
  const byId = new Map(facts.map((fact) => [fact.id, fact]));
  const seen = new Set<string>();
  const entities: Draft2InventoryEntity[] = [];
  for (const raw of body.entities.slice(0, INVENTORY_MAX_ENTITIES)) {
    const item = record(raw);
    const name = typeof item.name === "string" ? item.name.replace(/\s+/g, " ").trim() : "";
    const kind = INVENTORY_KINDS.find((candidate) => candidate === item.kind);
    const role = INVENTORY_ROLES.find((candidate) => candidate === item.role) ?? "mentioned";
    if (!name || name.length > 120 || !kind) continue;
    const factIds = [...new Set((Array.isArray(item.factIds) ? item.factIds : []).filter((id): id is string => typeof id === "string" && byId.has(id)))];
    const named = factIds.filter((id) => { const fact = byId.get(id)!; return comparableText(`${fact.claim} ${fact.evidence}`).includes(comparableText(name)); });
    const key = `${kind}:${comparableText(name)}`;
    if (!named.length || seen.has(key)) continue;
    seen.add(key);
    const description = typeof item.description === "string" ? item.description.replace(/\s+/g, " ").trim().slice(0, DESCRIPTION_MAX_CHARACTERS) : "";
    entities.push({ id: `e${entities.length + 1}`, name, kind, role, description, factIds: named });
  }
  return entities;
}

const sameEntity = (a: Draft2InventoryEntity, b: Draft2InventoryEntity) => a.kind === b.kind && comparableText(a.name) === comparableText(b.name);
const linkedPhoto = ({ id, name, provenance, transmissionAllowed, rights }: Draft2LinkedPhoto): Draft2LinkedPhoto => ({ id, name, provenance, transmissionAllowed, ...(rights ? { rights } : {}) });

/**
 * What a new search keeps from the last one, by name: the editor's decision
 * on each person still named, and the story photo linked to each person or
 * place while it is still one of the story's (`photos`, the active ones).
 * The characters choice is kept by the caller.
 */
export function carriedDecisions(entities: readonly Draft2InventoryEntity[], earlier: Draft2Inventory | undefined, photos?: readonly Draft2InventoryStoryPhoto[]): Draft2InventoryEntity[] {
  if (!earlier) return [...entities];
  return entities.map((entity) => {
    // The editor said a name the finder lists as a person is a thing: it stays one.
    const thing = entity.kind === "person" ? earlier.entities.find((candidate) => candidate.decidedThing && candidate.kind === "thing" && comparableText(candidate.name) === comparableText(entity.name)) : undefined;
    if (thing) return { ...entity, kind: "thing", decidedThing: true, ...(thing.note ? { note: thing.note } : {}) };
    const before = earlier.entities.find((candidate) => sameEntity(candidate, entity));
    if (!before) return entity;
    const decided = before.person && (before.person.status === "confirmed" || before.person.status === "rejected") ? { person: before.person } : {};
    const photo = before.storyPhoto && (photos ? photos.find((entry) => entry.id === before.storyPhoto!.id) : before.storyPhoto);
    // What the photo bank said stays until the bank is read again (bankOffer): who gave the bank's photo, and that the editor took it off.
    return { ...entity, ...decided, ...(photo ? { storyPhoto: linkedPhoto(photo) } : {}), ...(before.bank ? { bank: before.bank } : {}) };
  });
}

/** The bank's place or person each of the story's people and places is, by entity id (photo-bank.types.ts, matchSubject). */
export function bankMatches(entities: readonly Draft2InventoryEntity[], subjects: readonly PhotoBankSubject[]): Map<string, PhotoBankMatch> {
  const matches = new Map<string, PhotoBankMatch>();
  for (const entity of entities) {
    const query = queryOfEntity(entity);
    const match = query ? matchSubject(query, subjects) : undefined;
    if (match) matches.set(entity.id, match);
  }
  return matches;
}

/**
 * What the bank offers one of the story's people or places, and the photo the
 * program gives it on its own (`take`, a bank photo id): only when the match
 * may take one (a place by its ids, a person the editor confirmed once and the
 * bank may show), the entity has no photo yet, the editor did not take the
 * bank's off, a person has no confirmed Commons portrait, and one photo is
 * free to give (photo-bank.types.ts, photoToTake). The photo the story already
 * has from the bank is named, with who gave it.
 */
export function bankOffer(entity: Draft2InventoryEntity, match: PhotoBankMatch, bank: PhotoBankView, { storySubjectIds, storyPhotos }: { storySubjectIds: ReadonlySet<string>; storyPhotos: readonly Draft2InventoryStoryPhoto[] }): { bank: Draft2BankMatch; take?: string } {
  const subjectId = match.subject.id;
  const context = { subjectId, storySubjectIds, subjects: bank.subjects };
  const mine = photosInOrder(bank.photos.filter((photo) => !photo.retired && photo.subjectIds.includes(subjectId)));
  const photos: Draft2BankPhoto[] = mine.map((photo) => {
    const hold = photoHold(photo, context);
    const alsoShows = photo.subjectIds.filter((id) => id !== subjectId).map((id) => bank.subjects.find((subject) => subject.id === id)?.name).filter((name): name is string => Boolean(name));
    return { id: photo.id, name: photo.name, provenance: photo.provenance, rights: photo.rights, transmissionAllowed: photo.transmissionAllowed, alsoShows, uses: photo.uses, ...(hold ? { hold } : {}) };
  });
  const earlier = entity.bank?.subjectId === subjectId ? entity.bank : undefined;
  const current = entity.storyPhoto ? storyPhotos.find((photo) => photo.id === entity.storyPhoto!.id) : undefined;
  const linkedBank = current?.bankPhotoId && photos.some((photo) => photo.id === current.bankPhotoId) ? current.bankPhotoId : undefined;
  const linked = linkedBank && current ? { bankPhotoId: linkedBank, storyPhotoId: current.id, by: earlier?.linked?.storyPhotoId === current.id ? earlier.linked.by : "editor" as const } : undefined;
  const offered: Draft2BankMatch = {
    subjectId, name: match.subject.name, by: match.by, photos,
    ...(match.subject.kind === "person" && !mayShow(match.subject) ? { needsConsent: true as const } : {}),
    ...(linked ? { linked } : {}),
    ...(earlier?.declined ? { declined: true as const } : {}),
  };
  const portraitConfirmed = entity.kind === "person" && entity.person?.status === "confirmed";
  const take = !entity.storyPhoto && !offered.declined && !portraitConfirmed && takesPhotoOnItsOwn(match) ? photoToTake(mine, context)?.id : undefined;
  return { bank: offered, ...(take ? { take } : {}) };
}

/** A place the editor set aside stays aside when a new search finds the same match again (the same Wikidata item and Google place). */
export function keptPlaceRejections(entities: readonly Draft2InventoryEntity[], earlier: Draft2Inventory | undefined): Draft2InventoryEntity[] {
  if (!earlier) return [...entities];
  return entities.map((entity) => {
    const before = earlier.entities.find((candidate) => sameEntity(candidate, entity))?.place;
    const place = entity.place;
    if (!place || place.status !== "verified" || before?.status !== "rejected") return entity;
    const same = before.wikidataId === place.wikidataId && before.google?.placeId === place.google?.placeId;
    return same ? { ...entity, place: { ...place, status: "rejected" } } : entity;
  });
}

/**
 * The editor's decisions: confirm a person's Commons candidate; reject (a
 * person: none of the candidates; a place: the match is another place) or
 * reopen that; link one of the story's photos to a person or place, or
 * unlink it (null); read the story's photos again after adding one; and
 * whether the brand's characters may narrate.
 */
export type Draft2InventoryAction =
  | { action: "confirm"; entityId: string; candidateId: string }
  | { action: "bank"; entityId: string; bankPhotoId: string; consent: boolean }
  | { action: "reject"; entityId: string }
  | { action: "reopen"; entityId: string }
  /** The editor says a name listed as a person is a thing (a plant, a dish, a product): it may be drawn, generic, and is never looked up. */
  | { action: "thing"; entityId: string }
  | { action: "photo"; entityId: string; storyPhotoId: string | null }
  | { action: "photos" }
  | { action: "roster" }
  | { action: "characters"; characters: Draft2CharacterChoice };

/** The editor's decision as a contract; anything else is an input error. */
export function parseInventoryAction(value: unknown): Draft2InventoryAction {
  const body = record(value);
  if (body.action === "characters") {
    const characters = INVENTORY_CHARACTER_CHOICES.find((choice) => choice === body.characters);
    if (!characters) throw new Draft2InputError(`The characters choice is one of ${INVENTORY_CHARACTER_CHOICES.join(", ")}.`);
    return { action: "characters", characters };
  }
  if (body.action === "photos") return { action: "photos" };
  if (body.action === "roster") return { action: "roster" };
  const entityId = typeof body.entityId === "string" && /^e\d{1,3}$/.test(body.entityId) ? body.entityId : undefined;
  if (!entityId) throw new Draft2InputError("Name the person or place (entityId, such as e2).");
  if (body.action === "confirm") {
    const candidateId = typeof body.candidateId === "string" && /^Q\d{1,12}$/.test(body.candidateId) ? body.candidateId : undefined;
    if (!candidateId) throw new Draft2InputError("Name the Commons candidate (a Wikidata id, such as Q42).");
    return { action: "confirm", entityId, candidateId };
  }
  if (body.action === "bank") {
    const bankPhotoId = typeof body.bankPhotoId === "string" && /^[\w-]{1,64}$/.test(body.bankPhotoId) ? body.bankPhotoId : undefined;
    if (!bankPhotoId) throw new Draft2InputError("Name the photo bank's photo (bankPhotoId).");
    return { action: "bank", entityId, bankPhotoId, consent: body.consent === true };
  }
  if (body.action === "photo") {
    if (body.storyPhotoId === null) return { action: "photo", entityId, storyPhotoId: null };
    const storyPhotoId = typeof body.storyPhotoId === "string" && /^[\w-]{1,64}$/.test(body.storyPhotoId) ? body.storyPhotoId : undefined;
    if (!storyPhotoId) throw new Draft2InputError("Name the story photo (storyPhotoId), or null to unlink it.");
    return { action: "photo", entityId, storyPhotoId };
  }
  if (body.action === "reject" || body.action === "reopen" || body.action === "thing") return { action: body.action, entityId };
  throw new Draft2InputError("The action is confirm, reject, reopen, thing, photo, bank, photos, roster or characters.");
}

/** The person an action names, which must be a person the search looked up. */
export function personEntity(inventory: Draft2Inventory, entityId: string): Draft2InventoryEntity {
  const entity = inventory.entities.find((candidate) => candidate.id === entityId);
  if (!entity || entity.kind !== "person" || !entity.person) throw new Draft2InputError(`${entityId} is not one of this story's people.`);
  return entity;
}

/** The person or place an action names. */
export function inventoryEntity(inventory: Draft2Inventory, entityId: string): Draft2InventoryEntity {
  const entity = inventory.entities.find((candidate) => candidate.id === entityId);
  if (!entity || entity.kind === "organization") throw new Draft2InputError(`${entityId} is not one of this story's people or places.`);
  return entity;
}

/** The entity once the editor rejects its match: a person, every Commons candidate; a place, the place the lookups found. */
export function rejectedEntity(entity: Draft2InventoryEntity): Draft2InventoryEntity {
  if (entity.kind === "person" && entity.person) return { ...entity, person: { ...entity.person, status: "rejected", confirmed: undefined } };
  if (entity.kind === "place" && entity.place?.status === "verified") return { ...entity, place: { ...entity.place, status: "rejected" } };
  throw new Draft2InputError(`${entity.name} has no match to set aside.`);
}

/** A name listed as a person that is a thing: the editor's word, or Wikidata's (a taxon, a dish, a product), kept in its note. */
export function thingEntity(entity: Draft2InventoryEntity, note?: string): Draft2InventoryEntity {
  if (entity.kind !== "person") throw new Draft2InputError(`${entity.name} is not listed as a person.`);
  const { person, ...rest } = entity;
  void person;
  return { ...rest, kind: "thing", decidedThing: true, note: note ?? "The editor: not a person, a thing the facts name." };
}

/** The entity once the editor takes a decision back: a person's candidates wait again; a place set aside is the lookups' match again; a thing is a person to look up again. */
export function reopenedEntity(entity: Draft2InventoryEntity): Draft2InventoryEntity {
  if (entity.kind === "thing") { const { decidedThing, note, ...rest } = entity; void decidedThing; void note; return { ...rest, kind: "person", person: { status: "none", candidates: [], note: "Search people and places again to look this name up." } }; }
  if (entity.kind === "person" && entity.person) return { ...entity, person: { ...entity.person, status: entity.person.candidates.length ? "candidates" : "none", confirmed: undefined } };
  if (entity.kind === "place" && entity.place?.status === "rejected") return { ...entity, place: { ...entity.place, status: "verified" } };
  throw new Draft2InputError(`${entity.name} has no decision to take back.`);
}

/** The entity with one of the story's photos linked, or none (null). */
export function withStoryPhoto(entity: Draft2InventoryEntity, photo: Draft2LinkedPhoto | null): Draft2InventoryEntity {
  if (photo) return { ...entity, storyPhoto: linkedPhoto(photo) };
  const { storyPhoto, ...rest } = entity;
  void storyPhoto;
  return rest;
}

/** The inventory with the story's photos as they are now: a link to a photo no longer among them is dropped. The version is the caller's. */
export function withStoryPhotos(inventory: Draft2Inventory, photos: readonly Draft2InventoryStoryPhoto[]): Draft2Inventory {
  return {
    ...inventory,
    storyPhotos: [...photos],
    entities: inventory.entities.map((entity) => entity.storyPhoto ? withStoryPhoto(entity, photos.find((photo) => photo.id === entity.storyPhoto!.id) ?? null) : entity),
  };
}

/** Whether two inventories differ in the story's photos or the links to them, by value (a stored row's keys come back in another order). */
export function storyPhotosDiffer(a: Pick<Draft2Inventory, "entities" | "storyPhotos">, b: Pick<Draft2Inventory, "entities" | "storyPhotos">): boolean {
  const key = (inventory: Pick<Draft2Inventory, "entities" | "storyPhotos">) => JSON.stringify([
    inventory.storyPhotos.map((photo) => [photo.id, photo.name, photo.description, photo.provenance, photo.transmissionAllowed]),
    inventory.entities.map((entity) => entity.storyPhoto ? [entity.storyPhoto.id, entity.storyPhoto.name, entity.storyPhoto.provenance, entity.storyPhoto.transmissionAllowed] : null),
  ]);
  return key(a) !== key(b);
}

/**
 * Whether only the editor's declarations of rights differ: the photos and
 * their links are the same, so the steps read the same material and the
 * version stays (a photo declared reference only is refused where it would
 * be published, at the image step).
 */
export function storyPhotoRightsDiffer(a: Pick<Draft2Inventory, "entities" | "storyPhotos">, b: Pick<Draft2Inventory, "entities" | "storyPhotos">): boolean {
  const key = (inventory: Pick<Draft2Inventory, "entities" | "storyPhotos">) => JSON.stringify([
    inventory.storyPhotos.map((photo) => [photo.id, photo.rights ?? null]),
    inventory.entities.map((entity) => entity.storyPhoto ? [entity.storyPhoto.id, entity.storyPhoto.rights ?? null] : null),
  ]);
  return key(a) !== key(b);
}

/** The inventory after one decision, one version more. */
export function decidedInventory(inventory: Draft2Inventory, entityId: string | undefined, change: (entity: Draft2InventoryEntity) => Draft2InventoryEntity, now: Date, characters?: Draft2CharacterChoice): Draft2Inventory {
  return {
    ...inventory,
    version: inventory.version + 1,
    entities: inventory.entities.map((entity) => entity.id === entityId ? change(entity) : entity),
    ...(characters ? { characters } : {}),
    updatedAt: now.toISOString(),
  };
}

/** A person whose Commons candidates wait for the editor; one the editor gave a story photo already has their portrait. */
export function awaitsConfirmation(entity: Draft2InventoryEntity): boolean {
  return entity.person?.status === "candidates" && !entity.storyPhoto;
}

/**
 * What the visual script may show of each entity: a portrait (a confirmed
 * person, or one the editor linked a story photo to), a photo (a verified
 * place's, or the editor's) or a map (a verified place's), or nothing. An
 * editor's photo counts only when the publication may publish it.
 */
export type Draft2VisualMaterial = { portrait: boolean; photo: boolean; map: boolean };
export function entityMaterial(entity: Draft2InventoryEntity): Draft2VisualMaterial {
  const place = entity.kind === "place" && entity.place?.status === "verified" ? entity.place : undefined;
  const linked = Boolean(entity.storyPhoto) && publishablePhoto(entity.storyPhoto?.rights);
  return {
    portrait: entity.kind === "person" && (linked || (entity.person?.status === "confirmed" && Boolean(entity.person.confirmed))),
    photo: entity.kind === "place" && (linked || Boolean(place?.photo)),
    map: Boolean(place?.map),
  };
}

/**
 * The story photos a script may use by their own id: those the publication
 * may publish and the editor allowed sent to an image model, except a
 * person's (a confirmed or linked portrait), which appears only as their
 * portrait, through their entity. A reference-only photo is never one.
 */
export function referencePhotos(inventory: Pick<Draft2Inventory, "entities" | "storyPhotos">): Draft2InventoryStoryPhoto[] {
  const portraits = new Set(inventory.entities.filter((entity) => entity.kind === "person").flatMap((entity) => [entity.storyPhoto?.id, entity.person?.confirmed?.storyPhotoId]).filter(Boolean));
  return inventory.storyPhotos.filter((photo) => photo.transmissionAllowed && publishablePhoto(photo.rights) && !portraits.has(photo.id));
}

/** The inventory as the visual script's models read it: who and where, what each may show, and the story's own photos. */
export function inventoryForModels(inventory: Draft2Inventory) {
  return {
    entities: inventory.entities.map((entity) => {
      const material = entityMaterial(entity);
      const shows = [material.portrait ? "documentary portrait (a real photo pasted unchanged)" : "", material.photo ? "verified place photo" : "", material.map ? "verified map" : ""].filter(Boolean);
      return {
        id: entity.id, name: entity.name, kind: entity.kind, role: entity.role, description: entity.description, factIds: entity.factIds,
        verifiedMaterial: shows.length ? shows : entity.kind === "organization" ? ["none: organizations are never drawn, no logos"] : entity.kind === "thing" ? ["a thing the facts name: it may be drawn, generic, as the facts describe it, never as a brand or a product shot"] : ["none: never depict them; tell the story without showing them"],
      };
    }),
    storyPhotos: referencePhotos(inventory).map(({ id, name, description }) => ({ id, name, description })),
  };
}
