import { Draft2InputError, Draft2ResponseError, type Draft2Fact } from "./draft2-facts.types";
import { funnelVersions } from "./draft2-funnel";
import { referencePhotos, type Draft2Inventory } from "./draft2-inventory.types";
import type { Draft2CarouselSlide, Draft2Visual, Draft2VisualCandidate, Draft2VisualNeed, Draft2VisualShot, Draft2VisualSlide } from "./draft2-visual.types";
import { focusNarrative, narrativeUsesMaster, type Draft2FocusNarrative } from "./draft2-focus.types";
import {
  CREATIVE_IMAGE_REVIEW_SCHEMA, imageReviewIssues, parseImageReviewAnswer,
  type CreativeImageReviewAnswer, type CreativeImageReviewInput,
} from "../stories/creative-image-review";
import type { CreativeUnit, CreativeUnitRole } from "../stories/creative-content.types";
import type { Draft2SessionRow } from "@/db/schema";

/**
 * Images, the Draft 2 step after the visual script: one image per carousel
 * slide, made the way v1 makes its slides and checked the way the editor
 * chose (2026-10-10): generate → review → correct, at most three provider
 * calls a slide. GPT Image (fal) draws each slide from v1's prompt builder,
 * fed with the script's direction and the brand's identity, and letters the
 * slide's words itself; the documentary photo, the map panel, the page
 * number and the logo are composited afterwards with v1's compositors, in
 * v1's order, where the prompt reserved them. Sol reviews each finished
 * image (v1's checks, plus the words as they appear and what covers them);
 * a slide it flags is corrected once, from its image before the overlays,
 * and the editor decides from there. Everything here is pure: contracts,
 * the mapping to v1's slide unit, the material each slide uses, the review
 * contract and the step's state.
 */
export const IMAGES_QUALITY = "low" as const;
export const IMAGE_SUBMIT_CONCURRENCY = 3;
/** A slide marked as submitting this long ago with no request id lost its request: its outcome is unknown, so it is never sent again on its own. */
export const IMAGE_SUBMISSION_GRACE_MS = 180_000;
export const IMAGE_INSTRUCTION_MAX_CHARACTERS = 600;
/** Requests the canvas makes before it stops following a run: each one runs until the run settles or pauses. */
export const IMAGES_MAX_REQUESTS = 12;

export type Draft2ImageAttemptKind = "generate" | "correct" | "regenerate";
export type Draft2ImageAttemptStatus = "queued" | "submitting" | "generating" | "generated" | "failed";

/** Sol's review of one finished image: what blocks it (issues), and a note on how it tells its beat. */
export type Draft2ImageReview = {
  status: "passed" | "issues" | "unavailable";
  issues: string[];
  note: string;
  /** The slide's words as they appear in the image. */
  transcription: string;
  model: string;
  at: string;
  durationMs?: number;
};

/** One image of a slide: the first, its correction, or one the editor asked for. */
export type Draft2ImageAttempt = {
  version: number;
  kind: Draft2ImageAttemptKind;
  status: Draft2ImageAttemptStatus;
  /** The editor's instruction (a regeneration) or the review's issues (a correction). */
  instruction?: string;
  /** An edit starts from this version's image as it was before the logo and the page number. */
  baseVersion?: number;
  endpoint?: string;
  requestId?: string;
  promptCharacters?: number;
  promptSha256?: string;
  referenceImages?: number;
  /** The verified place photo the model received as its identity reference, by the place's name. */
  placePhoto?: string;
  expectedText?: string;
  sha256?: string;
  safetyFlag?: boolean;
  costMicros?: number;
  queuedAt: string;
  submittedAt?: string;
  completedAt?: string;
  error?: string;
  review?: Draft2ImageReview;
};

/**
 * What a slide shows of the verified material, resolved from its script
 * references: a photo pasted unchanged (a person's portrait, or a place
 * photo that may not be sent to an image model), a story photo the model
 * adapts, a verified place's photo as the model's identity reference, or a
 * verified place's map pasted as a panel.
 */
