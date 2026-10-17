import { Draft2InputError, Draft2ResponseError, type Draft2Fact } from "./draft2-facts.types";
import { funnelVersions } from "./draft2-funnel";
import { referencePhotos, type Draft2Inventory } from "./draft2-inventory.types";
import type { Draft2CarouselSlide, Draft2Visual, Draft2VisualCandidate, Draft2VisualNeed, Draft2VisualShot, Draft2VisualSlide } from "./draft2-visual.types";
import { brandFontChoice } from "../stories/brand-fonts";
import { focusNarrative, focusPresentation, narrativeUsesMaster, type Draft2FocusNarrative, type Draft2Presentation } from "./draft2-focus.types";
import {
  CREATIVE_IMAGE_REVIEW_SCHEMA, imageReviewIssues, parseImageReviewAnswer,
  type CreativeImageReviewAnswer, type CreativeImageReviewInput,
} from "../stories/creative-image-review";
import type { CreativeLogoForm, CreativeLogoTone, CreativeUnit, CreativeUnitRole } from "../stories/creative-content.types";
import type { PortraitBox, PortraitFit, PortraitSubject } from "../stories/creative-portrait-composite";
import { MAP_PANEL_POSITIONS, type MapPanelPosition } from "../stories/map-panel-position";
import { publishablePhoto } from "../stories/story-materials.types";
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

/**
 * generate: the first image; correct: the review's one correction;
 * regenerate: one the editor asked for; words: the image of an earlier
 * version with the slide's words set again by the program (no model, no
 * cost); section: a panorama's section, cut from the one wide scene.
 */
export type Draft2ImageAttemptKind = "generate" | "correct" | "regenerate" | "words" | "section";
export type Draft2ImageAttemptStatus = "queued" | "submitting" | "generating" | "generated" | "failed";

/** A slide's words as the program sets them on its image. */
export type Draft2SlideWords = { headline: string; text: string; practical?: string; cta?: string };

/**
 * How the program sets a slide's words (2026-10-17): the block's box on the
 * 1080 × 1350 slide (its height follows the words), its alignment, the
 * headline's and the text's font, size and colour, and what sits behind them.
 * The program writes one for every slide it letters; the editor moves,
 * resizes and restyles it, and the words are set again on the same image.
 */
export type Draft2WordsRole = { font: string; weight: number; size: number; color: string };
export type Draft2WordsLayout = {
  box: { left: number; top: number; width: number };
  align: "left" | "center" | "right";
  headline: Draft2WordsRole;
  text: Draft2WordsRole;
  background: { kind: "none" | "card" | "band"; color: string; opacity: number };
};
export const WORDS_ALIGNS = ["left", "center", "right"] as const;
export const WORDS_BACKGROUNDS = ["none", "card", "band"] as const;
/** The sizes the editor may set, in slide pixels. */
export const WORDS_SIZE = { headline: [28, 160], text: [18, 80] } as const;
/** The narrowest box the words may have, in slide pixels. */
export const WORDS_MIN_WIDTH = 240;

/**
 * A layout as the editor sends it, checked: the box kept inside the slide and
 * no narrower than WORDS_MIN_WIDTH, a known alignment and background, each
 * role's font one of the catalog's at one of its weights, its size within
 * WORDS_SIZE, colours as #rrggbb, the opacity between 0 and 1.
 */
