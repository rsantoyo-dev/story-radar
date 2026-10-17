import assert from "node:assert/strict";
import test from "node:test";
import {
  PhotoBankValidationError, commonsSubject, existingSubject, matchSubject, mayShow, parsePhotoChange, parseSubjectChange, parseSubjectChoice, photoHold, photoToTake, photosInOrder,
  queryOfEntity, subjectKey, subjectOfEntity, takesPhotoOnItsOwn, withAlias,
  type PhotoBankPhoto, type PhotoBankSubject,
} from "./photo-bank.types";

const S = (n: number) => `00000000-0000-4000-8000-00000000000${n}`;
const subject = (n: number, overrides: Partial<PhotoBankSubject>): PhotoBankSubject => ({ id: S(n), kind: "place", name: "x", aliases: [], consent: false, confirmed: false, ...overrides });
const park = subject(1, { name: "Parc naturel des Parulines", aliases: ["parc naturel des Parulines"], googlePlaceId: "ChIJNZk2Ru2h" });
const jo = subject(2, { kind: "person", name: "Jo" });
const elvis = subject(3, { kind: "person", name: "Elvis", consent: true });
const houde = subject(4, { kind: "person", name: "Louis-José Houde", wikidataId: "Q1871425" });
const central = subject(5, { name: "Parc Central", googlePlaceId: "G-OTHER" });
const SUBJECTS = [park, jo, elvis, houde, central];
const photo = (id: string, subjectIds: string[], overrides: Partial<PhotoBankPhoto> = {}): PhotoBankPhoto => ({
  id, name: id, description: "", provenance: "Ricardo Santoyo", rights: "own", transmissionAllowed: true, source: "upload", subjectIds, uses: 0, retired: false, createdAt: "2026-10-13T00:00:00.000Z", ...overrides,
});

test("names are compared without accents, punctuation or case", () => {
  assert.equal(subjectKey("Saint‑Jean-sur‑Richelieu"), "saint jean sur richelieu");
  assert.equal(subjectKey("  Fogón  Lab! "), "fogon lab");
  assert.equal(subjectKey("Louis-José Houde"), subjectKey("louis jose houde"));
});

test("a story's place is the bank's by its Google Maps id first, then by its Wikidata id, then by its name, whole or in part; ids that differ are another place", () => {
  assert.deepEqual(matchSubject({ kind: "place", name: "Parc des Parulines", googlePlaceId: "ChIJNZk2Ru2h" }, SUBJECTS), { subject: park, by: "google" });
  assert.deepEqual(matchSubject({ kind: "place", name: "parc naturel des parulines" }, SUBJECTS), { subject: park, by: "name" });
  assert.deepEqual(matchSubject({ kind: "place", name: "Parulines" }, SUBJECTS), { subject: park, by: "name" }, "part of its name, long enough to mean one place");
  assert.deepEqual(matchSubject({ kind: "place", name: "Parc des Parulines" }, SUBJECTS), { subject: park, by: "name" }, "its words in order");
  assert.equal(matchSubject({ kind: "place", name: "Parulines des Parc" }, SUBJECTS), undefined, "not in another order");
  assert.equal(matchSubject({ kind: "place", name: "Parc" }, SUBJECTS), undefined, "a word every park shares is no match");
  assert.equal(matchSubject({ kind: "place", name: "Parc naturel des Parulines", googlePlaceId: "G-ELSEWHERE" }, SUBJECTS), undefined, "the same name at another Google place is another place");
  const withWikidata = subject(6, { name: "Canal de Chambly", wikidataId: "Q123" });
  assert.deepEqual(matchSubject({ kind: "place", name: "Le canal", wikidataIds: ["Q123"] }, [withWikidata]), { subject: withWikidata, by: "wikidata" });
  assert.equal(matchSubject({ kind: "place", name: "Canal de Chambly", wikidataIds: ["Q999"] }, [withWikidata]), undefined, "another Wikidata item: another canal");
  assert.equal(matchSubject({ kind: "place", name: "Jo" }, SUBJECTS), undefined, "a person is never a place");
});

test("a story's person is the bank's by a Wikidata id among their Commons candidates, else by their whole name; never by part of it", () => {
  assert.deepEqual(matchSubject({ kind: "person", name: "L.-J. Houde", wikidataIds: ["Q9", "Q1871425"] }, SUBJECTS), { subject: houde, by: "wikidata" });
  assert.deepEqual(matchSubject({ kind: "person", name: "Louis-José Houde" }, SUBJECTS), { subject: houde, by: "name" }, "Commons not reached: the name alone");
  assert.equal(matchSubject({ kind: "person", name: "Louis-José Houde", wikidataIds: ["Q9"] }, SUBJECTS), undefined, "Commons knows another person of that name, and not the bank's");
  assert.deepEqual(matchSubject({ kind: "person", name: "jo" }, SUBJECTS), { subject: jo, by: "name" });
  assert.deepEqual(matchSubject({ kind: "person", name: "Jo", wikidataIds: ["Q77"] }, SUBJECTS), { subject: jo, by: "name" }, "a person Wikidata does not know is met by name whatever Commons finds");
  assert.equal(matchSubject({ kind: "person", name: "Jo Tremblay" }, SUBJECTS), undefined);
});

