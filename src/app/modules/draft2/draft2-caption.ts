import "server-only";
import { recordFunnelChoice, runFunnelStep, type FunnelStep, type FunnelStepInput } from "./draft2-funnel-run";
import { DRAFT2_CAPTION_ROLES } from "./draft2-models";
import { Draft2BusyError, Draft2InputError } from "./draft2-facts.types";
import { focusForModels, type Draft2FocusSnapshot } from "./draft2-focus.types";
import { funnelVersions } from "./draft2-funnel";
import { shownAttempt, slideSettled, type Draft2ImagesRun } from "./draft2-images.types";
import { confirmedMentions, sameMentions } from "./draft2-mentions.types";
import {
  CAPTION_EVALUATION_SCHEMA, CAPTION_GATE, CAPTION_MAX_CHARACTERS, CAPTION_MAX_HASHTAGS, CAPTION_MIN_HASHTAGS, CAPTION_PLAN, CAPTION_SCHEMA,
  captionExploreRequest, captionJudgeRequest, captionFixRequest, captionRefineRequest, captionRulesBrief, captionSourceHosts, captionSourceLine, mechanicalCaptionIssues, parseCaptionCandidates, parseCaptionEvaluation, sameCaption,
  type Draft2Caption, type Draft2CaptionCandidate, type Draft2CaptionIssue, type Draft2CaptionRules, type Draft2CaptionScore,
} from "./draft2-caption.types";
import type { Draft2Inventory } from "./draft2-inventory.types";
import type { Draft2CarouselSlide } from "./draft2-visual.types";
import { brandBrief, composeInstructions, discoverySkills } from "./skills/draft2-skills";
import { CAPTIONS_SKILL } from "./skills/captions";
import { FAIRNESS_SKILL } from "./skills/fairness";
import { READER_SKILL } from "./skills/reader";
import { adaptationCreditLine, placePhotoAdaptationCreditLine, portraitCreditLine } from "../stories/creative-portrait-composite";
import type { CreativeProfile } from "../stories/creative-content.types";
import { storySourceUrls } from "../stories/story-content.repository";
import { getDraft2Session, updateDraft2Session } from "./draft2-session.repository";
import type { Draft2SessionRow } from "@/db/schema";

/** What a caption run writes for: the images run, the carousel's words, the focus, the accounts confirmed, the credits and where the story was reported. */
type CaptionSnapshot = {
  imagesRunId: string;
  carousel: Draft2CarouselSlide[];
  focus: Draft2FocusSnapshot;
  mentions: { name: string; handle: string }[];
  mentionsVersion: number;
  credits: string[];
  /** The editor's choice to leave the credits out, carried to the next run. */
  creditsHidden?: true;
  /** The addresses of the story's sources; the post's source line names them. */
  sources: string[];
  /** The editor's choice to leave the source out, carried to the next run. */
  sourceHidden?: true;
};

/**
 * The credits the post owes, as v1 owes them (get-publication-candidate.ts,
 * batchPhotoCredits), for each slide's shown image: a photo pasted unchanged
 * (a portrait, or a place photo that may not be sent), a story photo from
 * Wikimedia Commons the model adapted, a verified place photo the model
 * received as its reference. Maps carry their attribution on their card.
 */
export function captionCredits(images: Pick<Draft2ImagesRun, "slides">, inventory: Pick<Draft2Inventory, "entities" | "storyPhotos"> | null | undefined): string[] {
  const credits: string[] = [];
  for (const slide of [...images.slides].sort((a, b) => a.order - b.order)) {
    const shown = shownAttempt(slide);
    if (!shown) continue;
    for (const material of slide.material) {
      const photo = "storyPhotoId" in material ? inventory?.storyPhotos.find((entry) => entry.id === material.storyPhotoId) : undefined;
      if (material.kind === "pasted-photo" && photo?.provenance) credits.push(portraitCreditLine(photo.provenance));
      if (material.kind === "story-photo" && photo && /via Wikimedia Commons/u.test(photo.provenance)) credits.push(adaptationCreditLine(photo.provenance));
      if (material.kind === "place-photo" && shown.placePhoto) {
        const placePhoto = inventory?.entities.find((entity) => entity.id === material.entityId)?.place?.photo;
        if (placePhoto) credits.push(placePhotoAdaptationCreditLine({ author: placePhoto.author, license: placePhoto.license, ...(placePhoto.source === "openverse" ? { provider: "openverse" } : {}) }));
      }
    }
  }
  return [...new Set(credits)];
}

