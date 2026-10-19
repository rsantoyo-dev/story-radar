import { comparableText, Draft2InputError } from "./draft2-facts.types";
import type { Draft2FocusSnapshot, Draft2PanoramaStation } from "./draft2-focus.types";
import { PANORAMA_FIELD_BREAK } from "./draft2-spine-checks";
import {
  funnelEvaluationSchema, funnelExploreRequest, funnelFixRequest, funnelJudgeRequest, funnelParseCandidates, funnelParseEvaluation, funnelRecord, funnelRefineRequest,
  funnelText, funnelVersions, headlineKey, longWords, wordOverlap,
  type FunnelCandidate, type FunnelEvaluation, type FunnelGate, type FunnelIssue, type FunnelPlanRound, type FunnelRegression, type FunnelRole,
  type FunnelRound, type FunnelRun, type FunnelScore, type FunnelVersion, type FunnelWords,
} from "./draft2-funnel";
import { entityMaterial, referencePhotos, type Draft2CharacterChoice, type Draft2Inventory, type Draft2InventoryKind } from "./draft2-inventory.types";
import { anchorNoun, narrativeUsesMaster, spineBeats, type Draft2FocusNarrative, type Draft2FocusSpine, type Draft2SpinePosition } from "./draft2-focus.types";
import type { Draft2ClosingOpening } from "./draft2-closing.types";
import type { Draft2Deck, Draft2DeckCandidate, Draft2DeckClosing } from "./draft2-deck.types";
import type { CreativeProfile } from "../stories/creative-content.types";
import type { Draft2RecentCover } from "./draft2-cover-variety";
import { avoidTerms, forbiddenElement, mentionsTerm } from "./draft2-image-rules";

/** The image rules every step shares (draft2-image-rules.ts), where the visual script's callers have always found them. */
export { avoidTerms, forbiddenElement };

/**
 * Visual script, the Draft 2 step after the deck and the people-and-places
 * inventory: the carousel's images written as one visual sequence, not a
 * series of variations on one subject (visuals v3). Each candidate is a
 * whole script: a concept, an optional protagonist and motif that may open,
 * disappear and return, a recurring cast, whether the brand's character
 * narrates, and for each slide what happens in its image (never its words
 * again), its dominant subject and what the reader sees there for the first
 * time, how much the recurring element takes, its shot, how it plays with
 * its headline, a reproducible art direction, the kind of image and the
 * verified material or characters it uses. Continuity comes from the
 * brand's identity; progression from what each image shows. The image model
 * letters each slide's words itself or the program sets them on a band
 * (layout.lettering says which), and the logo and the page number are
 * added afterwards: the script composes around them. On the
 * shared funnel (draft2-funnel.ts), Claude writes and Sol judges:
 *   1 script → the judge scores it, proposes 1 → the best revised + the proposal as written + as edited → the judge's pick
 * Two rounds and no extra round on the funnel's own (visuals v10,
 * 2026-10-15): the spine decides the story each image tells (each slide's
 * beat is the spine's image line, bound by the program), so the script
 * executes rather than invents, and in 22 real runs a third round never
 * raised a visual script's best.
 * The output keeps v1's slide contract (visualDirection, visualNeed,
 * characterIds, references) so a later image step can reuse v1's generator.
 * Everything here is pure: contracts, schemas, parsing, the mechanical
 * checks and the requests.
 */
/** One script in the first round: the spine fixes what each image tells, so a second script would differ in execution only; the judge's proposal is the second idea. */
export const VISUAL_CANDIDATES = 1;
/** The most scripts one round writes: the best revised beside the judge's proposal as written and as edited (the schema's and the parser's ceiling). */
export const VISUAL_ROUND_MAX_CANDIDATES = 3;
/**
 * Two rounds: the script and the judge's proposal, then the best revised
 * beside the proposal as written and as edited. Both rounds think at medium:
 * a visual revision at high took 50 s and 7,400 output tokens on average in
 * real runs, for scripts the judge did not accept.
 */
export const VISUAL_PLAN: readonly FunnelPlanRound[] = [
  { revise: 0, fresh: VISUAL_CANDIDATES, proposals: 1, effort: "medium" },
  { revise: 1, fresh: 0, proposals: 0, effort: "medium" },
];
/** A long carousel runs the same plan since visuals v10; kept for the stored runs' plan lookups. */
export const VISUAL_LONG_CAROUSEL = 10;
export const VISUAL_LONG_PLAN: readonly FunnelPlanRound[] = VISUAL_PLAN;
/**
 * v3 (2026-10-16): one script and no proposal, since the spine already
 * decides what each image shows. Since 2026-10-19 v3 keeps the judge's
 * revision round, run only when the first script is not accepted: with one
 * round the judge's findings never reached the writer, and scripts at 55–83
 * shipped as they came. The judge at medium since the audit of 2026-10-19:
 * at low it had named the same winner (48 shadow rounds) but, on the 25
 * scripts judged at both efforts, scored 3 points under medium on average
 * and 7 to 13 under on a first script, and under v3 (ten runs, 55–85) it
 * accepted none. A judgment costs 0.001–0.005 $ at either effort, so the
 * minute a round saves at low is not worth a gate it cannot reach.
 */
export const VISUAL_PLAN_V3: readonly FunnelPlanRound[] = [
  { revise: 0, fresh: VISUAL_CANDIDATES, proposals: 0, effort: "medium", judgeEffort: "medium" },
  { revise: 1, fresh: 0, proposals: 0, effort: "medium", judgeEffort: "medium" },
];
export const VISUAL_MAX_ROUNDS = 2;
/**
 * The gate (2026-10-19): forty runs in twelve days had three accepted at 95,
 * the best of the rest at 88–94 after five rounds, and originality 69–83 on
 * every script, the judge's own cap on a direct illustration being 80 while
 * the floor was 85. The spine chose what each image shows, so originality is
 * the execution's: it scores, it never blocks on its own. Accept at the
 * funnel's acceptable score, the other criteria at 85.
 */
