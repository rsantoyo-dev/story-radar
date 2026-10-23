import { CREATIVE_CONVERSION_GOALS, CREATIVE_NARRATIVE_FORMS, type CreativeConversionGoal, type CreativeProfile } from "../stories/creative-content.types";
import { Draft2InputError, Draft2ResponseError, type Draft2Fact } from "./draft2-facts.types";
import { entityMaterial, referencePhotos, type Draft2CharacterChoice, type Draft2Inventory } from "./draft2-inventory.types";
import { editedLevers, leversForModels, parsePlanLevers, type Draft2FocusLevers } from "./draft2-levers.types";
import type { Draft2Provider } from "./draft2-models";
import { TONE_KEYS, toneLine, toneValue, type ToneKey } from "./skills/tone";
import { spineImageProblems, type Draft2SpineProblem } from "./draft2-spine-checks";
import { caveatsIn, choreIn } from "./draft2-caveats.types";

/**
 * Focus, the second Draft 2 step: what the story is for, decided once the
 * facts are verified and before any hook is written. Claude decides every
 * field at once from the facts, the Topic's creative profile and its
 * editorial lines; the editor may change any field, and a field the editor
 * set stays theirs when Claude decides again. The Opening follows the focus
 * and its judge scores how well it does. The focus is guidance, never
 * evidence. Everything here is pure: contracts, the schema, parsing, edits
 * and the program's findings.
 *
 * Since narrative forms, the focus also names how the carousel is told
 * across its slides, in words and images together (narrative): classic, the
 * method before them, or an anchor that stays from slide to slide (a guide,
 * an object) while the story moves. People and places is found first, so
 * Claude decides it with the brand's characters and the story's material in
 * hand; the judge reviews a form Claude chose, and the editor has the last
 * word.
 */
/** The fields in the order they are decided: the story, then how it is told (concept, form, spine), then the directions derived from that. */
export const FOCUS_FIELDS = ["line", "audience", "framing", "readerConsequence", "structure", "goal", "voice", "concept", "narrative", "levers", "spine", "direction", "visualDirection", "textMode", "imageMode"] as const;
/** The fields that say how the story is told; an edit to one of them leaves the directions written for another telling (staleDirections). A panorama is planned as one scene. */
export const FOCUS_TELLING_FIELDS: readonly Draft2FocusField[] = ["concept", "narrative", "levers", "spine", "imageMode"];
/** The fields the second call writes from the first's decision: the spine and the two directions derived from it (the plan). */
export const FOCUS_PLAN_FIELDS: readonly Draft2FocusField[] = ["levers", "spine", "direction", "visualDirection"];
/** The editor's own choices on how the carousel is made, before the Spine: Claude neither decides nor plans them, and a decision keeps them. */
export const FOCUS_EDITOR_FIELDS: readonly Draft2FocusField[] = ["textMode", "imageMode"];
/** The fields the first call decides: the story and how it is told. */
export const FOCUS_DECISION_FIELDS: readonly Draft2FocusField[] = FOCUS_FIELDS.filter((field) => !FOCUS_PLAN_FIELDS.includes(field) && !FOCUS_EDITOR_FIELDS.includes(field));

/**
 * How the slides' words reach the images (2026-10-17, the editor: "put the
 * words afterwards, so we avoid making images again"): "image", the image
 * model letters them as before; "program", each image is made without a word,
 * keeping a calm band, and the program sets the words there, so a changed
 * word is set again on the stored image, never drawn again.
 */
export const FOCUS_TEXT_MODES = ["image", "program"] as const;
export type Draft2TextMode = (typeof FOCUS_TEXT_MODES)[number];
/**
 * How the images are made: "slides", one image per slide; "panorama", one
 * wide scene without words, cut into the slides side by side, so the scene
 * runs on across every swipe. A panorama's words are always the program's,
 * and it runs at most FOCUS_PANORAMA_MAX_SLIDES slides (GPT Image draws at
 * most 3:1, so more slides would each be drawn too small).
 */
export const FOCUS_IMAGE_MODES = ["slides", "panorama"] as const;
export type Draft2ImageMode = (typeof FOCUS_IMAGE_MODES)[number];
export const FOCUS_PANORAMA_MAX_SLIDES = 6;
export type Draft2Presentation = { text: Draft2TextMode; images: Draft2ImageMode };

/** How this carousel is made: the editor's choices, else one image per slide with the words drawn in it; a panorama always takes the program's words. */
export function focusPresentation(values: Pick<Draft2FocusValues, "textMode" | "imageMode"> | undefined | null): Draft2Presentation {
  const images = values?.imageMode === "panorama" ? "panorama" : "slides";
  return { images, text: images === "panorama" || values?.textMode === "program" ? "program" : "image" };
}

/** The most beats a spine may have under this presentation, when the presentation caps it (a panorama). */
export const presentationMaxBeats = (values: Pick<Draft2FocusValues, "textMode" | "imageMode"> | undefined | null): number | undefined =>
  focusPresentation(values).images === "panorama" ? FOCUS_PANORAMA_MAX_SLIDES : undefined;
export const FOCUS_FRAMINGS = ["reader-consequence", "explainer", "authority"] as const;
export const FOCUS_STRUCTURES = ["arc", "steps", "list"] as const;
export const FOCUS_GRAVITIES = ["light", "ordinary", "serious", "grave"] as const;
export const FOCUS_GOALS = CREATIVE_CONVERSION_GOALS;
export const FOCUS_AUDIENCE_MAX_CHARACTERS = 300;
/** The deliberation before the telling: the interest in one line, and two to four ways to tell the story compared. */
export const FOCUS_INTEREST_MAX_CHARACTERS = 200;
export const FOCUS_APPROACH_MAX_CHARACTERS = 160;
export const FOCUS_MIN_APPROACHES = 2;
export const FOCUS_MAX_APPROACHES = 4;
export const FOCUS_CONSEQUENCE_MAX_CHARACTERS = 300;
/** v1's editorial focus paragraph had the same ceiling. */
export const FOCUS_DIRECTION_MAX_CHARACTERS = 1_500;
/** The visual approach: one or two sentences the visual script follows. */
export const FOCUS_VISUAL_DIRECTION_MAX_CHARACTERS = 600;
const REASON_MAX_CHARACTERS = 400;
/** A line's objective as the focus keeps it; the longest real one is about 900 characters. */
const LINE_OBJECTIVE_MAX_CHARACTERS = 600;
export const FOCUS_LIST_MIN_ITEMS = 3;
export const FOCUS_STEPS_MIN_ITEMS = 2;
export const FOCUS_MAX_ITEMS = 12;
const MAX_CONSEQUENCE_FACTS = 10;
/**
 * Guards: what a reader who stops at the cover could wrongly believe and the
 * facts that prevent it (a suspension read as a closure, a decision about
 * past years read as news of today). The plan names them; the opening states
 * each on the cover or slide 2, citing one of the facts the guard names (each
 * is enough to prevent it).
 */
export const FOCUS_MAX_GUARDS = 2;
export const FOCUS_GUARD_MAX_CHARACTERS = 300;
export const FOCUS_GUARD_MAX_FACTS = 2;
/**
 * How the carousel is told across its slides. classic: one story told slide
 * by slide, each image its own; character-guide: a guide (the brand's
 * character, a figure from the story or an anonymous one) leads the reader
 * through the story's places or moments; traveling-object: one object from
 * the facts crosses its scenes, places or times; panorama: one wide scene
 * runs across every slide, read left to right; follow-the-line: a line with
 * a real meaning (a trail, a route, a street, a river) runs from slide to
 * slide and leads the reader along it. Panorama and follow-the-line are drawn
 * once as one wide master scene, and each slide is redrawn from its section.
 */
export const FOCUS_NARRATIVE_FORMS = CREATIVE_NARRATIVE_FORMS;
/**
 * How the reader meets the news. classic: the news, told straight;
 * discovery: the reader discovers it, through a premise that is the story's
 * own world (an SOS from the park's animals, a message found on a trail, a
 * mission order), each slide answering one question and opening the next,
 * the news itself the last reveal. A premise invents the world, never the
 * news: the mission or the mystery the reader follows is the facts' own.
 */
export const FOCUS_CONCEPT_ARCS = ["classic", "discovery", "progressive-reveal", "problem-solution", "cause-effect", "escalation", "comparison"] as const;
/**
 * The arcs past classic and discovery move the reader through beats the
 * facts give, in order: progressive-reveal (the answer piece by piece),
 * problem-solution (a problem, what it costs, the facts' solution),
 * cause-effect (one link of a chain the facts state per slide), escalation
 * (each slide bigger, in the facts' own magnitudes) and comparison (two
 * alternatives on the same criteria). They take no premise and any gravity.
 */
export const FOCUS_BEAT_ARCS = ["progressive-reveal", "problem-solution", "cause-effect", "escalation", "comparison"] as const;
export const FOCUS_PREMISE_MAX_CHARACTERS = 280;
export const FOCUS_REVEAL_MAX_CHARACTERS = 140;
export const FOCUS_MAX_REVEALS = 6;
const FOCUS_MIN_REVEALS = 2;
const MAX_PREMISE_FACTS = 6;
/** Claude proposes three premises: its choice and two more. */
const MAX_PREMISE_OPTIONS = 2;
/** A premise plays with a story; a serious or grave one is told straight. */
const PLAYFUL_GRAVITIES: readonly string[] = ["light", "ordinary"];

/** resolves: the last slide pays the story off; returns: it comes back to the cover's frame, read with what the reader now knows. */
export const FOCUS_NARRATIVE_ENDINGS = ["resolves", "returns"] as const;
/** What stays from slide to slide: nothing (classic), one of the brand's characters, another figure, an object, the scene of a panorama, or a line. */
export const FOCUS_ANCHOR_KINDS = ["none", "character", "figure", "object", "scene", "line"] as const;
export const FOCUS_ANCHOR_MAX_CHARACTERS = 200;
export const FOCUS_PROGRESSION_MAX_CHARACTERS = 300;
const MAX_ANCHOR_FACTS = 6;
const MAX_ANCHOR_ALTERNATIVES = 3;
const CHARACTER_DESCRIPTION_MAX_CHARACTERS = 300;

export type Draft2FocusField = (typeof FOCUS_FIELDS)[number];
export type Draft2FocusFraming = (typeof FOCUS_FRAMINGS)[number];
export type Draft2FocusStructureKind = (typeof FOCUS_STRUCTURES)[number];
export type Draft2FocusGravity = (typeof FOCUS_GRAVITIES)[number];
export type Draft2NarrativeForm = (typeof FOCUS_NARRATIVE_FORMS)[number];
export type Draft2NarrativeEnding = (typeof FOCUS_NARRATIVE_ENDINGS)[number];
export type Draft2AnchorKind = (typeof FOCUS_ANCHOR_KINDS)[number];

/** The anchors each form takes. */
export const NARRATIVE_ANCHOR_KINDS: Record<Draft2NarrativeForm, readonly Draft2AnchorKind[]> = {
  classic: ["none"],
  "character-guide": ["character", "figure"],
  "traveling-object": ["object"],
  panorama: ["scene"],
  "follow-the-line": ["line"],
};
/** The anchors that must come from the facts when Claude names them: an object, a line. */
const ANCHORS_FROM_FACTS: readonly Draft2AnchorKind[] = ["object", "line"];

/** Whether a form is drawn once as one wide master scene, each slide redrawn from its section. */
export const narrativeUsesMaster = (narrative: Pick<Draft2FocusNarrative, "form">) => narrative.form === "panorama" || narrative.form === "follow-the-line";

/** What the anchor is called on a slide, for messages and prompts. */
export const anchorNoun = (narrative: Pick<Draft2FocusNarrative, "form">): string =>
  ({ classic: "story", "character-guide": "guide", "traveling-object": "object", panorama: "scene", "follow-the-line": "line" })[narrative.form];

/**
 * The narrative form as the focus keeps it, in the answer's own flat shape,
 * so the editor's choice goes back to Claude exactly. For classic, all but
 * the form and the ending are empty.
 */
export type Draft2FocusNarrative = {
  form: Draft2NarrativeForm;
  anchorKind: Draft2AnchorKind;
  /** The brand character's id (People and places' roster) when the anchor is one; else null. */
  characterId: string | null;
  /** What stays, said the same way on every slide: the character's name, the figure or the object. */
  anchor: string;
  /** The facts that put the figure or the object in the story; empty for a brand character, an anonymous figure or the editor's own words. */
  anchorFactIds: string[];
  /** What changes from slide to slide while the anchor stays, in one line. */
  progression: string;
  ending: Draft2NarrativeEnding;
};
export const CLASSIC_NARRATIVE: Draft2FocusNarrative = { form: "classic", anchorKind: "none", characterId: null, anchor: "", anchorFactIds: [], progression: "", ending: "resolves" };

export type Draft2ConceptArc = (typeof FOCUS_CONCEPT_ARCS)[number];
/** The story's concept as the focus keeps it, in the answer's own shape. For classic, all but the arc are empty. */
export type Draft2FocusConcept = {
  arc: Draft2ConceptArc;
  /** The story's own world, in one line, invented for this story. */
  premise: string;
  /** The facts the premise dramatizes: its mission or its mystery is theirs. Empty for the editor's own words. */
  premiseFactIds: string[];
  /** The questions the slides answer in order, one short line each; the news itself is the last. */
  reveals: string[];
};
export const CLASSIC_CONCEPT: Draft2FocusConcept = { arc: "classic", premise: "", premiseFactIds: [], reveals: [] };

/**
 * The spine: the carousel's story in beats, one per slide, decided after the
 * concept and the narrative form and before the directions, so the words and
 * the images follow one plan (the spine skill). The roles are the classic
 * moments of a narration, an adaptable sequence: a story takes the ones it
 * needs, repeats rising when it must, and always has a turning point or a
 * climax and ends on a resolution or a payoff.
 */
export const FOCUS_SPINE_ROLES = ["hook", "setup", "inciting", "rising", "turning-point", "climax", "resolution", "payoff"] as const;
/** Where a beat falls in the carousel, in the funnel steps' own positions: the Opening's two, the Deck's middle, the Closing's one or two. */
export const FOCUS_SPINE_POSITIONS = ["cover", "slide2", "middle", "penultimate", "last"] as const;
export const FOCUS_SPINE_MIN_BEATS = 4;
export const FOCUS_SPINE_MAX_BEATS = 10;
/**
 * An arc's deck runs this many middle slides: the Deck's own range (a test
 * keeps them equal). One since 2026-10-17: a short notice (the Milan
 * boulevard's two-way traffic) was refused with one middle beat and padded to
 * six slides on the second answer; the carousel is as long as the story needs.
 */