export function parseWordsLayout(value: unknown): Draft2WordsLayout {
  const body = record(value);
  const box = record(body.box);
  const number = (entry: unknown, fallback: number) => typeof entry === "number" && Number.isFinite(entry) ? entry : fallback;
  const clamp = (entry: number, min: number, max: number) => Math.round(Math.min(max, Math.max(min, entry)));
  const width = clamp(number(box.width, 936), WORDS_MIN_WIDTH, 1080);
  const color = (entry: unknown, fallback: string) => typeof entry === "string" && /^#[0-9a-f]{6}$/iu.test(entry.trim()) ? entry.trim() : fallback;
  const role = (entry: unknown, [min, max]: readonly [number, number], fallback: Draft2WordsRole): Draft2WordsRole => {
    const given = record(entry);
    const choice = brandFontChoice(given, { font: fallback.font, weight: fallback.weight });
    return { ...choice, size: clamp(number(given.size, fallback.size), min, max), color: color(given.color, fallback.color) };
  };
  const background = record(body.background);
  return {
    box: { left: clamp(number(box.left, 72), 0, 1080 - width), top: clamp(number(box.top, 64), 0, 1300), width },
    align: WORDS_ALIGNS.find((entry) => entry === body.align) ?? "left",
    headline: role(body.headline, WORDS_SIZE.headline, { font: "liberation-sans", weight: 700, size: 66, color: "#1b1f24" }),
    text: role(body.text, WORDS_SIZE.text, { font: "liberation-sans", weight: 400, size: 38, color: "#1b1f24" }),
    background: {
      kind: WORDS_BACKGROUNDS.find((entry) => entry === background.kind) ?? "none",
      color: color(background.color, "#ffffff"),
      opacity: Math.min(1, Math.max(0, number(background.opacity, 0.92))),
    },
  };
}

/** A layout's style without its place: what "apply to every slide" carries, each slide keeping its own box. */
export const withStyleOf = (layout: Draft2WordsLayout, style: Draft2WordsLayout): Draft2WordsLayout => ({ ...style, box: layout.box });

/** The words a slide shows, from the carousel's slide. */
export const slideWordsOf = (slide: Pick<Draft2CarouselSlide, "headline" | "text" | "practical" | "cta">): Draft2SlideWords => ({
  headline: slide.headline, text: slide.text, ...(slide.practical ? { practical: slide.practical } : {}), ...(slide.cta ? { cta: slide.cta } : {}),
});

/** Whether the words set on an image are the words the slide has now. */
export const sameSlideWords = (a: Draft2SlideWords | undefined, b: Draft2SlideWords) =>
  Boolean(a) && a!.headline === b.headline && a!.text === b.text && (a!.practical ?? "") === (b.practical ?? "") && (a!.cta ?? "") === (b.cta ?? "");

/**
 * The slides whose shown image carries words the program set and the slide
 * has changed since (a hand edit or a review patch after the images): their
 * words are set again on the same image, for free, never drawn again.
 */
export function slidesWithChangedWords(images: Pick<Draft2ImagesRun, "slides"> | null | undefined, carousel: readonly Draft2CarouselSlide[] | undefined): string[] {
  if (!images || !carousel?.length) return [];
  return images.slides.flatMap((slide) => {
    const shown = shownAttempt(slide);
    const now = carousel.find((entry) => entry.slide === slide.slide);
    return shown?.words && now && !sameSlideWords(shown.words, slideWordsOf(now)) ? [slide.slide] : [];
  });
}