export const VISUAL_ACCEPT_SCORE = 90;
export const VISUAL_CRITERION_FLOOR = 85;
export const VISUAL_ORIGINALITY_FLOOR = 70;
export const VISUAL_DIRECTION_MAX_CHARACTERS = 700;
export const VISUAL_DIRECTION_MIN_CHARACTERS = 60;
/** A beat is the spine's image line (FOCUS_BEAT_IMAGE_MAX_CHARACTERS) when the focus has a spine. */
export const VISUAL_BEAT_MAX_CHARACTERS = 240;
const CONCEPT_MAX_CHARACTERS = 300;
const MOTIF_MAX_CHARACTERS = 300;
const CAST_MAX_CHARACTERS = 400;
const ROLE_MAX_CHARACTERS = 200;
export const VISUAL_MAX_CHARACTERS_PER_SLIDE = 2;
/** v1's kinds of slide image (creative-visual-need.ts), so a later image step routes each slide as v1 does. */
export const VISUAL_NEEDS = ["generic-illustration", "character-reference", "real-photo", "verified-map", "typography"] as const;
/** How close each image is: no two slides in a row share one, so the carousel never repeats one layout. A new shot is not, by itself, progression. */
export const VISUAL_SHOTS = ["wide", "medium", "close", "overhead", "typography"] as const;
/** How much a slide gives the recurring element (the protagonist or the motif): none, a supporting accent, the dominant subject, or the deliberate return that closes the story. */
export const VISUAL_RECURRING = ["none", "accent", "focus", "callback"] as const;
/** The recurring element leads at most this many slides (the return aside), never two in a row. */
export const VISUAL_MAX_RECURRING_FOCUS = 2;
/** Two subjects this alike (the share of their longer words) are the same subject. */
const SAME_SUBJECT_OVERLAP = 0.6;
const HEADLINE_LINK_MAX_CHARACTERS = 240;
const PROTAGONIST_MAX_CHARACTERS = 300;
export const VISUAL_SUBJECT_MAX_CHARACTERS = 160;
export const VISUAL_DISCOVERY_MAX_CHARACTERS = 240;

/** Fidelity to the spine's beats, one identity, the brand, the truth, the craft and the originality of the images; the narrative itself is the spine's, judged at the Focus (visuals v10). */
export const VISUAL_CRITERIA = ["fidelity", "continuity", "brand", "truth", "craft", "originality"] as const;
export const VISUAL_MECHANICAL_CODES = [
  "SLIDE_ORDER", "DIRECTION_TOO_LONG", "DIRECTION_TOO_SHORT", "BEAT_MISSING", "CHARACTER_UNKNOWN", "CHARACTER_OFF_PLAN", "CHARACTER_CHOICE",
  "TOO_MANY_CHARACTERS", "REFERENCE_UNKNOWN", "NEED_MISMATCH", "STRICT_MODE", "COVER_TYPOGRAPHY", "UNVERIFIED_PERSON", "UNVERIFIED_PLACE",
  "ORGANIZATION_NAMED", "AVOID_TERM", "FORBIDDEN_ELEMENT", "DUPLICATE_CANDIDATE", "SAME_SHOT", "SHOT_MISMATCH",
  "SUBJECT_MISSING", "DISCOVERY_MISSING", "SAME_SUBJECT", "RECURRING_DOMINANT", "CALLBACK_MISPLACED", "ANCHOR_MISSING", "SECTION_MISSING",
  "COVER_CHARACTER_STREAK", "COVER_BACKGROUND_REPEAT",
] as const;
export const VISUAL_JUDGE_CODES = [
  "ILLUSTRATES_TEXT", "BREAKS_CONTINUITY", "REPETITIVE", "MOTIF_DEPENDENCY", "OFF_BEAT", "PREDICTABLE", "TOO_ABSTRACT", "OFF_BRAND", "LOOKS_AI", "CONTRADICTS_FACTS", "CROWDS_TEXT", "VAGUE",
  "CHARACTER_MISUSED", "OFF_FOCUS", "UNVERIFIED_SCENE", "INVENTED_DETAIL", "OTHER",
] as const;
export const VISUAL_ISSUE_CODES = [...VISUAL_MECHANICAL_CODES, ...VISUAL_JUDGE_CODES] as const;
export const VISUAL_GATE: FunnelGate = { criteria: VISUAL_CRITERIA, accept: VISUAL_ACCEPT_SCORE, floor: VISUAL_CRITERION_FLOOR, floors: { originality: VISUAL_ORIGINALITY_FLOOR } };

export type Draft2VisualCriterion = (typeof VISUAL_CRITERIA)[number];
export type Draft2VisualIssueCode = (typeof VISUAL_ISSUE_CODES)[number];
export type Draft2VisualNeed = (typeof VISUAL_NEEDS)[number];
export type Draft2VisualShot = (typeof VISUAL_SHOTS)[number];
export type Draft2VisualRecurring = (typeof VISUAL_RECURRING)[number];
/** The creative profile's visual mode: what may be generated. */
export type Draft2VisualMode = "illustration-editorial" | "verified-references" | "photo-required";

/** One slide of the carousel as the visual script reads it: where it is and the words it carries. */
export type Draft2CarouselSlide = { slide: string; label: string; headline: string; text: string; practical?: string; cta?: string; factIds: string[] };
/** A brand character the script may cast (one with a reference image). */
export type Draft2VisualCharacter = { id: string; name: string; description: string };

export type Draft2VisualSlide = {
  /** The carousel position: cover, slide2, s1… (the deck's slides), penultimate, last. */
  slide: string;
  /** What this image adds to the story: the spine's image line for the slide, bound by the program when the focus has a spine (spineImageLines); the writer's own otherwise. Never the slide's words again. */
  beat: string;
  /** The image's dominant subject: who or what it is about (scripts before visuals v3 have none). */
  subject: string;
  /** What the reader sees here for the first time, tied to the beat (scripts before visuals v3 have none). */
  discovery: string;
  /** How much the slide gives the recurring element (scripts before visuals v3 have none). */
  recurring: Draft2VisualRecurring;
  /** How close the image is (scripts before visuals v2 have none). */
  shot: Draft2VisualShot;
  /** How the image plays with its headline, in one line; empty when the words carry the slide alone. */
  headlineLink: string;
  /** One reproducible art-direction paragraph (v1's visualDirection). */
  direction: string;
  need: Draft2VisualNeed;
  characterIds: string[];
  /** The verified material the slide uses: entity ids (e3) and story photo ids. */
  references: string[];
};
export type Draft2VisualCandidate = FunnelCandidate & {
  /** The visual story, in one or two sentences. */
  concept: string;
  /** Who or what the story follows, if anyone; optional since visuals v3 (scripts before v2 have none). */
  protagonist: string;
  /** The visual thread that evolves across the slides. */
  motif: string;
  /** Who and what recurs, described the same way every time. */
  cast: string;
  characterPlan: { use: boolean; characterIds: string[]; role: string };
  slides: Draft2VisualSlide[];
};
export type Draft2VisualIssue = FunnelIssue & { code: Draft2VisualIssueCode };
export type Draft2VisualScore = FunnelScore & { fidelity: number; continuity: number; brand: number; truth: number; craft: number; originality: number };
export type Draft2VisualEvaluation = FunnelEvaluation<Draft2VisualCandidate, Draft2VisualScore, Draft2VisualIssue>;
export type Draft2VisualRound = FunnelRound<Draft2VisualCandidate, Draft2VisualScore, Draft2VisualIssue>;
export type Draft2VisualVersion = FunnelVersion<Draft2VisualCandidate, Draft2VisualScore, Draft2VisualIssue>;
export type Draft2VisualRegression = FunnelRegression;

