import "server-only";
import { withCreativeTextBudget } from "../stories/creative-text-meter";
import { generateOpenAiStructuredResponse } from "../stories/openai-structured-response";
import { generateAnthropicStructuredResponse } from "../stories/anthropic-structured-response";
import { getAnthropicRuntimeConfig, requireAnthropicApiKey } from "../stories/anthropic.config";
import { getCreativeProfile } from "../stories/creative-profile.repository";
import { activeDraft2Session, claimDraft2Session, getDraft2Session, touchDraft2Session, updateDraft2Session, type Draft2SessionPatch } from "./draft2-session.repository";
import { draft2DevTrace } from "./draft2-dev-trace";
import { traceCost } from "./draft2-trace-cost";
import type { Draft2Reader } from "./draft2-address.types";
import { Draft2BusyError, Draft2InputError, Draft2ResponseError, type Draft2Fact, type Draft2TraceEntry } from "./draft2-facts.types";
import { factsSnapshot, failedCall, funnelVersions, funnelWithCandidate, funnelWordCount, type FunnelCandidate, type FunnelRole, type FunnelRun } from "./draft2-funnel";
import { focusForModels, focusItemCount, type Draft2FocusSnapshot } from "./draft2-focus.types";
import { mechanicalOpeningIssues, type Draft2Opening, type Draft2OpeningCandidate } from "./draft2-opening.types";
import { mechanicalClosingIssues, type Draft2Closing, type Draft2ClosingCandidate } from "./draft2-closing.types";
import { mechanicalDeckIssues, type Draft2Deck, type Draft2DeckCandidate } from "./draft2-deck.types";
import { carouselSlides, type Draft2VisualCandidate } from "./draft2-visual.types";
import { avoidTerms, mentionsTerm } from "./draft2-image-rules";
import {
  DRAFT2_READER_SCHEMA, DRAFT2_REVIEW_SCHEMA, DRAFT2_REVIEW_SHORTEN_SCHEMA, DRAFT2_REVIEW_V4_SCHEMA, REVIEW_MAX_PATCHES, directionPatches, REVIEW_NECESSARY_KINDS, carouselWithText, lengthOnly, parseReaderAnswer, parseReviewAnswer, parseShortenAnswer, patchedClosing, patchedDeck, patchedOpening,
  reviewCurrent, reviewPatchRules, reviewPatches, reviewWordLimits, sameWords, slideText,
  type Draft2Review, type Draft2ReviewImage, type Draft2ReviewPatch, type Draft2ReviewRun, type Draft2ReviewTextPatch } from "./draft2-review.types";
import { brandBrief, composeInstructions, creativeSkills } from "./skills/draft2-skills";
import { FAIRNESS_SKILL } from "./skills/fairness";
import { READER_SKILL } from "./skills/reader";
import { REVIEW_SKILL, REVIEW_V4_SECTION, REVIEW_V4_VERSION } from "./skills/review";
import type { Draft2SessionRow } from "@/db/schema";

const READER_MAX_OUTPUT_TOKENS = 4_000;
const EDITOR_MAX_OUTPUT_TOKENS = 8_000;
/** The replacement alone, shortened. */
const SHORTEN_MAX_OUTPUT_TOKENS = 1_000;
/** How many times a patch over its limit alone is asked shorter: the model's idea of a word is not the program's ("4 000 $" is three), so the second ask carries the program's count of the first answer. */
const SHORTEN_ATTEMPTS = 2;
/** Claude's thinking counts against the same ceiling as its answer. */
const CLAUDE_EDITOR_MAX_OUTPUT_TOKENS = 16_000;
const READER_TIMEOUT_MS = 90_000;
const EDITOR_TIMEOUT_MS = 240_000;
const HEARTBEAT_MS = 30_000;
const DEFAULT_READER_MODEL = "gpt-6-luna";

export type Draft2ReviewInput = { topicId: string; storyId: string; sessionId: string };