/** Sol's review of one finished image: what blocks it (issues), and a note on how it tells its beat. */
export type Draft2ImageReview = {
  status: "passed" | "issues" | "unavailable";
  issues: string[];
  /** The image shows what it must not (a person, a scene of a named event or place, a fact it contradicts, a detail no fact gives): an edit that keeps the scene cannot fix it, so its correction is a new image. */
  rework?: true;
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
  /** The layout and the window of the real photo this image was made with; an edit keeps its base's. Absent: the slide's rotation. */
  portrait?: PortraitFit;
  /** The editor's instruction (a regeneration) or the review's issues (a correction). */
  instruction?: string;
  /** A correction made as a new image (the review asked for rework) names the version it replaces; it has no base. */
  correctsVersion?: number;
  /** A correction made since 2026-10-14 is reviewed once made (never corrected again); an older one never was. */
  reviewAfter?: true;
  /** An edit starts from this version's image as it was before the logo and the page number. */
  baseVersion?: number;
  endpoint?: string;
  requestId?: string;
  promptCharacters?: number;
  promptSha256?: string;
  referenceImages?: number;
  /** The verified place photo the model received as its identity reference, by the place's name. */
  placePhoto?: string;
  /** The version of the brand's logo composited on it: the one that read best against the image there. */
  logo?: { form: CreativeLogoForm; tone: CreativeLogoTone; assetId: string };
  expectedText?: string;
  /** The words the program set on it (the focus's textMode "program"); absent when the image model lettered them. */
  words?: Draft2SlideWords;
  /** How it set them: the layout the editor starts from to move or restyle them. */
  wordsLayout?: Draft2WordsLayout;
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
  | { kind: "pasted-photo"; storyPhotoId: string; name: string; person: boolean; entityId?: string; sha256?: string; portrait?: Draft2PortraitFit }
  | { kind: "story-photo"; storyPhotoId: string; name: string; purpose: "subject" | "place" }
  | { kind: "place-photo"; entityId: string; name: string }
  | { kind: "map"; entityId: string; name: string; source: "google" | "wikidata"; panel?: Draft2MapPanel };

/**
 * The layout a real photo takes on its slide and the window of it the frame
 * shows, chosen once before the slide is made (fitPortrait), with where the
 * person is on the photo and who said so: Luna ("ai"), the editor's focal
 * point ("editor"), or nobody, the crop then left to the composite
 * ("automatic").
 */
export type Draft2PortraitFit = PortraitFit & { source: "ai" | "editor" | "automatic"; face?: PortraitBox; person?: PortraitBox };

/** A map panel as it was fetched (its bytes are stored beside the slide's images). */
export type Draft2MapPanel = {
  provider: "Google" | "OpenStreetMap"; layout: "inset" | "inset-labelled"; label?: { name: string; address: string }; sha256: string;
  /** Where the editor moved the card; bottom right when absent. */
  position?: MapPanelPosition;
};

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
export type Draft2MasterPlate = Draft2AnchorPlate & {
  width: number; height: number; sections: Draft2MasterSection[];
  /** The scene's version: 1 (absent) for the first, one more each time the editor has it made again. */
  version?: number;
  /** What the editor asked to change when the scene was made again. */
  instruction?: string;
  /** Where the editor moved the cuts from the centred layout, in the scene's pixels, and how large each section is (1 the largest). */
  offset?: Draft2CutOffset;
  /** The earlier versions of the scene, oldest first. */
  previous?: Draft2MasterPlateRecord[];
};
export type Draft2MasterPlateRecord = Omit<Draft2MasterPlate, "previous">;
export type Draft2CutOffset = { x: number; y: number; scale: number };
export const MASTER_PLATE_FILE = "master-scene.png";
export const MASTER_PLATE_PROMPT_FILE = "master-scene-prompt.txt";
/** A scene version's files: the first keeps the names it always had. */
export const masterPlateFile = (version = 1) => version <= 1 ? MASTER_PLATE_FILE : `master-scene-v${version}.png`;
export const masterPlatePromptFile = (version = 1) => version <= 1 ? MASTER_PLATE_PROMPT_FILE : `master-scene-v${version}-prompt.txt`;
/** The smallest a section may be, as a share of the largest the scene allows. */
export const CUT_MIN_SCALE = 0.6;

/**
 * The sections of a panorama cut with the editor's offset (2026-10-17: "re
 * divide it"): the largest sections the scene holds, scaled down when asked,
 * centred and then moved, clamped inside the scene. Returns the offset as
 * clamped, so what the editor sees is what is cut.
 */
export function cutSections(plate: Pick<Draft2MasterPlate, "width" | "height" | "sections">, asked: Partial<Draft2CutOffset>): { sections: Draft2MasterSection[]; offset: Draft2CutOffset } {
  const slides = plate.sections.map((section) => section.slide);
  const base = masterLayout(slides).sections[0];
  const scale = Math.min(1, Math.max(CUT_MIN_SCALE, Number.isFinite(asked.scale) ? Number(asked.scale) : 1));
  const height = Math.max(1, Math.floor(base.height * scale));
  const width = Math.max(1, Math.floor(height * SLIDE_RATIO));
  const total = width * slides.length;
  const left = Math.floor((plate.width - total) / 2);
  const top = Math.floor((plate.height - height) / 2);
  const clamp = (value: unknown, min: number, max: number) => Math.round(Math.min(max, Math.max(min, Number.isFinite(value) ? Number(value) : 0)));
  const x = clamp(asked.x, -left, plate.width - left - total);
  const y = clamp(asked.y, -top, plate.height - top - height);
  return { sections: slides.map((slide, index) => ({ slide, left: left + x + index * width, top: top + y, width, height })), offset: { x, y, scale: Math.round(scale * 100) / 100 } };
}
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
  /** How the run makes its images, as the visual script's focus said when it started; absent: one image per slide with its words drawn in it. */
  presentation?: Draft2Presentation;
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
 * model's subject. On a slide that rests on a real photo (real-photo), the
 * story photo is pasted unchanged: a model's redraw of a real place would
 * pass for it. A photo the publication may not publish (reference only) is
 * never shown. A pasted photo is the only photo on its slide, and a slide
 * has one place photo or map; what cannot be shown is noted.
 */
export function slideMaterial(slide: Draft2VisualSlide, inventory: Pick<Draft2Inventory, "entities" | "storyPhotos">): { material: Draft2SlideMaterial[]; notes: string[] } {
  const material: Draft2SlideMaterial[] = [];
  const notes: string[] = [];
  const usable = new Set(referencePhotos(inventory).map((photo) => photo.id));
  for (const id of slide.references) {
    const entity = inventory.entities.find((entry) => entry.id === id);
    // The editor's photo of this person or place, when the publication may publish it.
    const linked = entity?.storyPhoto && publishablePhoto(entity.storyPhoto.rights) ? entity.storyPhoto : undefined;
    const referenceOnly = entity?.storyPhoto && !linked ? ` (${entity.storyPhoto.name} is reference only: declare its publication rights to show it)` : "";
    if (entity?.kind === "person") {
      const storyPhotoId = linked?.id ?? (entity.person?.status === "confirmed" ? entity.person.confirmed?.storyPhotoId : undefined);
      if (storyPhotoId) material.push({ kind: "pasted-photo", storyPhotoId, name: entity.name, person: true, entityId: entity.id });
      else notes.push(`${entity.name} has no confirmed portrait${referenceOnly}, so the slide does not show them.`);
      continue;
    }
    if (entity?.kind === "place") {
      const verified = entity.place?.status === "verified" ? entity.place : undefined;
      if (slide.need === "verified-map" && verified?.map) material.push({ kind: "map", entityId: entity.id, name: entity.name, source: verified.google ? "google" : "wikidata" });
      else if (linked) {
        material.push(linked.transmissionAllowed && slide.need !== "real-photo"
          ? { kind: "story-photo", storyPhotoId: linked.id, name: entity.name, purpose: "place" }
          : { kind: "pasted-photo", storyPhotoId: linked.id, name: entity.name, person: false, entityId: entity.id });
      } else if (verified?.photo) material.push({ kind: "place-photo", entityId: entity.id, name: entity.name });
      else notes.push(`${entity.name} has no verified photo or map${referenceOnly}, so the slide shows a generic scene of its kind.`);
      continue;
    }
    const photo = inventory.storyPhotos.find((entry) => entry.id === id);
    if (photo && usable.has(photo.id)) {
      material.push(slide.need === "real-photo"
        ? { kind: "pasted-photo", storyPhotoId: photo.id, name: photo.name, person: false }
        : { kind: "story-photo", storyPhotoId: photo.id, name: photo.name, purpose: "subject" });
    } else if (photo && !publishablePhoto(photo.rights)) notes.push(`${photo.name} is reference only, so the slide does not show it: declare its publication rights to show it.`);
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

/** What a panorama's master plate names as its scene: the carousel's own, described section by section in its prompt. */
export const PANORAMA_SCENE = "the carousel's one continuous scene";

/** A new run: one slide per carousel slide, each with its first image queued. */
export function newImagesRun({ runId, visual, script, carousel, inventory, model, now }: {
  runId: string; visual: Draft2Visual; script: Draft2VisualCandidate; carousel: readonly Draft2CarouselSlide[]; inventory: Draft2Inventory; model: string; now: Date;
}): Draft2ImagesRun {
  const at = now.toISOString();
  // A guide or an object the story invents or takes from the facts is drawn once first; a brand character has its references.
  const narrative = visualNarrative(visual);
  const plate = narrative.form !== "classic" && (narrative.anchorKind === "figure" || narrative.anchorKind === "object") && narrative.anchor;
  // How the editor chose to make the carousel in the focus the visual script followed.
  const presentation = focusPresentation(visual.focus?.values);
  const panorama = presentation.images === "panorama";
  return {
    runId, status: "running", visualId: script.id, ...(visual.deckId ? { deckId: visual.deckId } : {}), inventoryVersion: inventory.version,
    quality: IMAGES_QUALITY, model, startedAt: at, updatedAt: at,
    ...(presentation.text !== "image" || panorama ? { presentation } : {}),
    ...(plate ? { anchorPlate: { anchor: narrative.anchor, status: "queued" as const, queuedAt: at } } : {}),
    // A panorama (the editor's choice) is drawn once as one wide scene and cut into the slides; a panorama or a line narrative is drawn once and each slide redrawn from its section.
    ...(panorama
      ? { masterPlate: { anchor: PANORAMA_SCENE, status: "queued" as const, queuedAt: at, ...masterLayout(carousel.map((words) => words.slide)) } }
      : narrativeUsesMaster(narrative) && narrative.anchor ? { masterPlate: { anchor: narrative.anchor, status: "queued" as const, queuedAt: at, ...masterLayout(carousel.map((words) => words.slide)) } } : {}),
    slides: carousel.map((words, index) => {
      const scriptSlide = script.slides.find((entry) => entry.slide === words.slide);
      if (!scriptSlide) throw new Draft2InputError(`The visual script has no image for ${words.label}. Write the visual script again.`);
      const { material, notes } = slideMaterial(scriptSlide, inventory);
      const pasted = material.some((entry) => entry.kind === "pasted-photo");
      return {
        slide: words.slide, label: words.label, order: index + 1, need: scriptSlide.need, ...(scriptSlide.shot ? { shot: scriptSlide.shot } : {}),
        characterIds: pasted ? [] : [...scriptSlide.characterIds], material, notes,
        attempts: [{ version: 1, kind: panorama ? "section" : "generate", status: "queued", queuedAt: at }],
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
/** A finished image not reviewed yet: a first image, an editor's, or a correction made since corrections are reviewed. */
export const awaitsReview = (attempt: Draft2ImageAttempt) => attempt.status === "generated" && !attempt.review && attempt.kind !== "words" && (attempt.kind !== "correct" || Boolean(attempt.reviewAfter));

/** Done when the newest image failed, or is finished and reviewed (a correction is reviewed, never corrected again). */
export function attemptSettled(attempt: Draft2ImageAttempt | undefined): boolean {
  if (!attempt) return true;
  // An image whose words were only set again is the image reviewed before: nothing to wait for.
  return attempt.status === "failed" || (attempt.status === "generated" && (Boolean(attempt.review) || attempt.kind === "words" || (attempt.kind === "correct" && !attempt.reviewAfter)));
}
export const slideSettled = (slide: Draft2SlideImage) => attemptSettled(latestAttempt(slide));

/**
 * A first image the review flagged gets one correction: an edit of that image
 * before its overlays when the flaw is in how it is drawn, a new image from
 * the slide's prompt when it shows what it must not (rework). The correction
 * is reviewed, never corrected again.
 */
export function correctionFor(slide: Draft2SlideImage, attempt: Draft2ImageAttempt, now: Date, { program = false }: { /** The program sets the words: the correction asks the model for none. */ program?: boolean } = {}): Draft2ImageAttempt | undefined {
  if (attempt.kind !== "generate" || attempt.review?.status !== "issues" || slide.attempts.some((entry) => entry.kind === "correct" && (entry.baseVersion === attempt.version || entry.correctsVersion === attempt.version))) return undefined;
  const version = Math.max(...slide.attempts.map((entry) => entry.version)) + 1;
  // An image that shows what it must not is made again from the slide's prompt; one with a flaw in how it is drawn is edited.
  return attempt.review.rework
    ? { version, kind: "correct", status: "queued", instruction: reworkInstruction(attempt.review.issues, { program }), correctsVersion: attempt.version, reviewAfter: true, queuedAt: now.toISOString() }
    : { version, kind: "correct", status: "queued", instruction: correctionInstruction(attempt.review.issues, { program }), baseVersion: attempt.version, reviewAfter: true, queuedAt: now.toISOString() };
}

/** What a new image must avoid that the first one showed: the review's issues, as requirements. */
export function reworkInstruction(issues: readonly string[], { program = false }: { program?: boolean } = {}): string {
  const listed = issues.map((issue, index) => `(${index + 1}) ${sentence(issue)}.`).join(" ");
  return `A first image of this slide was refused for these problems: ${listed} Make a new image that shows none of them: follow the slide's direction and the brand's rules for a subject without a verified photo (clean photographic cut-outs of the objects involved on flat colour fields, typography or a neutral setting), never a scene that could pass for a photograph of the named event or place, and nothing the slide's words and facts do not give. ${program ? "Render no words at all: the program sets them afterwards." : "Render the visible text exactly as VISIBLE_TEXT gives it."}`.slice(0, 1_800);
}

/** The cover's lettering: the hook dominates, clean, with little else to read. */
export const COVER_PROMPT = "\n\nCOVER: the headline is the dominant element, large, bold and clean, on few lines; the subheadline small, on one line; no other words. One strong visual idea in the brand's style, nothing that competes with the headline.";
/** The cover when the program sets its words: one strong idea, and room for a large headline in the band. */
export const COVER_PROGRAM_PROMPT = "\n\nCOVER: one strong visual idea in the brand's style, its subject large and clear below the calm band, where the program sets a large headline afterwards.";

/** What the correction asks of the image model: the review's issues, and nothing else changed. */
export function correctionInstruction(issues: readonly string[], { program = false }: { program?: boolean } = {}): string {
  const listed = issues.map((issue, index) => `(${index + 1}) ${sentence(issue)}.`).join(" ");
  return program
    ? `Fix only these problems the review found, and change nothing else: the layout, the protagonist, the palette and the calm band for the words stay as they are. ${listed} Render no words at all: the program sets them afterwards.`.slice(0, 1_500)
    : `Fix only these problems the review found, and change nothing else: the layout, the protagonist, the palette and the slide's words stay as they are. ${listed} Render the visible text exactly as VISIBLE_TEXT gives it.`.slice(0, 1_500);
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
  | { action: "words" }
  | { action: "scene"; instruction?: string }
  | { action: "cut"; offset: Draft2CutOffset }
  | { action: "layout"; slide: string; layout: Draft2WordsLayout; all: boolean }
  | { action: "regenerate"; slide: string; instruction?: string; edit: boolean; characterIds?: string[] }
  | { action: "choose"; slide: string; version: number }
  | { action: "map"; slide: string; position: MapPanelPosition };

const record = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};

export function parseImagesAction(value: unknown): Draft2ImagesAction {
  const body = record(value);
  // Every slide whose words changed since its image: set again by the program, on the same images.
  if (body.action === "words") return { action: "words" };
  // A panorama's scene made again (with what to change), or cut again where the editor moved the cuts.
  if (body.action === "scene") {
    const instruction = typeof body.instruction === "string" ? oneLine(body.instruction) : "";
    if (instruction.length > IMAGE_INSTRUCTION_MAX_CHARACTERS) throw new Draft2InputError(`Keep the instruction under ${IMAGE_INSTRUCTION_MAX_CHARACTERS} characters.`);
    return { action: "scene", ...(instruction ? { instruction } : {}) };
  }
  // The editor's layout for a slide's words (where they sit and how they look), or its style for every slide.
  if (body.action === "layout") {
    const slide = typeof body.slide === "string" && /^[a-z0-9]{1,24}$/i.test(body.slide) ? body.slide : undefined;
    if (!slide) throw new Draft2InputError("Name the slide (such as cover or s2).");
    return { action: "layout", slide, layout: parseWordsLayout(body.layout), all: body.all === true };
  }
  if (body.action === "cut") {
    const offset = record(body.offset);
    const number = (value: unknown, fallback: number) => typeof value === "number" && Number.isFinite(value) ? value : fallback;
    return { action: "cut", offset: { x: number(offset.x, 0), y: number(offset.y, 0), scale: number(offset.scale, 1) } };
  }
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
    // The editor's cast for this image, checked against the brand's characters where the session is read.
    const characterIds = Array.isArray(body.characterIds) ? body.characterIds.filter((entry): entry is string => typeof entry === "string") : undefined;
    return { action: "regenerate", slide, ...(instruction ? { instruction } : {}), edit: body.edit === true, ...(characterIds ? { characterIds } : {}) };
  }
  if (body.action === "map") {
    const position = MAP_PANEL_POSITIONS.find((entry) => entry === body.position);
    if (!position) throw new Draft2InputError(`The map card goes ${MAP_PANEL_POSITIONS.join(", ")}.`);
    return { action: "map", slide, position };
  }
  throw new Draft2InputError("The action is regenerate, choose, map, words, scene, cut or layout.");
}

/**
 * The slide with its verified map card moved to another corner, and a new
 * image queued from its prompt: the card is pasted by the program, so it is
 * the slide's layout that changes, never something to ask the image model.
 */
export function movedMapSlide(slide: Draft2SlideImage, position: MapPanelPosition, now: Date): Draft2SlideImage {
  const map = slide.material.find((entry): entry is Extract<Draft2SlideMaterial, { kind: "map" }> => entry.kind === "map");
  if (!map?.panel) throw new Draft2InputError(`${slide.label} has no verified map card to move.`);
  if ((map.panel.position ?? "bottom-right") === position) throw new Draft2InputError(`The map card of ${slide.label} is already there.`);
  const moved = { ...slide, material: slide.material.map((entry) => entry === map ? { ...map, panel: { ...map.panel!, position } } : entry) };
  return regeneratedSlide(moved, { action: "regenerate", slide: slide.slide, edit: false }, now);
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
export type Draft2ImageReviewAnswer = CreativeImageReviewAnswer & { transcription: string; textCovered: boolean; textNote: string; storyNote: string; anchorShown: boolean; inventedDetails: string[] };

export const DRAFT2_IMAGE_REVIEW_SCHEMA: Record<string, unknown> = {
  type: "object",
  additionalProperties: false,
  required: [...CREATIVE_IMAGE_REVIEW_SCHEMA.required, "transcription", "textCovered", "textNote", "storyNote", "anchorShown", "inventedDetails"],
  properties: {
    ...CREATIVE_IMAGE_REVIEW_SCHEMA.properties,
    transcription: { type: "string" },
    textCovered: { type: "boolean" },
    textNote: { type: "string" },
    storyNote: { type: "string" },
    anchorShown: { type: "boolean" },
    inventedDetails: { type: "array", items: { type: "string" } },
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
    // One asked before the check has none.
    inventedDetails: (Array.isArray(value.inventedDetails) ? value.inventedDetails : []).flatMap((entry) => typeof entry === "string" && entry.trim() ? [oneLine(entry).slice(0, 200)] : []).slice(0, 8),
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
  const invented = answer.inventedDetails ?? [];
  if (invented.length) issues.push(`The image shows what the slide's facts and words do not give: ${invented.join("; ")}.`);
  // What the image shows is wrong, not a detail of how it is drawn: only a new image fixes it.
  // Words under a pasted photo or map are where the image model set them: an edit keeps them there.
  const rework = answer.possibleRealPersonLikeness || answer.peopleOutsideVerifiedPhoto || Boolean(answer.inventedNamedSubject.trim()) || answer.factContradictions.length > 0 || invented.length > 0 || answer.textCovered;
  return {
    status: issues.length ? "issues" : "passed", issues, ...(rework && issues.length ? { rework: true as const } : {}),
    note: [answer.storyNote, answer.summary].map((part) => oneLine(part)).filter(Boolean).join(" "),
    transcription: answer.transcription, model: meta.model, at: meta.at, ...(meta.durationMs !== undefined ? { durationMs: meta.durationMs } : {}),
  };
}

/** The facts a slide cites, as the review reads them. */
export const slideFacts = (factIds: readonly string[], facts: readonly Draft2Fact[]) => facts.filter((fact) => factIds.includes(fact.id)).map((fact) => fact.claim);

const PORTRAIT_BOX = {
  type: "object",
  additionalProperties: false,
  required: ["left", "top", "right", "bottom"],
  properties: { left: { type: "number" }, top: { type: "number" }, right: { type: "number" }, bottom: { type: "number" } },
};

/** Luna's answer on a real photo: the named person's face, when it shows, and the part of them the photo shows, as fractions of the image. */
export const DRAFT2_PORTRAIT_SUBJECT_SCHEMA: Record<string, unknown> = {
  type: "object",
  additionalProperties: false,
  required: ["faceVisible", "face", "person", "people"],
  properties: { faceVisible: { type: "boolean" }, face: PORTRAIT_BOX, person: PORTRAIT_BOX, people: { type: "integer" } },
};

/** What Luna is asked about a real photo before its slide is composed; the photo is only looked at, never edited or redrawn. */
export const PORTRAIT_LOCATOR_INSTRUCTIONS = `You locate a person on a documentary photograph for a layout program that crops the photograph into a frame and must not cut them. The photograph is never edited or redrawn. Give boxes as fractions of the image: 0 is its left or top edge, 1 its right or bottom edge. face: the named person's face, from the top of the hair to the chin and from ear to ear; faceVisible is false when their face does not show (face then repeats person). person: the part of the named person the photograph shows, from the top of the hair down. When several people are visible, the named person is the one the photograph is about, usually the most prominent; people is how many people are visible.`;

/**
 * Luna's boxes, kept inside the photo. Percentages (0 to 100) are read as
 * fractions, the deviation a light model makes; a box with no area is none.
 * An answer with neither a face nor a person is a response error.
 */
export function parsePortraitSubject(text: string): PortraitSubject {
  let value: Record<string, unknown>;
  try {
    value = record(JSON.parse(text));
  } catch {
    throw new Draft2ResponseError("The portrait locator's answer is not valid JSON");
  }
  const box = (input: unknown): PortraitBox | undefined => {
    const entry = record(input);
    const numbers = [entry.left, entry.top, entry.right, entry.bottom];
    if (!numbers.every((number) => typeof number === "number" && Number.isFinite(number))) return undefined;
    const values = numbers as number[];
    const scale = values.some((number) => number > 1) && values.every((number) => number <= 100) ? 100 : 1;
    const [left, top, right, bottom] = values.map((number) => Math.min(1, Math.max(0, number / scale)));
    return right - left >= 0.02 && bottom - top >= 0.02 ? { left, top, right, bottom } : undefined;
  };
  const person = box(value.person);
  const face = value.faceVisible === false ? undefined : box(value.face);
  if (!face && !person) throw new Draft2ResponseError("The portrait locator found nobody on the photo");
  return { ...(face ? { face } : {}), ...(person ? { person } : {}) };
}

/** The editor's focal point on a photo as the subject to frame: a small face around it, which the crop keeps at its face line. */
export function focusSubject(focus: { x: number; y: number }): PortraitSubject {
  const within = (value: number) => Math.min(1, Math.max(0, value));
  return { face: { left: within(focus.x - 0.04), top: within(focus.y - 0.05), right: within(focus.x + 0.04), bottom: within(focus.y + 0.05) } };
}