export type Draft2Visual = FunnelRun<Draft2VisualCandidate, Draft2VisualScore, Draft2VisualIssue> & {
  writer?: FunnelRole;
  judge?: FunnelRole;
  /** What the run scripted and followed: the carousel's words, the deck it came from, the inventory version, the characters and the editor's choice on them, the visual mode. */
  carousel?: Draft2CarouselSlide[];
  deckId?: string;
  openingId?: string;
  closingId?: string;
  focus?: Draft2FocusSnapshot;
  inventoryVersion?: number;
  characters?: Draft2VisualCharacter[];
  characterChoice?: Draft2CharacterChoice;
  mode?: Draft2VisualMode;
  /** The publication's last covers the run read, newest first, so a continued run checks the same ones (draft2-cover-variety.ts). */
  recentCovers?: Draft2RecentCover[];
  previousRuns?: Draft2VisualRun[];
};
export type Draft2VisualRun = Omit<Draft2Visual, "rounds" | "previousRuns">;

/** The carousel in order, from the chosen opening, deck and closing: cover, slide 2, the deck's slides (s1…), the penultimate when the closing has one, the last. */
export function carouselSlides(opening: Draft2ClosingOpening, deck: Pick<Draft2DeckCandidate, "slides">, closing: Draft2DeckClosing): Draft2CarouselSlide[] {
  return [
    { slide: "cover", label: "Cover", headline: opening.cover.headline, text: opening.cover.subheadline, factIds: opening.cover.factIds },
    { slide: "slide2", label: "Slide 2", headline: opening.slide2.headline, text: opening.slide2.body, factIds: opening.slide2.factIds },
    ...deck.slides.map((slide, index) => ({
      slide: `s${index + 1}`, label: `Slide ${index + 3}`, headline: slide.headline, text: slide.body, ...(slide.practical ? { practical: slide.practical } : {}), factIds: slide.factIds,
    })),
    ...(closing.penultimate ? [{ slide: "penultimate", label: `Slide ${deck.slides.length + 3}`, headline: closing.penultimate.headline, text: closing.penultimate.body, factIds: closing.penultimate.factIds }] : []),
    { slide: "last", label: `Slide ${deck.slides.length + (closing.penultimate ? 4 : 3)}`, headline: closing.last.headline, text: closing.last.body, ...(closing.last.cta ? { cta: closing.last.cta } : {}), factIds: closing.last.factIds },
  ];
}

/**
 * The carousel as it stands: the deck chosen (the editor's choice, else the
 * judge's winner) between the opening and closing the deck recorded. Nothing
 * while the deck has no chosen version or no recorded ends.
 */
export function deckCarousel(deck: Pick<Draft2Deck, "rounds" | "editorChoiceId" | "winnerId" | "opening" | "closing"> | null | undefined): Draft2CarouselSlide[] | undefined {
  const chosenId = deck?.editorChoiceId ?? deck?.winnerId;
  const chosen = deck && chosenId ? funnelVersions(deck.rounds).find((version) => version.candidate.id === chosenId)?.candidate : undefined;
  return chosen && deck?.opening && deck.closing ? carouselSlides(deck.opening, chosen, deck.closing) : undefined;
}

/**
 * Whether two carousels letter the same words: the same slides in the same
 * order, each with the same headline, text, practical line and call to
 * action. Labels and fact ids do not count. A visual script pictures the
 * words as they stood (the image model letters them), so a review patch or
 * an edit applied since asks for a new script.
 */
export function sameCarouselWords(a: readonly Draft2CarouselSlide[], b: readonly Draft2CarouselSlide[]): boolean {
  const words = (slide: Draft2CarouselSlide) => [slide.slide, slide.headline, slide.text, slide.practical ?? "", slide.cta ?? ""].map((text) => text.trim()).join("\n");
  return a.length === b.length && a.every((slide, index) => words(slide) === words(b[index]));
}

/**
 * What is added to every image after it is made, as the script must leave
 * room for it: the slide's words, lettered by the image model inside the
 * image or set by the program on a band along the top (the editor's choice,
 * focusPresentation), and v1's post-production, the logo on the slides the
 * Topic puts it on and the page number on each slide
 * (creative-brand-overlay.ts, creative-carousel-chrome.ts).
 */