/** The publication's rules for the post: its emoji allowance and call-to-action style, the closing's action, and whether the story is grave. */
function captionRules(profile: CreativeProfile, { carousel, focus }: Pick<CaptionSnapshot, "carousel" | "focus">): Draft2CaptionRules {
  return {
    emojis: profile.allowEmojis ? Math.max(0, profile.maxEmojis) : 0,
    ctaStyle: profile.callToActionStyle ?? "",
    cta: carousel[carousel.length - 1]?.cta ?? "",
    grave: focus.values.voice.gravity === "grave",
  };
}

/**
 * What a run writes for: a continued run keeps what it started with, while
 * the images and the accounts are still the ones it read; a new run takes
 * the images as they stand, once every slide is made, the carousel's words
 * and focus of the visual script they picture, the accounts the editor
 * confirmed, the credits the shown images owe and the story's sources (each
 * shown or left out as the editor chose on the last run).
 */
async function captionTarget(session: Draft2SessionRow, stopped: Draft2Caption | undefined): Promise<CaptionSnapshot> {
  const images = session.images;
  const mentionsVersion = session.mentions?.version ?? 0;
  if (stopped) {
    const { imagesRunId, carousel, focus, mentions, credits } = stopped;
    if (!imagesRunId || !carousel || !focus || !mentions || !credits) throw new Draft2InputError("This caption run does not record what it wrote for. Write the caption again.");
    if (images?.runId !== imagesRunId) throw new Draft2InputError("The images changed since this run started. Write the caption again.");
    if (!sameMentions(mentions, confirmedMentions(session.mentions))) throw new Draft2InputError("The accounts to tag changed since this run started. Write the caption again.");
    return {
      imagesRunId, carousel, focus, mentions, mentionsVersion: stopped.mentionsVersion ?? 0, credits, sources: stopped.sources ?? [],
      ...(stopped.creditsHidden ? { creditsHidden: true as const } : {}), ...(stopped.sourceHidden ? { sourceHidden: true as const } : {}),
    };
  }
  if (!images || images.status === "running" || images.status === "paused" || !images.slides.every(slideSettled)) throw new Draft2InputError("The caption accompanies the finished carousel. Finish the images first.");
  if (images.slides.some((slide) => !shownAttempt(slide))) throw new Draft2InputError("Every slide needs an image before the caption. Make the missing ones first.");
  const visual = session.visual;
  if (!visual?.carousel?.length || !visual.focus || !funnelVersions(visual.rounds).some((version) => version.candidate.id === images.visualId)) {
    throw new Draft2InputError("The visual script changed since the images were made. Make the images again first.");
  }
  return {
    imagesRunId: images.runId, carousel: visual.carousel, focus: visual.focus,
    mentions: confirmedMentions(session.mentions), mentionsVersion, credits: captionCredits(images, session.inventory),
    sources: captionSourceHosts(await storySourceUrls(session.storyId)),
    ...(session.caption?.creditsHidden ? { creditsHidden: true as const } : {}),
    ...(session.caption?.sourceHidden ? { sourceHidden: true as const } : {}),
  };
}

/** The source line of a run, in the publication's language; none when the story has no outside source. */
const sourceOf = (snapshot: Pick<CaptionSnapshot, "sources">, profile: Pick<CreativeProfile, "language">) => captionSourceLine(snapshot.sources, profile.language);