export const FOCUS_SPINE_ARC_MIDDLE_MIN = 1;
export const FOCUS_SPINE_ARC_MIDDLE_MAX = 5;
export const FOCUS_BEAT_SCENE_MAX_CHARACTERS = 240;
export const FOCUS_BEAT_WORDS_MAX_CHARACTERS = 200;
export const FOCUS_BEAT_IMAGE_MAX_CHARACTERS = 240;
export const FOCUS_BEAT_WITHHOLDS_MAX_CHARACTERS = 160;
/** The image's dominant subject, in a few words: the program compares consecutive beats' subjects. */
export const FOCUS_BEAT_SUBJECT_MAX_CHARACTERS = 120;
/** The editor's notes for a rewrite of the plan (2026-10-16: "a field to give suggestions and recreate"), and how many past notes the focus keeps. */
export const FOCUS_PLAN_NOTES_MAX_CHARACTERS = 2_000;
export const FOCUS_PLAN_NOTES_KEPT = 10;
const MAX_BEAT_FACTS = 6;
export type Draft2SpineRole = (typeof FOCUS_SPINE_ROLES)[number];
export type Draft2SpinePosition = (typeof FOCUS_SPINE_POSITIONS)[number];
/** The roles that carry the turn: the one slide whose image leads. */
export const SPINE_TURN_ROLES: readonly Draft2SpineRole[] = ["turning-point", "climax"];
const SPINE_ENDING_ROLES: readonly Draft2SpineRole[] = ["resolution", "payoff"];
export type Draft2SpineBeat = {
  slide: Draft2SpinePosition;
  role: Draft2SpineRole;
  /** What happens on this slide, in the present tense, told through the narrative form and the concept. */
  scene: string;
  /** The words' job on this slide: what they state, ask or promise; never the words themselves. */
  words: string;
  /** What the image adds that the words cannot say; never an illustration of them. */
  image: string;
  /** The image's dominant subject, in a few words; never the previous beat's. Absent on spines written before spine v2. */
  subject?: string;
  /** What this slide keeps for the next one, the open loop; empty on the last slide only. */
  withholds: string;
  /** The verified facts the beat rests on; a hook may rest on none. */
  factIds: string[];
};
/**
 * How a panorama's one scene is designed (spine v10, 2026-10-18, after the
 * coffee ring's and the altitude's panoramas came out as six slides glued
 * together): the plan writes it with the beats when the editor chose a
 * panorama. The world is one place in one view; the device says what left to
 * right means; the field is the one plain surface of the words' band across
 * the whole width; the carrier is what runs through every seam; each beat
 * has its station, the turn's the largest.
 */
export const PANORAMA_DEVICES = ["journey", "time-lapse", "mechanism", "comparison"] as const;
export type Draft2PanoramaDevice = (typeof PANORAMA_DEVICES)[number];
export const PANORAMA_STATION_SIZES = ["large", "medium", "small"] as const;
export type Draft2PanoramaStationSize = (typeof PANORAMA_STATION_SIZES)[number];
export const PANORAMA_WORLD_MAX_CHARACTERS = 240;
export const PANORAMA_AXIS_MAX_CHARACTERS = 160;
export const PANORAMA_FIELD_MAX_CHARACTERS = 120;
export const PANORAMA_CARRIER_MAX_CHARACTERS = 160;
export const PANORAMA_CROSSING_MAX_CHARACTERS = 120;
/** One beat's place in the scene: how large its subject stands in its section, whether the brand's character is there, and what crosses its right edge into the next section. */
export type Draft2PanoramaStation = { size: Draft2PanoramaStationSize; character: boolean; crossing: string };
export type Draft2SpinePanorama = {
  /** The one place in one view, as the image model will draw it ("a kitchen counter seen from the front, the stove at the left end, the window at the right"). */
  world: string;
  /** What left to right means: journey (the eye travels through a place), time-lapse (the stages of one process laid side by side in order), mechanism (one cause unfolding), comparison (the two ends differ, the middle is the change). */
  device: Draft2PanoramaDevice;
  /** The axis in one line: from what, at the left, to what, at the right. */
  axis: string;
  /** The one plain surface of the words' band along the top of the whole scene (a wall, the sky, a flat field), in one colour of the brand across the whole width. */
  field: string;
  /** What runs through every seam, so the reader swipes to follow it: the surface itself by default; a line only when the facts give one. */
  carrier: string;
  /** The right end: resolves the story, or returns to the left end's frame. */
  ending: Draft2NarrativeEnding;
  /** One station per beat, in the beats' order. */
  stations: Draft2PanoramaStation[];
};
export type Draft2FocusSpine = { beats: Draft2SpineBeat[]; panorama?: Draft2SpinePanorama };
/** Another concept Claude wrote, for the editor to choose instead: a premise (discovery, when no arc is named) or an arc with its beats. */
export type Draft2PremiseOption = { arc?: Exclude<Draft2ConceptArc, "classic">; premise: string; premiseFactIds: string[]; reveals: string[] };

/** Another anchor Claude saw in the story, for the editor to choose instead. */
export type Draft2NarrativeAlternative = { kind: "figure" | "object" | "scene" | "line"; anchor: string; factIds: string[] };
const ALTERNATIVE_KINDS: readonly Draft2NarrativeAlternative["kind"][] = ["figure", "object", "scene", "line"];

/** The judge's look at a choice Claude made: kept, sent back to classic (Claude's proposal kept beside), or not reviewed, with why. */
export type Draft2CreativeReview<T> = { verdict: "keep" | "classic" | "unavailable"; reason: string; proposed?: T; by: { provider: Draft2Provider; model: string }; at: string };
export type Draft2NarrativeReview = Draft2CreativeReview<Draft2FocusNarrative>;
export type Draft2ConceptReview = Draft2CreativeReview<Draft2FocusConcept>;

/**
 * What People and places gives the focus: the brand's characters the editor
 * allows (with a reference image), the story's people (never drawn), its
 * places and whether each has verified material, and the story's photos.
 */
export type Draft2FocusMaterial = {
  characterChoice: Draft2CharacterChoice;
  characters: { id: string; name: string; description: string }[];
  people: string[];
  /** The story's people with a verified documentary portrait (confirmed on Commons, or a story photo the editor gave them): the images show them only through it, pasted unchanged. */
  portraits: string[];
  places: { name: string; verifiedPhoto: boolean; map: boolean }[];
  /** The story's organizations: never a voice of a premise, never drawn. */
  organizations: string[];
  storyPhotos: { id: string; name: string; description: string }[];
};

/** An editorial line of the Topic, as the focus keeps it: the revision it was read at and what the line is for. */
export type Draft2FocusLine = { id: string; revision: number; name: string; objective: string };

export type Draft2FocusVoice = { gravity: Draft2FocusGravity } & Record<ToneKey, number>;

/** A misreading the cover alone could cause, and the one or two facts whose words prevent it, each enough on its own. */
export type Draft2FocusGuard = { misreading: string; factIds: string[] };

export type Draft2FocusValues = {
  /** The editorial line the story serves; null when the Topic has none. */
  line: Draft2FocusLine | null;
  /** Who the story speaks to: the part of the publication's audience it is for. */
  audience: string;
  framing: Draft2FocusFraming;
  /** What changes for the audience, resting on the facts it cites; the editor's own words cite none. Null when no fact establishes one. */
  readerConsequence: { text: string; factIds: string[] } | null;
  /** arc: one tension; steps: an ordered procedure; list: parallel items. itemFactIds name each step's or item's first fact, in order. */
  structure: { kind: Draft2FocusStructureKind; itemFactIds: string[] };
  goal: CreativeConversionGoal;
  voice: Draft2FocusVoice;
  /** What to lead with, what to leave out, what the reader takes away (v1's editorial focus). */
  direction: string;
  /** How the reader meets the news: straight, or discovered through a premise. Absent on a focus decided before concepts: classic. */
  concept?: Draft2FocusConcept;
  /** How the carousel is told across its slides, in words and images. Absent on a focus decided before narrative forms: classic. */
  narrative?: Draft2FocusNarrative;
  /** The hook's lever (or free), up to two alternatives, and where its promise is kept; the plan chooses them with the spine. Absent on a focus decided before levers. */
  levers?: Draft2FocusLevers;
  /** The story in beats, one per slide, that the words and the images both follow. Absent on a focus decided before spines. */
  spine?: Draft2FocusSpine;
  /** What the cover alone could make a reader wrongly believe, and the facts the cover or slide 2 must state to prevent it; Claude's, written with the plan. Absent when there is none, or on a focus planned before guards. */
  guards?: Draft2FocusGuard[];
  /** What in the facts makes this audience stop, in one line: Claude's deliberation, read by every step. Absent on a focus decided before it. */
  interest?: string;
  /** How the images tell this story within the brand's visual identity: the world they live in, who leads them, what recurs. The visual script follows it. Absent on a focus decided before the field existed. */
  visualDirection?: string;
  /** Who sets the slides' words on the images (focusPresentation): the editor's choice; absent, the image model letters them. */
  textMode?: Draft2TextMode;
  /** One image per slide, or one panorama cut into the slides (focusPresentation): the editor's choice; absent, one per slide. */
  imageMode?: Draft2ImageMode;
};

export type Draft2FocusRole = { provider: Draft2Provider; model: string };

export type Draft2Focus = {
  /** running: Claude is deciding; failed: the last decision failed and the values before it stand. */
  status: "running" | "ready" | "failed";
  /** One more on every decision, edit and reset; an opening records the version it followed. */
  version: number;
  /** The focus as it stands: Claude's values with the editor's changes. */
  values?: Draft2FocusValues;
  /** Claude's own values, kept under the editor's changes so a field can go back to them. */
  ai?: Draft2FocusValues;
  /** One sentence per field Claude decided. */
  reasons?: Partial<Record<Draft2FocusField, string>>;
  /** The fields the editor set; Claude keeps them when it decides again. */
  edited: Draft2FocusField[];
  /** The Topic's editorial lines when the focus was decided: the choices for the line. */
  lineOptions: Draft2FocusLine[];
  decidedBy?: Draft2FocusRole;
  decidedAt?: string;
  updatedAt?: string;
  error?: string;
  /** Other anchors Claude saw on the last decision, for the editor to choose from. */
  narrativeOptions?: Draft2NarrativeAlternative[];
  /** The judge's look at the narrative form Claude chose on the last decision. */
  narrativeReview?: Draft2NarrativeReview;
  /** Claude's other premises on the last decision, for the editor to choose from. */
  conceptOptions?: Draft2PremiseOption[];
  /** The judge's look at the premise Claude chose on the last decision. */
  conceptReview?: Draft2ConceptReview;
  /** The People and places version the last decision read; one confirmed or rejected since may change the narrative's material. */
  inventoryVersion?: number;
  /** The narrative forms the publication allowed when the focus was decided (its creative profile); absent: every form. */
  narrativeForms?: Draft2NarrativeForm[];
  /** True once the editor changed how the story is told (concept, form or spine) while the directions still say what Claude wrote for the earlier telling; rewriting them clears it. */
  staleDirections?: boolean;
  /** Claude's deliberation on the last decision: the interest it found and the ways to tell the story it compared, the chosen one first. */
  deliberation?: Draft2FocusDeliberation;
  /** What the spine's image lines would make the images pay for (spineImageProblems), for the editor; never blocking. Absent when there is none. */
  spineProblems?: Draft2SpineProblem[];
  /** The editor's notes the plan was rewritten with, oldest first, the last few: what was asked and on which focus version. Claude's answer to the last is the spine's reason. */
  planNotes?: Draft2PlanNotes[];
};

export type Draft2PlanNotes = { at: string; text: string; focusVersion: number };

/** The editor's notes for a rewrite, as typed: trimmed, line breaks kept; empty is none; too long is an input error. */
export function parsePlanNotes(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string") throw new Draft2InputError("The notes are text.");
  const text = value.replace(/\r\n?/g, "\n").replace(/[ \t]+\n/g, "\n").trim();
  if ([...text].length > FOCUS_PLAN_NOTES_MAX_CHARACTERS) throw new Draft2InputError(`Keep the notes under ${FOCUS_PLAN_NOTES_MAX_CHARACTERS.toLocaleString("en")} characters.`);
  return text || undefined;
}

/**
 * The facts a slide's beat rests on: the cover's, slide 2's, the middle
 * beats' in order (s1, s2…), the penultimate's, the last's; none without a
 * spine or for a slide the spine does not cover.
 */
export function spineBeatFactIds(spine: Pick<Draft2FocusSpine, "beats"> | undefined, slide: string): string[] | undefined {
  if (!spine) return undefined;
  const middle = /^s(\d+)$/.exec(slide);
  const beat = middle ? spine.beats.filter((entry) => entry.slide === "middle")[Number(middle[1]) - 1] : spine.beats.find((entry) => entry.slide === slide);
  return beat?.factIds;
}

/** The middle beats' facts in order (deck slide 1, 2…); none without a spine. */
export const spineMiddleFactIds = (spine: Pick<Draft2FocusSpine, "beats"> | undefined): string[][] | undefined =>
  spine?.beats.filter((entry) => entry.slide === "middle").map((entry) => entry.factIds);

/** How many of its beat's facts a slide must cite: half, rounded up, three at most. */
export const BEAT_FACTS_REQUIRED_MAX = 3;
export const beatFactsRequired = (count: number) => Math.min(BEAT_FACTS_REQUIRED_MAX, Math.ceil(count / 2));

/**
 * The beat's facts a slide leaves out when it cites fewer than required (a
 * Saint-Jean fraud story's slide 2 cited the guards and the victim's age and
 * left the call, the fake policeman and the 4 000 $ demand, the story's
 * mechanism, to no slide, 2026-10-17); empty when it cites enough.
 */
export function beatFactsMissing(cited: readonly string[], beatFactIds: readonly string[] | undefined): string[] {
  if (!beatFactIds?.length) return [];
  const missing = beatFactIds.filter((id) => !cited.includes(id));
  return beatFactIds.length - missing.length >= beatFactsRequired(beatFactIds.length) ? [] : missing;
}

/** The finding for a slide that leaves out its beat's facts, naming them with their claims cut short. */
export function beatFactsFinding(label: string, missing: readonly string[], beatFactIds: readonly string[], facts: readonly Pick<Draft2Fact, "id" | "claim">[]): string {
  const named = missing.map((id) => { const claim = facts.find((fact) => fact.id === id)?.claim ?? ""; return claim ? `${id} (${claim.length > 80 ? `${claim.slice(0, 77)}…` : claim})` : id; });
  return `${label} leaves out the facts its beat rests on: ${named.join("; ")}. State at least ${beatFactsRequired(beatFactIds.length)} of the beat's ${beatFactIds.length}, and cite them.`;
}

/** A fact this important (the extractor's scale) must have a beat, or a guard, in the spine. */
export const SPINE_COVERAGE_IMPORTANCE = 85;