export type Draft2VisualLayout = {
  lettering: string;
  logo: { slides: string[]; area: string } | null;
  numbering: { area: string } | null;
};
const PLACEMENT_WORDS: Record<string, string> = {
  "top-left": "the top left corner", "top-center": "the top centre", "top-right": "the top right corner",
  "center-left": "the middle of the left edge", center: "the centre", "center-right": "the middle of the right edge",
  "bottom-left": "the bottom left corner", "bottom-center": "the bottom centre", "bottom-right": "the bottom right corner",
};
export function visualLayout(profile: Pick<CreativeProfile, "brandOverlay" | "carouselChrome">, carousel: readonly Pick<Draft2CarouselSlide, "slide">[], presentation: { text: "image" | "program" } = { text: "image" }): Draft2VisualLayout {
  const overlay = profile.brandOverlay;
  const place = overlay ? PLACEMENT_WORDS[overlay.placement] ?? overlay.placement : "";
  // The inner slides carry the brand's symbol alone when the brand chose it and has one: a square, where the full logo is a band.
  const symbol = overlay?.scope === "all-units" && overlay.innerForm === "symbol" && (overlay.versions ?? []).some((version) => version.form === "symbol");
  const logo = overlay?.enabled && overlay.asset
    ? {
      slides: overlay.scope === "all-units" ? carousel.map((slide) => slide.slide) : carousel.slice(0, 1).map((slide) => slide.slide),
      area: symbol
        ? `${place}: on the cover the full logo, about ${overlay.sizePercent}% of the slide's width; on the other slides the brand's symbol alone, a square about ${overlay.sizePercent}% of the slide's width; plus a margin`
        : `${place}, about ${overlay.sizePercent}% of the slide's width, plus a margin`,
    }
    : null;
  return {
    // Who letters the words: a run under the program's words had its writer place them where the image model would have (three OTHER issues in one judgment) because this line said so.
    lettering: presentation.text === "program"
      ? "The program sets each slide's words after the image is made, on a calm band along the top of the image (below the logo where there is one), in the brand's typography: a direction asks for no word, letter or number at all, keeps the slide's subject, faces and objects out of that band, and leaves it a plain field in the palette (sky, wall, table)."
      : "The image model letters each slide's words (its headline, text, practical line and call to action) inside the image, in the brand's typography; no other words.",
    logo,
    numbering: profile.carouselChrome?.enabled ? { area: "a small page-number badge centred on the bottom edge of every slide (beside the logo when the logo is there)" } : null,
  };
}

/** The plan a carousel asks for: by the pipeline, the same for every length since visuals v10 (the carousel stays a parameter for the stored runs' lookups). */
export const visualPlan = (carousel: readonly unknown[], pipeline: "v2" | "v3" = "v2"): readonly FunnelPlanRound[] => { void carousel; return pipeline === "v3" ? VISUAL_PLAN_V3 : VISUAL_PLAN; };

/**
 * The spine's image line for each carousel slide: the cover's and slide 2's
 * beats, the middle beats in order for the deck's slides, the penultimate's
 * and the last's. A slide past the middle beats has none (the writer's own
 * beat stands); a focus without a spine binds nothing.
 */
export function spineImageLines(spine: Draft2FocusSpine | undefined, carousel: readonly Pick<Draft2CarouselSlide, "slide">[]): Record<string, string> {
  if (!spine) return {};
  const middle = spineBeats(spine, "middle");
  const lines: Record<string, string> = {};
  for (const { slide } of carousel) {
    const index = /^s(\d+)$/.exec(slide);
    const beat = index ? middle[Number(index[1]) - 1] : spineBeats(spine, slide as Draft2SpinePosition)[0];
    if (beat?.image.trim()) lines[slide] = beat.image.trim();
  }
  return lines;
}

/** The scripts with each slide's beat bound to the spine's image line where the spine has one: the words and the images follow one plan, whatever the writer or the judge wrote there. */
export function bindSpineBeats<C extends Pick<Draft2VisualCandidate, "slides">>(candidates: readonly C[], lines: Record<string, string>): C[] {
  if (!Object.keys(lines).length) return [...candidates];
  return candidates.map((candidate) => ({ ...candidate, slides: candidate.slides.map((slide) => lines[slide.slide] ? { ...slide, beat: lines[slide.slide] } : slide) }));
}

/**
 * The scripts with every slide's shot set to wide when the images are one
 * wide scene (a panorama, a line): a section has the scene's one view, not a
 * shot of its own, whatever the writer wrote (two real panoramas were judged
 * on twelve shot mismatches the skill had told the writer to avoid). A
 * typography slide keeps its shot: the program refuses it as a section.
 */
export function bindPanoramaShots<C extends Pick<Draft2VisualCandidate, "slides">>(candidates: readonly C[]): C[] {
  return candidates.map((candidate) => ({ ...candidate, slides: candidate.slides.map((slide) => slide.shot === "wide" || slide.need === "typography" ? slide : { ...slide, shot: "wide" as const }) }));
}

/**
 * Each carousel slide's station in the spine's panorama (its size, whether
 * the brand's character stands there, what crosses into the next section),
 * found as spineImageLines finds its beat; nothing without a panorama. The
 * writer and the judge read them beside the beats: a judge looking for them
 * in spineBeats, where the skill once pointed, faulted a script for having
 * no stations.
 */
export function spineStations(spine: Draft2FocusSpine | undefined, carousel: readonly Pick<Draft2CarouselSlide, "slide">[]): Record<string, Draft2PanoramaStation> {
  const panorama = spine?.panorama;
  if (!spine || !panorama) return {};
  const middle = spine.beats.flatMap((beat, index) => beat.slide === "middle" ? [index] : []);
  const stations: Record<string, Draft2PanoramaStation> = {};
  for (const { slide } of carousel) {
    const match = /^s(\d+)$/.exec(slide);
    const index = match ? middle[Number(match[1]) - 1] : spine.beats.findIndex((beat) => beat.slide === slide);
    const station = index !== undefined && index >= 0 ? panorama.stations[index] : undefined;
    if (station) stations[slide] = station;
  }
  return stations;
}

const idList = { type: "array", maxItems: 6, items: { type: "string" } };

/** One script, as the writer writes it and the judge proposes it: one slide per carousel position, in order. */
function visualItem(positions: readonly string[]) {
  return {
    type: "object",
    properties: {
      id: { type: "string" },
      concept: { type: "string" },
      protagonist: { type: "string" },
      motif: { type: "string" },
      cast: { type: "string" },
      characterPlan: {
        type: "object",
        properties: { use: { type: "boolean" }, characterIds: idList, role: { type: "string" } },
        required: ["use", "characterIds", "role"],
        additionalProperties: false,
      },
      slides: {
        type: "array",
        minItems: positions.length,
        maxItems: positions.length,
        items: {
          type: "object",
          properties: {
            slide: { type: "string", enum: [...positions] },
            beat: { type: "string" },
            subject: { type: "string" },
            discovery: { type: "string" },
            recurring: { type: "string", enum: [...VISUAL_RECURRING] },
            shot: { type: "string", enum: [...VISUAL_SHOTS] },
            headlineLink: { type: "string" },
            direction: { type: "string" },
            need: { type: "string", enum: [...VISUAL_NEEDS] },
            characterIds: idList,
            references: idList,
          },
          required: ["slide", "beat", "subject", "discovery", "recurring", "shot", "headlineLink", "direction", "need", "characterIds", "references"],
          additionalProperties: false,
        },
      },
      angle: { type: "string" },
    },
    required: ["id", "concept", "protagonist", "motif", "cast", "characterPlan", "slides", "angle"],
    additionalProperties: false,
  };
}

