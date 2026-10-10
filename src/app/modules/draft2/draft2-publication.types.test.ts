import assert from "node:assert/strict";
import test from "node:test";
import { Draft2InputError } from "./draft2-facts.types";
import { publicationCurrent, publicationTarget, targetPostText, type Draft2Publication } from "./draft2-publication.types";
import type { Draft2Caption, Draft2CaptionCandidate } from "./draft2-caption.types";
import type { Draft2ImageAttempt, Draft2Images, Draft2SlideImage } from "./draft2-images.types";
import type { Draft2Mentions } from "./draft2-mentions.types";

const json = (value: unknown) => JSON.stringify(value);
const passed = { status: "passed" as const, issues: [], note: "", transcription: "", model: "sol", at: "t" };
const attempt = (version: number, extra: Partial<Draft2ImageAttempt> = {}): Draft2ImageAttempt => ({ version, kind: "generate", status: "generated", sha256: String(version).repeat(64).slice(0, 64), queuedAt: "t", review: passed, ...extra });
const slide = (id: string, label: string, order: number, attempts = [attempt(1)], chosenVersion?: number): Draft2SlideImage =>
  ({ slide: id, label, order, need: "generic-illustration", characterIds: [], material: [], notes: [], attempts, ...(chosenVersion ? { chosenVersion } : {}) });
const IMAGES: Draft2Images = {
  runId: "run-1", status: "ready", visualId: "c2", inventoryVersion: 2, quality: "low", model: "gpt-image-2.5", startedAt: "t", updatedAt: "t",
  slides: [slide("cover", "Cover", 1), slide("slide2", "Slide 2", 2), slide("last", "Slide 3", 3)],
};
const candidate = (id: string, text: string): Draft2CaptionCandidate => ({ id, angle: "x", text, hashtags: ["Longueuil", "Biblio"], factIds: ["f1"] });
const CAPTION = {
  status: "ready", winnerId: "c2", candidates: [], imagesRunId: "run-1", mentions: [{ name: "Bibliothèques de Longueuil", handle: "@biblio.longueuil" }], mentionsVersion: 4, credits: ["Photo: A. Lens · CC BY 4.0"],
  rounds: [{ round: 1, candidates: [candidate("c1", "One.\n\nSave it."), candidate("c2", "Two.\n\nSave it.")], mechanical: [], at: "t" }],
} as unknown as Draft2Caption;
const MENTIONS: Draft2Mentions = {
  status: "ready", version: 5, lookup: "instagram-page",
  accounts: [{ id: "m1", name: "Bibliothèques de Longueuil", handle: "biblio.longueuil", source: "claude", status: "confirmed", account: { username: "biblio.longueuil", name: "Bibliothèques de Longueuil" } }],
};
const SESSION = { images: IMAGES, caption: CAPTION, mentions: MENTIONS };
const refused = (session: Record<string, unknown>, pattern: RegExp) => assert.throws(() => publicationTarget({ ...SESSION, ...session }), (error: Error) => error instanceof Draft2InputError && pattern.test(error.message));

test("the carousel as it can be approved: each slide's shown image, the chosen caption and its credits", () => {
  const target = publicationTarget({ ...SESSION, images: { ...IMAGES, slides: [IMAGES.slides[0], slide("slide2", "Slide 2", 2, [attempt(1), attempt(2, { kind: "regenerate" })], 1), IMAGES.slides[2]] } });
  assert.equal(json(target.slides.map((entry) => [entry.slide, entry.label, entry.order, entry.version])), json([["cover", "Cover", 1, 1], ["slide2", "Slide 2", 2, 1], ["last", "Slide 3", 3, 1]]), "the version the editor chose");
  assert.equal(json([target.caption.id, target.credits, target.issues, target.imagesRunId]), json(["c2", ["Photo: A. Lens · CC BY 4.0"], [], "run-1"]));
  assert.equal(targetPostText(target), "Two.\n\nSave it.\n\nPhoto: A. Lens · CC BY 4.0\n\n#Longueuil #Biblio");
  assert.equal(publicationTarget({ ...SESSION, caption: { ...CAPTION, editorChoiceId: "c1" } }).caption.id, "c1", "the editor's choice over the judge's");
});

