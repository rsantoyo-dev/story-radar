import { comparableText, Draft2InputError, Draft2ResponseError, type Draft2Fact } from "./draft2-facts.types";
import type { Draft2Provider } from "./draft2-models";

/**
 * People and places, the Draft 2 step before the visual script: who and
 * where the story involves, and what verified images exist of them. Claude
 * lists the people, places and organizations the verified facts name; the
 * program keeps only names its cited facts contain, then looks them up the
 * way v1 does: a person in Wikidata and Commons (candidates the editor
 * confirms, used only as a documentary portrait pasted unchanged, never
 * generated), a place in Wikidata within the Topic's geo scope with a
 * Commons or Openverse photo and its coordinates. Organizations are never
 * drawn (no logos). The editor also says whether the brand's characters may
 * narrate. Everything here is pure: contracts, the schema, parsing, the
 * editor's decisions and what the visual script may use.
 */
export const INVENTORY_KINDS = ["person", "place", "organization"] as const;
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

export type Draft2InventoryEntity = {
  /** e1, e2…, stable while the story's names do not change. */
  id: string;
  name: string;
  kind: Draft2InventoryKind;
  role: Draft2InventoryRole;
  /** Who or what it is in this story, in one line. */
  description: string;
  factIds: string[];
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
  /** A place: its Wikidata identity within the Topic's geo scope, a verified photo, and whether a map can be drawn (coordinates). */
  place?: {
    status: "verified" | "not-found" | "unavailable";
    wikidataId?: string;
    sourceUrl?: string;
    photo?: Draft2PlacePhoto;
    map: boolean;
    note?: string;
  };
};

/** A photo already attached to the story, by the editor or from Commons. */
export type Draft2InventoryStoryPhoto = { id: string; name: string; description: string; provenance: string; transmissionAllowed: boolean };

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

/** What a new search keeps from the last one: the editor's decision on each person still named (by name), and the characters choice. */
export function carriedDecisions(entities: readonly Draft2InventoryEntity[], earlier: Draft2Inventory | undefined): Draft2InventoryEntity[] {
  if (!earlier) return [...entities];
  return entities.map((entity) => {
    const before = earlier.entities.find((candidate) => candidate.kind === entity.kind && comparableText(candidate.name) === comparableText(entity.name));
    return before?.person && (before.person.status === "confirmed" || before.person.status === "rejected") ? { ...entity, person: before.person } : entity;
  });
}

export type Draft2InventoryAction =
  | { action: "confirm"; entityId: string; candidateId: string }
  | { action: "reject"; entityId: string }
  | { action: "reopen"; entityId: string }
  | { action: "characters"; characters: Draft2CharacterChoice };

/** The editor's decision as a contract; anything else is an input error. */
export function parseInventoryAction(value: unknown): Draft2InventoryAction {
  const body = record(value);
  if (body.action === "characters") {
    const characters = INVENTORY_CHARACTER_CHOICES.find((choice) => choice === body.characters);
    if (!characters) throw new Draft2InputError(`The characters choice is one of ${INVENTORY_CHARACTER_CHOICES.join(", ")}.`);
    return { action: "characters", characters };
  }
  const entityId = typeof body.entityId === "string" && /^e\d{1,3}$/.test(body.entityId) ? body.entityId : undefined;
  if (!entityId) throw new Draft2InputError("Name the person (entityId, such as e2).");
  if (body.action === "confirm") {
    const candidateId = typeof body.candidateId === "string" && /^Q\d{1,12}$/.test(body.candidateId) ? body.candidateId : undefined;
    if (!candidateId) throw new Draft2InputError("Name the Commons candidate (a Wikidata id, such as Q42).");
    return { action: "confirm", entityId, candidateId };
  }
  if (body.action === "reject" || body.action === "reopen") return { action: body.action, entityId };
  throw new Draft2InputError("The action is confirm, reject, reopen or characters.");
}

/** The person an action names, which must be a person the search found candidates for. */
export function personEntity(inventory: Draft2Inventory, entityId: string): Draft2InventoryEntity {
  const entity = inventory.entities.find((candidate) => candidate.id === entityId);
  if (!entity || entity.kind !== "person" || !entity.person) throw new Draft2InputError(`${entityId} is not one of this story's people.`);
  return entity;
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

/** What the visual script may show of each entity: a portrait (a confirmed person), a photo or a map (a verified place), or nothing. */
export type Draft2VisualMaterial = { portrait: boolean; photo: boolean; map: boolean };
export function entityMaterial(entity: Draft2InventoryEntity): Draft2VisualMaterial {
  return {
    portrait: entity.kind === "person" && entity.person?.status === "confirmed" && Boolean(entity.person.confirmed),
    photo: entity.kind === "place" && entity.place?.status === "verified" && Boolean(entity.place.photo),
    map: entity.kind === "place" && entity.place?.status === "verified" && entity.place.map,
  };
}

/** The inventory as the visual script's models read it: who and where, what each may show, and the story's own photos. */
export function inventoryForModels(inventory: Draft2Inventory) {
  return {
    entities: inventory.entities.map((entity) => {
      const material = entityMaterial(entity);
      const shows = [material.portrait ? "documentary portrait (a real photo pasted unchanged)" : "", material.photo ? "verified place photo" : "", material.map ? "verified map" : ""].filter(Boolean);
      return {
        id: entity.id, name: entity.name, kind: entity.kind, role: entity.role, description: entity.description, factIds: entity.factIds,
        verifiedMaterial: shows.length ? shows : entity.kind === "organization" ? ["none: organizations are never drawn, no logos"] : ["none: never depict them; tell the story without showing them"],
      };
    }),
    storyPhotos: inventory.storyPhotos.filter((photo) => photo.transmissionAllowed).map(({ id, name, description }) => ({ id, name, description })),
  };
}