/** The writer's answer: the complete list of scripts for this carousel. */
export function visualSchema(positions: readonly string[]): Record<string, unknown> {
  return {
    type: "object",
    properties: { candidates: { type: "array", minItems: 1, maxItems: VISUAL_ROUND_MAX_CANDIDATES, items: visualItem(positions) } },
    required: ["candidates"],
    additionalProperties: false,
  };
}

/** The judge's answer: scores, issues under the judge's own codes, the verdict and its own script. */
export function visualEvaluationSchema(positions: readonly string[]): Record<string, unknown> {
  // The judge scores at most the round's scripts and the proposal as written beside them; the program's codes are the program's to find.
  return funnelEvaluationSchema({ criteria: VISUAL_CRITERIA, codes: VISUAL_JUDGE_CODES, maxScored: VISUAL_ROUND_MAX_CANDIDATES + 1, item: visualItem(positions), maxProposals: 1 });
}

const strings = (value: unknown, max = 6): string[] => [...new Set((Array.isArray(value) ? value : []).filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0 && entry.trim().length <= 64).map((entry) => entry.trim()))].slice(0, max);

/** One script from a model's answer, or undefined when a part is missing; checking what it names is the program's job. */
function visualFrom(raw: unknown, fallbackId: string): Draft2VisualCandidate | undefined {
  const item = funnelRecord(raw);
  const concept = funnelText(item.concept, CONCEPT_MAX_CHARACTERS * 2);
  // The protagonist and the motif are optional: an empty one means the identity alone carries the continuity.
  const optional = (value: unknown, max: number) => typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : undefined;
  const protagonist = optional(item.protagonist, PROTAGONIST_MAX_CHARACTERS);
  const motif = optional(item.motif, MOTIF_MAX_CHARACTERS * 2);
  const cast = funnelText(item.cast, CAST_MAX_CHARACTERS * 2);
  const plan = funnelRecord(item.characterPlan);
  if (!concept || protagonist === undefined || motif === undefined || !cast || typeof plan.use !== "boolean" || !Array.isArray(item.slides) || !item.slides.length) return undefined;
  const slides: Draft2VisualSlide[] = [];
  for (const entry of item.slides.slice(0, 24)) {
    const slide = funnelRecord(entry);
    const position = funnelText(slide.slide, 24);
    const direction = typeof slide.direction === "string" ? slide.direction.replace(/\s+/g, " ").trim() : undefined;
    const beat = typeof slide.beat === "string" ? slide.beat.replace(/\s+/g, " ").trim() : undefined;
    const need = VISUAL_NEEDS.find((candidate) => candidate === slide.need);
    const shot = VISUAL_SHOTS.find((candidate) => candidate === slide.shot);
    const recurring = VISUAL_RECURRING.find((candidate) => candidate === slide.recurring);
    const subject = optional(slide.subject, VISUAL_SUBJECT_MAX_CHARACTERS * 2);
    const discovery = optional(slide.discovery, VISUAL_DISCOVERY_MAX_CHARACTERS * 2);
    if (!position || direction === undefined || beat === undefined || !need || !shot || !recurring || subject === undefined || discovery === undefined) return undefined;
    const headlineLink = typeof slide.headlineLink === "string" ? slide.headlineLink.replace(/\s+/g, " ").trim().slice(0, HEADLINE_LINK_MAX_CHARACTERS) : "";
    slides.push({ slide: position, beat, subject, discovery, recurring, shot, headlineLink, direction, need, characterIds: strings(slide.characterIds, 4), references: strings(slide.references) });
  }
  return {
    id: funnelText(item.id, 24) ?? fallbackId,
    concept, protagonist, motif, cast,
    characterPlan: { use: plan.use, characterIds: strings(plan.characterIds, 4), role: typeof plan.role === "string" ? plan.role.replace(/\s+/g, " ").trim().slice(0, ROLE_MAX_CHARACTERS) : "" },
    slides,
    angle: funnelText(item.angle, 400) ?? "",
  };
}

/** The writer's answer as scripts; anything malformed is a response error, never persisted. */
export function parseVisualCandidates(answer: string): Draft2VisualCandidate[] {
  return funnelParseCandidates(answer, visualFrom, VISUAL_ROUND_MAX_CANDIDATES);
}

/**
 * The judge's answer as an evaluation of these scripts (see
 * funnelParseEvaluation); issues name a carousel position. An issue under one
 * of the program's codes is dropped: the program checked it, and a judge at
 * low effort had named five directions of 448–530 characters DIRECTION_TOO_LONG
 * in two rounds of one real run, so the writer cut them until craft fell.
 */
export function parseVisualEvaluation(answer: string, candidateIds: readonly string[], positions: readonly string[]): Draft2VisualEvaluation {
  return funnelParseEvaluation(answer, candidateIds, { criteria: VISUAL_CRITERIA, codes: VISUAL_JUDGE_CODES, dropCodes: VISUAL_MECHANICAL_CODES, parts: positions, parseProposal: visualFrom, maxProposals: 1 });
}


/** A name as a direction might write it: the full name and, for a person, the surname when it is distinctive. */
function nameForms(name: string, kind: Draft2InventoryKind): string[] {
  const full = comparableText(name);
  const parts = full.split(" ").filter(Boolean);
  const surname = parts.length > 1 ? parts[parts.length - 1] : "";
  return [full, ...(kind === "person" && [...surname].length >= 4 ? [surname] : [])];
}


/**
 * The editor's cast for one image: the brand's characters with a reference
 * image, each once, at most VISUAL_MAX_CHARACTERS_PER_SLIDE, and none on a
 * slide that rests on a verified photo (the brand's character never stands
 * beside a real person's photo or in a real place's). A map slide may carry
 * one, in the graphic area beside the card, consulting the practical
 * information. An empty list takes every character off.
 */
