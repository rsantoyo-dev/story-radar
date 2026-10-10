import { comparableText } from "./draft2-facts.types";
import type { Draft2FocusSnapshot } from "./draft2-focus.types";
import {
  funnelEvaluationSchema, funnelExploreRequest, funnelJudgeRequest, funnelParseCandidates, funnelParseEvaluation, funnelRecord, funnelRefineRequest,
  funnelText, headlineKey,
  type FunnelCandidate, type FunnelEvaluation, type FunnelGate, type FunnelIssue, type FunnelPlanRound, type FunnelRegression, type FunnelRole,
  type FunnelRound, type FunnelRun, type FunnelScore, type FunnelVersion, type FunnelWords,
} from "./draft2-funnel";
import { entityMaterial, type Draft2CharacterChoice, type Draft2Inventory } from "./draft2-inventory.types";
import type { Draft2ClosingOpening } from "./draft2-closing.types";
import type { Draft2DeckCandidate, Draft2DeckClosing } from "./draft2-deck.types";

/**
 * Visual script, the Draft 2 step after the deck and the people-and-places
 * inventory: the carousel's images written as one visual story. Each
 * candidate is a whole script: a concept, a recurring cast, a motif that
 * evolves, whether the brand's character narrates, and for each slide the
 * beat its image adds (never its words again), a reproducible art direction,
 * the kind of image and the verified material or characters it uses. On the
 * shared funnel (draft2-funnel.ts), Claude writes and Sol judges:
 *   3 scripts → Sol scores, proposes 1 → 2 revised + 1 original + 1 edit → Sol's pick
 *   (2 scripts, then 1 revised, for a carousel of more than 10 slides).
 * The output keeps v1's slide contract (visualDirection, visualNeed,
 * characterIds, references) so a later image step can reuse v1's generator.
 * Everything here is pure: contracts, schemas, parsing, the mechanical
 * checks and the requests.
 */
export const VISUAL_CANDIDATES = 3;
export const VISUAL_LONG_CANDIDATES = 2;
/** A carousel longer than this explores two scripts: each script carries one direction per slide. */
export const VISUAL_LONG_CAROUSEL = 10;
export const VISUAL_PLAN: readonly FunnelPlanRound[] = [
  { revise: 0, fresh: VISUAL_CANDIDATES, proposals: 1, effort: "medium" },
  { revise: 2, fresh: 0, proposals: 0 },
];
export const VISUAL_LONG_PLAN: readonly FunnelPlanRound[] = [
  { revise: 0, fresh: VISUAL_LONG_CANDIDATES, proposals: 1, effort: "medium" },
  { revise: 1, fresh: 0, proposals: 0 },
];
export const VISUAL_MAX_ROUNDS = 2;
export const VISUAL_ACCEPT_SCORE = 95;
export const VISUAL_CRITERION_FLOOR = 85;
export const VISUAL_DIRECTION_MAX_CHARACTERS = 700;
export const VISUAL_DIRECTION_MIN_CHARACTERS = 60;
export const VISUAL_BEAT_MAX_CHARACTERS = 200;
const CONCEPT_MAX_CHARACTERS = 300;
const MOTIF_MAX_CHARACTERS = 300;
const CAST_MAX_CHARACTERS = 400;
const ROLE_MAX_CHARACTERS = 200;
export const VISUAL_MAX_CHARACTERS_PER_SLIDE = 2;
/** v1's kinds of slide image (creative-visual-need.ts), so a later image step routes each slide as v1 does. */
export const VISUAL_NEEDS = ["generic-illustration", "character-reference", "real-photo", "verified-map", "typography"] as const;

export const VISUAL_CRITERIA = ["narrative", "continuity", "brand", "truth", "fit", "craft", "focus"] as const;
export const VISUAL_MECHANICAL_CODES = [
  "SLIDE_ORDER", "DIRECTION_TOO_LONG", "DIRECTION_TOO_SHORT", "BEAT_MISSING", "CHARACTER_UNKNOWN", "CHARACTER_OFF_PLAN", "CHARACTER_CHOICE",
  "TOO_MANY_CHARACTERS", "REFERENCE_UNKNOWN", "NEED_MISMATCH", "STRICT_MODE", "COVER_TYPOGRAPHY", "UNVERIFIED_PERSON", "UNVERIFIED_PLACE",
  "ORGANIZATION_NAMED", "AVOID_TERM", "FORBIDDEN_ELEMENT", "DUPLICATE_CANDIDATE",
] as const;
export const VISUAL_JUDGE_CODES = ["ILLUSTRATES_TEXT", "BREAKS_CONTINUITY", "OFF_BRAND", "LOOKS_AI", "CONTRADICTS_FACTS", "CROWDS_TEXT", "VAGUE", "CHARACTER_MISUSED", "OFF_FOCUS", "OTHER"] as const;
export const VISUAL_ISSUE_CODES = [...VISUAL_MECHANICAL_CODES, ...VISUAL_JUDGE_CODES] as const;
export const VISUAL_GATE: FunnelGate = { criteria: VISUAL_CRITERIA, accept: VISUAL_ACCEPT_SCORE, floor: VISUAL_CRITERION_FLOOR };