export type Draft2SlideMaterial =
  | { kind: "pasted-photo"; storyPhotoId: string; name: string; person: boolean; entityId?: string; sha256?: string }
  | { kind: "story-photo"; storyPhotoId: string; name: string; purpose: "subject" | "place" }
  | { kind: "place-photo"; entityId: string; name: string }
  | { kind: "map"; entityId: string; name: string; source: "google" | "wikidata"; panel?: Draft2MapPanel };

/** A map panel as it was fetched (its bytes are stored beside the slide's images). */
export type Draft2MapPanel = { provider: "Google" | "OpenStreetMap"; layout: "inset" | "inset-labelled"; label?: { name: string; address: string }; sha256: string };

export type Draft2SlideImage = {
  slide: string;
  label: string;
  order: number;
  need: Draft2VisualNeed;
  shot?: Draft2VisualShot;
  characterIds: string[];
  material: Draft2SlideMaterial[];
  /** What the slide could not show, and why. */
  notes: string[];
  attempts: Draft2ImageAttempt[];
  /** The editor's pick among the generated versions; else the newest one stands. */
  chosenVersion?: number;
};

/**
 * A narrative form's anchor drawn once, alone and without words, before any
 * slide: every slide that carries the anchor receives it as a reference, so
 * the guide or the object looks the same from the first slide to the last. A
 * brand character needs none: its reference images are passed already. A
 * plate that fails leaves the slides to the visual script's words alone.
 */
export type Draft2AnchorPlate = {
  /** What the plate shows, as the focus names it. */
  anchor: string;
  status: Draft2ImageAttemptStatus;
  queuedAt: string;
  submittedAt?: string;
  requestId?: string;
  endpoint?: string;
  promptCharacters?: number;
  sha256?: string;
  costMicros?: number;
  completedAt?: string;
  error?: string;
};
export const ANCHOR_PLATE_FILE = "anchor-plate.png";
export const ANCHOR_PLATE_PROMPT_FILE = "anchor-plate-prompt.txt";

/** One slide's section of the master scene, in the master's pixels. */
export type Draft2MasterSection = { slide: string; left: number; top: number; width: number; height: number };
/**
 * A panorama's or a line's master scene: the whole carousel drawn once as one
 * wide image without a word, then cut into one section per slide, side by
 * side; each slide is redrawn from its section, so the scene continues from
 * slide to slide. One that fails leaves each slide to be drawn on its own.
 */
export type Draft2MasterPlate = Draft2AnchorPlate & { width: number; height: number; sections: Draft2MasterSection[] };
export const MASTER_PLATE_FILE = "master-scene.png";
export const MASTER_PLATE_PROMPT_FILE = "master-scene-prompt.txt";
/** The master's height, and its widest width: under GPT Image's 3:1 ceiling, in multiples of 16. */
const MASTER_HEIGHT = 1344;
const MASTER_MAX_WIDTH = 3840;
const SLIDE_RATIO = 4 / 5;

/**
 * The master scene's size and each slide's section: 4:5 sections side by
 * side, as wide as the master allows, centred; with many slides they take
 * the middle band of its height.
 */
export function masterLayout(positions: readonly string[]): { width: number; height: number; sections: Draft2MasterSection[] } {
  const count = Math.max(1, positions.length);
  const width = Math.min(MASTER_MAX_WIDTH, Math.round((SLIDE_RATIO * count * MASTER_HEIGHT) / 16) * 16);
  const sectionHeight = Math.min(MASTER_HEIGHT, Math.floor(width / (SLIDE_RATIO * count)));
  const sectionWidth = Math.floor(sectionHeight * SLIDE_RATIO);
  const left = Math.floor((width - sectionWidth * count) / 2);
  const top = Math.floor((MASTER_HEIGHT - sectionHeight) / 2);
  return { width, height: MASTER_HEIGHT, sections: positions.map((slide, index) => ({ slide, left: left + index * sectionWidth, top, width: sectionWidth, height: sectionHeight })) };
}

/** Whether the plate lets the slides go: made, failed, or none to make. */
export const anchorPlateSettled = (plate: Draft2AnchorPlate | undefined) => !plate || plate.status === "generated" || plate.status === "failed";