export function editorCast(value: unknown, roster: readonly { id: string }[], need: Draft2VisualNeed): string[] {
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string")) throw new Draft2InputError("Name the characters as a list of their ids.");
  const ids = [...new Set(value as string[])];
  const unknown = ids.filter((id) => !roster.some((character) => character.id === id));
  if (unknown.length) throw new Draft2InputError(`${unknown.join(", ")} ${unknown.length === 1 ? "is" : "are"} not one of the brand's characters with a reference image.`);
  if (ids.length > VISUAL_MAX_CHARACTERS_PER_SLIDE) throw new Draft2InputError(`At most ${VISUAL_MAX_CHARACTERS_PER_SLIDE} characters on one image.`);
  if (ids.length && need === "real-photo") throw new Draft2InputError("This slide rests on a verified photo: the brand's characters stay off it.");
  return ids;
}

/**
 * The program's findings on each script, before the judge; any one keeps the
 * script from winning. One slide per carousel position, in order; each
 * direction within its length, with its beat; characters from the Topic's
 * roster, on the script's plan and the editor's choice, at most two a slide;
 * references only to verified material; each kind of image backed by what
 * it needs, and nothing generated under a strict visual mode; no real person
 * or place named without its verified material, no organization named, none
 * of the brand's avoid terms, nothing that would be drawn as words or logos;
 * no two slides in a row with the same shot, and a typography shot exactly
 * on a typography slide (neither in a panorama or a line, whose sections
 * have the scene's one view: bindPanoramaShots sets them). Progression,
 * which a new shot alone is not: each
 * slide names its dominant subject and what it shows for the first time; no
 * two slides in a row share a dominant subject; the recurring element leads
 * at most two slides, never two in a row, and returns at most once, at the
 * end.
 */