/**
 * The facts the story depends on that the spine leaves to no beat and no
 * guard (a Saint-Jean fraud story's spine left its date and its arrests, the
 * second most important fact, to none, 2026-10-17); never a disputed fact.
 */
export function spineUnusedFacts(spine: Pick<Draft2FocusSpine, "beats">, guards: readonly Pick<Draft2FocusGuard, "factIds">[], facts: readonly Pick<Draft2Fact, "id" | "importance" | "status" | "claim">[]): Pick<Draft2Fact, "id" | "importance" | "status" | "claim">[] {
  const placed = new Set([...spine.beats.flatMap((beat) => beat.factIds), ...guards.flatMap((guard) => guard.factIds)]);
  return facts.filter((fact) => fact.importance >= SPINE_COVERAGE_IMPORTANCE && fact.status !== "disputed" && !placed.has(fact.id));
}

/** The facts a spine must place in a beat or a guard: every fact of importance SPINE_COVERAGE_IMPORTANCE or more that is not disputed, for the planner's request. */
export const spineFactsToCover = (facts: readonly Pick<Draft2Fact, "id" | "importance" | "status">[]): string[] =>
  facts.filter((fact) => fact.importance >= SPINE_COVERAGE_IMPORTANCE && fact.status !== "disputed").map((fact) => fact.id);

/** The response error (or finding) for a spine that leaves important facts out. */
export const spineUnusedDetail = (unused: readonly Pick<Draft2Fact, "id" | "claim">[]) =>
  `The spine leaves out facts the story depends on: ${unused.map((fact) => `${fact.id} (${fact.claim.length > 80 ? `${fact.claim.slice(0, 77)}…` : fact.claim})`).join("; ")}. Give each a beat, or fold it into one.`;

/** What recurs on every slide by design, so a series check does not count it: a narrative form's anchor (the guide, the object, the place, the line); nothing for a classic telling. */
export const spineRecurring = (narrative: Pick<Draft2FocusNarrative, "form" | "anchor"> | undefined): string => narrative && narrative.form !== "classic" ? narrative.anchor : "";

/** The focus with its spine's image problems as they stand now, the brand's avoid terms given: recomputed when the spine is written, edited or kept by a decision. */
export function focusWithSpineProblems(focus: Draft2Focus, avoid: readonly string[]): Draft2Focus {
  const panorama = focus.values ? focusPresentation(focus.values).images === "panorama" : false;
  const problems = focus.values?.spine ? spineImageProblems(focus.values.spine.beats, { avoid, recurring: spineRecurring(focusNarrative(focus.values)), panorama }) : [];
  // A panorama whose spine has no scene yet (chosen after the plan): the images would improvise it.
  if (panorama && focus.values?.spine && !focus.values.spine.panorama) problems.push({ code: "SPINE_PANORAMA_SCENE", beat: 0, detail: "The spine has no scene for the panorama (its world, what left to right means, the field of the words' band, what crosses the seams, each beat's station): rewrite the spine with notes or decide again, or the images will improvise the scene" });
  const { spineProblems, ...rest } = focus;
  void spineProblems;
  return problems.length ? { ...rest, spineProblems: problems } : rest;
}

/** What makes the story worth telling to this audience, and the tellings compared before one was chosen. */
export type Draft2FocusDeliberation = { interest: string; approaches: string[] };


/** The focus an opening run followed, kept on the run. */
export type Draft2FocusSnapshot = { version: number; values: Draft2FocusValues };

