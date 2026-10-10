import assert from "node:assert/strict";
import test from "node:test";
import { Draft2InputError, Draft2ResponseError } from "./draft2-facts.types";
import {
  correctionFor, draft2ImageReview, imagesNote, imagesTarget, newImagesRun, parseDraft2ImageReview, parseImagesAction, regeneratedSlide, chosenSlide,
  settledStatus, shownAttempt, slideMaterial, slideSettled, slideUnit, textDifferences,
  type Draft2ImageAttempt, type Draft2SlideImage,
} from "./draft2-images.types";
import type { Draft2Inventory, Draft2InventoryEntity } from "./draft2-inventory.types";
import type { Draft2CarouselSlide, Draft2Visual, Draft2VisualCandidate, Draft2VisualSlide } from "./draft2-visual.types";

const json = (value: unknown) => JSON.stringify(value);
const NOW = new Date("2026-10-10T18:00:00.000Z");

const carousel: Draft2CarouselSlide[] = [
  { slide: "cover", label: "Cover", headline: "Your kids bring treats to the animals", text: "A free rally at the park on Saturday.", factIds: ["f1"] },
  { slide: "s1", label: "Slide 2", headline: "Toads, spiders and bats", text: "Naturalists explain them.", practical: "9:30 to 12:30", factIds: ["f2"] },
  { slide: "penultimate", label: "Slide 3", headline: "Meet at the kiosk", text: "An adult comes along.", factIds: ["f3"] },
  { slide: "last", label: "Slide 4", headline: "Light rain: it goes on", text: "Cancelled in heavy rain.", cta: "Follow us for family outings.", factIds: ["f3"] },
];
const scriptSlide = (slide: string, overrides: Partial<Draft2VisualSlide> = {}): Draft2VisualSlide => ({
  slide, beat: `A child steps forward on ${slide}`, shot: "medium", headlineLink: "", direction: `Photographic collage on cream: a child's boots on a trail, ${slide}.`, need: "generic-illustration", characterIds: [], references: [], ...overrides,
});
const script = (overrides: Partial<Draft2VisualCandidate> = {}): Draft2VisualCandidate => ({
  id: "c4", angle: "The walk", concept: "A family walks the trail and meets its animals.", protagonist: "A child seen from behind", motif: "Boots that get muddier", cast: "A child and an adult, from behind",
  characterPlan: { use: false, characterIds: [], role: "" }, slides: carousel.map((entry) => scriptSlide(entry.slide)), ...overrides,
});

const person = (overrides: Partial<Draft2InventoryEntity> = {}): Draft2InventoryEntity => ({
  id: "e1", name: "Catherine Fournier", kind: "person", role: "subject", description: "", factIds: ["f1"],
  person: { status: "confirmed", candidates: [], confirmed: { entityId: "Q1", name: "Catherine Fournier", thumbnailUrl: "u", author: "A", license: "CC BY 4.0", commonsUrl: "c", storyPhotoId: "photo-portrait" } }, ...overrides,
});
const place = (overrides: Partial<NonNullable<Draft2InventoryEntity["place"]>> = {}, entity: Partial<Draft2InventoryEntity> = {}): Draft2InventoryEntity => ({
  id: "e2", name: "Parc des Parulines", kind: "place", role: "subject", description: "", factIds: ["f1"],
  place: { status: "verified", wikidataId: "Q2", map: true, photo: { source: "commons", author: "B", license: "CC BY 4.0", resourceUrl: "r", width: 2000, height: 1300, retrievedAt: NOW.toISOString() }, ...overrides }, ...entity,
});
const inventory = (entities: Draft2InventoryEntity[], storyPhotos: Draft2Inventory["storyPhotos"] = []): Draft2Inventory => ({ status: "ready", version: 3, entities, storyPhotos, characters: "auto", roster: [] });