/** Whether a slide carries the narrative's anchor: every generated image does; a verified photo, a verified map or a typography card tells the story without it. */
export const slideCarriesAnchor = (slide: Pick<Draft2SlideImage, "need">) => slide.need !== "real-photo" && slide.need !== "verified-map" && slide.need !== "typography";

/** The narrative a visual script followed: its focus's, else classic. */
export const visualNarrative = (visual: Pick<Draft2Visual, "focus">): Draft2FocusNarrative => focusNarrative(visual.focus?.values ?? {});

export type Draft2ImagesRun = {
  /** Names the run's files; a new run never overwrites an earlier one's images. */
  runId: string;
  status: "running" | "paused" | "ready" | "needs-review" | "failed";
  /** The visual script version the images picture. */
  visualId: string;
  deckId?: string;
  inventoryVersion: number;
  quality: typeof IMAGES_QUALITY;
  model: string;
  slides: Draft2SlideImage[];
  /** The narrative form's anchor, drawn before the slides when it is a figure or an object. */
  anchorPlate?: Draft2AnchorPlate;
  /** A panorama's or a line's master scene, drawn before the slides. */
  masterPlate?: Draft2MasterPlate;
  startedAt: string;
  updatedAt: string;
  error?: string;
};
export type Draft2Images = Draft2ImagesRun & { previousRuns?: Draft2ImagesRun[] };

/** The files of a slide's version, named for R2 (buildDraft2ImageObjectKey). */
export const imageFile = (slide: string, version: number) => `${slide}-v${version}.png`;
export const imageBaseFile = (slide: string, version: number) => `${slide}-v${version}-base.png`;
export const imagePromptFile = (slide: string, version: number) => `${slide}-v${version}-prompt.txt`;
export const mapFile = (slide: string) => `${slide}-map.png`;

const oneLine = (value: string) => value.replace(/\s+/g, " ").trim();
const sentence = (value: string) => oneLine(value).replace(/[.\s]+$/u, "");

/** v1's role for a carousel position: the cover, the closing slides, the call to action, the content between. */
function unitRole(words: Draft2CarouselSlide, index: number, total: number): CreativeUnitRole {
  if (index === 0) return "cover";
  if (index === total - 1) return words.cta ? "call-to-action" : "conclusion";
  return words.slide === "penultimate" ? "conclusion" : "content";
}

/**
 * The slide as v1's prompt builder reads it (build-creative-image-prompt.ts):
 * its words as the visible text (the cover's text as its subheadline, a
 * practical line under the body, the call to action), and the script's
 * direction, led by what happens in the image, its dominant subject and how
 * it plays with the headline. A slide that pastes a real photo casts no
 * character.
 */
export function slideUnit(carousel: readonly Draft2CarouselSlide[], index: number, script: Draft2VisualSlide, material: readonly Draft2SlideMaterial[]): CreativeUnit {
  const words = carousel[index];
  const text = words.text.trim();
  const body = [text, words.practical?.trim()].filter((part): part is string => Boolean(part)).join("\n");
  const pasted = material.some((entry) => entry.kind === "pasted-photo");
  const lead = [
    script.beat ? `What happens: ${sentence(script.beat)}.` : "",
    script.subject ? `Its subject: ${sentence(script.subject)}.` : "",
    script.headlineLink ? `With its headline: ${sentence(script.headlineLink)}.` : "",
  ].filter(Boolean).join(" ");
  return {
    order: index + 1,
    type: "carousel-slide",
    role: unitRole(words, index, carousel.length),
    headline: words.headline,
    ...(index === 0 ? (text ? { subheadline: text } : {}) : body ? { body } : {}),
    ...(words.cta ? { ctaQuestion: words.cta } : {}),
    visualDirection: [lead, oneLine(script.direction)].filter(Boolean).join(" "),
    factIds: [...words.factIds],
    assetRequest: script.need === "typography" ? "typography-only" : "generated-image",
    aspectRatio: "4:5",
    characterIds: pasted ? [] : [...script.characterIds],
    storyReferences: material.flatMap((entry) => entry.kind === "story-photo" ? [{ id: entry.storyPhotoId, purpose: entry.purpose }] : []),
    visualNeed: script.need,
  };
}