export function mechanicalVisualIssues(candidates: readonly Draft2VisualCandidate[], { carousel, inventory, characters, characterChoice, mode, avoid, narrative }: {
  carousel: readonly Draft2CarouselSlide[];
  inventory: Pick<Draft2Inventory, "entities" | "storyPhotos">;
  characters: readonly Draft2VisualCharacter[];
  characterChoice: Draft2CharacterChoice;
  mode: Draft2VisualMode;
  avoid: readonly string[];
  /** The focus's narrative form: with one other than classic, its anchor is in every image the script generates. */
  narrative?: Draft2FocusNarrative;
}): Draft2VisualIssue[] {
  const positions = carousel.map((slide) => slide.slide);
  const roster = new Set(characters.map((character) => character.id));
  const entities = new Map(inventory.entities.map((entity) => [entity.id, { entity, material: entityMaterial(entity) }]));
  const storyPhotos = new Set(referencePhotos(inventory).map((photo) => photo.id));
  const strict = mode !== "illustration-editorial";
  const keys = new Map<string, Draft2VisualCandidate>();
  const issues: Draft2VisualIssue[] = [];
  for (const candidate of candidates) {
    const add = (code: Draft2VisualIssueCode, part: string | undefined, detail: string) => issues.push({ code, candidateId: candidate.id, ...(part ? { part } : {}), detail });
    const order = candidate.slides.map((slide) => slide.slide);
    if (order.join() !== positions.join()) add("SLIDE_ORDER", undefined, `The script has ${order.length} slides (${order.join(", ")}); the carousel's are ${positions.join(", ")}, one each, in that order.`);
    const plan = candidate.characterPlan;
    const used = new Set(candidate.slides.flatMap((slide) => slide.characterIds));
    for (const id of new Set([...plan.characterIds, ...used])) if (!roster.has(id)) add("CHARACTER_UNKNOWN", undefined, `${id} is not one of the Topic's characters with a reference image.`);
    // A character may take part in one slide's action without narrating the carousel; a narrator the plan names must appear.
    if (plan.use && !used.size) add("CHARACTER_OFF_PLAN", undefined, "The plan has a character narrate, but no slide casts one.");
    if (characterChoice === "off" && (plan.use || used.size)) add("CHARACTER_CHOICE", undefined, "The editor chose no character for this story.");
    if (characterChoice === "on" && !used.size) add("CHARACTER_CHOICE", undefined, "The editor chose to have the brand's character narrate.");
    const concept = headlineKey(candidate.concept);
    const earlier = keys.get(concept);
    if (earlier && !(candidate.proposalOf && earlier.proposalOf === candidate.proposalOf)) add("DUPLICATE_CANDIDATE", undefined, `The concept repeats ${earlier.id}'s.`);
    else if (!earlier) keys.set(concept, candidate);
    const labelOf = (position: string) => carousel.find((entry) => entry.slide === position)?.label ?? position;
    const partOf = (position: string) => positions.includes(position) ? position : undefined;
    // A panorama or a line is one wide scene cut into the slides: every section shares its scale, so adjacent shots may match.
    const master = Boolean(narrative && narrativeUsesMaster(narrative));
    // A narrative form's anchor is on every slide by design: the limits on a recurring element do not apply to it (narratives skill).
    const anchored = Boolean(narrative && narrative.form !== "classic");
    // One wide scene has one field and one surface: a direction that gives its section a background of its own, or tells it to differ from the one before, glues slides together (the first two panoramas' scenes).
    if (master) {
      for (const slide of candidate.slides) {
        const striped = PANORAMA_FIELD_BREAK.exec(slide.direction)?.[0];
        if (striped) add("BREAKS_CONTINUITY", partOf(slide.slide), `${labelOf(slide.slide)} asks for "${striped}": the scene has one field and one surface across its whole width, named once in the concept; no section has a background of its own.`);
      }
    }
    candidate.slides.forEach((slide, index) => {
      const previous = candidate.slides[index - 1];
      if (!previous) return;
      if (!master && previous.shot === slide.shot) add("SAME_SHOT", partOf(slide.slide), `${labelOf(slide.slide)} repeats ${labelOf(previous.slide)}'s ${slide.shot} shot; alternate the shots so no two slides in a row look alike.`);
      if (slide.subject && previous.subject && sameSubject(slide.subject, previous.subject)) {
        add("SAME_SUBJECT", partOf(slide.slide), `${labelOf(slide.slide)} is about the same subject as ${labelOf(previous.slide)} ("${slide.subject}"); show something the carousel has not shown yet.`);
      }
      if (!anchored && slide.recurring === "focus" && previous.recurring === "focus") add("RECURRING_DOMINANT", partOf(slide.slide), `The recurring element leads ${labelOf(previous.slide)} and ${labelOf(slide.slide)} in a row; let one of them show something else.`);
    });
    const focused = candidate.slides.filter((slide) => slide.recurring === "focus").length;
    if (!anchored && focused > VISUAL_MAX_RECURRING_FOCUS) add("RECURRING_DOMINANT", undefined, `The recurring element leads ${focused} slides; it leads at most ${VISUAL_MAX_RECURRING_FOCUS}, and may return once at the end.`);
    // A narrative form's anchor is in every generated image: a brand character by its id, a figure or an object as the recurring element.
    // A verified photo or map, or a typography card, carries the story without it.
    // In a panorama or a line, every slide is a section of the one scene: a typography card breaks it. The scene itself needs no recurring mark.
    if (narrative && narrative.form !== "classic") {
      const subject = anchorNoun(narrative);
      for (const slide of candidate.slides) {
        if (master && slide.need === "typography") {
          add("SECTION_MISSING", partOf(slide.slide), `${labelOf(slide.slide)} is a typography card: in a ${narrative.form === "panorama" ? "panorama" : "line to follow"} every slide is a section of the one wide scene.`);
          continue;
        }
        if (slide.need === "real-photo" || slide.need === "verified-map" || slide.need === "typography" || narrative.anchorKind === "scene") continue;
        const missing = narrative.anchorKind === "character" ? !slide.characterIds.includes(narrative.characterId ?? "") : slide.recurring === "none";
        if (missing) add("ANCHOR_MISSING", partOf(slide.slide), `${labelOf(slide.slide)} leaves out ${narrative.anchor}, the ${subject}: with this narrative form it is in every image${narrative.anchorKind === "character" ? `, cast by its id (${narrative.characterId})` : ", as the recurring element"}.`);
      }
    }
    const callbacks = candidate.slides.filter((slide) => slide.recurring === "callback");
    const closing = positions.slice(-2);
    if (!anchored && (callbacks.length > 1 || callbacks.some((slide) => !closing.includes(slide.slide)))) add("CALLBACK_MISPLACED", undefined, "The recurring element returns once, on one of the last two slides, to give the end a new meaning.");
    for (const slide of candidate.slides) {
      const part = positions.includes(slide.slide) ? slide.slide : undefined;
      const label = carousel.find((entry) => entry.slide === slide.slide)?.label ?? slide.slide;
      if (!master && (slide.need === "typography") !== (slide.shot === "typography")) add("SHOT_MISMATCH", part, `${label} is a ${slide.need} slide with a ${slide.shot} shot; a typography slide has the typography shot, and only it.`);
      if (!slide.subject || slide.subject.length > VISUAL_SUBJECT_MAX_CHARACTERS) add("SUBJECT_MISSING", part, `${label} needs its dominant subject, in 1 to ${VISUAL_SUBJECT_MAX_CHARACTERS} characters: who or what its image is about.`);
      if (!slide.discovery || slide.discovery.length > VISUAL_DISCOVERY_MAX_CHARACTERS) add("DISCOVERY_MISSING", part, `${label} needs a discovery, in 1 to ${VISUAL_DISCOVERY_MAX_CHARACTERS} characters: what the reader sees there for the first time.`);
      if (slide.direction.length > VISUAL_DIRECTION_MAX_CHARACTERS) add("DIRECTION_TOO_LONG", part, `${label}'s direction has ${slide.direction.length} characters; the limit is ${VISUAL_DIRECTION_MAX_CHARACTERS}.`);
      if (slide.direction.length < VISUAL_DIRECTION_MIN_CHARACTERS) add("DIRECTION_TOO_SHORT", part, `${label}'s direction is too short to reproduce (${slide.direction.length} characters).`);
      if (!slide.beat || slide.beat.length > VISUAL_BEAT_MAX_CHARACTERS) add("BEAT_MISSING", part, `${label} needs a beat of 1 to ${VISUAL_BEAT_MAX_CHARACTERS} characters: what its image adds to the story.`);
      if (slide.characterIds.length > VISUAL_MAX_CHARACTERS_PER_SLIDE) add("TOO_MANY_CHARACTERS", part, `${label} casts ${slide.characterIds.length} characters; at most ${VISUAL_MAX_CHARACTERS_PER_SLIDE}.`);
      const references = slide.references.map((id) => ({ id, entity: entities.get(id), photo: storyPhotos.has(id) }));
      for (const reference of references) {
        const usable = reference.photo || (reference.entity && (reference.entity.material.portrait || reference.entity.material.photo || reference.entity.material.map));
        if (!usable) add("REFERENCE_UNKNOWN", part, `${label} uses ${reference.id}, which has no verified material.`);
      }
      const photoBacked = references.some((reference) => reference.photo || reference.entity?.material.portrait || reference.entity?.material.photo);
      const mapBacked = references.some((reference) => reference.entity?.material.map);
      if (slide.need === "real-photo" && !photoBacked) add("NEED_MISMATCH", part, `${label} asks for a real photo without a verified portrait, place photo or story photo.`);
      if (slide.need === "verified-map" && !mapBacked) add("NEED_MISMATCH", part, `${label} asks for a map without a verified place that can be mapped.`);
      if (slide.need === "character-reference" && !slide.characterIds.length) add("NEED_MISMATCH", part, `${label} is a character slide that casts no character.`);
      if (slide.need === "real-photo" && slide.characterIds.length) add("NEED_MISMATCH", part, `${label} rests on a verified photo; the brand's character stays off it.`);
      if (strict && !["real-photo", "verified-map", "typography"].includes(slide.need)) add("STRICT_MODE", part, `Under the ${mode} visual mode nothing is generated: ${label} must be a real photo, a verified map or typography.`);
      if (strict && slide.characterIds.length) add("STRICT_MODE", part, `Under the ${mode} visual mode no character is drawn on ${label}.`);
      if (!strict && slide.slide === "cover" && slide.need === "typography") add("COVER_TYPOGRAPHY", part, "The cover is always an image, never a typography card.");
      const direction = comparableText(slide.direction);
      for (const { entity, material } of entities.values()) {
        const named = nameForms(entity.name, entity.kind).some((form) => mentionsTerm(direction, form));
        if (!named) continue;
        const referenced = slide.references.includes(entity.id);
        if (entity.kind === "person" && !(referenced && material.portrait)) add("UNVERIFIED_PERSON", part, `${label}'s direction names ${entity.name}; a real person appears only through a confirmed documentary portrait in the slide's references.`);
        if (entity.kind === "place" && !(referenced && (material.photo || material.map))) add("UNVERIFIED_PLACE", part, `${label}'s direction names ${entity.name}; a real place appears only through its verified photo or map in the slide's references.`);
        if (entity.kind === "organization") add("ORGANIZATION_NAMED", part, `${label}'s direction names ${entity.name}; show what it does, never its name, logo or signs.`);
      }
      const avoided = avoid.find((term) => mentionsTerm(direction, term));
      if (avoided) add("AVOID_TERM", part, `${label}'s direction asks for "${avoided}", which the brand's identity avoids.`);
      const forbidden = forbiddenElement(slide.direction);
      if (forbidden) add("FORBIDDEN_ELEMENT", part, `${label}'s direction asks for "${forbidden}"; images carry no words, logos, signs or interface.`);
    }
  }
  return issues;
}