test("images the review did not pass are listed for the editor to look at", () => {
  const issues = { status: "issues" as const, issues: ["The headline is cut off."], note: "", transcription: "", model: "sol", at: "t" };
  const target = publicationTarget({ ...SESSION, images: { ...IMAGES, status: "needs-review", slides: [
    slide("cover", "Cover", 1, [attempt(1, { review: issues }), attempt(2, { kind: "correct", baseVersion: 1, review: undefined })]),
    slide("slide2", "Slide 2", 2, [attempt(1, { review: issues })]),
    slide("last", "Slide 3", 3, [attempt(1, { review: { ...passed, status: "unavailable", note: "Sol did not answer." } })]),
  ] } });
  assert.equal(json(target.issues), json(["Cover: corrected and not reviewed again.", "Slide 2: The headline is cut off.", "Slide 3: not reviewed."]));
});

test("nothing is approved before the images and the caption are finished, for these images and these accounts", () => {
  refused({ images: null }, /Finish the images first/);
  refused({ images: { ...IMAGES, status: "running" } }, /Finish the images first/);
  refused({ images: { ...IMAGES, slides: [IMAGES.slides[0], slide("slide2", "Slide 2", 2, [attempt(1, { status: "failed", sha256: undefined, review: undefined })])] } }, /Slide 2 has no image/);
  refused({ images: { ...IMAGES, slides: [IMAGES.slides[0]] } }, /A carousel publishes 2 to 10 images; this one has 1/);
  refused({ images: { ...IMAGES, slides: Array.from({ length: 11 }, (_, index) => slide(`s${index}`, `Slide ${index + 1}`, index + 1)) } }, /this one has 11/);
  refused({ caption: null }, /Write the caption first/);
  refused({ caption: { ...CAPTION, status: "paused" } }, /Write the caption first/);
  refused({ caption: { ...CAPTION, winnerId: undefined } }, /Choose a caption first/);
  refused({ caption: { ...CAPTION, imagesRunId: "run-0" } }, /The images changed since this caption was written/);
  refused({ mentions: { ...MENTIONS, accounts: [] } }, /The accounts to tag changed since this caption was written/);
  assert.ok(publicationTarget({ ...SESSION, mentions: { ...MENTIONS, version: 9, accounts: [...MENTIONS.accounts, { id: "m2", name: "Other", handle: "other", source: "claude", status: "rejected" }] } }), "a decision on another account changes nothing");
});

test("the approved copy is current while the images, each slide's version and the post's text are the same", () => {
  const target = publicationTarget(SESSION);
  const publication: Draft2Publication = {
    draftId: "d1", batchId: "b1", snapshotHash: "h", imagesRunId: "run-1", captionId: "c2", approvedAt: "t", acknowledgedIssues: [],
    slides: target.slides.map(({ slide: id, label, order, version, sha256 }) => ({ slide: id, label, order, version, sha256 })), postText: targetPostText(target),
  };
  assert.ok(publicationCurrent(publication, target));
  assert.ok(!publicationCurrent(undefined, target));
  assert.ok(!publicationCurrent(publication, undefined));
  assert.ok(!publicationCurrent({ ...publication, imagesRunId: "run-0" }, target));
  assert.ok(!publicationCurrent({ ...publication, slides: publication.slides.map((entry, index) => index === 1 ? { ...entry, version: 2 } : entry) }, target));
  assert.ok(!publicationCurrent({ ...publication, slides: publication.slides.map((entry, index) => index === 1 ? { ...entry, sha256: "x" } : entry) }, target));
  assert.ok(!publicationCurrent(publication, publicationTarget({ ...SESSION, caption: { ...CAPTION, editorChoiceId: "c1" } })), "another caption, though a new run may reuse its id");
});