/**
 * What a slide shows of the verified material its script references, as v1
 * can use it: a person through their portrait, pasted unchanged; a place
 * through the story photo the editor gave it (adapted by the model, or
 * pasted when it may not be sent), its map on a map slide, else its
 * verified photo as the model's identity reference; a story photo as the
 * model's subject. A pasted photo is the only photo on its slide, and a
 * slide has one place photo or map; what cannot be shown is noted.
 */
export function slideMaterial(slide: Draft2VisualSlide, inventory: Pick<Draft2Inventory, "entities" | "storyPhotos">): { material: Draft2SlideMaterial[]; notes: string[] } {
  const material: Draft2SlideMaterial[] = [];
  const notes: string[] = [];
  const usable = new Set(referencePhotos(inventory).map((photo) => photo.id));
  for (const id of slide.references) {
    const entity = inventory.entities.find((entry) => entry.id === id);
    if (entity?.kind === "person") {
      const storyPhotoId = entity.storyPhoto?.id ?? (entity.person?.status === "confirmed" ? entity.person.confirmed?.storyPhotoId : undefined);
      if (storyPhotoId) material.push({ kind: "pasted-photo", storyPhotoId, name: entity.name, person: true, entityId: entity.id });
      else notes.push(`${entity.name} has no confirmed portrait, so the slide does not show them.`);
      continue;
    }
    if (entity?.kind === "place") {
      const verified = entity.place?.status === "verified" ? entity.place : undefined;
      if (slide.need === "verified-map" && verified?.map) material.push({ kind: "map", entityId: entity.id, name: entity.name, source: verified.google ? "google" : "wikidata" });
      else if (entity.storyPhoto) {
        material.push(entity.storyPhoto.transmissionAllowed
          ? { kind: "story-photo", storyPhotoId: entity.storyPhoto.id, name: entity.name, purpose: "place" }
          : { kind: "pasted-photo", storyPhotoId: entity.storyPhoto.id, name: entity.name, person: false, entityId: entity.id });
      } else if (verified?.photo) material.push({ kind: "place-photo", entityId: entity.id, name: entity.name });
      else notes.push(`${entity.name} has no verified photo or map, so the slide shows a generic scene of its kind.`);
      continue;
    }
    const photo = inventory.storyPhotos.find((entry) => entry.id === id);
    if (photo && usable.has(photo.id)) material.push({ kind: "story-photo", storyPhotoId: photo.id, name: photo.name, purpose: "subject" });
  }
  const pasted = material.find((entry) => entry.kind === "pasted-photo");
  if (pasted) {
    const dropped = material.filter((entry) => entry !== pasted);
    if (dropped.length) notes.push(`A real photo is the only photo on its slide, so ${dropped.map((entry) => entry.name).join(", ")} ${dropped.length === 1 ? "is" : "are"} left out.`);
    return { material: [pasted], notes };
  }
  const place = material.find((entry) => entry.kind === "map" || entry.kind === "place-photo");
  const kept = material.filter((entry) => entry.kind === "story-photo" || entry === place);
  const stories = kept.filter((entry) => entry.kind === "story-photo");
  if (stories.length > 3) notes.push("A slide takes at most three story photos; the first three are used.");
  return { material: [...(place ? [place] : []), ...stories.slice(0, 3)], notes };
}

/**
 * The visual script and what it pictures, when images can be made of it:
 * its run finished with a chosen version, and the carousel's deck and the
 * people and places are still the ones it followed. Images under a strict
 * visual mode (nothing generated) are v1's to compose for now.
 */