export type Draft2VisualCriterion = (typeof VISUAL_CRITERIA)[number];
export type Draft2VisualIssueCode = (typeof VISUAL_ISSUE_CODES)[number];
export type Draft2VisualNeed = (typeof VISUAL_NEEDS)[number];
/** The creative profile's visual mode: what may be generated. */
export type Draft2VisualMode = "illustration-editorial" | "verified-references" | "photo-required";

/** One slide of the carousel as the visual script reads it: where it is and the words it carries. */
export type Draft2CarouselSlide = { slide: string; label: string; headline: string; text: string; practical?: string; cta?: string; factIds: string[] };
/** A brand character the script may cast (one with a reference image). */
export type Draft2VisualCharacter = { id: string; name: string; description: string };

export type Draft2VisualSlide = {
  /** The carousel position: cover, slide2, s1… (the deck's slides), penultimate, last. */
  slide: string;
  /** What this image adds to the visual story; never the slide's words again. */
  beat: string;
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
  /** The visual thread that evolves across the slides. */
  motif: string;
  /** Who and what recurs, described the same way every time. */
  cast: string;
  characterPlan: { use: boolean; characterIds: string[]; role: string };
  slides: Draft2VisualSlide[];
};
export type Draft2VisualIssue = FunnelIssue & { code: Draft2VisualIssueCode };
export type Draft2VisualScore = FunnelScore & { narrative: number; continuity: number; brand: number; truth: number; fit: number; craft: number; focus: number };
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

/** The plan a carousel asks for: three scripts, or two for a long one. */
export const visualPlan = (carousel: readonly unknown[]): readonly FunnelPlanRound[] => carousel.length > VISUAL_LONG_CAROUSEL ? VISUAL_LONG_PLAN : VISUAL_PLAN;

const idList = { type: "array", maxItems: 6, items: { type: "string" } };

/** One script, as the writer writes it and the judge proposes it: one slide per carousel position, in order. */
function visualItem(positions: readonly string[]) {
  return {
    type: "object",
    properties: {
      id: { type: "string" },
      concept: { type: "string" },
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
            direction: { type: "string" },
            need: { type: "string", enum: [...VISUAL_NEEDS] },
            characterIds: idList,
            references: idList,
          },
          required: ["slide", "beat", "direction", "need", "characterIds", "references"],
          additionalProperties: false,
        },
      },
      angle: { type: "string" },
    },
    required: ["id", "concept", "motif", "cast", "characterPlan", "slides", "angle"],
    additionalProperties: false,
  };
}

/** The writer's answer: the complete list of scripts for this carousel. */
export function visualSchema(positions: readonly string[]): Record<string, unknown> {
  return {
    type: "object",
    properties: { candidates: { type: "array", minItems: 1, maxItems: VISUAL_CANDIDATES, items: visualItem(positions) } },
    required: ["candidates"],
    additionalProperties: false,
  };
}

/** The judge's answer: scores, issues, the verdict and its own script. */
export function visualEvaluationSchema(positions: readonly string[]): Record<string, unknown> {
  return funnelEvaluationSchema({ criteria: VISUAL_CRITERIA, codes: VISUAL_ISSUE_CODES, maxScored: VISUAL_CANDIDATES + 1, item: visualItem(positions), maxProposals: 1 });
}

const strings = (value: unknown, max = 6): string[] => [...new Set((Array.isArray(value) ? value : []).filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0 && entry.trim().length <= 64).map((entry) => entry.trim()))].slice(0, max);