test("a slide as v1's prompt builder reads it: the cover's text as its subheadline, a practical line under the body, the call to action, and the direction led by what happens", () => {
  const slides = script({ slides: carousel.map((entry, index) => scriptSlide(entry.slide, index === 1 ? { headlineLink: "the three animals the headline names, met on the trail", need: "typography" } : index === 0 ? { characterIds: ["char-jo"] } : {})) }).slides;
  const units = carousel.map((_, index) => slideUnit(carousel, index, slides[index], []));
  assert.equal(json(units.map((unit) => [unit.order, unit.role, unit.assetRequest])), json([[1, "cover", "generated-image"], [2, "content", "typography-only"], [3, "conclusion", "generated-image"], [4, "call-to-action", "generated-image"]]));
  assert.equal(json([units[0].subheadline, units[0].body, units[1].body, units[3].ctaQuestion]), json(["A free rally at the park on Saturday.", undefined, "Naturalists explain them.\n9:30 to 12:30", "Follow us for family outings."]));
  assert.equal(units[1].visualDirection, "What happens: A child steps forward on s1. With its headline: the three animals the headline names, met on the trail. Photographic collage on cream: a child's boots on a trail, s1.");
  assert.equal(json([units[0].characterIds, units[0].visualNeed, units[0].aspectRatio, units[0].factIds]), json([["char-jo"], "generic-illustration", "4:5", ["f1"]]));
  const pasted = slideUnit(carousel, 0, slides[0], [{ kind: "pasted-photo", storyPhotoId: "photo-portrait", name: "Catherine Fournier", person: true }]);
  assert.equal(json(pasted.characterIds), json([]), "a real photo is the only person on its slide");
  const story = slideUnit(carousel, 2, slides[2], [{ kind: "story-photo", storyPhotoId: "p1", name: "Kiosk", purpose: "place" }]);
  assert.equal(json(story.storyReferences), json([{ id: "p1", purpose: "place" }]));
});

test("what a slide shows of its references: a person's portrait pasted, a place's map on a map slide, its story photo, its verified photo, or a note", () => {
  const linked = { id: "p9", name: "The kiosk", provenance: "Editor", transmissionAllowed: true };
  const material = (slide: Partial<Draft2VisualSlide>, entities: Draft2InventoryEntity[], photos: Draft2Inventory["storyPhotos"] = []) => slideMaterial(scriptSlide("s1", slide), inventory(entities, photos));
  assert.equal(json(material({ need: "real-photo", references: ["e1"] }, [person()]).material), json([{ kind: "pasted-photo", storyPhotoId: "photo-portrait", name: "Catherine Fournier", person: true, entityId: "e1" }]));
  assert.equal(material({ need: "real-photo", references: ["e1"] }, [person({ person: { status: "none", candidates: [] }, storyPhoto: { ...linked, id: "p7" } })]).material[0]?.kind, "pasted-photo", "the editor's photo of them is their portrait");
  assert.match(material({ references: ["e1"] }, [person({ person: { status: "rejected", candidates: [] } })]).notes[0], /has no confirmed portrait, so the slide does not show them/);
  assert.equal(json(material({ need: "verified-map", references: ["e2"] }, [place({ google: { placeId: "g1", name: "Parc", address: "166 chemin du Clocher", latitude: 45.3, longitude: -73.2, sourceUrl: "s", exactName: true } })]).material), json([{ kind: "map", entityId: "e2", name: "Parc des Parulines", source: "google" }]));
  assert.equal(material({ need: "verified-map", references: ["e2"] }, [place()]).material[0]?.kind, "map", "Wikidata's coordinates make a map too");
  assert.equal(json(material({ need: "real-photo", references: ["e2"] }, [place({ status: "not-found", map: false, photo: undefined, wikidataId: undefined }, { storyPhoto: linked })]).material), json([{ kind: "story-photo", storyPhotoId: "p9", name: "Parc des Parulines", purpose: "place" }]));
  assert.equal(material({ need: "real-photo", references: ["e2"] }, [place({}, { storyPhoto: { ...linked, transmissionAllowed: false } })]).material[0]?.kind, "pasted-photo", "a photo that may not be sent is pasted unchanged");
  assert.equal(material({ need: "real-photo", references: ["e2"] }, [place()]).material[0]?.kind, "place-photo");
  assert.match(material({ references: ["e2"] }, [place({ status: "rejected" })]).notes[0], /has no verified photo or map, so the slide shows a generic scene/);
  const photos = ["p1", "p2", "p3", "p4"].map((id) => ({ id, name: id, description: "", provenance: "Editor", transmissionAllowed: true }));
  const many = material({ references: ["p1", "p2", "p3", "p4"] }, [], photos);
  assert.equal(json([many.material.length, many.notes.length]), json([3, 1]), "three story photos a slide at most");
  const both = material({ need: "real-photo", references: ["e1", "p1"] }, [person()], photos);
  assert.equal(json([both.material.map((entry) => entry.kind), /left out/.test(both.notes[0])]), json([["pasted-photo"], true]), "a real photo is the only photo on its slide");
  assert.equal(json(material({ references: ["photo-portrait"] }, [person()], [{ id: "photo-portrait", name: "Portrait", description: "", provenance: "Commons", transmissionAllowed: true }]).material), json([]), "a person's photo is never a free reference");
});