export function imagesTarget(session: Pick<Draft2SessionRow, "visual" | "deck" | "inventory">): { visual: Draft2Visual; script: Draft2VisualCandidate; carousel: Draft2CarouselSlide[]; inventory: Draft2Inventory } {
  const visual = session.visual;
  if (!visual || visual.status === "running" || visual.status === "paused") throw new Draft2InputError("Images picture the visual script. Finish the visual script first.");
  const chosenId = visual.editorChoiceId ?? visual.winnerId;
  const chosen = chosenId ? funnelVersions(visual.rounds).find((version) => version.candidate.id === chosenId) : undefined;
  if (!chosen || !visual.carousel?.length) throw new Draft2InputError("The visual script has no version to picture yet. Choose a visual script first.");
  const deckNow = session.deck?.editorChoiceId ?? session.deck?.winnerId;
  if (visual.deckId && deckNow && deckNow !== visual.deckId) throw new Draft2InputError(`The visual script pictures the deck ${visual.deckId}; the deck chosen now is ${deckNow}. Write the visual script again first.`);
  const inventory = session.inventory;
  if (!inventory || inventory.status !== "ready" || inventory.version !== visual.inventoryVersion) throw new Draft2InputError("The people and places changed since this visual script. Write the visual script again first.");
  if (visual.mode && visual.mode !== "illustration-editorial") throw new Draft2InputError(`Under the ${visual.mode} visual mode nothing is generated; v1 composes those slides. Draft 2 makes images under illustration-editorial.`);
  return { visual, script: chosen.candidate, carousel: visual.carousel, inventory };
}

/** A new run: one slide per carousel slide, each with its first image queued. */
export function newImagesRun({ runId, visual, script, carousel, inventory, model, now }: {
  runId: string; visual: Draft2Visual; script: Draft2VisualCandidate; carousel: readonly Draft2CarouselSlide[]; inventory: Draft2Inventory; model: string; now: Date;
}): Draft2ImagesRun {
  const at = now.toISOString();
  // A guide or an object the story invents or takes from the facts is drawn once first; a brand character has its references.
  const narrative = visualNarrative(visual);
  const plate = narrative.form !== "classic" && (narrative.anchorKind === "figure" || narrative.anchorKind === "object") && narrative.anchor;
  return {
    runId, status: "running", visualId: script.id, ...(visual.deckId ? { deckId: visual.deckId } : {}), inventoryVersion: inventory.version,
    quality: IMAGES_QUALITY, model, startedAt: at, updatedAt: at,
    ...(plate ? { anchorPlate: { anchor: narrative.anchor, status: "queued" as const, queuedAt: at } } : {}),
    // A panorama or a line is drawn once as one wide scene, each slide from its section.
    ...(narrativeUsesMaster(narrative) && narrative.anchor ? { masterPlate: { anchor: narrative.anchor, status: "queued" as const, queuedAt: at, ...masterLayout(carousel.map((words) => words.slide)) } } : {}),
    slides: carousel.map((words, index) => {
      const scriptSlide = script.slides.find((entry) => entry.slide === words.slide);
      if (!scriptSlide) throw new Draft2InputError(`The visual script has no image for ${words.label}. Write the visual script again.`);
      const { material, notes } = slideMaterial(scriptSlide, inventory);
      const pasted = material.some((entry) => entry.kind === "pasted-photo");
      return {
        slide: words.slide, label: words.label, order: index + 1, need: scriptSlide.need, ...(scriptSlide.shot ? { shot: scriptSlide.shot } : {}),
        characterIds: pasted ? [] : [...scriptSlide.characterIds], material, notes,
        attempts: [{ version: 1, kind: "generate", status: "queued", queuedAt: at }],
      };
    }),
  };
}

export const latestAttempt = (slide: Draft2SlideImage): Draft2ImageAttempt | undefined => slide.attempts[slide.attempts.length - 1];

/** The version the carousel shows: the editor's pick while it is a finished image, else the newest finished one. */
export function shownAttempt(slide: Draft2SlideImage): Draft2ImageAttempt | undefined {
  const generated = slide.attempts.filter((attempt) => attempt.status === "generated");
  return generated.find((attempt) => attempt.version === slide.chosenVersion) ?? generated[generated.length - 1];
}

/** One slide's image in the carousel's download: the version it shows, the hash its record keeps, and its file name. */
export type Draft2ImageDownload = { slide: string; version: number; sha256: string; name: string; approved: boolean };