/** Whether two subjects are the same: the same words once compared, or most of their longer words shared. */
function sameSubject(a: string, b: string): boolean {
  if (comparableText(a) === comparableText(b)) return true;
  return wordOverlap(longWords(a), longWords(b)) >= SAME_SUBJECT_OVERLAP;
}

/** Whether two scripts say the same thing: the same whole and the same slides. */
export const sameVisual = (a: Draft2VisualCandidate, b: Draft2VisualCandidate) => {
  const key = (candidate: Draft2VisualCandidate) => JSON.stringify([
    comparableText(candidate.concept), comparableText(candidate.protagonist ?? ""), comparableText(candidate.motif), comparableText(candidate.cast), candidate.characterPlan.use, candidate.characterPlan.characterIds,
    candidate.slides.map((slide) => [slide.slide, comparableText(slide.beat), comparableText(slide.subject ?? ""), comparableText(slide.discovery ?? ""), slide.recurring, slide.shot, comparableText(slide.headlineLink ?? ""), comparableText(slide.direction), slide.need, slide.characterIds, slide.references]),
  ]);
  return key(a) === key(b);
};

export const VISUAL_REVISION_INSTRUCTION = "Revise each script in scripts and return exactly one script per script, with the same id. Keep its concept, its protagonist, its cast and its motif, and every slide its issues do not name exactly as it is; change only what the issues name, in as few words as possible. Never make a direction vaguer, busier or more literal to the slide's words. When earlierAttempts lists a revision that scored lower, do not repeat what made it worse.";

export const VISUAL_DEVELOP_INSTRUCTION = "Edit the script in develop and return it with its id. Keep its concept, protagonist, cast and motif; change only what a program rule, the brand's identity or the verified material requires, in as few words as possible. A script that is already right comes back unchanged. It also competes as written, so an edit only helps when it is better.";

/** The fix pass's instruction for scripts (FUNNEL_FIX_INSTRUCTION counts words; a direction's limit is in characters): the program's findings fixed in place, a long direction cut by what it repeats, never by its subject. */
export const VISUAL_FIX_INSTRUCTION = "Fix only what each finding names, in as few words as possible, and return each listed script under its own id, every slide complete, and nothing else. Keep the concept, the cast, the motif and every slide no finding names exactly as they are. A direction over its limit loses its repeated scene rules, light and prohibitions first, never its subject, its station or what crosses its edges; a length finding says how many characters to remove at least: remove them and count again. A name, a term or an element a finding refuses is told another way or left out; a shot, a need or a character a finding names is changed to what the finding says.";

const newScriptsInstruction = (count: number) => `Then write ${count} new ${count === 1 ? "script" : "scripts"}, with ids ${Array.from({ length: count }, (_, index) => `n${index + 1}`).join(", ")}: each a different visual story from every script in anglesSoFar, built to answer the issues and suggestions.`;

/** How the visual script's requests name things. */
export const VISUAL_WORDS: FunnelWords<Draft2VisualCandidate, "scripts"> = {
  task: "scripts",
  listKey: "scripts",
  label: (candidate) => ({ concept: candidate.concept }),
  noCleanNote: "No script so far is clean enough to revise. Write new scripts, each a different visual story from every script in anglesSoFar, that avoid these issues.",
  revise: VISUAL_REVISION_INSTRUCTION,
  develop: VISUAL_DEVELOP_INSTRUCTION,
  newCandidates: newScriptsInstruction,
  fix: VISUAL_FIX_INSTRUCTION,
};

/** The fix pass's request: the flagged scripts with the program's findings on each, to fix in place before the judge reads the round. */
export const visualFixRequest = (flagged: readonly Draft2VisualCandidate[], findings: readonly FunnelIssue[]) => funnelFixRequest(VISUAL_WORDS, flagged, findings);

export function visualExploreRequest(candidatesWanted: number, last?: Draft2VisualRound, versions: readonly Draft2VisualVersion[] = []) {
  return funnelExploreRequest(VISUAL_WORDS, candidatesWanted, last, versions);
}

export function visualRefineRequest(targets: readonly Draft2VisualVersion[], versions: readonly Draft2VisualVersion[], regressions: readonly Draft2VisualRegression[], last: Draft2VisualRound | undefined, newScripts = 0, proposals: readonly Draft2VisualCandidate[] = []) {
  return funnelRefineRequest(VISUAL_WORDS, targets, versions, regressions, last, newScripts, proposals);
}

export function visualJudgeRequest(plan: readonly FunnelPlanRound[], round: number, candidates: readonly Draft2VisualCandidate[], mechanical: readonly Draft2VisualIssue[], revised: readonly Draft2VisualVersion[]) {
  return funnelJudgeRequest(VISUAL_WORDS.task, plan, round, candidates, mechanical, revised);
}

/** The visual mode's rule in a line, for the brief both models read. */
export function visualModeLine(mode: Draft2VisualMode): string {
  return mode === "illustration-editorial"
    ? "- Visual mode: illustration-editorial. Images are generated in the identity's medium; real people only through confirmed documentary portraits, real places only through their verified photo or map."
    : `- Visual mode: ${mode}. Nothing is generated: every slide is a real photo, a verified map or a typography card, and no character is drawn.`;
}
