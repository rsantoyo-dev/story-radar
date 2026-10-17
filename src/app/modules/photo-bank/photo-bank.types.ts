import { STORY_PHOTO_RIGHTS, StoryMaterialValidationError, parsePhotoFocus, publishablePhoto, type PhotoFocus, type StoryPhotoRights } from "../stories/story-materials.types";

/**
 * The workspace's photo bank (photo-bank.ts): every photo its stories
 * received, stored once with its rights and credit, and the places and people
 * it shows. A later story about the same place or person finds its photos
 * before any outside source (Commons, Openverse): a place matched by its
 * Google Maps or Wikidata id takes one of them on its own; a person's are
 * offered first, and taken on their own once the editor has confirmed that
 * person once. A person Wikidata does not know is shown only with their
 * recorded consent. Everything here is pure: contracts, matching, the choice
 * of a photo and the editor's input.
 */
export const PHOTO_BANK_SUBJECT_KINDS = ["place", "person"] as const;
export type PhotoBankSubjectKind = (typeof PHOTO_BANK_SUBJECT_KINDS)[number];
export const PHOTO_BANK_SOURCES = ["upload", "commons"] as const;
export type PhotoBankSource = (typeof PHOTO_BANK_SOURCES)[number];
export const PHOTO_BANK_NAME_MAX_CHARACTERS = 150;
export const PHOTO_BANK_MAX_ALIASES = 12;
/** A place named in part ("Parulines", "Parc des Parulines" for "Parc naturel des Parulines") is matched when the shorter name has this many letters, or two words. */
const PARTIAL_PLACE_NAME_MIN_CHARACTERS = 8;

export class PhotoBankValidationError extends StoryMaterialValidationError {}

/** A place or a person the bank's photos show, as the editor and the steps read it. */
export type PhotoBankSubject = {
  id: string;
  kind: PhotoBankSubjectKind;
  name: string;
  /** Other names the stories gave it. */
  aliases: string[];
  googlePlaceId?: string;
  wikidataId?: string;
  address?: string;
  /** A person Wikidata does not know: the editor recorded that they agreed to appear in the publication's posts. */
  consent: boolean;
  /** A person: the editor confirmed once that a story's person is this one. */
  confirmed: boolean;
};

/** A bank photo as the editor and the steps read it: never its object key. */
export type PhotoBankPhoto = {
  id: string;
  name: string;
  description: string;
  provenance: string;
  rights: StoryPhotoRights;
  transmissionAllowed: boolean;
  source: PhotoBankSource;
  focus?: PhotoFocus;
  /** The places and people it shows. */
  subjectIds: string[];
  /** The stories that have it (their own copy), and when it was last given to one. */
  uses: number;
  lastUsedAt?: string;
  retired: boolean;
  createdAt: string;
  /** The brand and story it was first added to, by name. */
  origin?: { topicName: string; storyTitle: string };
};

/** The bank as the editor reads it. */
export type PhotoBankView = { subjects: PhotoBankSubject[]; photos: PhotoBankPhoto[] };