/**
 * The carousel's images as files to download, in slide order: each slide's
 * shown version, named by its place in the carousel. One the editor has not
 * approved as it stands (the publication of this run records each slide's
 * version and hash) is a "-review" copy, as v1 names its downloads, so it is
 * never mistaken for an approved, publishable file. A slide with no finished
 * image is left out.
 */
export function draft2ImageDownloads(
  run: Pick<Draft2ImagesRun, "runId" | "slides">,
  publication?: { imagesRunId: string; slides: readonly { slide: string; version: number; sha256: string }[] } | null,
): Draft2ImageDownload[] {
  return [...run.slides].sort((left, right) => left.order - right.order).flatMap((slide) => {
    const attempt = shownAttempt(slide);
    if (!attempt?.sha256) return [];
    const approved = publication?.imagesRunId === run.runId
      && publication.slides.some((entry) => entry.slide === slide.slide && entry.version === attempt.version && entry.sha256 === attempt.sha256);
    return [{ slide: slide.slide, version: attempt.version, sha256: attempt.sha256, name: `slide-${String(slide.order).padStart(2, "0")}${approved ? "" : "-review"}.png`, approved }];
  });
}

/** A first image or one the editor asked for waits for its review; a correction is final as it comes. */
export const awaitsReview = (attempt: Draft2ImageAttempt) => attempt.status === "generated" && attempt.kind !== "correct" && !attempt.review;

/** Done when the newest image failed, or is finished and reviewed (a correction is never reviewed again). */
export function attemptSettled(attempt: Draft2ImageAttempt | undefined): boolean {
  if (!attempt) return true;
  return attempt.status === "failed" || (attempt.status === "generated" && (attempt.kind === "correct" || Boolean(attempt.review)));
}
export const slideSettled = (slide: Draft2SlideImage) => attemptSettled(latestAttempt(slide));

/** A first image the review flagged gets one correction, from that image before its overlays. */
export function correctionFor(slide: Draft2SlideImage, attempt: Draft2ImageAttempt, now: Date): Draft2ImageAttempt | undefined {
  if (attempt.kind !== "generate" || attempt.review?.status !== "issues" || slide.attempts.some((entry) => entry.kind === "correct" && entry.baseVersion === attempt.version)) return undefined;
  return { version: Math.max(...slide.attempts.map((entry) => entry.version)) + 1, kind: "correct", status: "queued", instruction: correctionInstruction(attempt.review.issues), baseVersion: attempt.version, queuedAt: now.toISOString() };
}

/** What the correction asks of the image model: the review's issues, and nothing else changed. */
export function correctionInstruction(issues: readonly string[]): string {
  const listed = issues.map((issue, index) => `(${index + 1}) ${sentence(issue)}.`).join(" ");
  return `Fix only these problems the review found, and change nothing else: the layout, the protagonist, the palette and the slide's words stay as they are. ${listed} Render the visible text exactly as VISIBLE_TEXT gives it.`.slice(0, 1_500);
}

/** The run once every slide settled: ready when each shown image passed its review, else for the editor to look at. */
export function settledStatus(slides: readonly Draft2SlideImage[]): "ready" | "needs-review" {
  return slides.every((slide) => shownAttempt(slide)?.review?.status === "passed") ? "ready" : "needs-review";
}

/** The run's state in a line, for the session's note. */
export function imagesNote(slides: readonly Draft2SlideImage[]): string | undefined {
  const failed = slides.filter((slide) => !shownAttempt(slide)).length;
  const flagged = slides.filter((slide) => { const shown = shownAttempt(slide); return shown && shown.review?.status !== "passed"; }).length;
  if (!failed && !flagged) return undefined;
  return [failed ? `${failed} ${failed === 1 ? "slide has" : "slides have"} no image` : "", flagged ? `${flagged} ${flagged === 1 ? "image needs" : "images need"} your review` : ""].filter(Boolean).join("; ") + ".";
}