/** One script from a model's answer, or undefined when a part is missing; checking what it names is the program's job. */
function visualFrom(raw: unknown, fallbackId: string): Draft2VisualCandidate | undefined {
  const item = funnelRecord(raw);
  const concept = funnelText(item.concept, CONCEPT_MAX_CHARACTERS * 2);
  const motif = funnelText(item.motif, MOTIF_MAX_CHARACTERS * 2);
  const cast = funnelText(item.cast, CAST_MAX_CHARACTERS * 2);
  const plan = funnelRecord(item.characterPlan);
  if (!concept || !motif || !cast || typeof plan.use !== "boolean" || !Array.isArray(item.slides) || !item.slides.length) return undefined;
  const slides: Draft2VisualSlide[] = [];
  for (const entry of item.slides.slice(0, 24)) {
    const slide = funnelRecord(entry);
    const position = funnelText(slide.slide, 24);
    const direction = typeof slide.direction === "string" ? slide.direction.replace(/\s+/g, " ").trim() : undefined;
    const beat = typeof slide.beat === "string" ? slide.beat.replace(/\s+/g, " ").trim() : undefined;
    const need = VISUAL_NEEDS.find((candidate) => candidate === slide.need);
    if (!position || direction === undefined || beat === undefined || !need) return undefined;
    slides.push({ slide: position, beat, direction, need, characterIds: strings(slide.characterIds, 4), references: strings(slide.references) });
  }
  return {
    id: funnelText(item.id, 24) ?? fallbackId,
    concept, motif, cast,
    characterPlan: { use: plan.use, characterIds: strings(plan.characterIds, 4), role: typeof plan.role === "string" ? plan.role.replace(/\s+/g, " ").trim().slice(0, ROLE_MAX_CHARACTERS) : "" },
    slides,
    angle: funnelText(item.angle, 400) ?? "",
  };
}

/** The writer's answer as scripts; anything malformed is a response error, never persisted. */
export function parseVisualCandidates(answer: string): Draft2VisualCandidate[] {
  return funnelParseCandidates(answer, visualFrom, VISUAL_CANDIDATES);
}

/** The judge's answer as an evaluation of these scripts (see funnelParseEvaluation); issues name a carousel position. */
export function parseVisualEvaluation(answer: string, candidateIds: readonly string[], positions: readonly string[]): Draft2VisualEvaluation {
  return funnelParseEvaluation(answer, candidateIds, { criteria: VISUAL_CRITERIA, codes: VISUAL_ISSUE_CODES, parts: positions, parseProposal: visualFrom, maxProposals: 1 });
}

/** Elements no image may carry: they would be drawn as words, logos or interface. */
const FORBIDDEN = /\b(logos?|watermarks?|captions?|subtitles?|hashtags?|swipe|page numbers?|signage|(?:text|words|letters|lettering) (?:that )?(?:reads?|says?|saying))\b/iu;

/** A name as a direction might write it: the full name and, for a person, the surname when it is distinctive. */
function nameForms(name: string, kind: "person" | "place" | "organization"): string[] {
  const full = comparableText(name);
  const parts = full.split(" ").filter(Boolean);
  const surname = parts.length > 1 ? parts[parts.length - 1] : "";
  return [full, ...(kind === "person" && [...surname].length >= 4 ? [surname] : [])];
}
const mentions = (text: string, form: string) => new RegExp(`(?:^|[^\\p{L}\\p{N}])${form.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:$|[^\\p{L}\\p{N}])`, "u").test(text);

/** The avoid items worth matching in a direction: short phrases the identity lists, compared as written. */
export function avoidTerms(identity: { avoid?: readonly { items: readonly string[] }[] } | null | undefined): string[] {
  return [...new Set((identity?.avoid ?? []).flatMap((group) => group.items).map((item) => comparableText(item).replace(/[.;:,]+$/u, "").trim()).filter((item) => [...item].length >= 4 && item.split(" ").length <= 4))];
}

/**
 * The program's findings on each script, before the judge; any one keeps the
 * script from winning. One slide per carousel position, in order; each
 * direction within its length, with its beat; characters from the Topic's
 * roster, on the script's plan and the editor's choice, at most two a slide;
 * references only to verified material; each kind of image backed by what
 * it needs, and nothing generated under a strict visual mode; no real person
 * or place named without its verified material, no organization named, none
 * of the brand's avoid terms, nothing that would be drawn as words or logos.
 */