/**
 * The reader: the cheap judge by default (DRAFT2_MODEL_REVIEW_READER, else
 * DRAFT2_MODEL_JUDGE). The editor: Claude by default since 2026-10-14, the
 * editor's choice for a last polish that changes only what must change
 * (every step's own gate stays Sol's); DRAFT2_MODEL_REVIEW_JUDGE names another
 * model, OpenAI's or Anthropic's by its name.
 */
export function reviewModels(env: Record<string, string | undefined>): { reader: FunnelRole; editor: FunnelRole } {
  const editor = env.DRAFT2_MODEL_REVIEW_JUDGE?.trim() || getAnthropicRuntimeConfig().model;
  return {
    reader: { provider: "openai", model: env.DRAFT2_MODEL_REVIEW_READER?.trim() || env.DRAFT2_MODEL_JUDGE?.trim() || DEFAULT_READER_MODEL },
    editor: { provider: /^claude-/i.test(editor) ? "anthropic" : "openai", model: editor },
  };
}

type Chosen = { opening: Draft2Opening; closing: Draft2Closing; deck: Draft2Deck; openingId: string; closingId: string; deckId: string; deckCandidate: Draft2DeckCandidate; focus: Draft2FocusSnapshot };

/** The versions the review reads: the chosen deck, consistent with the opening and the closing chosen now, and the focus they followed. */
function chosenCarousel(session: Draft2SessionRow): Chosen {
  const { opening, closing, deck } = session;
  if (!opening || !closing || !deck) throw new Draft2InputError("The review reads the whole carousel: write the opening, the closing and the deck first.");
  if (deck.status === "running" || deck.status === "paused") throw new Draft2InputError("The review reads the whole carousel. Finish the deck first.");
  const deckId = deck.editorChoiceId ?? deck.winnerId;
  const deckVersion = deckId ? funnelVersions(deck.rounds).find((version) => version.candidate.id === deckId) : undefined;
  if (!deckId || !deckVersion) throw new Draft2InputError("The deck has no version to review yet. Choose a deck first.");
  if (!deck.opening || !deck.closing || !deck.focus) throw new Draft2InputError("This deck does not record the opening and closing it connects. Write the deck again first.");
  const openingId = opening.editorChoiceId ?? opening.winnerId;
  const closingId = closing.editorChoiceId ?? closing.winnerId;
  if (!openingId || !closingId) throw new Draft2InputError("Choose an opening and a closing before the review.");
  if (openingId !== deck.opening.id || closingId !== deck.closing.id) throw new Draft2InputError(`The deck connects ${deck.opening.id} and ${deck.closing.id}; the opening and closing chosen now are ${openingId} and ${closingId}. Write the deck again first.`);
  return { opening, closing, deck, openingId, closingId, deckId, deckCandidate: deckVersion.candidate, focus: deck.focus };
}

/**
 * v4 (docs/features/draft2-v4.md): the visual script the review reads beside
 * the words, finished and following the deck chosen now, with each slide's
 * image direction.
 */
function reviewScript(session: Draft2SessionRow, chosen: Chosen): { visualId: string; images: Draft2ReviewImage[] } {
  const visual = session.visual;
  if (!visual || visual.status === "running" || visual.status === "paused") throw new Draft2InputError("A v4 review reads the words beside their image directions. Finish the visual script first.");
  const visualId = visual.editorChoiceId ?? visual.winnerId;
  const script = visualId ? funnelVersions(visual.rounds).find((version) => version.candidate.id === visualId)?.candidate as Draft2VisualCandidate | undefined : undefined;
  if (!visualId || !script) throw new Draft2InputError("The visual script has no version to review yet. Choose one first.");
  if (visual.deckId && visual.deckId !== chosen.deckId) throw new Draft2InputError("The visual script pictures another deck. Write the visual script again first.");
  return { visualId, images: script.slides.map(({ slide, need, subject, direction }) => ({ slide, need, subject, direction })) };
}