const visualRun = (overrides: Partial<Draft2Visual> = {}): Draft2Visual => ({
  status: "needs-review", winnerId: "c4", candidates: [script()], rounds: [{ round: 1, candidates: [script()], mechanical: [], at: "t", evaluation: { verdict: "revise", winnerId: "c4", scores: [{ candidateId: "c4", narrative: 94, continuity: 94, brand: 94, truth: 94, fit: 94, craft: 94, focus: 94, overall: 94, note: "x" }], issues: [], suggestions: [], summary: "x" } }],
  carousel, deckId: "c3", inventoryVersion: 3, mode: "illustration-editorial", ...overrides,
});

test("images picture a finished visual script while its deck and its people and places are still the ones it followed, under illustration-editorial", () => {
  const session = { visual: visualRun(), deck: { editorChoiceId: "c3" }, inventory: inventory([]) } as unknown as Parameters<typeof imagesTarget>[0];
  assert.equal(imagesTarget(session).script.id, "c4");
  const refused = (patch: Record<string, unknown>, pattern: RegExp) => assert.throws(() => imagesTarget({ ...session, ...patch } as Parameters<typeof imagesTarget>[0]), (error: Error) => error instanceof Draft2InputError && pattern.test(error.message));
  refused({ visual: null }, /Finish the visual script first/);
  refused({ visual: visualRun({ status: "paused" }) }, /Finish the visual script first/);
  refused({ visual: visualRun({ winnerId: undefined }) }, /Choose a visual script first/);
  refused({ deck: { editorChoiceId: "c9" } }, /pictures the deck c3; the deck chosen now is c9/);
  refused({ inventory: { ...inventory([]), version: 4 } }, /The people and places changed since this visual script/);
  refused({ visual: visualRun({ mode: "photo-required" }) }, /Under the photo-required visual mode nothing is generated/);
});

test("a new run queues one first image a slide, with what each slide shows and could not show", () => {
  const withPortrait = script({ slides: carousel.map((entry, index) => scriptSlide(entry.slide, index === 0 ? { need: "real-photo", references: ["e1"], characterIds: [] } : index === 1 ? { characterIds: ["char-jo"], need: "character-reference" } : {})) });
  const run = newImagesRun({ runId: "r1", visual: visualRun(), script: withPortrait, carousel, inventory: inventory([person()]), model: "openai/gpt-image-2.5/sunburst/text-to-image", now: NOW });
  assert.equal(json([run.status, run.visualId, run.deckId, run.inventoryVersion, run.quality, run.slides.length]), json(["running", "c4", "c3", 3, "low", 4]));
  assert.equal(json(run.slides.map((slide) => [slide.slide, slide.order, slide.attempts.map((attempt) => [attempt.version, attempt.kind, attempt.status])])), json([["cover", 1, [[1, "generate", "queued"]]], ["s1", 2, [[1, "generate", "queued"]]], ["penultimate", 3, [[1, "generate", "queued"]]], ["last", 4, [[1, "generate", "queued"]]]]));
  assert.equal(json([run.slides[0].material[0]?.kind, run.slides[1].characterIds]), json(["pasted-photo", ["char-jo"]]));
});

