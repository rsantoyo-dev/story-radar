import "server-only";
import { createHash, randomUUID } from "node:crypto";
import sharp from "sharp";
import { and, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { draft2Sessions, photoBankPhotos, photoBankSubjects, photoBankTags, stories, storyReferencePhotos, topics, type PhotoBankPhotoRow, type PhotoBankSubjectRow } from "@/db/schema";
import { createLogger } from "../observability/logger";
import { buildPhotoBankObjectKey, buildStoryReferenceObjectKey, copyPrivateR2Object, putPrivateR2Object, readPrivateR2ImageFile } from "../stories/r2-storage";
import { publicStoryPhoto, requireStoryMembership } from "../stories/story-materials.repository";
import { materialText, parsePhotoRights, type PhotoFocus, type StoryPhotoRights, type StoryReferencePhoto } from "../stories/story-materials.types";
import {
  PhotoBankValidationError, commonsSubject, existingSubject, parseSubjectName, subjectOfEntity, withAlias,
  type PhotoBankEntity, type PhotoBankPhoto, type PhotoBankPhotoChange, type PhotoBankSource, type PhotoBankSubject, type PhotoBankSubjectChange, type PhotoBankSubjectChoice,
  type PhotoBankSubjectInput, type PhotoBankSubjectKind, type PhotoBankView,
} from "./photo-bank.types";

/**
 * The workspace's photo bank (photo-bank.types.ts says what it is for). Every
 * photo a story receives enters it (bankStoryPhoto), the place or person the
 * editor gives a photo to is what it shows (tagBankPhoto), and a later story
 * takes a bank photo through its own copy (copyBankPhotoToStory), so its
 * material stays an immutable snapshot. Workspace-scoped throughout: a topic
 * reads only its own workspace's bank.
 */
const log = createLogger("photo-bank");
/** Photos brought into the bank per call; the next call brings the rest. */
const SYNC_BATCH = 100;

type StoryPhotoRow = typeof storyReferencePhotos.$inferSelect;
type Origin = { topicId: string; storyId: string };

/** The workspace a topic belongs to. */
export async function workspaceOfTopic(topicId: string): Promise<string> {
  const [row] = await db.select({ workspaceId: topics.workspaceId }).from(topics).where(eq(topics.id, topicId)).limit(1);
  if (!row) throw new PhotoBankValidationError("This brand was not found.");
  return row.workspaceId;
}

const subjectOf = (row: PhotoBankSubjectRow): PhotoBankSubject => ({
  id: row.id, kind: row.kind, name: row.name, aliases: row.aliases ?? [],
  ...(row.googlePlaceId ? { googlePlaceId: row.googlePlaceId } : {}), ...(row.wikidataId ? { wikidataId: row.wikidataId } : {}), ...(row.address ? { address: row.address } : {}),
  consent: Boolean(row.consentAt), confirmed: Boolean(row.confirmedAt),
});

/** The bank as the editor and the steps read it: its places and people, and its photos with what they show and how often they were used. */
export async function loadPhotoBank(workspaceId: string, { retired = false }: { retired?: boolean } = {}): Promise<PhotoBankView> {
  const [subjectRows, photoRows, tagRows, useRows] = await Promise.all([
    db.select().from(photoBankSubjects).where(eq(photoBankSubjects.workspaceId, workspaceId)),
    db.select({ photo: photoBankPhotos, topicName: topics.name, storyTitle: stories.title }).from(photoBankPhotos)
      .leftJoin(topics, eq(topics.id, photoBankPhotos.originTopicId)).leftJoin(stories, eq(stories.id, photoBankPhotos.originStoryId))
      .where(and(eq(photoBankPhotos.workspaceId, workspaceId), retired ? undefined : isNull(photoBankPhotos.retiredAt))),
    db.select({ photoId: photoBankTags.photoId, subjectId: photoBankTags.subjectId }).from(photoBankTags)
      .innerJoin(photoBankPhotos, eq(photoBankPhotos.id, photoBankTags.photoId)).where(eq(photoBankPhotos.workspaceId, workspaceId)),
    db.select({ photoId: storyReferencePhotos.bankPhotoId, uses: sql<number>`count(distinct ${storyReferencePhotos.storyId})::int`, last: sql<string>`max(${storyReferencePhotos.createdAt})` })
      .from(storyReferencePhotos).innerJoin(photoBankPhotos, eq(photoBankPhotos.id, storyReferencePhotos.bankPhotoId))
      .where(and(eq(photoBankPhotos.workspaceId, workspaceId), eq(storyReferencePhotos.active, true))).groupBy(storyReferencePhotos.bankPhotoId),
  ]);
  const photos = photoRows.map(({ photo, topicName, storyTitle }): PhotoBankPhoto => {
    const use = useRows.find((entry) => entry.photoId === photo.id);
    return {
      id: photo.id, name: photo.name, description: photo.description, provenance: photo.provenance, rights: photo.publicationRights,
      transmissionAllowed: photo.providerTransmissionAllowed, source: photo.source,
      ...(photo.focusX !== null && photo.focusY !== null ? { focus: { x: photo.focusX, y: photo.focusY } } : {}),
      subjectIds: tagRows.filter((tag) => tag.photoId === photo.id).map((tag) => tag.subjectId),
      uses: use?.uses ?? 0, ...(use?.last ? { lastUsedAt: new Date(use.last).toISOString() } : {}),
      retired: Boolean(photo.retiredAt), createdAt: photo.createdAt.toISOString(),
      ...(topicName && storyTitle ? { origin: { topicName, storyTitle } } : {}),
    };
  });
  return { subjects: subjectRows.map(subjectOf), photos };
}

/**
 * The place or person a story names, filed once: the subject with its ids,
 * else one of the same name whose ids do not differ (photo-bank.types.ts,
 * existingSubject), which learns the ids, address and name it lacked; a new
 * one otherwise.
 */
export async function subjectFor(workspaceId: string, input: PhotoBankSubjectInput): Promise<PhotoBankSubjectRow> {
  const name = parseSubjectName(input.name);
  const rows = await db.select().from(photoBankSubjects).where(and(eq(photoBankSubjects.workspaceId, workspaceId), eq(photoBankSubjects.kind, input.kind)));
  const found = existingSubject({ ...input, name }, rows.map(subjectOf));
  if (found) {
    const row = rows.find((entry) => entry.id === found.id)!;
    const aliases = withAlias(found, name);
    const learned = {
      ...(aliases !== found.aliases ? { aliases } : {}),
      ...(!row.googlePlaceId && input.googlePlaceId ? { googlePlaceId: input.googlePlaceId } : {}),
      ...(!row.wikidataId && input.wikidataId ? { wikidataId: input.wikidataId } : {}),
      ...(!row.address && input.address ? { address: input.address } : {}),
      ...(row.latitude === null && input.latitude !== undefined && input.longitude !== undefined ? { latitude: input.latitude, longitude: input.longitude } : {}),
    };
    if (!Object.keys(learned).length) return row;
    try {
      const [updated] = await db.update(photoBankSubjects).set({ ...learned, updatedAt: new Date() }).where(eq(photoBankSubjects.id, row.id)).returning();
      return updated ?? row;
    } catch (error) {
      // An id another subject already holds (two names for one place, filed apart): keep the subject as it was.
      log.warn("photo bank subject not updated", { subjectId: row.id, error: error instanceof Error ? error.message : String(error) });
      return row;
    }
  }
  const [inserted] = await db.insert(photoBankSubjects).values({
    workspaceId, kind: input.kind, name,
    ...(input.googlePlaceId ? { googlePlaceId: input.googlePlaceId } : {}), ...(input.wikidataId ? { wikidataId: input.wikidataId } : {}), ...(input.address ? { address: input.address } : {}),
    ...(input.latitude !== undefined && input.longitude !== undefined ? { latitude: input.latitude, longitude: input.longitude } : {}),
  }).onConflictDoNothing().returning();
  if (inserted) return inserted;
  // Another request filed it first (the same Google or Wikidata id): that one.
  const again = await db.select().from(photoBankSubjects).where(and(eq(photoBankSubjects.workspaceId, workspaceId), eq(photoBankSubjects.kind, input.kind)));
  const raced = existingSubject({ ...input, name }, again.map(subjectOf));
  if (!raced) throw new PhotoBankValidationError(`${name} could not be filed in the photo bank.`);
  return again.find((entry) => entry.id === raced.id)!;
}

/** That the photo shows the place or person; the first story where the editor said so stays its origin. */
export async function tagBankPhoto(photoId: string, subjectId: string, origin?: Origin): Promise<void> {
  await db.insert(photoBankTags).values({ photoId, subjectId, ...(origin ? { originTopicId: origin.topicId, originStoryId: origin.storyId } : {}) }).onConflictDoNothing();
}

/**
 * The editor took one of the story's photos off its place or person: the
 * bank forgets that the photo shows them when this story is where it learned
 * it. No subject is created; a photo not in the bank changes nothing.
 */
export async function untagStoryPhoto(topicId: string, storyId: string, storyPhotoId: string, input: PhotoBankSubjectInput): Promise<void> {
  const [row] = await db.select({ bankPhotoId: storyReferencePhotos.bankPhotoId }).from(storyReferencePhotos)
    .where(and(eq(storyReferencePhotos.topicId, topicId), eq(storyReferencePhotos.storyId, storyId), eq(storyReferencePhotos.id, storyPhotoId))).limit(1);
  if (!row?.bankPhotoId) return;
  const workspaceId = await workspaceOfTopic(topicId);
  const subjects = (await db.select().from(photoBankSubjects).where(and(eq(photoBankSubjects.workspaceId, workspaceId), eq(photoBankSubjects.kind, input.kind)))).map(subjectOf);
  const subject = existingSubject(input, subjects);
  if (!subject) return;
  await db.delete(photoBankTags).where(and(eq(photoBankTags.photoId, row.bankPhotoId), eq(photoBankTags.subjectId, subject.id), eq(photoBankTags.originStoryId, storyId)));
}

/** One of the story's photos the editor gave to its place or person: in the bank (if it was not yet), filed under them, learned from this story. */
export async function fileStoryPhoto(topicId: string, storyId: string, storyPhotoId: string, input: PhotoBankSubjectInput): Promise<void> {
  const [row] = await db.select().from(storyReferencePhotos)
    .where(and(eq(storyReferencePhotos.topicId, topicId), eq(storyReferencePhotos.storyId, storyId), eq(storyReferencePhotos.id, storyPhotoId))).limit(1);
  if (row) await bankStoryPhoto(row, { subject: input });
}

/**
 * A story's photo in the bank: the bank photo with the same bytes, or a new
 * one (its bytes copied in R2, nothing downloaded), with the story photo's
 * name, credit, rights and focal point; the story photo then names it. A
 * Commons import is filed under the person or place it shows. Returns the
 * bank photo's id.
 */
export async function bankStoryPhoto(row: StoryPhotoRow, { subject }: { subject?: PhotoBankSubjectInput } = {}): Promise<string> {
  const workspaceId = await workspaceOfTopic(row.topicId);
  const commons = commonsSubject(row.description, row.provenance);
  const source: PhotoBankSource = commons ? "commons" : "upload";
  const find = async () => (await db.select().from(photoBankPhotos).where(and(eq(photoBankPhotos.workspaceId, workspaceId), eq(photoBankPhotos.sha256, row.sha256))).limit(1))[0];
  let bank = await find();
  if (!bank) {
    const objectKey = buildPhotoBankObjectKey(workspaceId, row.sha256);
    await copyPrivateR2Object(row.objectKey, objectKey);
    [bank] = await db.insert(photoBankPhotos).values({
      workspaceId, name: row.name, description: row.description, provenance: row.provenance, providerTransmissionAllowed: row.providerTransmissionAllowed,
      publicationRights: row.publicationRights, source, objectKey, sha256: row.sha256, fileName: `${row.sha256}.webp`, contentType: row.contentType, fileSize: row.fileSize,
      focusX: row.focusX, focusY: row.focusY, originTopicId: row.topicId, originStoryId: row.storyId,
    }).onConflictDoNothing().returning();
    bank ??= await find();
    if (!bank) throw new PhotoBankValidationError("The photo could not be added to the photo bank.");
  }
  if (row.bankPhotoId !== bank.id) await db.update(storyReferencePhotos).set({ bankPhotoId: bank.id }).where(eq(storyReferencePhotos.id, row.id));
  const filed = subject ?? (commons ? { kind: commons.kind, name: commons.name, wikidataId: commons.wikidataId } : undefined);
  if (filed) await tagBankPhoto(bank.id, (await subjectFor(workspaceId, filed)).id, { topicId: row.topicId, storyId: row.storyId });
  return bank.id;
}

/** bankStoryPhoto that never fails its caller: a photo the bank could not take is brought in by the next sync. */
export async function bankStoryPhotoQuietly(row: StoryPhotoRow, options?: { subject?: PhotoBankSubjectInput }): Promise<string | undefined> {
  try { return await bankStoryPhoto(row, options); } catch (error) {
    log.warn("story photo not added to the photo bank", { storyPhotoId: row.id, error: error instanceof Error ? error.message : String(error) });
    return undefined;
  }
}

/**
 * Brings into the bank every active story photo of the workspace it does not
 * have yet (the photos saved before the bank, or one a failure left out), and
 * files each under the places and people the Draft 2 sessions of its story
 * gave it to. Idempotent; a photo that fails is logged and tried again on the
 * next call.
 */
export async function syncPhotoBank(workspaceId: string): Promise<{ banked: number; filed: number }> {
  const pending = await db.select({ photo: storyReferencePhotos }).from(storyReferencePhotos).innerJoin(topics, eq(topics.id, storyReferencePhotos.topicId))
    .where(and(eq(topics.workspaceId, workspaceId), isNull(storyReferencePhotos.bankPhotoId), eq(storyReferencePhotos.active, true))).limit(SYNC_BATCH);
  if (!pending.length) return { banked: 0, filed: 0 };
  const banked = new Map<string, string>();
  for (const { photo } of pending) {
    const id = await bankStoryPhotoQuietly(photo);
    if (id) banked.set(photo.id, id);
  }
  let filed = 0;
  const storyIds = [...new Set(pending.map(({ photo }) => photo.storyId))];
  const sessions = await db.select({ topicId: draft2Sessions.topicId, storyId: draft2Sessions.storyId, inventory: draft2Sessions.inventory }).from(draft2Sessions).where(inArray(draft2Sessions.storyId, storyIds));
  for (const session of sessions) {
    for (const entity of ((session.inventory?.entities ?? []) as PhotoBankEntity[])) {
      const subject = subjectOfEntity(entity);
      const photoIds = [entity.storyPhoto?.id, entity.person?.confirmed?.storyPhotoId].filter((id): id is string => Boolean(id && banked.has(id)));
      if (!subject || !photoIds.length) continue;
      try {
        const filedUnder = await subjectFor(workspaceId, subject);
        for (const photoId of photoIds) { await tagBankPhoto(banked.get(photoId)!, filedUnder.id, { topicId: session.topicId, storyId: session.storyId }); filed++; }
      } catch (error) {
        log.warn("photo bank link not filed", { storyId: session.storyId, error: error instanceof Error ? error.message : String(error) });
      }
    }
  }
  log.info("photo bank synced", { workspaceId, banked: banked.size, filed });
  return { banked: banked.size, filed };
}

/** syncPhotoBank that never fails its caller. */
export async function syncPhotoBankQuietly(workspaceId: string): Promise<void> {
  try { await syncPhotoBank(workspaceId); } catch (error) {
    log.warn("photo bank not synced", { workspaceId, error: error instanceof Error ? error.message : String(error) });
  }
}

/** A bank photo of the workspace; retired ones only when asked. */
async function bankPhotoRow(workspaceId: string, photoId: string, { retired = false } = {}): Promise<PhotoBankPhotoRow> {
  const [row] = await db.select().from(photoBankPhotos).where(and(eq(photoBankPhotos.workspaceId, workspaceId), eq(photoBankPhotos.id, photoId))).limit(1);
  if (!row || (row.retiredAt && !retired)) throw new PhotoBankValidationError("This photo is not in the photo bank (or was retired from it).");
  return row;
}

/**
 * A bank photo given to a story: the story's copy of it (its own photo, with
 * the bank's name, credit, rights and focal point, its bytes copied in R2), or
 * the copy the story already has, or the story's own photo with the same
 * bytes. Returns the story photo.
 */
export async function copyBankPhotoToStory(topicId: string, storyId: string, bankPhotoId: string): Promise<StoryReferencePhoto> {
  await requireStoryMembership(topicId, storyId);
  const bank = await bankPhotoRow(await workspaceOfTopic(topicId), bankPhotoId);
  const [existing] = await db.select().from(storyReferencePhotos).where(and(
    eq(storyReferencePhotos.topicId, topicId), eq(storyReferencePhotos.storyId, storyId), eq(storyReferencePhotos.active, true),
    or(eq(storyReferencePhotos.bankPhotoId, bank.id), eq(storyReferencePhotos.sha256, bank.sha256)),
  )).limit(1);
  if (existing) {
    if (existing.bankPhotoId !== bank.id) await db.update(storyReferencePhotos).set({ bankPhotoId: bank.id }).where(eq(storyReferencePhotos.id, existing.id));
    return publicStoryPhoto({ ...existing, bankPhotoId: bank.id });
  }
  const id = randomUUID();
  const objectKey = buildStoryReferenceObjectKey(topicId, storyId, id);
  await copyPrivateR2Object(bank.objectKey, objectKey);
  const [row] = await db.insert(storyReferencePhotos).values({
    id, topicId, storyId, name: bank.name, description: bank.description, provenance: bank.provenance, providerTransmissionAllowed: bank.providerTransmissionAllowed,
    publicationRights: bank.publicationRights, objectKey, sha256: bank.sha256, fileName: `${id}.webp`, contentType: bank.contentType, fileSize: bank.fileSize,
    focusX: bank.focusX, focusY: bank.focusY, bankPhotoId: bank.id,
  }).returning();
  return publicStoryPhoto(row);
}

/** The bank photo of a person or place Wikidata knows (a Commons import made for another story), the newest; undefined when the bank has none. */
export async function bankPhotoOfWikidata(topicId: string, kind: PhotoBankSubjectKind, wikidataId: string): Promise<string | undefined> {
  const workspaceId = await workspaceOfTopic(topicId);
  const [row] = await db.select({ id: photoBankPhotos.id }).from(photoBankPhotos)
    .innerJoin(photoBankTags, eq(photoBankTags.photoId, photoBankPhotos.id)).innerJoin(photoBankSubjects, eq(photoBankSubjects.id, photoBankTags.subjectId))
    .where(and(eq(photoBankPhotos.workspaceId, workspaceId), isNull(photoBankPhotos.retiredAt), eq(photoBankSubjects.kind, kind), eq(photoBankSubjects.wikidataId, wikidataId)))
    .orderBy(sql`${photoBankPhotos.createdAt} desc`).limit(1);
  return row?.id;
}

/**
 * The editor gave a story's place or person a bank photo: the subject learns
 * the name the story uses and what the lookups found; a person is confirmed
 * (their next stories take their photo on their own), and their consent is
 * recorded when the editor ticked it.
 */
export async function confirmBankSubject(topicId: string, subjectId: string, { input, consent }: { input: PhotoBankSubjectInput; consent: boolean }): Promise<void> {
  const workspaceId = await workspaceOfTopic(topicId);
  const [row] = await db.select().from(photoBankSubjects).where(and(eq(photoBankSubjects.workspaceId, workspaceId), eq(photoBankSubjects.id, subjectId))).limit(1);
  if (!row) throw new PhotoBankValidationError("This place or person is no longer in the photo bank.");
  const subject = subjectOf(row);
  const aliases = withAlias(subject, input.name);
  const now = new Date();
  try {
    await db.update(photoBankSubjects).set({
      ...(aliases !== subject.aliases ? { aliases } : {}),
      ...(!row.googlePlaceId && input.googlePlaceId ? { googlePlaceId: input.googlePlaceId } : {}),
      ...(!row.wikidataId && input.wikidataId ? { wikidataId: input.wikidataId } : {}),
      ...(!row.address && input.address ? { address: input.address } : {}),
      ...(row.kind === "person" && !row.confirmedAt ? { confirmedAt: now } : {}),
      ...(row.kind === "person" && consent && !row.consentAt ? { consentAt: now } : {}),
      updatedAt: now,
    }).where(eq(photoBankSubjects.id, row.id));
  } catch (error) {
    // An id another subject holds: record only the confirmation and the consent.
    log.warn("photo bank subject identity not learned", { subjectId, error: error instanceof Error ? error.message : String(error) });
    await db.update(photoBankSubjects).set({ ...(row.kind === "person" && !row.confirmedAt ? { confirmedAt: now } : {}), ...(row.kind === "person" && consent && !row.consentAt ? { consentAt: now } : {}), updatedAt: now }).where(eq(photoBankSubjects.id, row.id));
  }
}

/** A story photo's new rights reach its bank photo and every story's copy of it: the rights are the photo's, not one story's. */
export async function syncStoryPhotoRights(storyPhoto: { bankPhotoId?: string | null }, rights: StoryPhotoRights): Promise<void> {
  if (!storyPhoto.bankPhotoId) return;
  await db.update(photoBankPhotos).set({ publicationRights: rights, updatedAt: new Date() }).where(eq(photoBankPhotos.id, storyPhoto.bankPhotoId));
  await db.update(storyReferencePhotos).set({ publicationRights: rights }).where(eq(storyReferencePhotos.bankPhotoId, storyPhoto.bankPhotoId));
}

/** A story photo's focal point becomes its bank photo's: the next story's copy starts from it. */
export async function syncStoryPhotoFocus(storyPhoto: { bankPhotoId?: string | null }, focus: PhotoFocus | null): Promise<void> {
  if (!storyPhoto.bankPhotoId) return;
  await db.update(photoBankPhotos).set({ focusX: focus?.x ?? null, focusY: focus?.y ?? null, updatedAt: new Date() }).where(eq(photoBankPhotos.id, storyPhoto.bankPhotoId));
}

/** A subject the editor names on the bank's page: one of the workspace's, or a new one. */
async function chosenSubject(workspaceId: string, choice: PhotoBankSubjectChoice): Promise<PhotoBankSubjectRow> {
  if ("subjectId" in choice) {
    const [row] = await db.select().from(photoBankSubjects).where(and(eq(photoBankSubjects.workspaceId, workspaceId), eq(photoBankSubjects.id, choice.subjectId))).limit(1);
    if (!row) throw new PhotoBankValidationError("This place or person is not in the photo bank.");
    return row;
  }
  return subjectFor(workspaceId, { kind: choice.kind, name: choice.name });
}

/** The editor's change to a bank photo (photo-bank.types.ts, parsePhotoChange). Rights reach every story's copy; the rest is the bank's. */
export async function changeBankPhoto(workspaceId: string, photoId: string, change: PhotoBankPhotoChange): Promise<void> {
  const row = await bankPhotoRow(workspaceId, photoId, { retired: true });
  if ("publicationRights" in change) await syncStoryPhotoRights({ bankPhotoId: row.id }, change.publicationRights);
  else if ("focus" in change) await syncStoryPhotoFocus({ bankPhotoId: row.id }, change.focus);
  else if ("retired" in change) await db.update(photoBankPhotos).set({ retiredAt: change.retired ? new Date() : null, updatedAt: new Date() }).where(eq(photoBankPhotos.id, row.id));
  else if ("tag" in change) await tagBankPhoto(row.id, (await chosenSubject(workspaceId, change.tag)).id);
  else await db.delete(photoBankTags).where(and(eq(photoBankTags.photoId, row.id), eq(photoBankTags.subjectId, change.untag)));
}

/** The editor's change to a place or person: a new name (the old one stays an alias), or a person's consent to appear. */
export async function changeBankSubject(workspaceId: string, subjectId: string, change: PhotoBankSubjectChange): Promise<void> {
  const [row] = await db.select().from(photoBankSubjects).where(and(eq(photoBankSubjects.workspaceId, workspaceId), eq(photoBankSubjects.id, subjectId))).limit(1);
  if (!row) throw new PhotoBankValidationError("This place or person is not in the photo bank.");
  if ("consent" in change) {
    if (row.kind !== "person") throw new PhotoBankValidationError("Only a person's consent is recorded.");
    await db.update(photoBankSubjects).set({ consentAt: change.consent ? new Date() : null, updatedAt: new Date() }).where(eq(photoBankSubjects.id, row.id));
    return;
  }
  const subject = subjectOf(row);
  await db.update(photoBankSubjects).set({ name: change.name, aliases: withAlias({ name: change.name, aliases: subject.aliases }, row.name), updatedAt: new Date() }).where(eq(photoBankSubjects.id, row.id));
}

/**
 * A photo the editor adds to the bank itself, with what it shows: the same
 * rules as a story photo (a JPG, PNG or WebP up to 15 MB, a credit, the
 * rights, permission to send it to the image provider), normalized the same
 * way. Bytes the bank already has are that photo, filed under the place or
 * person too.
 */
export async function uploadBankPhoto(workspaceId: string, form: FormData): Promise<{ photoId: string; existed: boolean }> {
  const image = form.get("image");
  if (!(image instanceof File) || !["image/jpeg", "image/png", "image/webp"].includes(image.type) || image.size === 0 || image.size > 15 * 1024 * 1024) throw new PhotoBankValidationError("Upload a JPG, PNG or WebP photo up to 15 MB.");
  const name = materialText(form.get("name"), "Photo name", 150);
  const description = materialText(form.get("description"), "Description", 1000);
  const provenance = materialText(form.get("provenance"), "Source / permission", 1000);
  if (form.get("providerTransmissionAllowed") !== "true") throw new PhotoBankValidationError("Confirm permission to use and send this photo to the image provider.");
  const publicationRights = parsePhotoRights(form.get("publicationRights"));
  const subjectId = form.get("subjectId");
  const subjectKind = form.get("subjectKind");
  const choice: PhotoBankSubjectChoice | undefined = typeof subjectId === "string" && subjectId ? { subjectId }
    : (subjectKind === "place" || subjectKind === "person") ? { kind: subjectKind, name: parseSubjectName(form.get("subjectName")) } : undefined;
  let normalized: Buffer;
  try {
    const pipeline = sharp(Buffer.from(await image.arrayBuffer()), { limitInputPixels: 40_000_000, animated: false });
    const metadata = await pipeline.metadata();
    if (!metadata.width || !metadata.height || metadata.width < 64 || metadata.height < 64 || !["jpeg", "png", "webp"].includes(metadata.format ?? "") || (metadata.pages ?? 1) > 1) throw new Error("Invalid image");
    normalized = await pipeline.rotate().resize({ width: 2048, height: 2048, fit: "inside", withoutEnlargement: true }).webp({ quality: 90 }).toBuffer();
  } catch { throw new PhotoBankValidationError("This image cannot be decoded. Use a still JPG, PNG or WebP of at least 64 × 64."); }
  const sha256 = createHash("sha256").update(normalized).digest("hex");
  const subject = choice ? await chosenSubject(workspaceId, choice) : undefined;
  const [had] = await db.select().from(photoBankPhotos).where(and(eq(photoBankPhotos.workspaceId, workspaceId), eq(photoBankPhotos.sha256, sha256))).limit(1);
  if (had) {
    if (subject) await tagBankPhoto(had.id, subject.id);
    return { photoId: had.id, existed: true };
  }
  const objectKey = buildPhotoBankObjectKey(workspaceId, sha256);
  await putPrivateR2Object({ objectKey, body: normalized, contentType: "image/webp" });
  const [row] = await db.insert(photoBankPhotos).values({
    workspaceId, name, description, provenance, providerTransmissionAllowed: true, publicationRights, source: "upload", objectKey, sha256, fileName: `${sha256}.webp`, fileSize: normalized.length,
  }).onConflictDoNothing().returning();
  const photoId = row?.id ?? (await db.select({ id: photoBankPhotos.id }).from(photoBankPhotos).where(and(eq(photoBankPhotos.workspaceId, workspaceId), eq(photoBankPhotos.sha256, sha256))).limit(1))[0]?.id;
  if (!photoId) throw new PhotoBankValidationError("The photo could not be added to the photo bank.");
  if (subject) await tagBankPhoto(photoId, subject.id);
  return { photoId, existed: !row };
}

/** A bank photo's bytes, for the editor's preview. */
export async function readBankPhotoFile(workspaceId: string, photoId: string): Promise<File> {
  const row = await bankPhotoRow(workspaceId, photoId, { retired: true });
  return readPrivateR2ImageFile({ objectKey: row.objectKey, contentType: row.contentType, fileName: row.fileName });
}