/** The chosen candidate of a step, found among its versions. */
function chosenOf<C extends FunnelCandidate>(run: FunnelRun<C>, id: string): C {
  const version = funnelVersions(run.rounds).find((entry) => entry.candidate.id === id);
  if (!version) throw new Draft2InputError(`${id} is no longer one of the step's versions.`);
  return version.candidate as C;
}

/**
 * What the program finds wrong with a patched candidate, with the owning
 * step's own checks and the context that step recorded; empty when the patch
 * keeps every rule. Only what the patch brings counts: a finding the chosen
 * version already had (a rule newer than the carousel, such as abbreviations
 * since 2026-10-15) never refuses a patch elsewhere in it.
 */
function patchFindings(session: Draft2SessionRow, chosen: Chosen, patch: Pick<Draft2ReviewTextPatch, "owner" | "slide" | "field" | "after">, facts: readonly Draft2Fact[], emojis: number, reader: Draft2Reader): string[] {
  const values = chosen.focus.values;
  const itemCount = focusItemCount(values);
  const brought = (before: readonly { detail: string }[], after: readonly { detail: string }[]) => {
    const had = new Set(before.map((issue) => issue.detail));
    return after.map((issue) => issue.detail).filter((detail) => !had.has(detail));
  };
  if (patch.owner === "opening") {
    const current = chosenOf<Draft2OpeningCandidate>(chosen.opening, chosen.openingId);
    const check = (candidate: Draft2OpeningCandidate) => mechanicalOpeningIssues([candidate], facts, { itemCount, reader });
    return brought(check(current), check(patchedOpening(current, patch.slide, patch.field, patch.after)));
  }
  if (patch.owner === "closing") {
    if (!chosen.closing.opening || !chosen.closing.shape) return ["This closing does not record the opening and the shape it was written for."];
    const rules = { opening: chosen.closing.opening, shape: chosen.closing.shape, grave: values.voice.gravity === "grave", itemCount, emojis, reader };
    const current = chosenOf<Draft2ClosingCandidate>(chosen.closing, chosen.closingId);
    const check = (candidate: Draft2ClosingCandidate) => mechanicalClosingIssues([candidate], facts, rules);
    return brought(check(current), check(patchedClosing(current, patch.slide, patch.field, patch.after)));
  }
  if (!chosen.deck.opening || !chosen.deck.closing || !chosen.deck.shape) return ["This deck does not record what it connects."];
  const rules = { opening: chosen.deck.opening, closing: chosen.deck.closing, shape: chosen.deck.shape, itemCount, emojis, reader };
  const check = (candidate: Draft2DeckCandidate) => mechanicalDeckIssues([candidate], facts, rules);
  return brought(check(chosen.deckCandidate), check(patchedDeck(chosen.deckCandidate, patch.slide, patch.field, patch.after)));
}

/**
 * Reads the whole carousel: first a reader of the audience, slide by slide
 * (would they swipe, what do they think, would they follow or comment), then
 * the editor with those reactions beside the slides, the focus and the facts,
 * who scores it, names what works, and writes the patches. Each patch is
 * checked by the program against the owning step's rules before it is
 * offered; one that breaks them is refused with the rule.
 */