/** The editor's decisions: another image of a slide (optionally an edit of the one shown), or the version a slide shows. */
export type Draft2ImagesAction =
  | { action: "regenerate"; slide: string; instruction?: string; edit: boolean }
  | { action: "choose"; slide: string; version: number };

const record = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};

export function parseImagesAction(value: unknown): Draft2ImagesAction {
  const body = record(value);
  const slide = typeof body.slide === "string" && /^[a-z0-9]{1,24}$/i.test(body.slide) ? body.slide : undefined;
  if (!slide) throw new Draft2InputError("Name the slide (such as cover or s2).");
  if (body.action === "choose") {
    if (!Number.isInteger(body.version) || Number(body.version) < 1) throw new Draft2InputError("Name the version to show (1, 2…).");
    return { action: "choose", slide, version: Number(body.version) };
  }
  if (body.action === "regenerate") {
    const instruction = typeof body.instruction === "string" ? oneLine(body.instruction) : "";
    if (instruction.length > IMAGE_INSTRUCTION_MAX_CHARACTERS) throw new Draft2InputError(`Keep the instruction under ${IMAGE_INSTRUCTION_MAX_CHARACTERS} characters.`);
    if (body.edit === true && !instruction) throw new Draft2InputError("Say what to change in the image.");
    return { action: "regenerate", slide, ...(instruction ? { instruction } : {}), edit: body.edit === true };
  }
  throw new Draft2InputError("The action is regenerate or choose.");
}

/** The slide with another image queued: from its prompt again, or an edit of the image it shows. */
export function regeneratedSlide(slide: Draft2SlideImage, action: Extract<Draft2ImagesAction, { action: "regenerate" }>, now: Date): Draft2SlideImage {
  if (!slideSettled(slide)) throw new Draft2InputError(`${slide.label} is still being made; wait for it to finish.`);
  const shown = shownAttempt(slide);
  if (action.edit && !shown) throw new Draft2InputError(`${slide.label} has no image to edit; make a new one.`);
  const attempt: Draft2ImageAttempt = {
    version: Math.max(0, ...slide.attempts.map((entry) => entry.version)) + 1, kind: "regenerate", status: "queued",
    ...(action.instruction ? { instruction: action.instruction } : {}), ...(action.edit && shown ? { baseVersion: shown.version } : {}), queuedAt: now.toISOString(),
  };
  return { ...slide, attempts: [...slide.attempts, attempt], chosenVersion: undefined };
}

/** The slide showing the editor's version, which must be a finished image. */
export function chosenSlide(slide: Draft2SlideImage, version: number): Draft2SlideImage {
  if (!slide.attempts.some((attempt) => attempt.version === version && attempt.status === "generated")) throw new Draft2InputError(`${slide.label} has no finished version ${version}.`);
  return { ...slide, chosenVersion: version };
}