/** The Caption on the shared funnel: its plan, gate, roles, prompts and contract. */
const CAPTION_STEP: FunnelStep<Draft2CaptionCandidate, Draft2CaptionScore, Draft2CaptionIssue, Draft2Caption, CaptionSnapshot> = {
  step: "caption",
  noun: "caption",
  article: "a caption",
  plural: "captions",
  plan: CAPTION_PLAN,
  gate: CAPTION_GATE,
  operations: { writer: "draft2_caption", judge: "draft2_caption_review" },
  roles: DRAFT2_CAPTION_ROLES,
  snapshot: captionTarget,
  newRun: (snapshot, profile) => { const source = sourceOf(snapshot, profile); return { ...snapshot, ...(source ? { source } : {}), rules: captionRules(profile, snapshot) }; },
  setup: ({ snapshot, profile, facts }) => {
    const rules = captionRules(profile, snapshot);
    const source = sourceOf(snapshot, profile);
    const brief = `${brandBrief(profile)}\n\n${captionRulesBrief(rules)}`;
    return {
      // A discovery story's caption keeps the premise's question and states the news plainly.
      writer: composeInstructions("caption-writer", [CAPTIONS_SKILL, FAIRNESS_SKILL, READER_SKILL, ...(snapshot.focus.values.concept?.arc === "discovery" ? discoverySkills(snapshot.focus.values.concept) : [])], brief),
      judge: composeInstructions("caption-judge", [CAPTIONS_SKILL, FAIRNESS_SKILL, READER_SKILL, ...(snapshot.focus.values.concept?.arc === "discovery" ? discoverySkills(snapshot.focus.values.concept) : [])], brief),
      context: {
        focus: focusForModels(snapshot.focus.values), carousel: snapshot.carousel, mentions: snapshot.mentions, ...(source ? { source } : {}), credits: snapshot.credits,
        limits: { postCharacters: CAPTION_MAX_CHARACTERS, hashtags: { min: CAPTION_MIN_HASHTAGS, max: CAPTION_MAX_HASHTAGS } },
      },
      schemas: { writer: CAPTION_SCHEMA, judge: CAPTION_EVALUATION_SCHEMA },
      parseCandidates: parseCaptionCandidates,
      parseEvaluation: parseCaptionEvaluation,
      mechanical: (candidates) => mechanicalCaptionIssues(candidates, facts, { source, credits: snapshot.credits, mentions: snapshot.mentions, rules, reader: { address: profile.readerAddress, language: profile.language } }),
      explore: captionExploreRequest,
      refine: captionRefineRequest,
      fix: captionFixRequest,
      judgeRequest: captionJudgeRequest,
      same: sameCaption,
    };
  },
};

/**
 * Runs the Caption step on a session whose images are made: the post's text
 * for the finished carousel, in the publication's voice, with the closing's
 * call to action, the accounts the editor confirmed and 5 to 8 hashtags.
 * Claude writes three captions; Sol scores them and proposes one; Claude
 * revises the best and edits Sol's, which also competes as Sol wrote it, for
 * Sol's pick. Pausing, continuing and the heartbeat are the funnel's.
 */
export function runDraft2Caption(input: FunnelStepInput): Promise<Draft2SessionRow> {
  return runFunnelStep(CAPTION_STEP, input);
}

/** Records the editor's pick among every caption the run scored, beside the judge's scores. */
export function recordCaptionChoice(input: { topicId: string; sessionId: string; candidateId: string }): Promise<Draft2SessionRow> {
  return recordFunnelChoice(CAPTION_STEP, input);
}

/**
 * The editor shows the photo credits after the caption, or leaves them out
 * at their own responsibility (the photos' licenses may ask for them). No
 * provider call; the post's text changes, so an approval made before no
 * longer matches it. The caption is written to fit with its credits either
 * way, so showing them again never makes the post too long.
 */
export async function recordCaptionCredits({ topicId, sessionId, shown }: { topicId: string; sessionId: string; shown: boolean }): Promise<Draft2SessionRow> {
  const session = await getDraft2Session(topicId, sessionId);
  if (!session) throw new Draft2InputError("This Draft 2 session was not found. Reload the canvas.");
  const caption = session.caption;
  if (!caption) throw new Draft2InputError("Write the caption first.");
  if (caption.status === "running") throw new Draft2BusyError("The caption is being written; show or leave out the credits when it finishes.");
  if (!caption.creditsHidden === shown) return session;
  const { creditsHidden, ...rest } = caption;
  void creditsHidden;
  const updated = await updateDraft2Session(session.id, { caption: shown ? rest : { ...rest, creditsHidden: true } });
  if (!updated) throw new Draft2InputError("This Draft 2 session was not found. Reload the canvas.");
  return updated;
}

/**
 * The editor shows the source line after the caption, or leaves it out. No
 * provider call; the post's text changes, so an approval made before no
 * longer matches it. The caption is written to fit with its source either
 * way.
 */
export async function recordCaptionSource({ topicId, sessionId, shown }: { topicId: string; sessionId: string; shown: boolean }): Promise<Draft2SessionRow> {
  const session = await getDraft2Session(topicId, sessionId);
  if (!session) throw new Draft2InputError("This Draft 2 session was not found. Reload the canvas.");
  const caption = session.caption;
  if (!caption) throw new Draft2InputError("Write the caption first.");
  if (caption.status === "running") throw new Draft2BusyError("The caption is being written; show or leave out the source when it finishes.");
  if (!caption.sourceHidden === shown) return session;
  const { sourceHidden, ...rest } = caption;
  void sourceHidden;
  const updated = await updateDraft2Session(session.id, { caption: shown ? rest : { ...rest, sourceHidden: true } });
  if (!updated) throw new Draft2InputError("This Draft 2 session was not found. Reload the canvas.");
  return updated;
}