export async function reviewDraft2Carousel({ topicId, storyId, sessionId }: Draft2ReviewInput): Promise<Draft2SessionRow> {
  const session = await getDraft2Session(topicId, sessionId);
  if (!session || session.storyId !== storyId) throw new Draft2InputError("This Draft 2 session was not found for the story. Reload the canvas.");
  if (await activeDraft2Session(topicId, storyId)) throw new Draft2BusyError("A Draft 2 run is already in progress for this story.");
  const facts = session.facts ?? [];
  if (!facts.length || (session.step === "facts" && session.status !== "ready")) throw new Draft2InputError("The review rests on verified facts. Verify the facts first.");
  const chosen = chosenCarousel(session);
  const carousel = carouselSlides(chosen.deck.opening!, chosen.deckCandidate, chosen.deck.closing!);
  // v4: after the visual script, the words and their image directions read together, by the editor at high effort.
  const script = session.pipeline === "v4" ? reviewScript(session, chosen) : undefined;
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) throw new Draft2InputError("OPENAI_API_KEY is not configured: the review needs the reader and the editor.");
  const models = reviewModels(process.env);
  const anthropicKey = models.editor.provider === "anthropic" ? requireAnthropicApiKey() : undefined;
  const earlier = session.review ?? undefined;
  const startedAt = new Date().toISOString();
  const running: Draft2Review = {
    status: "running", version: (earlier?.version ?? 0) + 1,
    openingId: chosen.openingId, closingId: chosen.closingId, deckId: chosen.deckId, focusVersion: chosen.focus.version,
    carousel, ...(script ? { visualId: script.visualId, images: script.images } : {}), startedAt, updatedAt: startedAt,
    previousRuns: earlier ? [...(earlier.previousRuns ?? []), reviewRunSummary(earlier)] : undefined,
  };
  const claimed = await claimDraft2Session(session.id, { step: "review", review: running, error: null });
  if (!claimed) throw new Draft2BusyError("A Draft 2 run is already in progress for this story.");
  const trace: Draft2TraceEntry[] = [...session.trace];
  const auditContext = { runId: session.id, topicId, storyId };
  const heartbeat = setInterval(() => { void touchDraft2Session(session.id).catch(() => undefined); }, HEARTBEAT_MS);

  /** One structured call on the trace, with its cost; a failure stays on the trace too. */
  const call = async (role: FunnelRole, operation: string, request: { instructions: string; contents: Record<string, unknown>; schema: Record<string, unknown>; maxOutputTokens: number; reasoningEffort: "low" | "medium" | "high"; timeoutMs: number; skillVersions: Record<string, string> }) => {
    const at = new Date().toISOString();
    const begin = Date.now();
    const provider = role.provider;
    draft2DevTrace({ step: "review", round: 1, provider, model: role.model, operation, phase: "request", detail: { contents: request.contents } });
    try {
      const answered = provider === "anthropic"
        ? await generateAnthropicStructuredResponse({
          apiKey: anthropicKey!, model: role.model, instructions: request.instructions, contents: request.contents, schema: request.schema, schemaName: operation,
          maxOutputTokens: CLAUDE_EDITOR_MAX_OUTPUT_TOKENS, effort: request.reasoningEffort, timeoutMs: request.timeoutMs, auditContext,
        })
        : await generateOpenAiStructuredResponse({
          apiKey, model: role.model, instructions: request.instructions, contents: request.contents, schema: request.schema, schemaName: operation,
          maxOutputTokens: request.maxOutputTokens, reasoningEffort: request.reasoningEffort, timeoutMs: request.timeoutMs, auditContext,
        });
      const cacheWriteTokens = "cacheWriteTokens" in answered ? answered.cacheWriteTokens : undefined;
      const durationMs = Date.now() - begin;
      trace.push({ at, step: "review", round: 1, provider, model: role.model, operation, durationMs, usage: answered.usage, cachedInputTokens: answered.cachedInputTokens, ...(cacheWriteTokens ? { cacheWriteTokens } : {}), answerCharacters: answered.text.length, outcome: "ok", skillVersions: request.skillVersions, effort: request.reasoningEffort, ...traceCost(provider, role.model, answered.usage, answered.cachedInputTokens, cacheWriteTokens) });
      draft2DevTrace({ step: "review", round: 1, provider, model: role.model, operation, phase: "response", durationMs, detail: { usage: answered.usage, answer: answered.text } });
      return answered.text;
    } catch (error) {
      const note = error instanceof Error ? error.message : "unknown error";
      trace.push({ at, step: "review", round: 1, provider, model: role.model, operation, durationMs: Date.now() - begin, outcome: "error", note, ...failedCall(error), skillVersions: request.skillVersions, effort: request.reasoningEffort });
      draft2DevTrace({ step: "review", round: 1, provider, model: role.model, operation, phase: "error", durationMs: Date.now() - begin, detail: { error: note } });
      throw error;
    }
  };

  let review: Draft2Review;
  try {
    review = await withCreativeTextBudget({ topicId, storyId, runId: session.id }, async () => {
      const profile = await getCreativeProfile(topicId);
      const brief = brandBrief(profile);
      const emojis = profile.allowEmojis ? Math.max(0, profile.maxEmojis) : 0;
      const slides = carousel.map(({ slide, label, headline, text, practical, cta }) => ({ slide, label, headline, text, ...(practical ? { practical } : {}), ...(cta ? { cta } : {}) }));
      // 1. The reader: the audience's member, no rubric, the cheap model.
      const readerBy = models.reader;
      const reader = composeInstructions("carousel-reader", [], brief);
      const readerAnswer = await call(readerBy, "draft2_review_read", {
        instructions: reader.instructions, contents: { task: "read", slides }, schema: DRAFT2_READER_SCHEMA, maxOutputTokens: READER_MAX_OUTPUT_TOKENS, reasoningEffort: "low", timeoutMs: READER_TIMEOUT_MS, skillVersions: reader.skillVersions,
      });
      const read = parseReaderAnswer(readerAnswer, carousel);
      // 2. The editor: the whole carousel, the focus, the reader's reactions and the facts; Claude by default, changing only what must change.
      const editorBy = models.editor;
      const editor = composeInstructions("carousel-editor", [REVIEW_SKILL, FAIRNESS_SKILL, READER_SKILL, ...creativeSkills(chosen.focus.values)], brief);
      const editorInstructions = `${editor.instructions}${script ? `\n\n${REVIEW_V4_SECTION}` : ""}\n\n# Verified facts\n${JSON.stringify(factsSnapshot(facts))}`;
      const editorSkills = script ? { ...editor.skillVersions, "review-v4": REVIEW_V4_VERSION } : editor.skillVersions;
      let refusal = "";
      // The word limits each slide's text keeps, so a patch is written within them (the Saint-Jean review lost both its truth patches to a 30-word body, 2026-10-17).
      const limits = { patches: REVIEW_MAX_PATCHES, words: reviewWordLimits(carousel, { deck: chosen.deck.shape ?? undefined, closing: chosen.closing.shape ?? undefined }) };
      // A review the program refuses (a verdict or a summary missing, a score that is no integer) is asked for again once, with the rule it broke; refused again, the step fails.
      const editorContents = { task: "review", slides, ...(script ? { images: script.images, ...(session.visual?.subjectsUnseen?.length ? { subjectsUnseen: session.visual.subjectsUnseen } : {}) } : {}), focus: focusForModels(chosen.focus.values), reader: read, limits };
      let editorAnswer = "";
      let answer!: ReturnType<typeof parseReviewAnswer>;
      for (let attempt = 1; attempt <= 2; attempt++) {
        editorAnswer = await call(editorBy, "draft2_review", {
          instructions: editorInstructions,
          contents: attempt === 1 ? editorContents : { ...editorContents, correction: `${refusal}. Return the whole review again, every field, with this fixed and nothing else changed.` },
          schema: script ? DRAFT2_REVIEW_V4_SCHEMA : DRAFT2_REVIEW_SCHEMA, maxOutputTokens: EDITOR_MAX_OUTPUT_TOKENS, reasoningEffort: script ? "high" : "medium", timeoutMs: EDITOR_TIMEOUT_MS, skillVersions: editorSkills,
        });
        try {
          answer = parseReviewAnswer(editorAnswer, carousel);
          break;
        } catch (error) {
          if (!(error instanceof Draft2ResponseError) || attempt === 2) throw error;
          refusal = error.message;
          const last = trace[trace.length - 1];
          if (last) last.note = `Refused by the program: ${error.message}`.slice(0, 600);
        }
      }
      // 3. The program: a patch that breaks the review's own rules or the owning step's is refused with the rule, before anyone sees it as a choice; one over its slide's word limit alone is asked shorter once, the same change within the limit.
      const address = { address: profile.readerAddress, language: profile.language };
      const headlineOf = (slide: string) => carousel.find((entry) => entry.slide === slide)?.headline;
      const checked = (patch: Draft2ReviewTextPatch) => [...reviewPatchRules(patch, facts, headlineOf(patch.slide)), ...patchFindings(session, chosen, patch, facts, emojis, address)];
      /** The editor's own patch within the limit, counted as the program counts, or nothing when the call fails or answers nothing usable: the refusal stands. */
      const shorten = async (patch: Draft2ReviewTextPatch, limit: number, findings: string[]): Promise<string | undefined> => {
        const words = funnelWordCount(patch.after);
        try {
          const shortAnswer = await call(editorBy, "draft2_review_shorten", {
            instructions: editorInstructions,
            contents: {
              task: "shorten", slide: patch.slide, field: patch.field, headline: headlineOf(patch.slide), before: patch.before, after: patch.after, reason: patch.reason, limit, words, findings,
              instruction: `Return the same change in ${limit} words or fewer; the replacement has ${words} as the program counts them: every group of characters between spaces that has a letter or a digit is a word: numbers count ("4 000 $" is two words, 4 and 000), a symbol alone does not. Drop words, never a figure, a qualifier or an attribution the facts give.`,
            },
            schema: DRAFT2_REVIEW_SHORTEN_SCHEMA, maxOutputTokens: SHORTEN_MAX_OUTPUT_TOKENS, reasoningEffort: "low", timeoutMs: READER_TIMEOUT_MS, skillVersions: editor.skillVersions,
          });
          return parseShortenAnswer(shortAnswer);
        } catch { return undefined; }
      };
      const patches: Draft2ReviewPatch[] = [];
      for (const patch of reviewPatches(answer, carousel)) {
        if (patch.status !== "proposed") { patches.push(patch); continue; }
        let findings = checked(patch);
        const limit = limits.words[patch.slide]?.[patch.field];
        let again = patch;
        for (let attempt = 1; attempt <= SHORTEN_ATTEMPTS && limit && lengthOnly(findings); attempt++) {
          const shorter = await shorten(again, limit, findings);
          if (!shorter) break;
          again = { ...patch, after: shorter, note: [patch.note, `Shortened to the slide's limit of ${limit} words.`].filter(Boolean).join(" ") };
          findings = checked(again);
        }
        if (!findings.length) { patches.push(again); continue; }
        patches.push({ ...patch, status: "refused" as const, note: findings.join(" ") });
      }
      // v4: the image directions it would change, checked against the script it read and the brand's avoid list.
      if (script) {
        const avoided = avoidTerms(profile.creativeIdentity);
        patches.push(...directionPatches(editorAnswer, script.images, { firstId: patches.length + 1, avoid: (direction) => avoided.find((term) => mentionsTerm(direction, term)) }));
      }
      const now = new Date().toISOString();
      return { ...running, status: "ready", reader: read, readerBy, editor: { ...answer, patches }, editorBy, updatedAt: now };
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "The review failed.";
    await updateDraft2Session(session.id, { review: { ...running, status: "failed", error: message, updatedAt: new Date().toISOString() }, trace, status: "failed", error: message }).catch(() => undefined);
    throw error;
  } finally {
    clearInterval(heartbeat);
  }
  return (await updateDraft2Session(session.id, { review, trace, status: "ready", error: null })) ?? claimed;
}

/** An earlier review as the session keeps it: without the carousel and the images it read, or its own history. */
function reviewRunSummary(review: Draft2Review): Draft2ReviewRun {
  const { previousRuns, carousel, images, ...run } = review;
  void previousRuns; void carousel; void images;
  return run;
}

export type Draft2ReviewAction = "apply" | "decline" | "undo" | "apply-all";

/** The visual script version chosen now. */
const chosenVisualId = (session: Draft2SessionRow) => session.visual?.editorChoiceId ?? session.visual?.winnerId ?? undefined;

/** What a patch's place says now: a slide's text in the review's carousel, or an image direction in the chosen script. */
function patchedText(session: Draft2SessionRow, review: Draft2Review, patch: Draft2ReviewPatch): string {
  if (patch.owner === "visual") {
    const visual = session.visual;
    const id = chosenVisualId(session);
    const script = visual && id ? funnelVersions(visual.rounds).find((version) => version.candidate.id === id)?.candidate as Draft2VisualCandidate | undefined : undefined;
    return script?.slides.find((slide) => slide.slide === patch.slide)?.direction ?? "";
  }
  return slideText(review.carousel.find((entry) => entry.slide === patch.slide)!, patch.field);
}

/** A step's run with one version's text replaced wherever the run keeps that version (its rounds and its last candidates). */
const withCandidate = <C extends FunnelCandidate, R extends FunnelRun<C, never, never> | FunnelRun<C>>(run: R, candidate: C): R => funnelWithCandidate(run as FunnelRun<C>, candidate) as R;

/**
 * One text of the chosen carousel replaced (or restored), in the owning step
 * and in every later step that keeps a copy of it: the closing and the deck
 * record the opening they follow, the deck the closing it leads to. The
 * review's own carousel follows, so a later patch quotes the words as they
 * now stand.
 */
function patched(session: Draft2SessionRow, chosen: Chosen, patch: Draft2ReviewPatch, after: string): Draft2SessionPatch {
  const changes: Draft2SessionPatch = {};
  if (patch.owner === "visual") {
    // v4: the chosen script's slide takes the new direction, and the review's copy follows; the images are made from it.
    const visual = session.visual!;
    const candidate = chosenOf<Draft2VisualCandidate>(visual, (visual.editorChoiceId ?? visual.winnerId)!);
    changes.visual = withCandidate(visual, { ...candidate, slides: candidate.slides.map((slide) => slide.slide === patch.slide ? { ...slide, direction: after } : slide) });
    const review = session.review!;
    changes.review = { ...review, images: (review.images ?? []).map((image) => image.slide === patch.slide ? { ...image, direction: after } : image) };
    return changes;
  }
  if (patch.owner === "opening") {
    const candidate = patchedOpening(chosenOf<Draft2OpeningCandidate>(chosen.opening, chosen.openingId), patch.slide, patch.field, after);
    changes.opening = withCandidate(chosen.opening, candidate);
    const snapshot = { id: candidate.id, cover: candidate.cover, slide2: candidate.slide2 };
    if (chosen.closing.opening?.id === candidate.id) changes.closing = { ...chosen.closing, opening: snapshot };
    if (chosen.deck.opening?.id === candidate.id) changes.deck = { ...chosen.deck, opening: snapshot };
  } else if (patch.owner === "closing") {
    const candidate = patchedClosing(chosenOf<Draft2ClosingCandidate>(chosen.closing, chosen.closingId), patch.slide, patch.field, after);
    changes.closing = withCandidate(chosen.closing, candidate);
    if (chosen.deck.closing?.id === candidate.id) changes.deck = { ...chosen.deck, closing: { id: candidate.id, penultimate: candidate.penultimate, last: candidate.last } };
  } else {
    changes.deck = withCandidate(chosen.deck, patchedDeck(chosen.deckCandidate, patch.slide, patch.field, after));
  }
  const review = session.review!;
  changes.review = { ...review, carousel: carouselWithText(review.carousel, patch.slide, patch.field, after) };
  // A visual script that reads these versions keeps its own copy of the words, which its images letter: it takes the patch too, as a hand edit's.
  const visual = session.visual;
  if (visual?.carousel && visual.openingId === chosen.openingId && visual.closingId === chosen.closingId && visual.deckId === chosen.deckId) {
    changes.visual = { ...visual, carousel: carouselWithText(visual.carousel, patch.slide, patch.field, after) };
  }
  return changes;
}

/**
 * The editor's decision on a patch: applied (the chosen candidate's text
 * replaced, the review keeping what it replaced), declined, or undone (the
 * text restored). "apply-all" applies every patch still proposed, for the
 * autopilot. An apply checks the slide still says what the review quoted.
 */
export async function decideDraft2ReviewPatch({ topicId, sessionId, patchId, action, by = "editor" }: { topicId: string; sessionId: string; patchId?: string; action: Draft2ReviewAction; by?: "editor" | "autopilot" }): Promise<Draft2SessionRow> {
  let session = await getDraft2Session(topicId, sessionId);
  if (!session) throw new Draft2InputError("This Draft 2 session was not found. Reload the canvas.");
  const review = session.review;
  if (!review?.editor) throw new Draft2InputError("Read the carousel before deciding on its patches.");
  if (review.status === "running") throw new Draft2BusyError("The carousel is being read; decide when the review finishes.");
  // The autopilot applies only what must change (truth, repetition, detail); a style patch waits for the editor.
  const ids = action === "apply-all"
    ? review.editor.patches.filter((patch) => patch.status === "proposed" && (by !== "autopilot" || REVIEW_NECESSARY_KINDS.includes(patch.kind ?? "style"))).map((patch) => patch.id)
    : patchId ? [patchId] : [];
  if (!ids.length) {
    if (action === "apply-all") return session;
    throw new Draft2InputError("Name the patch to decide on.");
  }
  for (const id of ids) {
    const current = session.review!;
    const patch = current.editor!.patches.find((entry) => entry.id === id);
    if (!patch) throw new Draft2InputError(`${id} is not one of this review's patches.`);
    const now = new Date().toISOString();
    const record = (next: Draft2ReviewPatch, extra: Draft2SessionPatch = {}) => {
      const reviewed = extra.review ?? current;
      return { ...extra, review: { ...reviewed, version: current.version + 1, updatedAt: now, editor: { ...reviewed.editor!, patches: reviewed.editor!.patches.map((entry) => entry.id === id ? next : entry) } } } as Draft2SessionPatch;
    };
    let changes: Draft2SessionPatch;
    if (action === "decline") {
      if (patch.status !== "proposed") throw new Draft2InputError(`${id} was already ${patch.status}.`);
      changes = record({ ...patch, status: "declined" });
    } else if (action === "undo") {
      if (patch.status !== "applied") throw new Draft2InputError(`${id} is not applied.`);
      const chosen = chosenCarousel(session);
      if (!reviewCurrent(current, { ...chosen, ...(patch.owner === "visual" ? { visualId: chosenVisualId(session) } : {}) })) throw new Draft2InputError("The review read other versions of the carousel; read it again before undoing.");
      if (!sameWords(patchedText(session, current, patch), patch.after)) throw new Draft2InputError("The slide no longer says what this patch wrote; undo is not possible.");
      changes = record({ ...patch, status: "proposed", appliedAt: undefined, appliedBy: undefined }, patched(session, chosen, patch, patch.before));
    } else {
      if (patch.status !== "proposed") throw new Draft2InputError(`${id} was already ${patch.status}.`);
      const chosen = chosenCarousel(session);
      if (!reviewCurrent(current, { ...chosen, ...(patch.owner === "visual" ? { visualId: chosenVisualId(session) } : {}) })) throw new Draft2InputError("The review read other versions of the carousel; read it again before applying a patch.");
      if (!sameWords(patchedText(session, current, patch), patch.before)) throw new Draft2InputError("The slide no longer says what the review quoted; read the carousel again.");
      changes = record({ ...patch, status: "applied", appliedAt: now, appliedBy: by }, patched(session, chosen, patch, patch.after));
    }
    const updated = await updateDraft2Session(session.id, changes);
    if (!updated) throw new Draft2InputError("This Draft 2 session was not found. Reload the canvas.");
    session = updated;
  }
  return session;
}
