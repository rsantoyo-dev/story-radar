import "server-only";
import { recordFunnelChoice, runFunnelStep, type FunnelStep, type FunnelStepInput } from "./draft2-funnel-run";
import { DRAFT2_CAPTION_ROLES } from "./draft2-models";
import { withCreativeTextBudget } from "../stories/creative-text-meter";
import { generateAnthropicStructuredResponse } from "../stories/anthropic-structured-response";
import { getAnthropicRuntimeConfig, requireAnthropicApiKey } from "../stories/anthropic.config";
import { getCreativeProfile } from "../stories/creative-profile.repository";
import { draft2DevTrace } from "./draft2-dev-trace";
import { Draft2BusyError, Draft2InputError, type Draft2TraceEntry } from "./draft2-facts.types";
import { failedCall, funnelRunSummary, type FunnelRole } from "./draft2-funnel";
import { DEFAULT_DRAFT2_SOL_MODEL, draft2RoleModel } from "./draft2-models";
import { openingFactsSnapshot, type Draft2DraftExtras } from "./draft2-opening.types";
import { traceCost } from "./draft2-trace-cost";
import { focusForModels, type Draft2FocusSnapshot } from "./draft2-focus.types";
import { imagesScript, shownAttempt, slideSettled, type Draft2ImagesRun } from "./draft2-images.types";
import { confirmedMentions, sameMentions } from "./draft2-mentions.types";
import {
  CAPTION_EVALUATION_SCHEMA, CAPTION_GATE, CAPTION_MAX_CHARACTERS, CAPTION_MAX_HASHTAGS, CAPTION_MIN_HASHTAGS, captionPlan, CAPTION_SCHEMA,
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
import { storySourceCredits } from "../stories/story-content.repository";
import { activeDraft2Session, claimDraft2Session, getDraft2Session, touchDraft2Session, updateDraft2Session } from "./draft2-session.repository";
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
  /** The editor's choice to post no first comment, carried to the next run. */
  commentHidden?: true;
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
    // The editor's own photo is the whole slide: it owes its own credit when licensed, and the slide's material is not on it.
    if (shown.own?.fill === "slide") {
      if (shown.own.rights === "licensed" && shown.own.provenance) credits.push(portraitCreditLine(shown.own.provenance));
      continue;
    }
    if (shown.own?.fill === "scene" && shown.own.rights === "licensed" && shown.own.provenance) credits.push(portraitCreditLine(shown.own.provenance));
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
      ...(stopped.commentHidden ? { commentHidden: true as const } : {}),
    };
  }
  if (!images || images.status === "running" || images.status === "paused" || !images.slides.every(slideSettled)) throw new Draft2InputError("The caption accompanies the finished carousel. Finish the images first.");
  if (images.slides.some((slide) => !shownAttempt(slide))) throw new Draft2InputError("Every slide needs an image before the caption. Make the missing ones first.");
  const visual = session.visual;
  if (!visual?.carousel?.length || !visual.focus || !imagesScript(images, visual.rounds)) {
    throw new Draft2InputError("The visual script changed since the images were made. Make the images again first.");
  }
  return {
    imagesRunId: images.runId, carousel: visual.carousel, focus: visual.focus,
    mentions: confirmedMentions(session.mentions), mentionsVersion, credits: captionCredits(images, session.inventory),
    sources: captionSourceHosts(await storySourceCredits(session.storyId)),
    ...(session.caption?.creditsHidden ? { creditsHidden: true as const } : {}),
    ...(session.caption?.sourceHidden ? { sourceHidden: true as const } : {}),
    ...(session.caption?.commentHidden ? { commentHidden: true as const } : {}),
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
  plan: (_snapshot, pipeline) => captionPlan(pipeline),
  gate: CAPTION_GATE,
  operations: { writer: "draft2_caption", judge: "draft2_caption_review" },
  roles: DRAFT2_CAPTION_ROLES,
  snapshot: captionTarget,
  newRun: (snapshot, profile) => { const source = sourceOf(snapshot, profile); return { ...snapshot, ...(source ? { source } : {}), rules: captionRules(profile, snapshot) }; },
  setup: ({ snapshot, profile, facts, plan }) => {
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
      judgeRequest: (round, candidates, mechanical, revised) => captionJudgeRequest(plan, round, candidates, mechanical, revised),
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
export async function runDraft2Caption(input: FunnelStepInput): Promise<Draft2SessionRow> {
  // v4 (docs/features/draft2-v4.md): the caption was drafted with the carousel; the program checks it and fixes it once, no writer and no judge again.
  if (!input.more && !input.resume) {
    const session = await getDraft2Session(input.topicId, input.sessionId);
    if (session?.pipeline === "v4" && session.opening?.draft?.caption) return runDraft2CaptionFromDraft(input, session, session.opening.draft.caption);
  }
  return runFunnelStep(CAPTION_STEP, input);
}

/** One fix call on the drafted caption: the caption's own writer at medium effort, within the route's time. */
const DRAFT_CAPTION_FIX_MAX_OUTPUT_TOKENS = 6_000;
const DRAFT_CAPTION_FIX_TIMEOUT_MS = 120_000;
const HEARTBEAT_MS = 20_000;

/**
 * The v4 Caption step: the caption the draft wrote with the carousel's words
 * (its text, hashtags, facts and first comment), checked by the program
 * against the finished images (the credits and the source line the post
 * owes, the accounts the editor confirmed, the publication's rules). What
 * the program finds goes back to the caption writer once, with the findings;
 * the program keeps the version with fewer. Stored as a caption run of one
 * version (two when the fix stood), so the Caption screen, the hand edits,
 * the first comment and the publication work as they do. A call lost leaves
 * the drafted caption standing with its findings marked.
 */
async function runDraft2CaptionFromDraft(input: FunnelStepInput, session: Draft2SessionRow, drafted: Draft2DraftExtras["caption"]): Promise<Draft2SessionRow> {
  if (session.storyId !== input.storyId) throw new Draft2InputError("This Draft 2 session was not found for the story. Reload the canvas.");
  if (await activeDraft2Session(input.topicId, input.storyId)) throw new Draft2BusyError("A Draft 2 run is already in progress for this story.");
  const facts = session.facts ?? [];
  if (!facts.length || (session.step === "facts" && session.status !== "ready")) throw new Draft2InputError("The caption rests on verified facts. Verify the facts first.");
  const snapshot = await captionTarget(session, undefined);
  const profile = await getCreativeProfile(input.topicId);
  const rules = captionRules(profile, snapshot);
  const source = sourceOf(snapshot, profile);
  const reader = { address: profile.readerAddress, language: profile.language };
  const check = (candidates: readonly Draft2CaptionCandidate[]) => mechanicalCaptionIssues(candidates, facts, { source, credits: snapshot.credits, mentions: snapshot.mentions, rules, reader });
  const first: Draft2CaptionCandidate = { id: "d1", angle: "The caption drafted with the carousel", text: drafted.text, hashtags: drafted.hashtags, factIds: drafted.factIds, ...(drafted.comment ? { comment: drafted.comment } : {}) };
  const writer: FunnelRole = { provider: "anthropic", model: draft2RoleModel("caption", "writer", "anthropic", process.env, { anthropic: getAnthropicRuntimeConfig().model, openai: DEFAULT_DRAFT2_SOL_MODEL }) };
  const earlier = session.caption ?? undefined;
  const base = { writer, pipeline: "v4" as const, ...snapshot, ...(source ? { source } : {}), rules, ...(earlier ? { previousRuns: [...(earlier.previousRuns ?? []), funnelRunSummary(earlier)] } : {}) };
  const running = { ...base, status: "running", rounds: [], candidates: [], plannedRounds: 1 } as unknown as Draft2Caption;
  const claimed = await claimDraft2Session(session.id, { step: "caption", caption: running, error: null });
  if (!claimed) throw new Draft2BusyError("A Draft 2 run is already in progress for this story.");
  const trace: Draft2TraceEntry[] = [...session.trace];
  const heartbeat = setInterval(() => { void touchDraft2Session(session.id).catch(() => undefined); }, HEARTBEAT_MS);
  try {
    const at = new Date().toISOString();
    const rounds: Draft2Caption["rounds"] = [{ round: 1, kind: "explore", candidates: [first], mechanical: check([first]), at }];
    if (rounds[0].mechanical.length) {
      // The caption's own writer fixes what the program named, once; the call is on the trace, lost or not.
      const discovery = snapshot.focus.values.concept?.arc === "discovery" ? discoverySkills(snapshot.focus.values.concept) : [];
      const composed = composeInstructions("caption-writer", [CAPTIONS_SKILL, FAIRNESS_SKILL, READER_SKILL, ...discovery], `${brandBrief(profile)}\n\n${captionRulesBrief(rules)}`);
      const context = { focus: focusForModels(snapshot.focus.values), carousel: snapshot.carousel, mentions: snapshot.mentions, ...(source ? { source } : {}), credits: snapshot.credits, limits: { postCharacters: CAPTION_MAX_CHARACTERS, hashtags: { min: CAPTION_MIN_HASHTAGS, max: CAPTION_MAX_HASHTAGS } }, verifiedFacts: openingFactsSnapshot(facts) };
      const contents = captionFixRequest([first], rounds[0].mechanical);
      const operation = "draft2_caption_fix";
      const begin = Date.now();
      const started = new Date().toISOString();
      draft2DevTrace({ step: "caption", round: 2, provider: "anthropic", model: writer.model, operation, phase: "request", detail: { contents } });
      const fixed = await withCreativeTextBudget({ topicId: input.topicId, storyId: input.storyId, runId: session.id }, () => generateAnthropicStructuredResponse({
        apiKey: requireAnthropicApiKey(), model: writer.model, instructions: composed.instructions, context, contents, schema: CAPTION_SCHEMA, schemaName: operation,
        maxOutputTokens: DRAFT_CAPTION_FIX_MAX_OUTPUT_TOKENS, effort: "medium", timeoutMs: DRAFT_CAPTION_FIX_TIMEOUT_MS, auditContext: { runId: session.id, topicId: input.topicId, storyId: input.storyId },
      })).then((answered) => {
        trace.push({ at: started, step: "caption", round: 2, provider: "anthropic", model: writer.model, operation, durationMs: Date.now() - begin, usage: answered.usage, cachedInputTokens: answered.cachedInputTokens, ...(answered.cacheWriteTokens ? { cacheWriteTokens: answered.cacheWriteTokens } : {}), answerCharacters: answered.text.length, outcome: "ok", skillVersions: composed.skillVersions, effort: "medium", ...traceCost("anthropic", writer.model, answered.usage, answered.cachedInputTokens, answered.cacheWriteTokens) });
        const candidate = parseCaptionCandidates(answered.text).find((entry) => entry.id === first.id) ?? parseCaptionCandidates(answered.text)[0];
        return candidate ? { ...candidate, id: "d1.2" } : undefined;
      }).catch((error) => {
        trace.push({ at: started, step: "caption", round: 2, provider: "anthropic", model: writer.model, operation, durationMs: Date.now() - begin, outcome: "error", note: error instanceof Error ? error.message : "unknown error", ...failedCall(error), skillVersions: composed.skillVersions, effort: "medium" });
        return undefined;
      });
      if (fixed) rounds.push({ round: 2, kind: "refine", candidates: [fixed], mechanical: check([fixed]), at: new Date().toISOString() });
    }
    const kept = rounds.reduce((best, round) => round.mechanical.length < best.mechanical.length ? round : best, rounds[0]);
    const count = kept.mechanical.length;
    const status = count ? "needs-review" : "ready";
    const caption = {
      ...base, status, rounds, candidates: kept.candidates, winnerId: kept.candidates[0].id, plannedRounds: rounds.length,
      ...(count ? { error: `The program found ${count} issue${count === 1 ? "" : "s"} on the caption the draft wrote; edit it by hand, or write it again.` } : {}),
    } as unknown as Draft2Caption;
    const updated = await updateDraft2Session(session.id, { caption, trace, step: "caption", status, error: null });
    if (!updated) throw new Draft2InputError("This Draft 2 session was not found. Reload the canvas.");
    return updated;
  } catch (error) {
    const message = error instanceof Error ? error.message : "The caption step failed.";
    await updateDraft2Session(session.id, { caption: { ...running, status: "failed", error: message } as Draft2Caption, trace, status: "failed", error: message }).catch(() => undefined);
    throw error;
  } finally {
    clearInterval(heartbeat);
  }
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

/**
 * The editor posts the chosen caption's first comment under the post, or
 * turns it off for this post. No provider call; what is published changes,
 * so an approval made before no longer matches it.
 */
export async function recordCaptionComment({ topicId, sessionId, shown }: { topicId: string; sessionId: string; shown: boolean }): Promise<Draft2SessionRow> {
  const session = await getDraft2Session(topicId, sessionId);
  if (!session) throw new Draft2InputError("This Draft 2 session was not found. Reload the canvas.");
  const caption = session.caption;
  if (!caption) throw new Draft2InputError("Write the caption first.");
  if (caption.status === "running") throw new Draft2BusyError("The caption is being written; turn the first comment on or off when it finishes.");
  if (!caption.commentHidden === shown) return session;
  const { commentHidden, ...rest } = caption;
  void commentHidden;
  const updated = await updateDraft2Session(session.id, { caption: shown ? rest : { ...rest, commentHidden: true } });
  if (!updated) throw new Draft2InputError("This Draft 2 session was not found. Reload the canvas.");
  return updated;
}