test("a story's place or person is filed under the subject with its ids, or one of the same name whose ids do not differ; the names it was given become aliases", () => {
  assert.equal(existingSubject({ kind: "place", name: "Les Parulines", googlePlaceId: "ChIJNZk2Ru2h" }, SUBJECTS), park);
  assert.equal(existingSubject({ kind: "place", name: "Parc naturel des Parulines" }, SUBJECTS), park);
  assert.equal(existingSubject({ kind: "place", name: "Parc Central", googlePlaceId: "G-ELSEWHERE" }, SUBJECTS), undefined, "another Parc Central");
  assert.equal(existingSubject({ kind: "person", name: "Louis-José Houde", wikidataId: "Q1871425" }, SUBJECTS), houde);
  assert.deepEqual(withAlias(park, "Les Parulines"), ["parc naturel des Parulines", "Les Parulines"]);
  assert.equal(withAlias(park, "PARC NATUREL DES PARULINES"), park.aliases, "the same name in other letters is no new alias");
  assert.equal(withAlias({ name: "x", aliases: Array.from({ length: 12 }, (_, index) => `n${index}`) }, "new").length, 12, "the newest twelve");
});

test("the bank shows a place always, a person Wikidata knows, or one whose consent the editor recorded; it gives a photo on its own to a place matched by its ids and to a person confirmed once", () => {
  assert.deepEqual([mayShow(park), mayShow(jo), mayShow(elvis), mayShow(houde)], [true, false, true, true]);
  assert.equal(takesPhotoOnItsOwn({ subject: park, by: "google" }), true);
  assert.equal(takesPhotoOnItsOwn({ subject: park, by: "name" }), false, "a name alone may be another place");
  assert.equal(takesPhotoOnItsOwn({ subject: { ...jo, confirmed: true }, by: "name" }), false, "no consent recorded");
  assert.equal(takesPhotoOnItsOwn({ subject: { ...jo, confirmed: true, consent: true }, by: "name" }), true);
  assert.equal(takesPhotoOnItsOwn({ subject: houde, by: "wikidata" }), false, "the editor has not confirmed them from the bank yet");
  assert.equal(takesPhotoOnItsOwn({ subject: { ...houde, confirmed: true }, by: "wikidata" }), true);
});

test("the photo given on its own may be published, is not retired, shows no one the story does not name and no one without consent, and is the least used", () => {
  const photos = [
    photo("used", [park.id], { uses: 2, lastUsedAt: "2026-10-14T00:00:00.000Z" }),
    photo("with-jo", [park.id, jo.id]),
    photo("reference", [park.id], { rights: "reference" }),
    photo("retired", [park.id], { retired: true }),
    photo("elsewhere", [central.id]),
  ];
  const context = (storySubjectIds: string[], subjects = SUBJECTS) => ({ subjectId: park.id, storySubjectIds: new Set(storySubjectIds), subjects });
  assert.equal(photoToTake(photos, context([park.id]))?.id, "used", "Jo is not in the story: their photo waits for the editor");
  assert.equal(photoHold(photos[1], context([park.id])), "Jo appears in it and is not in this story");
  assert.equal(photoHold(photos[1], context([park.id, jo.id])), "Jo: consent to appear not recorded");
  assert.equal(photoToTake(photos, context([park.id, jo.id], SUBJECTS.map((entry) => entry.id === jo.id ? { ...entry, consent: true } : entry)))?.id, "with-jo", "the least used, once Jo is in the story and agreed");
  assert.match(String(photoHold(photos[2], context([park.id]))), /^reference only/);
  assert.equal(photoHold(photos[3], context([park.id])), "retired from the bank");
  assert.equal(photoToTake([photos[2], photos[3]], context([park.id])), undefined);
  const order = photosInOrder([
    photo("old-use", [park.id], { uses: 1, lastUsedAt: "2026-10-01T00:00:00.000Z" }),
    photo("recent-use", [park.id], { uses: 1, lastUsedAt: "2026-10-15T00:00:00.000Z" }),
    photo("new", [park.id], { createdAt: "2026-10-16T00:00:00.000Z" }),
    photo("older", [park.id], { createdAt: "2026-10-02T00:00:00.000Z" }),
  ]).map((entry) => entry.id);
  assert.deepEqual(order, ["new", "older", "old-use", "recent-use"], "unused first, the newest of them first; then the longest unused");
});