test("the words in the image are compared with the slide's: accents count, the page number and the logo do not, spacing alone is no difference", () => {
  assert.equal(json(textDifferences("Pluie légère : votre sortie tient", "Pluie légère : votre sortie tient")), json({ missing: [], extra: [] }));
  assert.equal(json(textDifferences("Pluie légère", "Pluie legere")), json({ missing: ["légère"], extra: ["legere"] }));
  assert.equal(json(textDifferences("Un rallye en famille", "Un rallye en famille\n3/6\nSalut St-Jean", "Salut St-Jean")), json({ missing: [], extra: [] }));
  assert.equal(json(textDifferences("De 9 h 30 à 12 h 30", "De 9h30 à 12h30")), json({ missing: [], extra: [] }));
  assert.equal(json(textDifferences("Les animaux aussi ont droit à leurs bonbons", "Les animaux ont droit à leurs bonbons bonbons")), json({ missing: ["aussi"], extra: ["bonbons"] }));
});

const answer = (overrides: Record<string, unknown> = {}) => JSON.stringify({
  peopleOutsideVerifiedPhoto: false, possibleRealPersonLikeness: false, thirdPartyLogos: [], brandAvoidViolations: [], factContradictions: [], inventedNamedSubject: "", summary: "",
  transcription: "Toads, spiders and bats\nNaturalists explain them.", textCovered: false, textNote: "", storyNote: "", ...overrides,
});
const reviewInput = { visibleText: "Toads, spiders and bats\nNaturalists explain them.", expectedText: "Toads, spiders and bats\nNaturalists explain them.", publicationName: "Salut St-Jean", characters: [], facts: ["Naturalists explain toads."], brand: { avoid: ["Marks: Polaroid frames"], allowed: [], acceptance: [] } };
const meta = { model: "gpt-6.1-sol", at: NOW.toISOString() };

test("Sol's review: v1's blocking issues, the words that differ, words an overlay covers and broken lettering block; the story note never does", () => {
  assert.equal(json(draft2ImageReview(parseDraft2ImageReview(answer({ storyNote: "The boots carry the beat." })), reviewInput, meta)), json({ status: "passed", issues: [], note: "The boots carry the beat.", transcription: "Toads, spiders and bats\nNaturalists explain them.", model: "gpt-6.1-sol", at: NOW.toISOString() }));
  const flagged = draft2ImageReview(parseDraft2ImageReview(answer({ transcription: "Toads, spiders and bat\nNaturalists explain them.", textCovered: true, textNote: "the last line is cut at the edge", brandAvoidViolations: ["Polaroid-style white frame"], possibleRealPersonLikeness: true })), reviewInput, meta);
  assert.equal(flagged.status, "issues");
  assert.deepEqual(flagged.issues, [
    "The image shows a generated person who could be read as a real or named person.",
    "The image shows what the brand's identity avoids: Polaroid-style white frame.",
    "The words in the image differ from the slide's: missing «bats»; not in the slide «bat».",
    "The logo or the page number covers part of the slide's words.",
    "The lettering has a problem: the last line is cut at the edge.",
  ]);
  assert.throws(() => parseDraft2ImageReview(JSON.stringify({ ...JSON.parse(answer()), transcription: undefined })), (error: Error) => error instanceof Draft2ResponseError);
});

const attempt = (overrides: Partial<Draft2ImageAttempt> = {}): Draft2ImageAttempt => ({ version: 1, kind: "generate", status: "generated", queuedAt: NOW.toISOString(), sha256: "a".repeat(64), ...overrides });
const slide = (attempts: Draft2ImageAttempt[], overrides: Partial<Draft2SlideImage> = {}): Draft2SlideImage => ({ slide: "s1", label: "Slide 2", order: 2, need: "generic-illustration", characterIds: [], material: [], notes: [], attempts, ...overrides });
const passed = { status: "passed" as const, issues: [], note: "", transcription: "", model: "sol", at: "t" };
const issues = { status: "issues" as const, issues: ["The words in the image differ from the slide's: missing «bats»."], note: "", transcription: "", model: "sol", at: "t" };