export function mechanicalVisualIssues(candidates: readonly Draft2VisualCandidate[], { carousel, inventory, characters, characterChoice, mode, avoid }: {
  carousel: readonly Draft2CarouselSlide[];
  inventory: Pick<Draft2Inventory, "entities" | "storyPhotos">;
  characters: readonly Draft2VisualCharacter[];
  characterChoice: Draft2CharacterChoice;
  mode: Draft2VisualMode;
  avoid: readonly string[];
}): Draft2VisualIssue[] {
  const positions = carousel.map((slide) => slide.slide);
  const roster = new Set(characters.map((character) => character.id));
  const entities = new Map(inventory.entities.map((entity) => [entity.id, { entity, material: entityMaterial(entity) }]));
  const storyPhotos = new Set(inventory.storyPhotos.filter((photo) => photo.transmissionAllowed).map((photo) => photo.id));
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
    if (!plan.use && used.size) add("CHARACTER_OFF_PLAN", undefined, "The plan says no character narrates, but slides cast one.");
    if (plan.use && !used.size) add("CHARACTER_OFF_PLAN", undefined, "The plan has a character narrate, but no slide casts one.");
    for (const id of used) if (!plan.characterIds.includes(id)) add("CHARACTER_OFF_PLAN", undefined, `${id} appears on a slide but is not in the plan.`);
    if (characterChoice === "off" && (plan.use || used.size)) add("CHARACTER_CHOICE", undefined, "The editor chose no character for this story.");
    if (characterChoice === "on" && !used.size) add("CHARACTER_CHOICE", undefined, "The editor chose to have the brand's character narrate.");
    const concept = headlineKey(candidate.concept);
    const earlier = keys.get(concept);
    if (earlier && !(candidate.proposalOf && earlier.proposalOf === candidate.proposalOf)) add("DUPLICATE_CANDIDATE", undefined, `The concept repeats ${earlier.id}'s.`);
    else if (!earlier) keys.set(concept, candidate);
    for (const slide of candidate.slides) {
      const part = positions.includes(slide.slide) ? slide.slide : undefined;
      const label = carousel.find((entry) => entry.slide === slide.slide)?.label ?? slide.slide;
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
      if ((slide.need === "real-photo" || slide.need === "verified-map") && slide.characterIds.length) add("NEED_MISMATCH", part, `${label} rests on verified material; the brand's character stays off it.`);
      if (strict && !["real-photo", "verified-map", "typography"].includes(slide.need)) add("STRICT_MODE", part, `Under the ${mode} visual mode nothing is generated: ${label} must be a real photo, a verified map or typography.`);
      if (strict && slide.characterIds.length) add("STRICT_MODE", part, `Under the ${mode} visual mode no character is drawn on ${label}.`);
      if (!strict && slide.slide === "cover" && slide.need === "typography") add("COVER_TYPOGRAPHY", part, "The cover is always an image, never a typography card.");
      const direction = comparableText(slide.direction);
      for (const { entity, material } of entities.values()) {
        const named = nameForms(entity.name, entity.kind).some((form) => mentions(direction, form));
        if (!named) continue;
        const referenced = slide.references.includes(entity.id);
        if (entity.kind === "person" && !(referenced && material.portrait)) add("UNVERIFIED_PERSON", part, `${label}'s direction names ${entity.name}; a real person appears only through a confirmed documentary portrait in the slide's references.`);
        if (entity.kind === "place" && !(referenced && (material.photo || material.map))) add("UNVERIFIED_PLACE", part, `${label}'s direction names ${entity.name}; a real place appears only through its verified photo or map in the slide's references.`);
        if (entity.kind === "organization") add("ORGANIZATION_NAMED", part, `${label}'s direction names ${entity.name}; show what it does, never its name, logo or signs.`);
      }
      const avoided = avoid.find((term) => mentions(direction, term));
      if (avoided) add("AVOID_TERM", part, `${label}'s direction asks for "${avoided}", which the brand's identity avoids.`);
      const forbidden = FORBIDDEN.exec(slide.direction);
      if (forbidden) add("FORBIDDEN_ELEMENT", part, `${label}'s direction asks for "${forbidden[0]}"; images carry no words, logos, signs or interface.`);
    }
  }
  return issues;
}

/** Whether two scripts say the same thing: the same whole and the same slides. */
export const sameVisual = (a: Draft2VisualCandidate, b: Draft2VisualCandidate) => {
  const key = (candidate: Draft2VisualCandidate) => JSON.stringify([
    comparableText(candidate.concept), comparableText(candidate.motif), comparableText(candidate.cast), candidate.characterPlan.use, candidate.characterPlan.characterIds,
    candidate.slides.map((slide) => [slide.slide, comparableText(slide.beat), comparableText(slide.direction), slide.need, slide.characterIds, slide.references]),
  ]);
  return key(a) === key(b);
};

export const VISUAL_REVISION_INSTRUCTION = "Revise each script in scripts and return exactly one script per script, with the same id. Keep its concept, its cast and its motif, and every slide its issues do not name exactly as it is; change only what the issues name, in as few words as possible. Never make a direction vaguer, busier or more literal to the slide's words. When earlierAttempts lists a revision that scored lower, do not repeat what made it worse.";

export const VISUAL_DEVELOP_INSTRUCTION = "Edit the script in develop and return it with its id. Keep its concept, cast and motif; change only what a program rule, the brand's identity or the verified material requires, in as few words as possible. A script that is already right comes back unchanged. It also competes as written, so an edit only helps when it is better.";

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
};

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