test("a Commons import's person or place is read from the description the import writes", () => {
  const via = "Photo: Jeangagnon · CC BY-SA 3.0 (https://creativecommons.org/licenses/by-sa/3.0/) · https://commons.wikimedia.org/wiki/File:x.jpg · via Wikimedia Commons";
  assert.deepEqual(commonsSubject("Louis-José Houde — humoriste, animateur et acteur québécois. Portrait from Wikimedia Commons (Wikidata Q1871425).", via), { kind: "person", name: "Louis-José Houde", wikidataId: "Q1871425" });
  assert.deepEqual(commonsSubject("Fort Chambly. Photo from Wikimedia Commons (Wikidata Q5). Commons warns of personality rights.", via), { kind: "place", name: "Fort Chambly", wikidataId: "Q5" });
  assert.equal(commonsSubject("jo parulines", "ricardo santoyo"), undefined);
  assert.equal(commonsSubject("Louis-José Houde. Portrait from Wikimedia Commons (Wikidata Q1871425).", "My own photo"), undefined, "only an import says it came via Commons");
});

test("a story's place or person is filed with what its lookups found, and looked up by it", () => {
  const verified = { kind: "place", name: "parc naturel des Parulines", place: { status: "verified", google: { placeId: "ChIJNZk2Ru2h", address: "166 Chem. du Clocher", latitude: 45.3, longitude: -73.2 } } };
  assert.deepEqual(subjectOfEntity(verified), { kind: "place", name: "parc naturel des Parulines", googlePlaceId: "ChIJNZk2Ru2h", address: "166 Chem. du Clocher", latitude: 45.3, longitude: -73.2 });
  assert.deepEqual(subjectOfEntity({ ...verified, place: { ...verified.place, status: "rejected" } }), { kind: "place", name: "parc naturel des Parulines" }, "a match the editor set aside was another place");
  assert.deepEqual(subjectOfEntity({ kind: "person", name: "Louis-José Houde", person: { status: "confirmed", confirmed: { entityId: "Q1871425" } } }), { kind: "person", name: "Louis-José Houde", wikidataId: "Q1871425" });
  assert.equal(subjectOfEntity({ kind: "organization", name: "Pomerleau" }), undefined, "organizations are never shown");
  assert.deepEqual(queryOfEntity({ kind: "person", name: "Jo", person: { status: "candidates", candidates: [{ entityId: "Q77" }, { entityId: "Q78" }] } }), { kind: "person", name: "Jo", wikidataIds: ["Q77", "Q78"] });
  assert.deepEqual(queryOfEntity(verified), { kind: "place", name: "parc naturel des Parulines", googlePlaceId: "ChIJNZk2Ru2h" });
});

test("the editor's changes are contracts: rights, focal point, retired, a place or person added or taken off, a name, a consent", () => {
  assert.deepEqual(parsePhotoChange({ publicationRights: "own" }), { publicationRights: "own" });
  assert.deepEqual(parsePhotoChange({ focus: { x: 0.25, y: 0.5 } }), { focus: { x: 0.25, y: 0.5 } });
  assert.deepEqual(parsePhotoChange({ focus: null }), { focus: null });
  assert.deepEqual(parsePhotoChange({ retired: true }), { retired: true });
  assert.deepEqual(parsePhotoChange({ tag: { subjectId: S(1) } }), { tag: { subjectId: S(1) } });
  assert.deepEqual(parsePhotoChange({ tag: { kind: "person", name: "  Jo  " } }), { tag: { kind: "person", name: "Jo" } });
  assert.deepEqual(parsePhotoChange({ untag: S(2) }), { untag: S(2) });
  const invalid = (value: unknown, pattern: RegExp) => assert.throws(() => parsePhotoChange(value), (error: Error) => error instanceof PhotoBankValidationError && pattern.test(error.message));
  invalid({ publicationRights: "mine" }, /our own, licensed, or reference only/);
  invalid({ focus: { x: 2, y: 0 } }, /between 0 and 1/);
  invalid({ retired: "yes" }, /true or false/);
  invalid({ tag: { kind: "organization", name: "Pomerleau" } }, /place or a person/);
  invalid({ tag: { kind: "place", name: " " } }, /Name the place or person/);
  invalid({ untag: "e2" }, /untag/);
  invalid({}, /publicationRights, focus, retired, tag or untag/);
  assert.deepEqual(parseSubjectChange({ consent: true }), { consent: true });
  assert.deepEqual(parseSubjectChange({ name: "Les Parulines" }), { name: "Les Parulines" });
  assert.throws(() => parseSubjectChange({ consent: "yes" }), /true or false/);
  assert.throws(() => parseSubjectChoice({ subjectId: "e1" }), /subjectId/);
});