test("a first image the review flags is corrected once from its image before the overlays; a correction is final as it comes", () => {
  const flagged = slide([attempt({ review: issues })]);
  const correction = correctionFor(flagged, flagged.attempts[0], NOW)!;
  assert.equal(json([correction.version, correction.kind, correction.status, correction.baseVersion]), json([2, "correct", "queued", 1]));
  assert.match(correction.instruction!, /^Fix only these problems the review found, and change nothing else[^]*\(1\) The words in the image differ from the slide's: missing «bats»\.[^]*Render the visible text exactly as VISIBLE_TEXT gives it\.$/);
  assert.equal(correctionFor(slide([attempt({ review: issues }), correction]), flagged.attempts[0], NOW), undefined, "once");
  assert.equal(correctionFor(slide([attempt({ kind: "regenerate", review: issues })]), attempt({ kind: "regenerate", review: issues }), NOW), undefined, "the editor's own images are theirs to judge");
  assert.equal(correctionFor(slide([attempt({ review: passed })]), attempt({ review: passed }), NOW), undefined);
  assert.equal(slideSettled(slide([attempt({ review: issues }), { ...correction, status: "generated" }])), true, "a correction is not reviewed again");
  assert.equal(slideSettled(slide([attempt()])), false, "a first image waits for its review");
  assert.equal(slideSettled(slide([attempt({ status: "failed" })])), true);
});

test("a slide shows the editor's pick while it is a finished image, else its newest; the run is ready when every shown image passed", () => {
  const two = slide([attempt({ review: passed }), attempt({ version: 2, kind: "correct" })]);
  assert.equal(shownAttempt(two)?.version, 2);
  assert.equal(shownAttempt({ ...two, chosenVersion: 1 })?.version, 1);
  assert.equal(shownAttempt({ ...two, chosenVersion: 7 })?.version, 2, "a pick that is not a finished image is ignored");
  assert.equal(settledStatus([slide([attempt({ review: passed })])]), "ready");
  assert.equal(settledStatus([two]), "needs-review", "a correction is for the editor to look at");
  assert.equal(imagesNote([two, slide([attempt({ status: "failed" })], { slide: "last" })]), "1 slide has no image; 1 image needs your review.");
  assert.equal(imagesNote([slide([attempt({ review: passed })])]), undefined);
});

test("the editor's decisions: another image (optionally an edit of the one shown, which needs what to change), or the version a slide shows", () => {
  assert.deepEqual(parseImagesAction({ action: "regenerate", slide: "s1", instruction: "  Show the boots  closer " , edit: true }), { action: "regenerate", slide: "s1", instruction: "Show the boots closer", edit: true });
  assert.deepEqual(parseImagesAction({ action: "regenerate", slide: "cover" }), { action: "regenerate", slide: "cover", edit: false });
  assert.deepEqual(parseImagesAction({ action: "choose", slide: "last", version: 2 }), { action: "choose", slide: "last", version: 2 });
  for (const bad of [{ action: "regenerate", slide: "s1", edit: true }, { action: "choose", slide: "s1", version: 0 }, { action: "regenerate", slide: "../x" }, { action: "delete", slide: "s1" }, { action: "regenerate", slide: "s1", instruction: "x".repeat(601) }]) {
    assert.throws(() => parseImagesAction(bad), (error: Error) => error instanceof Draft2InputError);
  }
  const done = slide([attempt({ review: passed }), attempt({ version: 2, kind: "correct" })], { chosenVersion: 1 });
  const again = regeneratedSlide(done, { action: "regenerate", slide: "s1", instruction: "Closer", edit: true }, NOW);
  assert.equal(json([again.attempts[2], again.chosenVersion]), json([{ version: 3, kind: "regenerate", status: "queued", instruction: "Closer", baseVersion: 1, queuedAt: NOW.toISOString() }, undefined]), "an edit starts from the image shown");
  assert.throws(() => regeneratedSlide(slide([attempt()]), { action: "regenerate", slide: "s1", edit: false }, NOW), /is still being made/);
  assert.throws(() => regeneratedSlide(slide([attempt({ status: "failed" })]), { action: "regenerate", slide: "s1", instruction: "x", edit: true }, NOW), /has no image to edit/);
  assert.equal(chosenSlide(done, 2).chosenVersion, 2);
  assert.throws(() => chosenSlide(done, 5), /has no finished version 5/);
});