/** A name as the bank compares it: no accents, no punctuation, one space between words, lower case. */
export function subjectKey(value: string): string {
  return value.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

/** A place or person as a story names it, with what its lookups found: what the bank files it under. */
export type PhotoBankSubjectInput = { kind: PhotoBankSubjectKind; name: string; googlePlaceId?: string; wikidataId?: string; address?: string; latitude?: number; longitude?: number };

/** A Draft 2 session's person or place as the bank reads it (draft2-inventory.types.ts, Draft2InventoryEntity): only what files a photo. */
export type PhotoBankEntity = {
  kind?: string;
  name?: string;
  storyPhoto?: { id?: string };
  person?: { status?: string; candidates?: readonly { entityId?: string }[]; confirmed?: { entityId?: string; storyPhotoId?: string } };
  place?: { status?: string; wikidataId?: string; google?: { placeId?: string; address?: string; latitude?: number; longitude?: number } };
};

/**
 * The place or person a story's entity is, as the bank files it: a verified
 * place with its Google Maps and Wikidata ids, address and point; a person
 * with the Wikidata id the editor confirmed. A place the editor set aside is
 * filed by its name alone: the lookups' ids were another place's.
 */
export function subjectOfEntity(entity: PhotoBankEntity): PhotoBankSubjectInput | undefined {
  if (!entity.name || (entity.kind !== "place" && entity.kind !== "person")) return undefined;
  if (entity.kind === "place") {
    const place = entity.place?.status === "verified" ? entity.place : undefined;
    const google = place?.google;
    return {
      kind: "place", name: entity.name,
      ...(google?.placeId ? { googlePlaceId: google.placeId } : {}), ...(place?.wikidataId ? { wikidataId: place.wikidataId } : {}), ...(google?.address ? { address: google.address } : {}),
      ...(typeof google?.latitude === "number" && typeof google.longitude === "number" ? { latitude: google.latitude, longitude: google.longitude } : {}),
    };
  }
  const confirmed = entity.person?.status === "confirmed" ? entity.person.confirmed?.entityId : undefined;
  return { kind: "person", name: entity.name, ...(confirmed ? { wikidataId: confirmed } : {}) };
}

/** What the bank looks a story's entity up by: a verified place's ids, a person's confirmed Wikidata id or their Commons candidates'. */
export function queryOfEntity(entity: PhotoBankEntity): PhotoBankQuery | undefined {
  const subject = subjectOfEntity(entity);
  if (!subject) return undefined;
  const candidates = subject.kind === "person" && !subject.wikidataId ? (entity.person?.candidates ?? []).map((candidate) => candidate.entityId).filter((id): id is string => Boolean(id)) : [];
  const wikidataIds = subject.wikidataId ? [subject.wikidataId] : candidates;
  return { kind: subject.kind, name: subject.name, ...(subject.googlePlaceId ? { googlePlaceId: subject.googlePlaceId } : {}), ...(wikidataIds.length ? { wikidataIds } : {}) };
}

/** What a story names, with what its lookups found: a place's Google Maps place id, a place's or a person's Wikidata ids (a person's Commons candidates). */
export type PhotoBankQuery = { kind: PhotoBankSubjectKind; name: string; googlePlaceId?: string; wikidataIds?: readonly string[] };
export type PhotoBankMatchBy = "google" | "wikidata" | "name";
export type PhotoBankMatch = { subject: PhotoBankSubject; by: PhotoBankMatchBy };

/** Whether every word of the shorter name appears in the longer, in order ("parc des parulines" in "parc naturel des parulines"). */
function wordsInOrder(short: string, long: string): boolean {
  const words = long.split(" ");
  let at = 0;
  for (const word of short.split(" ")) {
    at = words.indexOf(word, at);
    if (at < 0) return false;
    at += 1;
  }
  return true;
}

/** One name met by another: the same words, or, for a place, the shorter name's words within the longer's, in order, when the shorter is long enough to mean one place. */
function namesMeet(kind: PhotoBankSubjectKind, a: string, b: string): "exact" | "partial" | undefined {
  const [x, y] = [subjectKey(a), subjectKey(b)];
  if (!x || !y) return undefined;
  if (x === y) return "exact";
  if (kind !== "place") return undefined;
  const [short, long] = x.length <= y.length ? [x, y] : [y, x];
  const enough = short.length >= PARTIAL_PLACE_NAME_MIN_CHARACTERS || short.includes(" ");
  return enough && wordsInOrder(short, long) ? "partial" : undefined;
}

/** Two ids that both exist and differ say these are two places or two people. */
const conflicts = (a: string | undefined, b: string | undefined) => Boolean(a && b && a !== b);

/**
 * The bank's place or person a story's names: by the place's Google Maps id,
 * then by a Wikidata id, then by its name or one of its aliases (a whole name
 * first; a place also by part of its name). A subject whose own ids differ
 * from the story's is another place or person, whatever its name.
 */
export function matchSubject(query: PhotoBankQuery, subjects: readonly PhotoBankSubject[]): PhotoBankMatch | undefined {
  const mine = subjects.filter((subject) => subject.kind === query.kind);
  const wikidata = new Set(query.wikidataIds ?? []);
  if (query.kind === "place" && query.googlePlaceId) {
    const subject = mine.find((entry) => entry.googlePlaceId === query.googlePlaceId);
    if (subject) return { subject, by: "google" };
  }
  if (wikidata.size) {
    const subject = mine.find((entry) => entry.wikidataId && wikidata.has(entry.wikidataId) && !conflicts(entry.googlePlaceId, query.googlePlaceId));
    if (subject) return { subject, by: "wikidata" };
  }
  const compatible = mine.filter((entry) => !conflicts(entry.googlePlaceId, query.googlePlaceId) && !(entry.wikidataId && wikidata.size && !wikidata.has(entry.wikidataId)));
  const meeting = (level: "exact" | "partial") => compatible.find((entry) => [entry.name, ...entry.aliases].some((name) => namesMeet(query.kind, name, query.name) === level));
  const subject = meeting("exact") ?? meeting("partial");
  return subject ? { subject, by: "name" } : undefined;
}

/**
 * The subject a story's place or person is filed under: the one with its ids,
 * else one of the same name whose ids do not differ; undefined when it is new.
 */
export function existingSubject(input: Pick<PhotoBankSubject, "kind" | "name"> & { googlePlaceId?: string; wikidataId?: string }, subjects: readonly PhotoBankSubject[]): PhotoBankSubject | undefined {
  const mine = subjects.filter((subject) => subject.kind === input.kind);
  return (input.googlePlaceId ? mine.find((subject) => subject.googlePlaceId === input.googlePlaceId) : undefined)
    ?? (input.wikidataId ? mine.find((subject) => subject.wikidataId === input.wikidataId) : undefined)
    ?? mine.find((subject) => !conflicts(subject.googlePlaceId, input.googlePlaceId) && !conflicts(subject.wikidataId, input.wikidataId)
      && [subject.name, ...subject.aliases].some((name) => subjectKey(name) === subjectKey(input.name)));
}

/** The aliases once a story names the subject another way: the new name kept as written, once, the subject's own name never repeated. */
export function withAlias(subject: Pick<PhotoBankSubject, "name" | "aliases">, name: string): string[] {
  const key = subjectKey(name);
  if (!key || subjectKey(subject.name) === key || subject.aliases.some((alias) => subjectKey(alias) === key)) return subject.aliases;
  return [...subject.aliases, name.replace(/\s+/g, " ").trim()].slice(-PHOTO_BANK_MAX_ALIASES);
}

/** A person the bank may show: one Wikidata knows (a public figure, under Commons' rules), or one whose consent the editor recorded. A place always. */
export const mayShow = (subject: Pick<PhotoBankSubject, "kind" | "wikidataId" | "consent">) => subject.kind === "place" || Boolean(subject.wikidataId) || subject.consent;

/**
 * Whether a match may take a photo without the editor: a place matched by
 * its Google Maps or Wikidata id (its name alone may be another place), a
 * person the editor confirmed once and the bank may show.
 */
export function takesPhotoOnItsOwn(match: PhotoBankMatch): boolean {
  if (match.subject.kind === "place") return match.by !== "name";
  return match.subject.confirmed && mayShow(match.subject);
}

/** Why a bank photo cannot be given to a story on its own; undefined when it can. */
export function photoHold(photo: PhotoBankPhoto, { subjectId, storySubjectIds, subjects }: { subjectId: string; storySubjectIds: ReadonlySet<string>; subjects: readonly PhotoBankSubject[] }): string | undefined {
  if (photo.retired) return "retired from the bank";
  if (!publishablePhoto(photo.rights)) return "reference only: declare it your own or licensed to publish it";
  const people = photo.subjectIds.map((id) => subjects.find((subject) => subject.id === id)).filter((subject): subject is PhotoBankSubject => subject?.kind === "person");
  const absent = people.filter((person) => person.id !== subjectId && !storySubjectIds.has(person.id));
  if (absent.length) return `${absent.map((person) => person.name).join(" and ")} ${absent.length === 1 ? "appears" : "appear"} in it and ${absent.length === 1 ? "is" : "are"} not in this story`;
  const unconsented = people.filter((person) => !mayShow(person));
  if (unconsented.length) return `${unconsented.map((person) => person.name).join(" and ")}: consent to appear not recorded`;
  return undefined;
}

/** The bank's photos in the order they are offered: the least used, then the longest unused, then the newest. */
export function photosInOrder(photos: readonly PhotoBankPhoto[]): PhotoBankPhoto[] {
  const last = (photo: PhotoBankPhoto) => photo.lastUsedAt ? Date.parse(photo.lastUsedAt) : 0;
  return [...photos].sort((a, b) => a.uses - b.uses || last(a) - last(b) || Date.parse(b.createdAt) - Date.parse(a.createdAt));
}

/**
 * The photo the program gives a story's place or person on its own: one the
 * publication may publish, not retired, showing no one the story does not
 * name and no one whose consent is missing (a park's photo with Jo in it waits
 * for the editor when Jo is not in the story), in the bank's order, so
 * consecutive posts do not repeat one photo.
 */
export function photoToTake(photos: readonly PhotoBankPhoto[], context: { subjectId: string; storySubjectIds: ReadonlySet<string>; subjects: readonly PhotoBankSubject[] }): PhotoBankPhoto | undefined {
  return photosInOrder(photos.filter((photo) => photo.subjectIds.includes(context.subjectId))).find((photo) => !photoHold(photo, context));
}

/**
 * A Commons import's subject, read from the description the import writes
 * ("Name — description. Portrait from Wikimedia Commons (Wikidata Q42)."): a
 * portrait is a person's, a photo a place's. Undefined for any other photo.
 */
export function commonsSubject(description: string, provenance: string): { kind: PhotoBankSubjectKind; name: string; wikidataId: string } | undefined {
  if (!provenance.includes("via Wikimedia Commons")) return undefined;
  const match = /\b(Portrait|Photo) from Wikimedia Commons \(Wikidata (Q\d{1,12})\)/.exec(description);
  if (!match) return undefined;
  const name = description.split(/ — |\. (?:Portrait|Photo) from Wikimedia Commons/)[0]?.trim();
  return name ? { kind: match[1] === "Portrait" ? "person" : "place", name: name.slice(0, PHOTO_BANK_NAME_MAX_CHARACTERS), wikidataId: match[2] } : undefined;
}

const record = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** A subject's name from untrusted input. */
export function parseSubjectName(value: unknown): string {
  const name = typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
  if (!name || name.length > PHOTO_BANK_NAME_MAX_CHARACTERS) throw new PhotoBankValidationError(`Name the place or person (1 to ${PHOTO_BANK_NAME_MAX_CHARACTERS} characters).`);
  return name;
}

/** A place or person a photo shows, from untrusted input: one already in the bank (subjectId), or a new one (kind and name). */
export type PhotoBankSubjectChoice = { subjectId: string } | { kind: PhotoBankSubjectKind; name: string };
export function parseSubjectChoice(value: unknown): PhotoBankSubjectChoice {
  const body = record(value);
  if (typeof body.subjectId === "string") {
    if (!UUID.test(body.subjectId)) throw new PhotoBankValidationError("Name a place or person of the bank (subjectId).");
    return { subjectId: body.subjectId };
  }
  const kind = PHOTO_BANK_SUBJECT_KINDS.find((entry) => entry === body.kind);
  if (!kind) throw new PhotoBankValidationError("Say whether it is a place or a person.");
  return { kind, name: parseSubjectName(body.name) };
}

/** The editor's change to a bank photo: its rights, its focal point, retired or back, or a place or person it shows added or taken off. */
export type PhotoBankPhotoChange =
  | { publicationRights: StoryPhotoRights }
  | { focus: PhotoFocus | null }
  | { retired: boolean }
  | { tag: PhotoBankSubjectChoice }
  | { untag: string };
export function parsePhotoChange(value: unknown): PhotoBankPhotoChange {
  const body = record(value);
  if ("publicationRights" in body) {
    const rights = STORY_PHOTO_RIGHTS.find((entry) => entry === body.publicationRights);
    if (!rights) throw new PhotoBankValidationError("Say what the publication may do with this photo: our own, licensed, or reference only.");
    return { publicationRights: rights };
  }
  if ("focus" in body) {
    try { return { focus: parsePhotoFocus(body.focus) }; } catch (error) { throw new PhotoBankValidationError(error instanceof Error ? error.message : "The focal point is invalid."); }
  }
  if ("retired" in body) {
    if (typeof body.retired !== "boolean") throw new PhotoBankValidationError("retired is true or false.");
    return { retired: body.retired };
  }
  if ("tag" in body) return { tag: parseSubjectChoice(body.tag) };
  if ("untag" in body) {
    if (typeof body.untag !== "string" || !UUID.test(body.untag)) throw new PhotoBankValidationError("Name the place or person to take off (untag).");
    return { untag: body.untag };
  }
  throw new PhotoBankValidationError("Change publicationRights, focus, retired, tag or untag.");
}

/** The editor's change to a place or person: its name, or a person's consent to appear. */
export type PhotoBankSubjectChange = { name: string } | { consent: boolean };
export function parseSubjectChange(value: unknown): PhotoBankSubjectChange {
  const body = record(value);
  if ("consent" in body) {
    if (typeof body.consent !== "boolean") throw new PhotoBankValidationError("consent is true or false.");
    return { consent: body.consent };
  }
  if ("name" in body) return { name: parseSubjectName(body.name) };
  throw new PhotoBankValidationError("Change the name or the consent.");
}