/** Words as compared: lowercase, accents kept, punctuation and dashes as spaces. */
const wordsOf = (text: string) => text.normalize("NFC").toLocaleLowerCase()
  .replace(/[«»"“”„'’‘`.,;:!?¿¡()[\]{}…–—\-_/*•·|]/gu, " ").split(/\s+/u).filter(Boolean);
const PAGE_NUMBER = /^\d{1,2}\s*\/\s*\d{1,2}$/u;

/**
 * How the words in the image differ from the slide's: the words missing and
 * the words it adds, compared as lists (order aside); a spacing difference
 * alone ("9h30" for "9 h 30") is no difference. The page number and the
 * words of the publication's own name (its logo) are not the slide's words.
 */
export function textDifferences(expected: string, transcription: string, publicationName = ""): { missing: string[]; extra: string[] } {
  const transcribed = transcription.split(/\n/u).filter((line) => !PAGE_NUMBER.test(line.trim())).join("\n").replace(/\b\d{1,2}\s*\/\s*\d{1,2}\b/gu, " ");
  const want = wordsOf(expected);
  const seen = wordsOf(transcribed);
  const logo = new Set(wordsOf(publicationName));
  const remaining = [...seen];
  const missing: string[] = [];
  for (const word of want) {
    const index = remaining.indexOf(word);
    if (index >= 0) remaining.splice(index, 1);
    else missing.push(word);
  }
  const extra = remaining.filter((word) => !logo.has(word));
  if (!missing.length && !extra.length) return { missing, extra };
  const compact = (words: readonly string[]) => words.join("");
  const shown = seen.filter((word) => !logo.has(word) || want.includes(word));
  return compact(want) === compact(shown) ? { missing: [], extra: [] } : { missing, extra };
}

/** Sol's answer: v1's review fields, plus the words as they appear, whether an overlay covers them, the lettering, the story, and whether the narrative's anchor is shown. */
export type Draft2ImageReviewAnswer = CreativeImageReviewAnswer & { transcription: string; textCovered: boolean; textNote: string; storyNote: string; anchorShown: boolean };

export const DRAFT2_IMAGE_REVIEW_SCHEMA: Record<string, unknown> = {
  type: "object",
  additionalProperties: false,
  required: [...CREATIVE_IMAGE_REVIEW_SCHEMA.required, "transcription", "textCovered", "textNote", "storyNote", "anchorShown"],
  properties: {
    ...CREATIVE_IMAGE_REVIEW_SCHEMA.properties,
    transcription: { type: "string" },
    textCovered: { type: "boolean" },
    textNote: { type: "string" },
    storyNote: { type: "string" },
    anchorShown: { type: "boolean" },
  },
};

export function parseDraft2ImageReview(text: string): Draft2ImageReviewAnswer {
  const base = parseImageReviewAnswer(text);
  const value = record(JSON.parse(text));
  if (typeof value.transcription !== "string" || typeof value.textCovered !== "boolean") throw new Draft2ResponseError("The image review answer is incomplete");
  return {
    ...base,
    transcription: value.transcription.slice(0, 2_000),
    textCovered: value.textCovered,
    textNote: typeof value.textNote === "string" ? oneLine(value.textNote).slice(0, 300) : "",
    storyNote: typeof value.storyNote === "string" ? oneLine(value.storyNote).slice(0, 300) : "",
    // A review asked before narrative forms has no anchor to look for.
    anchorShown: typeof value.anchorShown === "boolean" ? value.anchorShown : true,
  };
}

const quoted = (words: readonly string[]) => words.slice(0, 8).map((word) => `«${word}»`).join(", ");

/**
 * The review as the editor reads it: v1's blocking issues (imageReviewIssues),
 * words that differ from the slide's, words an overlay covers, and broken
 * lettering, all blocking; the story note never blocks.
 */
export function draft2ImageReview(answer: Draft2ImageReviewAnswer, input: CreativeImageReviewInput & { expectedText: string; anchor?: string }, meta: { model: string; at: string; durationMs?: number }): Draft2ImageReview {
  const issues = [...imageReviewIssues(answer, input)];
  const { missing, extra } = textDifferences(input.expectedText, answer.transcription, input.publicationName);
  if (missing.length || extra.length) {
    issues.push(`The words in the image differ from the slide's: ${[missing.length ? `missing ${quoted(missing)}` : "", extra.length ? `not in the slide ${quoted(extra)}` : ""].filter(Boolean).join("; ")}.`);
  }
  if (answer.textCovered) issues.push("The logo or the page number covers part of the slide's words.");
  if (answer.textNote) issues.push(`The lettering has a problem: ${sentence(answer.textNote)}.`);
  if (input.anchor && !answer.anchorShown) issues.push(`${sentence(input.anchor)}, which is on every slide of this carousel, is missing or does not look as it does on the others.`);
  return {
    status: issues.length ? "issues" : "passed", issues,
    note: [answer.storyNote, answer.summary].map((part) => oneLine(part)).filter(Boolean).join(" "),
    transcription: answer.transcription, model: meta.model, at: meta.at, ...(meta.durationMs !== undefined ? { durationMs: meta.durationMs } : {}),
  };
}

/** The facts a slide cites, as the review reads them. */
export const slideFacts = (factIds: readonly string[], facts: readonly Draft2Fact[]) => facts.filter((fact) => factIds.includes(fact.id)).map((fact) => fact.claim);