/** A value as JSON with its object keys sorted: two copies compare equal whatever order a stored row gives their keys. */
const canonicalJson = (value: unknown): string => JSON.stringify(value, (_key, entry: unknown) => entry && typeof entry === "object" && !Array.isArray(entry)
  ? Object.fromEntries(Object.entries(entry).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
  : entry);

/** The parts of a spine only the images read: each beat's image line and dominant subject, and the panorama's scene. */
const spineImages = (spine: Draft2FocusSpine) => ({ beats: spine.beats.map(({ image, subject }) => ({ image, ...(subject ? { subject } : {}) })), ...(spine.panorama ? { panorama: spine.panorama } : {}) });
/** A spine without the parts only the images read: what the words follow. */
const spineWords = (spine: Draft2FocusSpine) => spine.beats.map(({ image, subject, ...beat }) => { void image; void subject; return beat; });
/** Whether two spines have the same beats, slide for slide: the images' parts of one can then stand on the other's words. */
const sameBeats = (a: Draft2FocusSpine, b: Draft2FocusSpine) => a.beats.length === b.beats.length && a.beats.every((beat, index) => beat.slide === b.beats[index].slide);
/**
 * The spine a visual script follows: the words' beats with the image lines,
 * subjects and scene as the focus has them now, while the beats are still the
 * same slides (an image line or a station the editor rewrites by hand
 * reaches the images without the words being written again: a real
 * panorama's hand-fixed scene would otherwise have stayed on the Spine
 * screen); the words' spine as it was otherwise.
 */
const spineForImages = (words: Draft2FocusSpine | undefined, now: Draft2FocusSpine | undefined): Draft2FocusSpine | undefined => {
  if (!words || !now || !sameBeats(words, now)) return words;
  const { panorama, ...rest } = words;
  void panorama;
  return {
    ...rest,
    beats: words.beats.map(({ subject, ...beat }, index) => { void subject; const image = now.beats[index]; return { ...beat, image: image.image, ...(image.subject ? { subject: image.subject } : {}) }; }),
    ...(now.panorama ? { panorama: now.panorama } : {}),
  };
};

/** The fields the words follow: every one but those only the visual script and the images read (the visual direction, who sets the words, one image or a panorama, and the spine's image lines, subjects and scene). */
const wordsValues = ({ visualDirection, textMode, imageMode, spine, ...values }: Draft2FocusValues) => {
  void visualDirection; void textMode; void imageMode;
  return { ...values, ...(spine ? { spine: spineWords(spine) } : {}) };
};
const samePresentation = (a: Pick<Draft2FocusValues, "textMode" | "imageMode">, b: Pick<Draft2FocusValues, "textMode" | "imageMode">) => {
  const left = focusPresentation(a);
  const right = focusPresentation(b);
  return left.text === right.text && left.images === right.images;
};

/**
 * Whether words written with one focus still follow the focus as it stands:
 * every field but the visual direction counts. Only the visual script reads
 * the visual direction, so a change to it asks for a new script, never for
 * new words.
 */
export function wordsFollowFocus(snapshot: Draft2FocusSnapshot | undefined, focus: { version: number; values?: Draft2FocusValues | null }): boolean {
  if (!snapshot || !focus.values) return false;
  return snapshot.version === focus.version || canonicalJson(wordsValues(snapshot.values)) === canonicalJson(wordsValues(focus.values));
}

/**
 * The focus a new visual script follows: the one its words followed, with
 * the visual direction, how the carousel is made and the spine's image lines,
 * subjects and scene as the focus has them now (spineForImages). The snapshot
 * keeps the words' version: the other fields are theirs. The words' snapshot
 * itself when nothing the images read has changed.
 */
export function visualFocus(words: Draft2FocusSnapshot, focus: { values?: Draft2FocusValues | null } | null | undefined): Draft2FocusSnapshot {
  if (!focus?.values) return words;
  const { visualDirection, textMode, imageMode } = focus.values;
  const { visualDirection: wordsDirection, textMode: wordsText, imageMode: wordsImages, ...rest } = words.values;
  void wordsDirection; void wordsText; void wordsImages;
  const spine = spineForImages(words.values.spine, focus.values.spine);
  const values: Draft2FocusValues = { ...rest, ...(visualDirection ? { visualDirection } : {}), ...(textMode ? { textMode } : {}), ...(imageMode ? { imageMode } : {}), ...(spine ? { spine } : {}) };
  return canonicalJson(values) === canonicalJson(words.values) ? words : { ...words, values };
}

/** Whether two spines show the same images: the same beats, slide for slide, with other image lines, subjects or scene. Spines whose beats differ are the words' concern (wordsFollowFocus). */
const spineImagesChanged = (script: Draft2FocusSpine | undefined, now: Draft2FocusSpine | undefined): boolean =>
  Boolean(script && now && sameBeats(script, now) && canonicalJson(spineImages(script)) !== canonicalJson(spineImages(now)));

/** Whether a visual script followed another visual direction, another way of making the carousel or other spine images than the focus has now: any of them asks for another script, never for new words. */
export function visualDirectionChanged(script: Draft2FocusSnapshot | undefined, focus: { values?: Draft2FocusValues | null } | null | undefined): boolean {
  if (!script || !focus?.values) return false;
  return (script.values.visualDirection ?? "") !== (focus.values.visualDirection ?? "") || !samePresentation(script.values, focus.values) || spineImagesChanged(script.values.spine, focus.values.spine);
}

export type Draft2FocusFindingCode = "NO_READER_CONSEQUENCE" | "TOO_FEW_ITEMS" | "NARRATIVE_CHARACTER_UNAVAILABLE" | "NARRATIVE_REAL_PERSON" | "CONCEPT_GRAVITY" | "CONCEPT_REAL_PERSON" | "SPINE_SHAPE" | "SPINE_FACT_UNUSED" | "SPINE_CAVEATS" | "SPINE_GUARD_ITEMS";
/** What the program finds wrong with a focus; any one keeps the Opening from starting. */
export type Draft2FocusFinding = { field: Draft2FocusField; code: Draft2FocusFindingCode; detail: string };

/** A line as the Topic stores it (editorial-lines.ts), reduced to what the focus reads. */
export type Draft2FocusLineSource = { id: string; revision: number; name: string; objective: string; themes: readonly string[]; archived?: boolean };

const factIdsSchema = { type: "array", items: { type: "string" } };
const dial = { type: "integer", minimum: 1, maximum: 100 };

/** Claude's answer: every field of the focus and a reason for each. */
export const DRAFT2_FOCUS_SCHEMA: Record<string, unknown> = {
  type: "object",
  properties: {
    lineId: { type: ["string", "null"] },
    interest: { type: "string" },
    approaches: { type: "array", items: { type: "string" } },
    audience: { type: "string" },
    framing: { type: "string", enum: [...FOCUS_FRAMINGS] },
    readerConsequence: {
      type: "object",
      properties: { text: { type: ["string", "null"] }, factIds: factIdsSchema },
      required: ["text", "factIds"],
      additionalProperties: false,
    },
    structure: {
      type: "object",
      properties: { kind: { type: "string", enum: [...FOCUS_STRUCTURES] }, itemFactIds: factIdsSchema },
      required: ["kind", "itemFactIds"],
      additionalProperties: false,
    },
    goal: { type: "string", enum: [...FOCUS_GOALS] },
    voice: {
      type: "object",
      properties: { gravity: { type: "string", enum: [...FOCUS_GRAVITIES] }, ...Object.fromEntries(TONE_KEYS.map((key) => [key, dial])) },
      required: ["gravity", ...TONE_KEYS],
      additionalProperties: false,
    },
    concept: {
      type: "object",
      properties: {
        arc: { type: "string", enum: [...FOCUS_CONCEPT_ARCS] },
        premise: { type: "string" },
        premiseFactIds: factIdsSchema,
        reveals: { type: "array", items: { type: "string" } },
      },
      required: ["arc", "premise", "premiseFactIds", "reveals"],
      additionalProperties: false,
    },
    conceptAlternatives: {
      type: "array",
      items: {
        type: "object",
        properties: {
          arc: { type: "string" },
          premise: { type: "string" }, premiseFactIds: factIdsSchema, reveals: { type: "array", items: { type: "string" } },
        },
        required: ["arc", "premise", "premiseFactIds", "reveals"],
        additionalProperties: false,
      },
    },
    narrative: {
      type: "object",
      properties: {
        form: { type: "string", enum: [...FOCUS_NARRATIVE_FORMS] },
        anchorKind: { type: "string", enum: [...FOCUS_ANCHOR_KINDS] },
        characterId: { type: ["string", "null"] },
        anchor: { type: "string" },
        anchorFactIds: factIdsSchema,
        progression: { type: "string" },
        ending: { type: "string", enum: [...FOCUS_NARRATIVE_ENDINGS] },
      },
      required: ["form", "anchorKind", "characterId", "anchor", "anchorFactIds", "progression", "ending"],
      additionalProperties: false,
    },
    anchorAlternatives: {
      type: "array",
      items: {
        type: "object",
        properties: { kind: { type: "string" }, anchor: { type: "string" }, factIds: factIdsSchema },
        required: ["kind", "anchor", "factIds"],
        additionalProperties: false,
      },
    },
    reasons: {
      type: "object",
      properties: Object.fromEntries(FOCUS_DECISION_FIELDS.map((field) => [field, { type: "string" }])),
      required: [...FOCUS_DECISION_FIELDS],
      additionalProperties: false,
    },
  },
  required: ["lineId", "interest", "approaches", "audience", "framing", "readerConsequence", "structure", "goal", "voice", "concept", "conceptAlternatives", "narrative", "anchorAlternatives", "reasons"],
  additionalProperties: false,
};

/**
 * The second call's answer: the plan, from the decision. The spine's positions
 * and roles are plain strings here (the parser checks them): an enum inside an
 * array is what grows the compiled grammar past the provider's limit, which is
 * why the decision and the plan are two calls.
 */
export const DRAFT2_FOCUS_PLAN_SCHEMA: Record<string, unknown> = {
  type: "object",
  properties: {
    // Ids are strings the parser checks against the catalog: no enum inside an array keeps Anthropic's compiled grammar small.
    levers: {
      type: "object",
      properties: { primary: { type: "string" }, alternatives: { type: "array", items: { type: "string" } }, factIds: factIdsSchema, paidBy: { type: "string" } },
      required: ["primary", "alternatives", "factIds", "paidBy"],
      additionalProperties: false,
    },
    guards: {
      type: "array",
      items: {
        type: "object",
        properties: { misreading: { type: "string" }, factIds: factIdsSchema },
        required: ["misreading", "factIds"],
        additionalProperties: false,
      },
    },
    spine: {
      type: "object",
      properties: {
        beats: {
          type: "array",
          items: {
            type: "object",
            properties: {
              slide: { type: "string" },
              role: { type: "string" },
              scene: { type: "string" },
              words: { type: "string" },
              image: { type: "string" },
              subject: { type: "string" },
              withholds: { type: "string" },
              factIds: factIdsSchema,
            },
            required: ["slide", "role", "scene", "words", "image", "subject", "withholds", "factIds"],
            additionalProperties: false,
          },
        },
      },
      required: ["beats"],
      additionalProperties: false,
    },
    direction: { type: "string" },
    visualDirection: { type: "string" },
    reasons: {
      type: "object",
      properties: Object.fromEntries(FOCUS_PLAN_FIELDS.map((field) => [field, { type: "string" }])),
      required: [...FOCUS_PLAN_FIELDS],
      additionalProperties: false,
    },
  },
  required: ["levers", "guards", "spine", "direction", "visualDirection", "reasons"],
  additionalProperties: false,
};

const record = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const text = (value: unknown, max: number): string | undefined =>
  typeof value === "string" && value.trim() && value.trim().length <= max ? value.trim() : undefined;
const oneOf = <T extends string>(values: readonly T[], value: unknown): T | undefined => values.find((candidate) => candidate === value);
/**
 * A planning text cut to its limit at the last word that fits, for the last
 * answer only: a beat whose scene or words run a few characters over is
 * still a beat, and failing the whole step for it cost a story its Spine
 * (2026-10-17, the coffee ring's panorama).
 */
const clipped = (value: unknown, max: number): string | undefined => {
  if (typeof value !== "string" || !value.trim()) return undefined;
  const whole = value.trim();
  if (whole.length <= max) return whole;
  const cut = whole.slice(0, max + 1);
  const end = cut.lastIndexOf(" ");
  return (end > max / 2 ? cut.slice(0, end) : whole.slice(0, max)).replace(/[\s,;:–-]+$/u, "");
};

/** The numbers the program checks a spine against, for the planner's request: the beats it may have and each field's characters. */
export function spineLimitsForModels(values: Pick<Draft2FocusValues, "textMode" | "imageMode">) {
  const panorama = focusPresentation(values).images === "panorama";
  return {
    beats: { min: FOCUS_SPINE_MIN_BEATS, max: presentationMaxBeats(values) ?? FOCUS_SPINE_MAX_BEATS, ...(panorama ? { note: "a panorama: four or five read larger than six" } : {}) },
    characters: { scene: FOCUS_BEAT_SCENE_MAX_CHARACTERS, words: FOCUS_BEAT_WORDS_MAX_CHARACTERS, image: FOCUS_BEAT_IMAGE_MAX_CHARACTERS, withholds: FOCUS_BEAT_WITHHOLDS_MAX_CHARACTERS, subject: FOCUS_BEAT_SUBJECT_MAX_CHARACTERS },
    // A panorama's spine designs its scene (spine.panorama): the program requires it, one station per beat, exactly one station "large" (the turn's).
    ...(panorama ? { panorama: { required: true, stations: "one per beat, in the beats' order; exactly one large, on the turning point or the climax", characters: { world: PANORAMA_WORLD_MAX_CHARACTERS, axis: PANORAMA_AXIS_MAX_CHARACTERS, field: PANORAMA_FIELD_MAX_CHARACTERS, carrier: PANORAMA_CARRIER_MAX_CHARACTERS, crossing: PANORAMA_CROSSING_MAX_CHARACTERS } } } : {}),
  };
}

/**
 * The plan's schema for a focus as it is made: a panorama's spine carries its
 * scene (spine.panorama), required there and absent otherwise, since the
 * contract names every property it allows.
 */
export function focusPlanSchema(values: Pick<Draft2FocusValues, "textMode" | "imageMode">): Record<string, unknown> {
  if (focusPresentation(values).images !== "panorama") return DRAFT2_FOCUS_PLAN_SCHEMA;
  const properties = DRAFT2_FOCUS_PLAN_SCHEMA.properties as Record<string, Record<string, unknown>>;
  const spine = properties.spine as { properties: Record<string, unknown>; required: string[] };
  return {
    ...DRAFT2_FOCUS_PLAN_SCHEMA,
    properties: {
      ...properties,
      spine: {
        ...spine,
        properties: {
          ...spine.properties,
          panorama: {
            type: "object",
            properties: {
              world: { type: "string" }, device: { type: "string", enum: [...PANORAMA_DEVICES] }, axis: { type: "string" }, field: { type: "string" }, carrier: { type: "string" }, ending: { type: "string", enum: [...FOCUS_NARRATIVE_ENDINGS] },
              stations: { type: "array", items: { type: "object", properties: { size: { type: "string", enum: [...PANORAMA_STATION_SIZES] }, character: { type: "boolean" }, crossing: { type: "string" } }, required: ["size", "character", "crossing"], additionalProperties: false } },
            },
            required: ["world", "device", "axis", "field", "carrier", "ending", "stations"],
            additionalProperties: false,
          },
        },
        required: [...spine.required, "panorama"],
      },
    },
  };
}

/** The ids of verified facts in a list, once each and in order; anything else is dropped. */
function knownFactIds(value: unknown, facts: ReadonlySet<string>, max: number): string[] {
  const ids: string[] = [];
  for (const entry of Array.isArray(value) ? value : []) {
    if (typeof entry === "string" && facts.has(entry.trim()) && !ids.includes(entry.trim())) ids.push(entry.trim());
  }
  return ids.slice(0, max);
}

const clip = (value: string, max: number) => {
  const plain = value.replace(/\s+/g, " ").trim();
  return plain.length > max ? `${plain.slice(0, max - 1).trimEnd()}…` : plain;
};

/** The material People and places gives the focus; the brand's characters only while the editor has not turned them off. */
export function focusMaterial(inventory: Pick<Draft2Inventory, "characters" | "roster" | "entities" | "storyPhotos">): Draft2FocusMaterial {
  return {
    characterChoice: inventory.characters,
    characters: inventory.characters === "off" ? [] : inventory.roster.map(({ id, name, description }) => ({ id, name, description: clip(description, CHARACTER_DESCRIPTION_MAX_CHARACTERS) })),
    people: inventory.entities.filter((entity) => entity.kind === "person").map((entity) => entity.name),
    portraits: inventory.entities.filter((entity) => entity.kind === "person" && entityMaterial(entity).portrait).map((entity) => entity.name),
    places: inventory.entities.filter((entity) => entity.kind === "place").map((entity) => {
      const material = entityMaterial(entity);
      return { name: entity.name, verifiedPhoto: Boolean(material.photo), map: Boolean(material.map) };
    }),
    organizations: inventory.entities.filter((entity) => entity.kind === "organization").map((entity) => entity.name),
    storyPhotos: referencePhotos(inventory).map(({ id, name, description }) => ({ id, name, description })),
  };
}

const escapeRegExp = (value: string) => value.replace(/[.*+?^\${}()|[\]\\]/g, "\\$&");
/** The first of the story's people named in a text, as a whole name, whatever its case. */
function realPersonIn(text: string, people: readonly string[]): string | undefined {
  return people.find((name) => name.trim().length > 2 && new RegExp(`(^|[^\\p{L}\\p{N}])${escapeRegExp(name.trim())}($|[^\\p{L}\\p{N}])`, "iu").test(text));
}

/** What a panorama's scene is called before the spine designs it. */
export const PANORAMA_DEFAULT_ANCHOR = "the carousel's one continuous scene";

/**
 * The narrative a focus follows: its own, else classic (a focus decided before
 * narrative forms). Since 2026-10-18 the editor's panorama (imageMode) is the
 * panorama form whatever Claude chose: the scene the spine designed is the
 * anchor, its axis the progression, its ending the ending, so the Opening,
 * the Deck, the Closing and the visual script read the form's own guidance.
 */
export const focusNarrative = (values: Pick<Draft2FocusValues, "narrative"> & Partial<Pick<Draft2FocusValues, "imageMode" | "spine">>): Draft2FocusNarrative => {
  const own = values.narrative ?? CLASSIC_NARRATIVE;
  if (values.imageMode !== "panorama" || own.form !== "classic") return own;
  const scene = values.spine?.panorama;
  return { form: "panorama", anchorKind: "scene", characterId: null, anchor: scene?.world ?? PANORAMA_DEFAULT_ANCHOR, anchorFactIds: [], progression: scene?.axis ?? "", ending: scene?.ending ?? "resolves" };
};

/**
 * The narrative form of Claude's answer, checked against the contract and the
 * material. A form outside the list, an anchor of the wrong kind or missing
 * its words, a brand character the brand does not have (or the editor turned
 * off), an object not taken from the facts, or a real person of the story as
 * the anchor is a response error, asked for again with the rule it broke. An
 * answer without one is classic. The editor's choice is kept as given; the
 * findings say what it misses.
 */
function parseNarrative(value: unknown, { known, material, editorChoice, forms }: { known: ReadonlySet<string>; material?: Draft2FocusMaterial; editorChoice?: Draft2FocusNarrative; forms?: readonly Draft2NarrativeForm[] }): Draft2FocusNarrative {
  if (editorChoice) return editorChoice;
  if (value === undefined) return CLASSIC_NARRATIVE;
  const body = record(value);
  const form = oneOf(FOCUS_NARRATIVE_FORMS, body.form);
  const ending = oneOf(FOCUS_NARRATIVE_ENDINGS, body.ending);
  if (!form || !ending) throw new Draft2ResponseError(`The narrative form is one of ${FOCUS_NARRATIVE_FORMS.join(", ")} and its ending one of ${FOCUS_NARRATIVE_ENDINGS.join(", ")}`);
  if (form === "classic") return CLASSIC_NARRATIVE;
  // The publication's own forms (its creative profile): one it turned off is asked for again, with the forms it keeps.
  if (forms && !forms.includes(form)) throw new Draft2ResponseError(`This publication does not tell its stories as ${form}; the narrative form is one of ${forms.join(", ")}`);
  const kind = oneOf(FOCUS_ANCHOR_KINDS, body.anchorKind);
  const allowed = NARRATIVE_ANCHOR_KINDS[form];
  if (!kind || !allowed.includes(kind)) throw new Draft2ResponseError(`A ${form} anchor is ${allowed.join(" or ")}, not ${String(body.anchorKind)}`);
  const anchor = text(body.anchor, FOCUS_ANCHOR_MAX_CHARACTERS);
  const progression = text(body.progression, FOCUS_PROGRESSION_MAX_CHARACTERS);
  if (!anchor) throw new Draft2ResponseError(`The narrative's anchor is missing or longer than ${FOCUS_ANCHOR_MAX_CHARACTERS} characters`);
  if (!progression) throw new Draft2ResponseError(`The narrative's progression is missing or longer than ${FOCUS_PROGRESSION_MAX_CHARACTERS} characters`);
  if (kind === "character") {
    const character = material?.characters.find((entry) => entry.id === body.characterId);
    if (!character) {
      throw new Draft2ResponseError(material?.characterChoice === "off"
        ? "The editor turned the brand's characters off: the guide is a figure, or the story is told another way"
        : `The narrative names a brand character the brand does not have (${String(body.characterId)}); use an id from material.characters`);
    }
    return { form, anchorKind: kind, characterId: character.id, anchor: character.name, anchorFactIds: [], progression, ending };
  }
  const anchorFactIds = knownFactIds(body.anchorFactIds, known, MAX_ANCHOR_FACTS);
  if (ANCHORS_FROM_FACTS.includes(kind) && !anchorFactIds.length) {
    throw new Draft2ResponseError(kind === "line"
      ? "The line comes from the facts (the trail, route, street or river they name): cite them in anchorFactIds"
      : "A traveling object comes from the facts: cite the facts that put it in the story in anchorFactIds");
  }
  const person = realPersonIn(anchor, material?.people ?? []);
  if (person) throw new Draft2ResponseError(`${person} is a real person of the story: never the anchor, who appears only in a verified documentary photo`);
  return { form, anchorKind: kind, characterId: null, anchor, anchorFactIds, progression, ending };
}

/** The concept a focus follows: its own, else classic (a focus decided before concepts). */
export const focusConcept = (values: Pick<Draft2FocusValues, "concept">): Draft2FocusConcept => values.concept ?? CLASSIC_CONCEPT;

/** The reveals of a discovery chain: the lines that fit, at most six. */
const revealsOf = (value: unknown): string[] =>
  (Array.isArray(value) ? value : []).flatMap((entry) => { const line = text(entry, FOCUS_REVEAL_MAX_CHARACTERS); return line ? [line] : []; }).slice(0, FOCUS_MAX_REVEALS);

/**
 * The concept of Claude's answer, checked against the contract: an arc
 * outside the list; for discovery, a premise without its words or the facts
 * it dramatizes, a chain of fewer than two reveals, a premise for a serious
 * or grave story, or a real person of the story in it; for another arc, no
 * facts or fewer than two beats. Each is a response error, asked for again
 * with the rule it broke. An answer without one is classic; the editor's
 * choice is kept as given (the findings say what it misses).
 */
function parseConcept(value: unknown, { known, material, gravity, editorChoice }: { known: ReadonlySet<string>; material?: Draft2FocusMaterial; gravity: string; editorChoice?: Draft2FocusConcept }): Draft2FocusConcept {
  if (editorChoice) return editorChoice;
  if (value === undefined) return CLASSIC_CONCEPT;
  const body = record(value);
  const arc = oneOf(FOCUS_CONCEPT_ARCS, body.arc);
  if (!arc) throw new Draft2ResponseError(`The concept's arc is one of ${FOCUS_CONCEPT_ARCS.join(", ")}`);
  if (arc === "classic") return CLASSIC_CONCEPT;
  if (arc !== "discovery") {
    const factIds = knownFactIds(body.premiseFactIds, known, MAX_PREMISE_FACTS);
    if (!factIds.length) throw new Draft2ResponseError(`A ${arc} arc rests on the facts: cite the facts its beats come from in premiseFactIds`);
    const beats = revealsOf(body.reveals);
    if (beats.length < FOCUS_MIN_REVEALS) throw new Draft2ResponseError(`A ${arc} arc needs ${FOCUS_MIN_REVEALS} to ${FOCUS_MAX_REVEALS} beats of at most ${FOCUS_REVEAL_MAX_CHARACTERS} characters each, in order`);
    return { arc, premise: "", premiseFactIds: factIds, reveals: beats };
  }
  if (!PLAYFUL_GRAVITIES.includes(gravity)) throw new Draft2ResponseError(`A discovery premise plays with the story, and this one's gravity is ${gravity}: tell it classic`);
  const premise = text(body.premise, FOCUS_PREMISE_MAX_CHARACTERS);
  if (!premise) throw new Draft2ResponseError(`The premise is missing or longer than ${FOCUS_PREMISE_MAX_CHARACTERS} characters`);
  const premiseFactIds = knownFactIds(body.premiseFactIds, known, MAX_PREMISE_FACTS);
  if (!premiseFactIds.length) throw new Draft2ResponseError("A premise dramatizes the facts: cite the facts its mission or mystery comes from in premiseFactIds");
  const reveals = revealsOf(body.reveals);
  if (reveals.length < FOCUS_MIN_REVEALS) throw new Draft2ResponseError(`The discovery chain needs ${FOCUS_MIN_REVEALS} to ${FOCUS_MAX_REVEALS} reveals of at most ${FOCUS_REVEAL_MAX_CHARACTERS} characters each, the news itself the last`);
  const person = realPersonIn(premise, material?.people ?? []);
  if (person) throw new Draft2ResponseError(`${person} is a real person of the story: never a voice or a character of the premise`);
  return { arc, premise, premiseFactIds, reveals };
}

/** What is wrong with a spine's shape for a structure, if anything: its positions, its count of middle beats, its turn and its ending. */
export function spineShapeProblem(beats: readonly Draft2SpineBeat[], structure: { kind: Draft2FocusStructureKind; itemFactIds: readonly string[] }, { maxBeats }: { maxBeats?: number } = {}): string | undefined {
  if (beats.length < FOCUS_SPINE_MIN_BEATS || beats.length > FOCUS_SPINE_MAX_BEATS) return `The spine has ${FOCUS_SPINE_MIN_BEATS} to ${FOCUS_SPINE_MAX_BEATS} beats, one per slide; this one has ${beats.length}`;
  if (maxBeats && beats.length > maxBeats) return `A panorama runs at most ${maxBeats} slides, one section of its scene each; this spine has ${beats.length}`;
  const positions = beats.map((beat) => beat.slide);
  const rank = (position: Draft2SpinePosition) => FOCUS_SPINE_POSITIONS.indexOf(position);
  if (positions.some((position, index) => index > 0 && rank(position) < rank(positions[index - 1]))) return "The beats follow the carousel: the cover, slide2, the middle slides, the penultimate of an arc, then the last";
  const count = (position: Draft2SpinePosition) => positions.filter((entry) => entry === position).length;
  if (count("cover") !== 1 || positions[0] !== "cover" || beats[0].role !== "hook") return "The first beat is the cover and its role is hook, and there is one cover";
  if (count("slide2") !== 1 || positions[1] !== "slide2") return "The second beat is slide2, and there is one";
  if (count("last") !== 1 || positions[positions.length - 1] !== "last") return "The last beat is the last slide, and there is one";
  const penultimates = count("penultimate");
  if (structure.kind === "arc" ? penultimates !== 1 : penultimates !== 0) return structure.kind === "arc" ? "An arc's closing has one penultimate beat before the last" : `A ${structure.kind === "list" ? "list" : "procedure"} closes on the last slide alone: no penultimate beat`;
  const middle = count("middle");
  if (structure.kind === "arc" && (middle < FOCUS_SPINE_ARC_MIDDLE_MIN || middle > FOCUS_SPINE_ARC_MIDDLE_MAX)) return `An arc's deck has ${FOCUS_SPINE_ARC_MIDDLE_MIN} to ${FOCUS_SPINE_ARC_MIDDLE_MAX} middle beats; this spine has ${middle}`;
  const items = structure.itemFactIds.length;
  if (structure.kind !== "arc" && items && (middle < Math.max(1, items - 1) || middle > items)) return `A ${structure.kind === "list" ? "list" : "procedure"} has one middle beat per item or step (${items}, the first allowed on slide2); this spine has ${middle}`;
  if (!beats.some((beat) => SPINE_TURN_ROLES.includes(beat.role))) return "Every spine has a turning point or a climax: the strongest true thing the facts hold";
  if (!SPINE_ENDING_ROLES.includes(beats[beats.length - 1].role)) return "The last beat is a payoff or a resolution";
  if (beats.slice(0, -1).some((beat) => !beat.withholds)) return "Every beat but the last withholds something for the next slide";
  return undefined;
}

/**
 * A spine checked against the contract and the structure, from Claude's
 * answer (`known` facts; a broken rule is a response error, asked for again)
 * or from the editor (`known` undefined; an input error). Each beat needs its
 * slide and role, its scene, words and image within their limits, what it
 * withholds (empty on the last only) and the facts it rests on.
 */
function spineFrom(value: unknown, structure: { kind: Draft2FocusStructureKind; itemFactIds: readonly string[] }, known: ReadonlySet<string> | undefined, fail: (message: string) => never, limits: { maxBeats?: number; /** The last answer: a text over its limit is cut at a word, not refused. */ clip?: boolean } = {}): Draft2FocusSpine {
  const field = limits.clip ? clipped : text;
  const raw = record(value).beats;
  if (!Array.isArray(raw)) fail("The spine is a list of beats, one per slide");
  const beats: Draft2SpineBeat[] = (raw as unknown[]).map((entry, index) => {
    const body = record(entry);
    const slide = oneOf(FOCUS_SPINE_POSITIONS, body.slide);
    const role = oneOf(FOCUS_SPINE_ROLES, body.role);
    if (!slide || !role) fail(`Beat ${index + 1}: slide is one of ${FOCUS_SPINE_POSITIONS.join(", ")} and role one of ${FOCUS_SPINE_ROLES.join(", ")}`);
    const scene = field(body.scene, FOCUS_BEAT_SCENE_MAX_CHARACTERS);
    const words = field(body.words, FOCUS_BEAT_WORDS_MAX_CHARACTERS);
    const image = field(body.image, FOCUS_BEAT_IMAGE_MAX_CHARACTERS);
    if (!scene) fail(`Beat ${index + 1} needs its scene, in 1 to ${FOCUS_BEAT_SCENE_MAX_CHARACTERS} characters`);
    if (!words) fail(`Beat ${index + 1} needs the words' job, in 1 to ${FOCUS_BEAT_WORDS_MAX_CHARACTERS} characters`);
    if (!image) fail(`Beat ${index + 1} needs what the image adds, in 1 to ${FOCUS_BEAT_IMAGE_MAX_CHARACTERS} characters`);
    const withholds = typeof body.withholds === "string" ? (limits.clip ? clipped(body.withholds, FOCUS_BEAT_WITHHOLDS_MAX_CHARACTERS) ?? "" : body.withholds.trim()) : "";
    if (withholds.length > FOCUS_BEAT_WITHHOLDS_MAX_CHARACTERS) fail(`Beat ${index + 1} withholds in at most ${FOCUS_BEAT_WITHHOLDS_MAX_CHARACTERS} characters`);
    const factIds = known
      ? knownFactIds(body.factIds, known, MAX_BEAT_FACTS)
      : (Array.isArray(body.factIds) ? body.factIds : []).filter((id): id is string => typeof id === "string" && id.trim().length > 0).map((id) => id.trim()).slice(0, MAX_BEAT_FACTS);
    // The subject is a short planning field: cut to its limit, never fatal; a spine written before it has none.
    const subject = typeof body.subject === "string" ? body.subject.replace(/\s+/g, " ").trim().slice(0, FOCUS_BEAT_SUBJECT_MAX_CHARACTERS) : "";
    return { slide: slide!, role: role!, scene: scene!, words: words!, image: image!, ...(subject ? { subject } : {}), withholds, factIds };
  });
  const problem = spineShapeProblem(beats, structure, limits);
  if (problem) fail(problem);
  const panorama = panoramaFrom(record(value).panorama, beats, fail, limits);
  return { beats, ...(panorama ? { panorama } : {}) };
}

/**
 * A panorama's scene from the plan or the editor, checked: its texts within
 * their limits (cut at a word on the last answer), a known device and ending,
 * one station per beat with a known size, exactly one station large and on
 * the turn, a crossing on every station but the last. Absent when the answer
 * has none: the plan is asked for it when the presentation is a panorama
 * (parseFocusPlan); an editor's spine may lack it.
 */
function panoramaFrom(value: unknown, beats: readonly Draft2SpineBeat[], fail: (message: string) => never, limits: { clip?: boolean }): Draft2SpinePanorama | undefined {
  if (!value || typeof value !== "object") return undefined;
  const body = record(value);
  const field = limits.clip ? clipped : text;
  const world = field(body.world, PANORAMA_WORLD_MAX_CHARACTERS);
  const axis = field(body.axis, PANORAMA_AXIS_MAX_CHARACTERS);
  const surface = field(body.field, PANORAMA_FIELD_MAX_CHARACTERS);
  const carrier = field(body.carrier, PANORAMA_CARRIER_MAX_CHARACTERS);
  const device = oneOf(PANORAMA_DEVICES, body.device);
  const ending = oneOf(FOCUS_NARRATIVE_ENDINGS, body.ending) ?? "resolves";
  if (!world) fail(`The panorama's world: the one place in one view, in 1 to ${PANORAMA_WORLD_MAX_CHARACTERS} characters`);
  if (!device) fail(`The panorama's device is one of ${PANORAMA_DEVICES.join(", ")}`);
  if (!axis) fail(`The panorama's axis: what left to right means, in 1 to ${PANORAMA_AXIS_MAX_CHARACTERS} characters`);
  if (!surface) fail(`The panorama's field: the one plain surface of the words' band across the whole width, in 1 to ${PANORAMA_FIELD_MAX_CHARACTERS} characters`);
  if (!carrier) fail(`The panorama's carrier: what runs through every seam, in 1 to ${PANORAMA_CARRIER_MAX_CHARACTERS} characters`);
  const raw = Array.isArray(body.stations) ? body.stations as unknown[] : [];
  if (raw.length !== beats.length) fail(`The panorama has one station per beat, in the beats' order: ${beats.length} beats, ${raw.length} stations`);
  const stations: Draft2PanoramaStation[] = raw.map((entry, index) => {
    const station = record(entry);
    const size = oneOf(PANORAMA_STATION_SIZES, station.size);
    if (!size) fail(`Station ${index + 1}: size is one of ${PANORAMA_STATION_SIZES.join(", ")}`);
    const crossing = typeof station.crossing === "string" ? (limits.clip ? clipped(station.crossing, PANORAMA_CROSSING_MAX_CHARACTERS) ?? "" : station.crossing.trim()) : "";
    if (crossing.length > PANORAMA_CROSSING_MAX_CHARACTERS) fail(`Station ${index + 1} crosses in at most ${PANORAMA_CROSSING_MAX_CHARACTERS} characters`);
    return { size: size!, character: station.character === true, crossing };
  });
  const large = stations.flatMap((station, index) => station.size === "large" ? [index] : []);
  if (large.length !== 1) fail(`Exactly one station is large: the turning point's or the climax's; this scene has ${large.length}`);
  if (!SPINE_TURN_ROLES.includes(beats[large[0]].role)) fail(`The large station is the turn's (beat ${large[0] + 1} is ${beats[large[0]].role}): the strongest true thing stands largest in the scene`);
  const uncrossed = stations.slice(0, -1).flatMap((station, index) => station.crossing ? [] : [index + 1]);
  if (uncrossed.length) fail(`Every station but the last says what crosses its right edge into the next section; ${uncrossed.length === 1 ? "station" : "stations"} ${uncrossed.join(", ")} ${uncrossed.length === 1 ? "does" : "do"} not`);
  return { world: world!, device: device!, axis: axis!, field: surface!, carrier: carrier!, ending, stations };
}

/** The spine a focus follows, if it has one (a focus decided before spines has none). */
export const focusSpine = (values: Pick<Draft2FocusValues, "spine">): Draft2FocusSpine | undefined => values.spine;

/** The beat of a position, for the steps: the Opening's two, the Deck's middle beats in order, the Closing's. */
export const spineBeats = (spine: Draft2FocusSpine | undefined, position: Draft2SpinePosition): Draft2SpineBeat[] => (spine?.beats ?? []).filter((beat) => beat.slide === position);

/**
 * The plan of Claude's second call: the spine and the two directions, checked
 * against the contract and the structure that stands; a part the editor owns
 * (editorChoices) is kept as given, whatever the answer says for it. A broken
 * rule is a response error, asked for again with the rule it broke.
 */
export function parseFocusPlan(answer: string, { known, structure, eligibleLevers = [], editorChoices = {}, imageCheck, coverage, maxBeats, clip = false, panorama = false }: {
  known: ReadonlySet<string>; structure: Draft2FocusValues["structure"]; eligibleLevers?: readonly string[]; editorChoices?: Record<string, unknown>;
  /** The carousel is a panorama: the plan's spine must design its scene. */
  panorama?: boolean;
  /** Check Claude's image lines (spineImageProblems): a problem is a response error, asked for again with the rule. The second answer is not checked: its problems go to the editor as notes. */
  imageCheck?: { avoid: readonly string[]; recurring?: string; panorama?: boolean };
  /** The most beats the presentation allows (a panorama's six). */
  maxBeats?: number;
  /** The last answer: a beat's text over its limit is cut at a word instead of failing the step. */
  clip?: boolean;
  /** Check that every important fact has a beat or a guard (spineUnusedFacts): a gap is a response error, asked for again with the rule; the second answer's gaps go to the editor as findings. */
  coverage?: readonly Pick<Draft2Fact, "id" | "importance" | "status" | "claim">[];
}): Draft2FocusPlan {
  let parsed: unknown;
  try { parsed = JSON.parse(answer); } catch { throw new Draft2ResponseError("The plan answer is not valid JSON"); }
  const body = record(parsed);
  const spine = editorChoices.spine ? editorChoices.spine as Draft2FocusSpine : spineFrom(body.spine, structure, known, (message) => { throw new Draft2ResponseError(message); }, { maxBeats, clip });
  if (panorama && !editorChoices.spine && !spine.panorama) throw new Draft2ResponseError("A panorama's spine designs its scene: spine.panorama with its world, device, axis, field, carrier, ending and one station per beat");
  if (imageCheck && !editorChoices.spine) {
    const problems = spineImageProblems(spine.beats, imageCheck);
    if (problems.length) throw new Draft2ResponseError(`The spine's image lines: ${problems.map((problem) => problem.detail).join("; ")}`);
  }
  const direction = typeof editorChoices.direction === "string" ? editorChoices.direction : text(body.direction, FOCUS_DIRECTION_MAX_CHARACTERS);
  const visualDirection = typeof editorChoices.visualDirection === "string" ? editorChoices.visualDirection : text(body.visualDirection, FOCUS_VISUAL_DIRECTION_MAX_CHARACTERS);
  if (!direction) throw new Draft2ResponseError(`The direction is missing or longer than ${FOCUS_DIRECTION_MAX_CHARACTERS} characters`);
  if (!visualDirection) throw new Draft2ResponseError(`The visual direction is missing or longer than ${FOCUS_VISUAL_DIRECTION_MAX_CHARACTERS} characters`);
  const levers = editorChoices.levers ? editorChoices.levers as Draft2FocusLevers : parsePlanLevers(body.levers, { eligible: eligibleLevers, known });
  const guards = parseGuards(body.guards, known);
  if (coverage && !editorChoices.spine) {
    const unused = spineUnusedFacts(spine, guards, coverage);
    if (unused.length) throw new Draft2ResponseError(spineUnusedDetail(unused));
  }
  const given = record(body.reasons);
  const reasons: Partial<Record<Draft2FocusField, string>> = {};
  for (const field of FOCUS_PLAN_FIELDS) {
    const reason = text(given[field], REASON_MAX_CHARACTERS);
    if (reason && !(field in editorChoices)) reasons[field] = reason;
  }
  return { levers, guards, spine, direction, visualDirection, reasons };
}

/** The guards an answer names, the valid ones: a misreading with one or two verified facts, each once, at most two; any other is left out. */
export function parseGuards(value: unknown, known: ReadonlySet<string>): Draft2FocusGuard[] {
  const guards: Draft2FocusGuard[] = [];
  for (const entry of Array.isArray(value) ? value : []) {
    const body = record(entry);
    const misreading = text(body.misreading, FOCUS_GUARD_MAX_CHARACTERS);
    const factIds = knownFactIds(body.factIds, known, FOCUS_GUARD_MAX_FACTS);
    if (misreading && factIds.length && !guards.some((guard) => guard.misreading === misreading)) guards.push({ misreading, factIds });
  }
  return guards.slice(0, FOCUS_MAX_GUARDS);
}

/** The levers, the guards, the spine and the two directions, as the second call writes them from the decision. */
export type Draft2FocusPlan = { levers: Draft2FocusLevers; guards?: Draft2FocusGuard[]; spine: Draft2FocusSpine; direction: string; visualDirection: string; reasons?: Partial<Record<Draft2FocusField, string>> };

/**
 * The focus with its plan: the spine and the directions become Claude's (a
 * part the editor owns stays theirs), their reasons join the decision's, and
 * the directions are no longer stale. Within a decision the version does not
 * move again (the decision moved it); a rewrite the editor asked for does.
 */
export function focusWithPlan(focus: Draft2Focus, plan: Draft2FocusPlan, now: Date, { bump = true, notes }: { bump?: boolean; notes?: string } = {}): Draft2Focus {
  if (!focus.values) throw new Draft2InputError("Decide the focus before rewriting its plan.");
  // A rewrite with the editor's notes starts from the plan as it stands, the editor's changes in it, so the whole new plan is written and becomes Claude's.
  const owned = (field: Draft2FocusField) => !notes && focus.edited.includes(field);
  const written: Partial<Draft2FocusValues> = {
    ...(owned("levers") ? {} : { levers: plan.levers }),
    ...(owned("spine") ? {} : { spine: plan.spine }),
    ...(owned("direction") ? {} : { direction: plan.direction }),
    ...(owned("visualDirection") ? {} : { visualDirection: plan.visualDirection }),
  };
  const reasons = Object.fromEntries(Object.entries(plan.reasons ?? {}).filter(([field]) => !owned(field as Draft2FocusField)));
  // The guards are always Claude's latest: a plan with none leaves none from an earlier one.
  const guarded = (values: Draft2FocusValues): Draft2FocusValues => {
    const next = { ...values };
    delete next.guards;
    return plan.guards?.length ? { ...next, guards: plan.guards } : next;
  };
  return {
    ...focus,
    version: bump ? focus.version + 1 : focus.version,
    values: guarded({ ...focus.values, ...written }),
    ...(focus.ai ? { ai: guarded({ ...focus.ai, levers: plan.levers, spine: plan.spine, direction: plan.direction, visualDirection: plan.visualDirection }) } : {}),
    reasons: { ...focus.reasons, ...reasons },
    staleDirections: false,
    updatedAt: now.toISOString(),
    ...(notes ? {
      edited: focus.edited.filter((field) => !FOCUS_PLAN_FIELDS.includes(field)),
      planNotes: [...(focus.planNotes ?? []), { at: now.toISOString(), text: notes, focusVersion: focus.version }].slice(-FOCUS_PLAN_NOTES_KEPT),
    } : {}),
  };
}

/** Claude's other concepts, the valid ones (a premise with its facts and chain; an arc with its facts and beats), never with a person of the story, at most two. */
function parsePremiseOptions(value: unknown, known: ReadonlySet<string>, people: readonly string[]): Draft2PremiseOption[] {
  const options: Draft2PremiseOption[] = [];
  for (const entry of Array.isArray(value) ? value : []) {
    const body = record(entry);
    const arc = body.arc === undefined ? "discovery" : FOCUS_CONCEPT_ARCS.find((candidate) => candidate === body.arc && candidate !== "classic");
    if (!arc || arc === "classic") continue;
    const premise = arc === "discovery" ? text(body.premise, FOCUS_PREMISE_MAX_CHARACTERS) : "";
    const premiseFactIds = knownFactIds(body.premiseFactIds, known, MAX_PREMISE_FACTS);
    const reveals = revealsOf(body.reveals);
    if ((arc === "discovery" && (!premise || realPersonIn(premise, people))) || !premiseFactIds.length || reveals.length < FOCUS_MIN_REVEALS) continue;
    const key = `${arc}:${premise || reveals.join("|")}`;
    if (options.some((option) => `${option.arc ?? "discovery"}:${option.premise || option.reveals.join("|")}` === key)) continue;
    options.push({ arc, premise: premise ?? "", premiseFactIds, reveals });
  }
  return options.slice(0, MAX_PREMISE_OPTIONS);
}

/** Claude's other anchors, the valid ones (a figure or an object with its words), at most three. */
function parseAnchorAlternatives(value: unknown, known: ReadonlySet<string>, people: readonly string[]): Draft2NarrativeAlternative[] {
  const alternatives: Draft2NarrativeAlternative[] = [];
  for (const entry of Array.isArray(value) ? value : []) {
    const body = record(entry);
    const kind = ALTERNATIVE_KINDS.find((candidate) => candidate === body.kind);
    const anchor = text(body.anchor, FOCUS_ANCHOR_MAX_CHARACTERS);
    if (!kind || !anchor || realPersonIn(anchor, people) || alternatives.some((alternative) => alternative.anchor === anchor)) continue;
    alternatives.push({ kind, anchor, factIds: knownFactIds(body.factIds, known, MAX_ANCHOR_FACTS) });
  }
  return alternatives.slice(0, MAX_ANCHOR_ALTERNATIVES);
}

/** A line of the Topic as the focus keeps it. */
export function focusLine(line: Draft2FocusLineSource): Draft2FocusLine {
  const objective = line.objective.replace(/\s+/g, " ").trim();
  return { id: line.id, revision: line.revision, name: line.name, objective: objective.length > LINE_OBJECTIVE_MAX_CHARACTERS ? `${objective.slice(0, LINE_OBJECTIVE_MAX_CHARACTERS - 1).trimEnd()}…` : objective };
}

/** The editor's fields as Claude receives them: the answer's own shape, so it can keep them exactly. */
export function editorChoicesOf(focus: Pick<Draft2Focus, "values" | "edited" | "lineOptions">): Record<string, unknown> {
  const values = focus.values;
  if (!values) return {};
  const choices: Record<string, unknown> = {};
  for (const field of focus.edited) {
    if (field === "line") {
      // A line archived since the editor chose it is no longer a choice.
      if (values.line && focus.lineOptions.some((line) => line.id === values.line?.id)) choices.lineId = values.line.id;
    } else choices[field] = values[field];
  }
  return choices;
}

/**
 * Claude's answer as the focus's values and reasons. A malformed answer, a
 * value outside the contract or a line the Topic does not have is a response
 * error, never persisted; fact ids that are not verified facts are dropped,
 * and a reader consequence left with none is no consequence. The editor's
 * fields replace whatever the answer says for them; for a structure the
 * editor chose, the items come from Claude when it answered the same kind,
 * which is how a list the editor asked for gets its items.
 */
export function parseFocusDecision(answer: string, { facts, lines, editorChoices = {}, material, narrativeForms }: {
  facts: readonly Draft2Fact[];
  lines: readonly Draft2FocusLine[];
  editorChoices?: Record<string, unknown>;
  /** People and places' material: the brand characters, the people never drawn. */
  material?: Draft2FocusMaterial;
  /** The narrative forms the publication allows; absent: every form. */
  narrativeForms?: readonly Draft2NarrativeForm[];
}): { values: Draft2FocusValues; reasons: Partial<Record<Draft2FocusField, string>>; alternatives: Draft2NarrativeAlternative[]; premiseOptions: Draft2PremiseOption[]; deliberation?: Draft2FocusDeliberation } {
  let parsed: unknown;
  try { parsed = JSON.parse(answer); } catch { throw new Draft2ResponseError("The focus answer is not valid JSON"); }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Draft2ResponseError("The focus answer is not an object");
  const { structure: chosenStructure, readerConsequence: chosenConsequence, narrative: chosenNarrative, concept: chosenConcept, spine: chosenSpine, ...overrides } = editorChoices;
  const body = { ...(parsed as Record<string, unknown>), ...overrides };
  const known = new Set(facts.map((fact) => fact.id));

  const lineId = typeof body.lineId === "string" ? body.lineId.trim() : null;
  const line = lineId ? lines.find((candidate) => candidate.id === lineId) : undefined;
  if (lines.length && !line) throw new Draft2ResponseError(`The focus names an editorial line the Topic does not have (${String(body.lineId)})`);

  const audience = text(body.audience, FOCUS_AUDIENCE_MAX_CHARACTERS);
  // The deliberation: an answer from before it has none; one that deliberates names the interest and compares at least two tellings.
  const deliberates = body.interest !== undefined || body.approaches !== undefined;
  const interest = deliberates ? text(body.interest, FOCUS_INTEREST_MAX_CHARACTERS) : undefined;
  const approaches = (Array.isArray(body.approaches) ? body.approaches : []).flatMap((entry) => { const line = text(entry, FOCUS_APPROACH_MAX_CHARACTERS); return line ? [line] : []; }).slice(0, FOCUS_MAX_APPROACHES);
  if (deliberates && !interest) throw new Draft2ResponseError(`The interest is missing or longer than ${FOCUS_INTEREST_MAX_CHARACTERS} characters: what in these facts would make this audience stop, in one line`);
  if (deliberates && approaches.length < FOCUS_MIN_APPROACHES) throw new Draft2ResponseError(`Compare ${FOCUS_MIN_APPROACHES} to ${FOCUS_MAX_APPROACHES} ways to tell the story in approaches, the classic telling among them, each in at most ${FOCUS_APPROACH_MAX_CHARACTERS} characters`);
  const framing = oneOf(FOCUS_FRAMINGS, body.framing);
  const goal = oneOf(FOCUS_GOALS, body.goal);
  // The directions belong to the plan (the second call); an answer that carries them (the editor's, or an older single call) keeps them within their limits.
  const directionGiven = typeof body.direction === "string" && body.direction.trim().length > 0;
  const visualGiven = typeof body.visualDirection === "string" && body.visualDirection.trim().length > 0;
  const direction = directionGiven ? text(body.direction, FOCUS_DIRECTION_MAX_CHARACTERS) : "";
  const visualDirection = visualGiven ? text(body.visualDirection, FOCUS_VISUAL_DIRECTION_MAX_CHARACTERS) : "";
  const structure = record(body.structure);
  const kind = oneOf(FOCUS_STRUCTURES, structure.kind);
  const voice = record(body.voice);
  const gravity = oneOf(FOCUS_GRAVITIES, voice.gravity);
  if (!audience) throw new Draft2ResponseError(`The focus's audience is missing or longer than ${FOCUS_AUDIENCE_MAX_CHARACTERS} characters`);
  if (directionGiven && direction === undefined) throw new Draft2ResponseError(`The focus's direction is longer than ${FOCUS_DIRECTION_MAX_CHARACTERS} characters`);
  if (visualGiven && visualDirection === undefined) throw new Draft2ResponseError(`The focus's visual direction is longer than ${FOCUS_VISUAL_DIRECTION_MAX_CHARACTERS} characters`);
  if (!framing || !goal || !kind || !gravity) throw new Draft2ResponseError("The focus's framing, goal, structure or gravity is outside the contract");
  if (TONE_KEYS.some((key) => typeof voice[key] !== "number" || !Number.isFinite(voice[key]))) throw new Draft2ResponseError("The focus's voice needs a number for every tone dial");

  const consequence = record(body.readerConsequence);
  const consequenceText = typeof consequence.text === "string" ? consequence.text.trim() : "";
  if (consequenceText.length > FOCUS_CONSEQUENCE_MAX_CHARACTERS) throw new Draft2ResponseError(`The focus's reader consequence is longer than ${FOCUS_CONSEQUENCE_MAX_CHARACTERS} characters`);
  const consequenceFacts = knownFactIds(consequence.factIds, known, MAX_CONSEQUENCE_FACTS);
  const readerConsequence = "readerConsequence" in editorChoices
    ? chosenConsequence as Draft2FocusValues["readerConsequence"]
    : consequenceText && consequenceFacts.length ? { text: consequenceText, factIds: consequenceFacts } : null;
  const answered = { kind, itemFactIds: kind === "arc" ? [] : knownFactIds(structure.itemFactIds, known, FOCUS_MAX_ITEMS) };
  const narrative = parseNarrative(body.narrative, { known, material, editorChoice: chosenNarrative as Draft2FocusNarrative | undefined, forms: narrativeForms });
  const concept = parseConcept(body.concept, { known, material, gravity, editorChoice: chosenConcept as Draft2FocusConcept | undefined });
  const editorStructure = chosenStructure as Draft2FocusValues["structure"] | undefined;
  const finalStructure = editorStructure
    ? { kind: editorStructure.kind, itemFactIds: answered.kind === editorStructure.kind && answered.itemFactIds.length ? answered.itemFactIds : editorStructure.itemFactIds }
    : answered;
  // The spine is checked against the structure that stands (the editor's when they chose one); an answer without one, from before spines, has none.
  const spine = chosenSpine
    ? chosenSpine as Draft2FocusSpine
    : body.spine === undefined ? undefined : spineFrom(body.spine, finalStructure, known, (message) => { throw new Draft2ResponseError(message); });

  const values: Draft2FocusValues = {
    line: line ?? null,
    audience,
    framing,
    readerConsequence,
    structure: finalStructure,
    goal,
    voice: { gravity, ...Object.fromEntries(TONE_KEYS.map((key) => [key, toneValue(voice[key])])) } as Draft2FocusVoice,
    direction: direction ?? "",
    concept,
    narrative,
    ...(spine ? { spine } : {}),
    ...(visualDirection ? { visualDirection } : {}),
    ...(interest ? { interest } : {}),
  };
  const given = record((parsed as Record<string, unknown>).reasons);
  const chosen = new Set(Object.keys(editorChoices).map((key) => key === "lineId" ? "line" : key));
  const reasons: Partial<Record<Draft2FocusField, string>> = {};
  // The editor's own fields (how the carousel is made) are never Claude's: no reason of Claude's stands for them.
  for (const field of FOCUS_FIELDS) {
    if (FOCUS_EDITOR_FIELDS.includes(field)) continue;
    const reason = text(given[field], REASON_MAX_CHARACTERS);
    if (reason && !chosen.has(field)) reasons[field] = reason;
  }
  return {
    values, reasons,
    alternatives: parseAnchorAlternatives((parsed as Record<string, unknown>).anchorAlternatives, known, material?.people ?? []),
    premiseOptions: parsePremiseOptions((parsed as Record<string, unknown>).conceptAlternatives, known, material?.people ?? []),
    ...(interest ? { deliberation: { interest, approaches } } : {}),
  };
}

/**
 * The focus after a decision: Claude's values with the editor's fields kept,
 * Claude's own values under them, one version more. For an edited field,
 * Claude's earlier value stays the one the field can go back to.
 */
export function decidedFocus(focus: Draft2Focus, decision: { values: Draft2FocusValues; reasons: Partial<Record<Draft2FocusField, string>>; alternatives?: Draft2NarrativeAlternative[]; premiseOptions?: Draft2PremiseOption[]; deliberation?: Draft2FocusDeliberation }, decidedBy: Draft2FocusRole, now: Date): Draft2Focus {
  const edited = focus.edited.filter((field) => field !== "line" || decision.values.line?.id === focus.values?.line?.id);
  // Claude's own values, field by field, plus the interest it found (not a field the editor edits, always Claude's latest).
  // A field the decision leaves to the plan (the levers, until the plan answers) has no value yet: no key, as the stored row would have.
  const ai = {
    ...Object.fromEntries(FOCUS_FIELDS.flatMap((field) => { const value = edited.includes(field) && focus.ai ? focus.ai[field] : decision.values[field]; return value === undefined ? [] : [[field, value]]; })),
    ...(decision.values.interest ? { interest: decision.values.interest } : {}),
  } as Draft2FocusValues;
  // A decision that keeps the editor's spine keeps the plan written for it (lever, guards, directions) until the plan runs again, and marks
  // it stale: never an empty direction and no lever under a spine the Opening would follow (the coffee ring, 2026-10-17). A decision that
  // leaves the spine to the plan leaves the plan too.
  const keptSpine = edited.includes("spine") && Boolean(decision.values.spine);
  const carried = keptSpine && focus.values
    ? Object.fromEntries((["levers", "guards", "direction", "visualDirection"] as const).flatMap((key) => {
      const given = decision.values[key];
      const previous = focus.values![key];
      return (given === undefined || given === "") && previous !== undefined && previous !== "" ? [[key, previous]] : [];
    }))
    : {};
  const planOwned = (["levers", "direction", "visualDirection"] as const).every((field) => edited.includes(field));
  return {
    ...focus,
    status: "ready",
    version: focus.version + 1,
    // The editor's choices on how the carousel is made are never Claude's to decide: a decision keeps them.
    values: { ...decision.values, ...carried, ...Object.fromEntries(FOCUS_EDITOR_FIELDS.flatMap((field) => focus.values?.[field] !== undefined ? [[field, focus.values[field]]] : [])) },
    ai,
    reasons: decision.reasons,
    edited,
    narrativeOptions: decision.alternatives ?? [],
    narrativeReview: undefined,
    conceptOptions: decision.premiseOptions ?? [],
    conceptReview: undefined,
    deliberation: decision.deliberation,
    decidedBy,
    decidedAt: now.toISOString(),
    updatedAt: now.toISOString(),
    error: undefined,
    staleDirections: keptSpine && !planOwned,
  };
}

const sameValue = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
/** A spine's shape: its beats' slides and roles, in order. */
const spineShape = (spine: Pick<Draft2FocusSpine, "beats">) => spine.beats.map((beat) => `${beat.slide}:${beat.role}`).join(" ");

/** The editor's value for a field, checked against the contract; a value that does not fit is an input error. */
function editedValue(focus: Draft2Focus, field: Draft2FocusField, value: unknown): Draft2FocusValues[Draft2FocusField] {
  const values = focus.values!;
  const plain = (max: number, label: string, { empty = false } = {}) => {
    if (typeof value !== "string" || value.trim().length > max || (!empty && !value.trim())) throw new Draft2InputError(`The ${label} needs ${empty ? "at most" : "1 to"} ${max.toLocaleString("en-CA")} characters.`);
    return value.trim();
  };
  switch (field) {
    case "line": {
      if (value === null && !focus.lineOptions.length) return null;
      const line = focus.lineOptions.find((candidate) => candidate.id === value);
      if (!line) throw new Draft2InputError("Choose one of the Topic's editorial lines.");
      return line;
    }
    case "audience": return plain(FOCUS_AUDIENCE_MAX_CHARACTERS, "audience");
    case "direction": return plain(FOCUS_DIRECTION_MAX_CHARACTERS, "direction");
    case "visualDirection": return plain(FOCUS_VISUAL_DIRECTION_MAX_CHARACTERS, "visual direction");
    case "readerConsequence": {
      const words = plain(FOCUS_CONSEQUENCE_MAX_CHARACTERS, "reader consequence", { empty: true });
      if (!words) return null;
      // Unchanged words keep the facts they cite; the editor's own words cite none.
      return words === values.readerConsequence?.text ? values.readerConsequence : { text: words, factIds: [] };
    }
    case "framing": {
      const framing = oneOf(FOCUS_FRAMINGS, value);
      if (!framing) throw new Draft2InputError(`The framing is one of ${FOCUS_FRAMINGS.join(", ")}.`);
      return framing;
    }
    case "goal": {
      const goal = oneOf(FOCUS_GOALS, value);
      if (!goal) throw new Draft2InputError(`The goal is one of ${FOCUS_GOALS.join(", ")}.`);
      return goal;
    }
    case "structure": {
      const kind = oneOf(FOCUS_STRUCTURES, value);
      if (!kind) throw new Draft2InputError(`The structure is one of ${FOCUS_STRUCTURES.join(", ")}.`);
      if (kind === "arc") return { kind, itemFactIds: [] };
      // The items Claude found for this kind, when it found any; otherwise Claude picks them when it decides again.
      const found = [values.structure, focus.ai?.structure].find((structure) => structure?.kind === kind);
      return { kind, itemFactIds: found?.itemFactIds ?? [] };
    }
    case "narrative": return editedNarrative(focus, value);
    case "concept": return editedConcept(focus, value);
    case "spine": return spineFrom(value, values.structure, undefined, (message) => { throw new Draft2InputError(`${message}.`); }, { maxBeats: presentationMaxBeats(values) });
    case "levers": return editedLevers(value, values.levers);
    case "textMode": {
      const mode = oneOf(FOCUS_TEXT_MODES, value);
      if (!mode) throw new Draft2InputError(`Who sets the words is one of ${FOCUS_TEXT_MODES.join(", ")}.`);
      if (mode === "image" && focusPresentation(values).images === "panorama") throw new Draft2InputError("A panorama's words are set by the program: choose one image per slide first to have them drawn in the image.");
      return mode;
    }
    case "imageMode": {
      const mode = oneOf(FOCUS_IMAGE_MODES, value);
      if (!mode) throw new Draft2InputError(`The images are one of ${FOCUS_IMAGE_MODES.join(", ")}.`);
      return mode;
    }
    case "voice": {
      const voice = record(value);
      const gravity = oneOf(FOCUS_GRAVITIES, voice.gravity);
      if (!gravity) throw new Draft2InputError(`The gravity is one of ${FOCUS_GRAVITIES.join(", ")}.`);
      if (TONE_KEYS.some((key) => !Number.isInteger(voice[key]) || Number(voice[key]) < 1 || Number(voice[key]) > 100)) throw new Draft2InputError("Each tone dial is a whole number from 1 to 100.");
      return { gravity, ...Object.fromEntries(TONE_KEYS.map((key) => [key, Number(voice[key])])) } as Draft2FocusVoice;
    }
  }
}

/**
 * The editor's narrative form, checked against the contract. Classic needs
 * nothing more; a guide is one of the brand's characters (by id) or a figure
 * in the editor's words; an object needs its words. An anchor Claude found
 * (its choice, an alternative, or the proposal the judge sent back) keeps the
 * facts it cites; the editor's own words cite none.
 */
function editedNarrative(focus: Draft2Focus, value: unknown): Draft2FocusNarrative {
  const body = record(value);
  const form = oneOf(FOCUS_NARRATIVE_FORMS, body.form);
  if (!form) throw new Draft2InputError(`The narrative form is one of ${FOCUS_NARRATIVE_FORMS.join(", ")}.`);
  if (form === "classic") return CLASSIC_NARRATIVE;
  if (focus.narrativeForms && !focus.narrativeForms.includes(form)) throw new Draft2InputError(`This publication does not tell its stories as ${form}: turn the form on in its creative profile first.`);
  const kind = oneOf(FOCUS_ANCHOR_KINDS, body.anchorKind);
  if (!kind || !NARRATIVE_ANCHOR_KINDS[form].includes(kind)) {
    throw new Draft2InputError(form === "character-guide" ? "A guide is one of the brand's characters or a figure you describe." : `A ${form === "traveling-object" ? "traveling object" : form === "panorama" ? "panorama" : "line to follow"} needs its ${anchorNoun({ form })}.`);
  }
  const anchor = typeof body.anchor === "string" ? body.anchor.trim() : "";
  if (!anchor || anchor.length > FOCUS_ANCHOR_MAX_CHARACTERS) throw new Draft2InputError(`Say what the ${anchorNoun({ form })} is in 1 to ${FOCUS_ANCHOR_MAX_CHARACTERS} characters.`);
  const characterId = kind === "character" && typeof body.characterId === "string" && body.characterId.trim() ? body.characterId.trim() : null;
  if (kind === "character" && !characterId) throw new Draft2InputError("Choose one of the brand's characters.");
  const progression = typeof body.progression === "string" ? body.progression.trim() : "";
  if (progression.length > FOCUS_PROGRESSION_MAX_CHARACTERS) throw new Draft2InputError(`Say what changes from slide to slide in at most ${FOCUS_PROGRESSION_MAX_CHARACTERS} characters.`);
  const ending = oneOf(FOCUS_NARRATIVE_ENDINGS, body.ending) ?? "resolves";
  const found = kind === "character" ? undefined : [focus.values?.narrative, focus.ai?.narrative, focus.narrativeReview?.proposed]
    .map((narrative) => narrative && narrative.anchorKind === kind && narrative.anchor === anchor ? narrative.anchorFactIds : undefined)
    .concat((focus.narrativeOptions ?? []).map((option) => option.kind === kind && option.anchor === anchor ? option.factIds : undefined))
    .find((factIds) => factIds !== undefined);
  return { form, anchorKind: kind, characterId, anchor, anchorFactIds: found ?? [], progression, ending };
}

/**
 * The editor's concept, checked against the contract. Classic needs nothing;
 * discovery needs its premise; another arc takes no premise. The reveals or
 * beats are optional (the writers order them when there are none). A concept
 * Claude wrote (its choice, another of its concepts, or the one the judge
 * sent back) keeps the facts it cites; the editor's own words cite none.
 */
function editedConcept(focus: Draft2Focus, value: unknown): Draft2FocusConcept {
  const body = record(value);
  const arc = oneOf(FOCUS_CONCEPT_ARCS, body.arc);
  if (!arc) throw new Draft2InputError(`The concept is one of ${FOCUS_CONCEPT_ARCS.join(", ")}.`);
  if (arc === "classic") return CLASSIC_CONCEPT;
  const premise = arc === "discovery" && typeof body.premise === "string" ? body.premise.trim() : "";
  if (arc === "discovery" && (!premise || premise.length > FOCUS_PREMISE_MAX_CHARACTERS)) throw new Draft2InputError(`Write the premise in 1 to ${FOCUS_PREMISE_MAX_CHARACTERS} characters.`);
  const lines = (Array.isArray(body.reveals) ? body.reveals : []).map((entry) => typeof entry === "string" ? entry.trim() : "").filter(Boolean);
  if (lines.length > FOCUS_MAX_REVEALS || lines.some((line) => line.length > FOCUS_REVEAL_MAX_CHARACTERS)) {
    throw new Draft2InputError(`The ${arc === "discovery" ? "discovery chain has at most" : "arc has at most"} ${FOCUS_MAX_REVEALS} ${arc === "discovery" ? "reveals" : "beats"} of at most ${FOCUS_REVEAL_MAX_CHARACTERS} characters each.`);
  }
  const same = (entry: { arc?: Draft2ConceptArc; premise: string; reveals: string[] } | undefined) => Boolean(entry) && (entry!.arc ?? "discovery") === arc
    && (arc === "discovery" ? entry!.premise === premise : entry!.reveals.join("\n") === lines.join("\n"));
  const found = [focus.values?.concept, focus.ai?.concept, focus.conceptReview?.proposed, ...(focus.conceptOptions ?? [])].find(same);
  return { arc, premise, premiseFactIds: found?.premiseFactIds ?? [], reveals: lines };
}

/**
 * The focus after the editor set one field. A value equal to Claude's gives
 * the field back to Claude; any other becomes the editor's, which Claude
 * keeps when it decides again. An unchanged value changes nothing.
 */
export function applyFocusEdit(focus: Draft2Focus, field: Draft2FocusField, value: unknown, now: Date): Draft2Focus {
  if (!focus.values) throw new Draft2InputError("Decide the focus before changing it.");
  const next = editedValue(focus, field, value);
  if (sameValue(next, focus.values[field])) return focus;
  const backToClaude = focus.ai && sameValue(next, focus.ai[field]);
  const edited = backToClaude ? focus.edited.filter((entry) => entry !== field) : [...new Set([...focus.edited, field])];
  // Beats edited by hand that keep their slides and roles (a fact placed, a scene or an image line rewritten) are the same telling: the
  // directions stand. Beats added, removed or given other roles tell another story.
  const sameShape = field === "spine" && focus.values.spine && spineShape(focus.values.spine) === spineShape(next as Draft2FocusSpine);
  // A change to how the story is told leaves the directions written for the earlier telling, unless the editor owns both; a direction the editor writes is theirs and never stale.
  const staleDirections = FOCUS_TELLING_FIELDS.includes(field) && !sameShape
    ? !(edited.includes("direction") && edited.includes("visualDirection"))
    : field === "direction" || field === "visualDirection" ? false : focus.staleDirections;
  return {
    ...focus,
    version: focus.version + 1,
    values: { ...focus.values, [field]: next },
    edited,
    updatedAt: now.toISOString(),
    ...(staleDirections !== undefined ? { staleDirections } : {}),
  };
}

/** The focus with one of the editor's fields given back to Claude's value. */
export function resetFocusField(focus: Draft2Focus, field: Draft2FocusField, now: Date): Draft2Focus {
  if (!focus.values || !focus.ai) throw new Draft2InputError("Decide the focus before changing it.");
  if (!focus.edited.includes(field)) return focus;
  return {
    ...focus,
    version: focus.version + 1,
    values: { ...focus.values, [field]: focus.ai[field] },
    edited: focus.edited.filter((entry) => entry !== field),
    updatedAt: now.toISOString(),
  };
}

/**
 * The program's findings on a focus. Any one keeps the Opening from starting
 * until the editor fixes it or Claude decides again. With People and places'
 * material, the narrative's anchor is checked too: a brand character that is
 * no longer available, or a real person of the story as the anchor.
 */
export function focusFindings(values: Draft2FocusValues, material?: Draft2FocusMaterial, facts?: readonly Pick<Draft2Fact, "id" | "importance" | "status" | "claim">[]): Draft2FocusFinding[] {
  const findings: Draft2FocusFinding[] = [];
  // Every fact the story depends on has a beat or a guard; the Opening waits until it does (the editor can add it to a beat by hand).
  if (values.spine && facts) {
    const unused = spineUnusedFacts(values.spine, values.guards ?? [], facts);
    if (unused.length) findings.push({ field: "spine", code: "SPINE_FACT_UNUSED", detail: spineUnusedDetail(unused) });
  }
  if (values.framing === "reader-consequence" && !values.readerConsequence?.text) {
    findings.push({ field: "readerConsequence", code: "NO_READER_CONSEQUENCE", detail: "The framing leads with the reader consequence, and the focus has none: write it, choose another framing, or decide again." });
  }
  const { kind, itemFactIds } = values.structure;
  const minimum = kind === "list" ? FOCUS_LIST_MIN_ITEMS : kind === "steps" ? FOCUS_STEPS_MIN_ITEMS : 0;
  if (itemFactIds.length < minimum) {
    findings.push({ field: "structure", code: "TOO_FEW_ITEMS", detail: `A ${kind === "list" ? "list" : "procedure"} needs at least ${minimum} ${kind === "list" ? "items" : "steps"} from the facts, and the focus names ${itemFactIds.length}: decide again for Claude to find them, or choose another structure.` });
  }
  const concept = focusConcept(values);
  if (concept.arc === "discovery") {
    if (!PLAYFUL_GRAVITIES.includes(values.voice.gravity)) {
      findings.push({ field: "concept", code: "CONCEPT_GRAVITY", detail: `The story's gravity is ${values.voice.gravity}: a discovery premise would play with it. Tell it classic, or change the gravity.` });
    }
    const person = material ? realPersonIn(concept.premise, material.people) : undefined;
    if (person) findings.push({ field: "concept", code: "CONCEPT_REAL_PERSON", detail: `${person} is a real person of the story: never a voice or a character of the premise. Write another premise.` });
  }
  const narrative = focusNarrative(values);
  if (narrative.form !== "classic" && material) {
    if (narrative.anchorKind === "character" && !material.characters.some((character) => character.id === narrative.characterId)) {
      findings.push({ field: "narrative", code: "NARRATIVE_CHARACTER_UNAVAILABLE", detail: material.characterChoice === "off"
        ? `${narrative.anchor} guides the carousel, and the brand's characters are off in People and places: turn them on there, or choose another guide.`
        : `${narrative.anchor} is no longer one of the brand's characters with a reference image: choose another guide.` });
    }
    const person = narrative.anchorKind === "character" ? undefined : realPersonIn(narrative.anchor, material.people);
    if (person) findings.push({ field: "narrative", code: "NARRATIVE_REAL_PERSON", detail: `${person} is a real person of the story: they appear only in a verified documentary photo, never drawn as the ${anchorNoun(narrative)}. Choose another anchor.` });
  }
  // A spine written for another structure (an arc's penultimate on a list, too few middle beats) no longer fits the slides the steps will write.
  const shape = values.spine ? spineShapeProblem(values.spine.beats, values.structure, { maxBeats: presentationMaxBeats(values) }) : undefined;
  if (shape) findings.push({ field: "spine", code: "SPINE_SHAPE", detail: `${shape}: decide again for Claude to rewrite the spine for this structure, or edit the beats.` });
  // Caveats are not content (2026-10-22): in a list or a procedure, a plan whose beats order conditions (a check, the box office, the weather, a purchase)
  // writes the slides the program then refuses; the Saint-Jean weekend spine ordered them on five beats of seven. The items' practical lines carry them.
  if (values.spine && values.structure.kind !== "arc") {
    let middle = 0;
    const planned = values.spine.beats.flatMap((beat) => {
      const name = beat.slide === "middle" ? `middle ${++middle}` : beat.slide;
      const caveat = caveatsIn(beat.words)[0] ?? (beat.slide === "cover" ? choreIn(beat.words) : undefined);
      return caveat ? [`${name} ("${caveat}")`] : [];
    });
    if (planned.length) findings.push({ field: "spine", code: "SPINE_CAVEATS", detail: `The spine plans conditions instead of what the reader does or sees: ${planned.join(", ")}. In a ${values.structure.kind === "list" ? "list" : "procedure"} each item's practical line carries its own days, price and reservation; the cover sells the items and the closing ends on the choice. Rewrite the plan, or edit these beats.` });
    // A guard that generalizes over the items ("les cinq sorties sont gratuites", "chaque sortie…") names the items' differences, which their own slides carry: it is no guard.
    const generalizing = (values.guards ?? []).filter((guard) => /(?<![\p{L}])(chaque|chacune?|toutes?|tous|les (?:cinq|quatre|trois|six|sept|huit|neuf|dix)|every|each|all|cada|tod[oa]s|las (?:cinco|cuatro|tres|seis|siete|ocho|nueve|diez))(?![\p{L}])/iu.test(guard.misreading));
    if (generalizing.length) findings.push({ field: "spine", code: "SPINE_GUARD_ITEMS", detail: `${generalizing.map((guard) => `"${guard.misreading}"`).join(" and ")} ${generalizing.length === 1 ? "generalizes" : "generalize"} over the items: their differences are no guard, each item's slide carries its own details. Rewrite the plan without ${generalizing.length === 1 ? "it" : "them"}.` });
  }
  return findings;
}

/** How many items or steps a focus promises; undefined for an arc. The Opening counts it as a stated number. */
export const focusItemCount = (values: Draft2FocusValues): number | undefined => values.structure.kind === "arc" ? undefined : values.structure.itemFactIds.length;

/** The focus as the Opening's models read it: what each value means, dials with their words. */
export function focusForModels(values: Draft2FocusValues) {
  const { line, readerConsequence, structure, voice } = values;
  const presentation = focusPresentation(values);
  return {
    // How the carousel is made, when it is not one image per slide with its words drawn in it: the spine and the visual script plan for it.
    ...(presentation.text !== "image" || presentation.images !== "slides" ? { presentation } : {}),
    ...(line ? { line: { name: line.name, objective: line.objective } } : {}),
    ...(values.interest ? { interest: values.interest } : {}),
    audience: values.audience,
    framing: values.framing,
    readerConsequence: readerConsequence
      ? { text: readerConsequence.text, ...(readerConsequence.factIds.length ? { factIds: readerConsequence.factIds } : { note: "the editor's words: guidance, not a fact" }) }
      : null,
    structure: structure.kind === "arc" ? { kind: "arc" } : { kind: structure.kind, items: structure.itemFactIds.length, itemFactIds: structure.itemFactIds },
    goal: values.goal,
    voice: { gravity: voice.gravity, tone: toneLine(voice) },
    ...(focusConcept(values).arc !== "classic" ? { concept: conceptForModels(focusConcept(values)) } : {}),
    ...(focusNarrative(values).form !== "classic" ? { narrative: narrativeForModels(focusNarrative(values), structure, Boolean(values.visualDirection)) } : {}),
    ...(values.levers ? { levers: leversForModels(values.levers) } : {}),
    ...(values.guards?.length ? { guards: values.guards.map(({ misreading, factIds }) => ({ misreading, factIds })) } : {}),
    ...(values.spine ? { spine: spineForModels(values.spine) } : {}),
    ...(values.spine?.panorama ? { panorama: panoramaForModels(values.spine.panorama) } : {}),
    direction: values.direction,
    ...(values.visualDirection ? { visualDirection: values.visualDirection } : {}),
  };
}

/** The spine as the models read it: each beat with its slide, role, scene, the words' job, what the image adds, what it withholds and its facts, and its station in a panorama's scene. */
export function spineForModels(spine: Draft2FocusSpine) {
  return spine.beats.map(({ slide, role, scene, words, image, subject, withholds, factIds }, index) => ({
    slide, role, scene, words, image,
    ...(subject ? { subject } : {}),
    ...(withholds ? { withholds } : {}),
    ...(factIds.length ? { factIds } : {}),
    ...(spine.panorama?.stations[index] ? { station: spine.panorama.stations[index] } : {}),
  }));
}

/** A panorama's scene as the models read it (focus.panorama): the world, the device and its axis, the field, the carrier and the ending; the stations are on the beats. */
export function panoramaForModels(panorama: Draft2SpinePanorama) {
  const { stations, ...scene } = panorama;
  void stations;
  return scene;
}

/** A concept as the models read it: a discovery's premise, the facts it dramatizes and its chain of reveals; another arc's facts and beats. */
export function conceptForModels(concept: Draft2FocusConcept) {
  if (concept.arc !== "discovery") {
    return {
      arc: concept.arc,
      ...(concept.premiseFactIds.length ? { factIds: concept.premiseFactIds } : { note: "the editor's beats: they order the facts, they add none" }),
      ...(concept.reveals.length ? { beats: concept.reveals } : {}),
    };
  }
  return {
    arc: concept.arc,
    premise: concept.premise,
    ...(concept.premiseFactIds.length ? { premiseFactIds: concept.premiseFactIds } : { note: "the editor's premise: it dramatizes the facts, it adds none" }),
    ...(concept.reveals.length ? { reveals: concept.reveals } : {}),
  };
}

/**
 * A narrative form as the models read it: the form, what stays and what
 * changes, how it ends. The progression is never missing: when the editor
 * chose the form without one (their edit may leave it empty), the structure
 * gives it, so the writers and the judges measure the same steps. When the
 * focus also has a visualDirection, the models are told the anchor replaces
 * any other recurring element it names (the direction was written before the
 * form, or without it).
 */
export function narrativeForModels(narrative: Draft2FocusNarrative, structure?: Draft2FocusValues["structure"], withVisualDirection = false) {
  return {
    form: narrative.form,
    anchor: {
      kind: narrative.anchorKind,
      what: narrative.anchor,
      ...(narrative.characterId ? { characterId: narrative.characterId } : {}),
      ...(narrative.anchorFactIds.length ? { factIds: narrative.anchorFactIds } : narrative.anchorKind === "character" ? {} : { note: "not from the facts: it stands for nothing the facts do not say" }),
    },
    progression: narrative.progression || defaultProgression(narrative, structure),
    ...(withVisualDirection ? { recurs: "the anchor is what recurs across the images; it replaces any other recurring element visualDirection names" } : {}),
    ending: narrative.ending,
  };
}

/** What changes from slide to slide when the editor named none: a list's items or a procedure's steps, one per slide; otherwise one step of the anchor's way from the cover to the ending. */
function defaultProgression(narrative: Draft2FocusNarrative, structure?: Draft2FocusValues["structure"]): string {
  const anchor = narrative.anchorKind === "scene" ? "the scene" : narrative.anchorKind === "line" ? "the line" : "the anchor";
  if (structure?.kind === "list") return `one item per slide, in the list's order: ${anchor} meets each in turn, in a new state each time`;
  if (structure?.kind === "steps") return `one step per slide, in order: ${anchor} takes each step, in a new state each time`;
  return `one step per slide, from ${anchor}'s first state on the cover to the ending; the writers order the steps so that each makes the next wanted`;
}

/** The judge's answer on a narrative form. */
export const DRAFT2_NARRATIVE_REVIEW_SCHEMA: Record<string, unknown> = {
  type: "object",
  properties: { verdict: { type: "string", enum: ["keep", "classic"] }, reason: { type: "string" } },
  required: ["verdict", "reason"],
  additionalProperties: false,
};

/** The judge's answer as a verdict and a reason; anything else is a response error. */
export function parseNarrativeReview(answer: string): { verdict: "keep" | "classic"; reason: string } {
  let parsed: unknown;
  try { parsed = JSON.parse(answer); } catch { throw new Draft2ResponseError("The narrative review is not valid JSON"); }
  const body = record(parsed);
  const verdict = body.verdict === "keep" || body.verdict === "classic" ? body.verdict : undefined;
  const reason = text(body.reason, REASON_MAX_CHARACTERS);
  if (!verdict || !reason) throw new Draft2ResponseError("The narrative review needs a verdict (keep or classic) and a reason");
  return { verdict, reason };
}

/** What the judge receives to review a premise, beside its instructions and the verified facts. */
export function conceptReviewRequest({ values, material, title }: { values: Draft2FocusValues; material: Draft2FocusMaterial; title: string }) {
  return { task: "concept-review", story: { title }, focus: focusForModels(values), material };
}

/** What the judge receives to review a narrative form, beside its instructions and the verified facts. */
export function narrativeReviewRequest({ values, material, title }: { values: Draft2FocusValues; material: Draft2FocusMaterial; title: string }) {
  return { task: "narrative-review", story: { title }, focus: focusForModels(values), material };
}

/** The profile's structure setting in the focus's terms; "auto" leaves the choice to Claude. */
const PROFILE_STRUCTURE: Record<NonNullable<CreativeProfile["storyStructure"]>, Draft2FocusStructureKind | "auto"> = { auto: "auto", "hook-steps": "steps", "hook-list": "list" };

/**
 * What Claude receives to decide the focus, beside the instructions (the
 * skill and the brand brief, which carry the audience and the tone defaults)
 * and the verified facts.
 */
export function focusDecisionRequest({ title, today, profile, lines, foundBy, editorChoices = {}, material }: {
  title: string;
  today: string;
  profile: Pick<CreativeProfile, "framingStrategy" | "storyStructure" | "conversionGoal" | "narrativeForms">;
  lines: readonly Draft2FocusLineSource[];
  /** The lines whose collection runs found the story, newest first. */
  foundBy: readonly string[];
  editorChoices?: Record<string, unknown>;
  /** People and places' material, for the narrative form. */
  material?: Draft2FocusMaterial;
}) {
  return {
    task: "focus",
    story: { title },
    today,
    topicDefaults: { framing: profile.framingStrategy, structure: PROFILE_STRUCTURE[profile.storyStructure ?? "auto"], goal: profile.conversionGoal },
    lines: lines.map((line) => ({ id: line.id, name: line.name, objective: focusLine(line).objective, ...(line.themes.length ? { themes: line.themes } : {}) })),
    ...(foundBy.length ? { foundBy } : {}),
    ...(material ? { material } : {}),
    ...(profile.narrativeForms ? { narrativeForms: { allowed: profile.narrativeForms, note: "The only narrative forms this publication tells its stories in: choose one of them." } } : {}),
    ...(Object.keys(editorChoices).length ? { editorChoices } : {}),
  };
}

/** Today's date where the publication works (the timezone of a line that found the story), so dates in the facts read as past or upcoming. */
export function focusToday(timezone: string | undefined, now: Date): string {
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone: timezone || "UTC", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  } catch {
    return now.toISOString().slice(0, 10);
  }
}
