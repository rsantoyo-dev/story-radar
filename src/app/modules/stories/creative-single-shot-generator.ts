import "server-only";

import {
  acquisitionAngleInstruction,
  acquisitionHookInstruction,
  assertVisibleDraftLanguage,
  BRIEF_SYSTEM_INSTRUCTION,
  briefForPrompt,
  CreativeContentResponseError,
  creativeBriefSchema,
  creativeDraftSchema,
  DRAFT_SYSTEM_INSTRUCTION,
  generateGeminiJson,
  isTransientGeminiError,
  parseCreativeDraft,
  parseGroundedCreativeBrief,
  parseJsonObject,
  profileForPrompt,
  providerLabel,
  strictCreativeSchema,
  sumCreativeAiUsage,
  topicForPrompt,
  type CreativeStoryInput,
  type CreativeTopicContext,
  type GeneratorOptions,
} from "./gemini-creative-content-generator";
import { failedGeminiUsage } from "./creative-gemini-request";
import { generateOpenAiStructuredResponse } from "./openai-structured-response";
import { creativeBriefFramingInstruction, creativeScriptFramingInstruction } from "./creative-framing-instruction";
import { CREATIVE_PUBLISHABLE_THRESHOLDS } from "./creative-quality";
import { effectiveFramingStrategy } from "./creative-content.types";
import { carouselNarrativePolicyForPrompt, unspentPlanFactIds } from "./carousel-narrative";
import { deterministicCreativeQualityIssues, repairDeterministicCreativeCopy } from "./creative-quality";
import { unsupportedFactNames } from "./creative-fact-guard";
import { enforceCoverTitle } from "./creative-cover-title";
import type { TopicAcquisitionTaxonomy } from "./acquisition-lenses";
import type {
  CreativeAiUsage,
  CreativeAspectRatio,
  CreativeCharacterRosterEntry,
  CreativeFormat,
  CreativeQualityIssue,
  GeneratedCreativeBrief,
  GeneratedCreativeDraft,
} from "./creative-content.types";

export type CreativeVisualNeed =
  | "verified-map"
  | "real-photo"
  | "character-reference"
  | "generic-illustration"
  | "typography";

const VISUAL_NEEDS = new Set<string>([
  "verified-map",
  "real-photo",
  "character-reference",
  "generic-illustration",
  "typography",
]);

/**
 * The draft schema plus a per-unit visualNeed.
 *
 * visualNeed is deliberately a plain string with no `enum`: Gemini's
 * responseJsonSchema validator rejects this schema outright (HTTP 400
 * INVALID_ARGUMENT, no field detail) once that enum is attached, the same way
 * it rejects creativeGroundingAuditSchema's field/category enums. The allowed
 * values are stated in the prompt instead and enforced by attachVisualNeeds
 * below, which falls back to a safe value for anything unrecognized — the
 * pattern this codebase already uses for that provider quirk.
 */
export function creativeSingleShotDraftSchema(
  format: CreativeFormat,
  carouselSlideCount: number | undefined,
  includeCharacterPlan: boolean,
): Record<string, unknown> {
  const draft = creativeDraftSchema(format, carouselSlideCount, includeCharacterPlan) as {
    required: string[];
    properties: Record<string, unknown>;
  };
  const units = draft.properties.units as {
    items: { required: string[]; properties: Record<string, unknown> };
  };
  return {
    ...draft,
    properties: {
      ...draft.properties,
      units: {
        ...units,
        items: {
          ...units.items,
          required: [...units.items.required, "visualNeed"],
          properties: { ...units.items.properties, visualNeed: { type: "string" } },
        },
      },
    },
  };
}

const VISUAL_NEED_INSTRUCTION = `\n\nFor every unit, also return visualNeed, exactly one of "verified-map", "real-photo", "character-reference", "generic-illustration" or "typography", describing what that slide's visualDirection actually requires: "verified-map" only when the slide depicts a specific real place, route or geographic extent precisely enough that it must come from verified map data; "real-photo" when the slide needs documentary photographic evidence rather than an illustrated scene; "character-reference" when the visualDirection calls for one of the topic's configured recurring characters; "typography" when assetRequest is typography-only; otherwise "generic-illustration". Return no other value. This field does not change what the image pipeline renders yet — it only records the slide's visual intent for later use.`;

/**
 * Output cap for the brief call. Sized so MAX_BRIEF_KEY_FACTS facts with claim
 * guards fit without truncating; a cap, so an ordinary brief costs no more.
 */
const BRIEF_OUTPUT_TOKENS = 12_288;

/**
 * Appended when the script call is a rewrite after an independent review.
 * A targeted patch cannot re-lead a cover, rewrite a closing so it resolves
 * the opening, or remove a causal link the facts do not state — two live runs
 * showed exactly those findings surviving a patch. A rewrite by the writer,
 * against the same brief, with the reviewed script and every finding in
 * hand, can; and it costs the same single call.
 */
const REVISION_INSTRUCTION = `\n\nREVISION: this is a rewrite of a script an independent editor has reviewed, not a first draft. previousScript is the reviewed copy and reviewFindings are the editor's findings. Each finding's message is its acceptance condition and every one must be resolved, whatever its severity: each holds a scored dimension below qualityThresholds (compare currentScores). You may restructure any slide a finding names — re-lead the cover with the configured framing, rewrite the closing so it resolves the opening, remove an explanatory or causal link the cited facts do not state, cut over-length copy to 40 words or fewer. Keep every slide no finding names exactly as it is, word for word, including its factIds and visual direction. Use only the brief's facts and each slide's allowed fact IDs, as before.`;

const BRIEF_RETRY = `\n\nYour previous response failed validation; the error is supplied as previousValidationError. Correct exactly that problem and return a complete brief, keeping everything that was already correct.`;

const DRAFT_RETRY = `\n\nYour previous response failed validation; the error is supplied as previousValidationError. Correct exactly that problem and return a complete script, keeping everything that was already correct. Return exactly the planned slide count, in the planned order, using only each slide's allowed fact IDs. When a slide's supporting text is over the limit, cut it to 40 words or fewer — word counts drift upward, so leave a margin below 45.`;

/** Merge the raw response's per-unit visualNeed onto the parsed draft; parseCreativeDraft does not know this field. */
function attachVisualNeeds(draft: GeneratedCreativeDraft, text: string): GeneratedCreativeDraft {
  const value = parseJsonObject(text);
  const rawUnits = Array.isArray(value.units) ? value.units : [];
  return {
    ...draft,
    units: draft.units.map((unit, index) => {
      const raw = rawUnits[index];
      const rawVisualNeed =
        raw && typeof raw === "object" ? (raw as Record<string, unknown>).visualNeed : undefined;
      const visualNeed: CreativeVisualNeed =
        typeof rawVisualNeed === "string" && VISUAL_NEEDS.has(rawVisualNeed)
          ? (rawVisualNeed as CreativeVisualNeed)
          : "generic-illustration";
      return { ...unit, visualNeed };
    }),
  };
}

export type SingleShotScriptResult = {
  brief: GeneratedCreativeBrief;
  draft: GeneratedCreativeDraft;
  /** The provider that wrote the visible script. The brief is always Gemini's. */
  provider: "google" | "openai";
  model: string;
  modelVersion?: string;
  usage: CreativeAiUsage;
  /** Physical calls spent (2 nominally, more when a validation retry was needed). Count this against the caller's call budget. */
  attempts: number;
};

const zeroUsage = (): CreativeAiUsage => ({ promptTokens: 0, outputTokens: 0, thoughtsTokens: 0, totalTokens: 0 });

/** Attach a completed call's usage to an error thrown while validating its response. */
function withBilledUsage(error: unknown, usage: CreativeAiUsage): unknown {
  if (error instanceof Error) Object.assign(error, { creativeGeminiUsage: usage });
  return error;
}

/**
 * The generate step: two Gemini calls, back to back, then the editorial
 * orchestrator audits once.
 *
 * It is deliberately NOT one merged call. Gemini's responseJsonSchema
 * validator rejects the union of creativeBriefSchema and creativeDraftSchema
 * with a bare HTTP 400 INVALID_ARGUMENT (verified live: each schema is
 * accepted alone, any merge containing `units` is refused, and no field-level
 * detail is returned). The two schemas used here are the ones the legacy
 * pipeline already sends, unchanged, so they are known to be accepted.
 *
 * What the single-shot rewrite actually removes is still removed: the
 * OpenAI narrative-plan review loop (up to 4 calls), the Luna fallbacks, and
 * the multi-tier Terra/Sol repair loop. A typical run is 3 calls
 * (brief, draft, audit) against roughly 15 before.
 *
 * Gemini only, no cascade to Groq/Cloudflare/OpenAI: a vendor swap here would
 * either burn the call budget or make generation and the later audit the same
 * vendor family. Each step gets one bounded validation retry, mirroring
 * generateUnreviewedCreativeBrief's existing pattern.
 */
export async function generateSingleShotCreativeScript(
  options: GeneratorOptions & {
    format: CreativeFormat;
    outputAspectRatio: CreativeAspectRatio;
    characterRoster: CreativeCharacterRosterEntry[];
    /** Required to extract a brief; unnecessary when existingBrief is supplied. */
    acquisitionTaxonomy?: TopicAcquisitionTaxonomy;
    /** Physical Gemini attempts this step may spend, so it cannot consume the audit's budget. */
    maxAttempts?: number;
    /**
     * Rewrite the script against a brief that already exists instead of
     * extracting a new one. This is what "regenerate the draft" means: the
     * evidence, angle and plan the editor already reviewed are kept, and only
     * the visible copy is written again — one Gemini call instead of two.
     */
    existingBrief?: GeneratedCreativeBrief;
    /**
     * Rewrite a reviewed script instead of writing a first one: the previous
     * copy and the independent review's findings go to the writer, which
     * writes the whole script again against existingBrief. The orchestrator's
     * repair step; one attempt, then the verify decides.
     */
    revision?: {
      previousDraft: GeneratedCreativeDraft;
      findings: CreativeQualityIssue[];
      scores?: NonNullable<GeneratedCreativeDraft["qualityReview"]>["scores"];
      thresholds: typeof CREATIVE_PUBLISHABLE_THRESHOLDS;
    };
  },
): Promise<SingleShotScriptResult> {
  const {
    apiKey,
    paidGeminiApiKey,
    model,
    story,
    topic,
    profile,
    editorialDirection,
    format,
    outputAspectRatio,
    characterRoster,
    acquisitionTaxonomy,
    maxAttempts,
    existingBrief,
    revision,
  } = options;
  if (revision && !existingBrief) {
    throw new CreativeContentResponseError("A revision rewrites against the reviewed brief; supply existingBrief.");
  }
  const sharedContents = {
    carouselNarrativePolicy: carouselNarrativePolicyForPrompt(profile.conversionGoal),
    topic: topicForPrompt(topic as CreativeTopicContext),
    creativeProfile: profileForPrompt(profile),
  };
  const fullStory = story as CreativeStoryInput;
  let usage = zeroUsage();
  let attempts = 0;
  let lastModel = model;
  let lastModelVersion: string | undefined;

  // Gemini's own second account is not a vendor swap: it keeps generation on
  // Gemini and the later audit on OpenAI, so the independence guarantee holds.
  // Only overload/quota failures are re-sent — a rejected request or a bad
  // credential fails identically on the other account.
  const allAccounts = paidGeminiApiKey && paidGeminiApiKey !== apiKey ? [apiKey, paidGeminiApiKey] : [apiKey];
  // Later calls in the same run start on the account that just worked, rather
  // than re-failing on one already known to be overloaded.
  let preferredAccount = 0;

  const call = async (
    systemInstruction: string,
    schema: Record<string, unknown>,
    contents: Record<string, unknown>,
    maxOutputTokens: number,
  ) => {
    const accounts = [...allAccounts.slice(preferredAccount), ...allAccounts.slice(0, preferredAccount)];
    let lastError: unknown;
    for (const [index, key] of accounts.entries()) {
      if (maxAttempts !== undefined && attempts >= maxAttempts) {
        throw new CreativeContentResponseError(
          `Generation reached its ${maxAttempts}-call limit before producing a usable script. The remaining budget is reserved for the independent review.`,
        );
      }
      attempts += 1;
      try {
        const response = await generateGeminiJson({ apiKey: key, model, systemInstruction, schema, contents, maxOutputTokens });
        usage = sumCreativeAiUsage(usage, response.usage);
        lastModel = response.model;
        lastModelVersion = response.modelVersion ?? lastModelVersion;
        preferredAccount = allAccounts.indexOf(key);
        return response;
      } catch (error) {
        usage = sumCreativeAiUsage(usage, failedGeminiUsage(error));
        lastError = error;
        if (!isTransientGeminiError(error) || index === accounts.length - 1) throw error;
        console.warn(
          `A Gemini account was unavailable (${error instanceof Error ? error.message : "unknown"}); retrying on the other account.`,
        );
      }
    }
    throw lastError;
  };

  // A Topic may hand the script to an OpenAI writer, the same knob the legacy
  // pipeline exposes as carouselWriterModel. Only the visible copy moves: the
  // brief stays on Gemini, so evidence selection and the writing that spends it
  // are still two different vendors' work. The later audit does then share a
  // vendor family with the writer — an accepted tradeoff for a stronger first
  // draft, not an oversight. Leave it unset to keep everything on Gemini.
  const writerModel = format === "carousel" ? options.carouselWriterModel : undefined;
  const draftProvider = writerModel ? ("openai" as const) : ("google" as const);
  if (writerModel && !options.openAiApiKey) {
    throw new CreativeContentResponseError(
      "The configured carousel writer requires an OpenAI API key.",
    );
  }

  const callWriter = async (
    systemInstruction: string,
    schema: Record<string, unknown>,
    contents: Record<string, unknown>,
    maxOutputTokens: number,
  ) => {
    if (maxAttempts !== undefined && attempts >= maxAttempts) {
      throw new CreativeContentResponseError(
        `Generation reached its ${maxAttempts}-call limit before producing a usable script. The remaining budget is reserved for the independent review.`,
      );
    }
    attempts += 1;
    // No fallback to Gemini on failure: a half-configured writer should surface
    // as a resumable failure, not silently produce a draft from another model
    // than the Topic asked for.
    const response = await generateOpenAiStructuredResponse({
      apiKey: options.openAiApiKey!,
      model: writerModel!,
      instructions: systemInstruction,
      contents,
      schema: strictCreativeSchema(schema),
      schemaName: "creative_draft",
      maxOutputTokens: Math.max(maxOutputTokens, 8_192),
      // The legacy writer path hardcodes "low", tuned for Luna as a cheap
      // fallback. Here the writer is chosen for quality, and the script
      // decides hook, structure and fact allocation — the calls where extra
      // reasoning pays. Its cost is bounded by maxOutputTokens either way.
      reasoningEffort: "medium",
      auditContext: options.openAiAuditContext,
    });
    usage = sumCreativeAiUsage(usage, response.usage);
    lastModel = response.model;
    return response;
  };

  // Step 1: facts, angle and narrative plan.
  const briefInstruction = acquisitionTaxonomy
    ? `${BRIEF_SYSTEM_INSTRUCTION}\n\n${creativeBriefFramingInstruction(
        profile.framingStrategy as Parameters<typeof creativeBriefFramingInstruction>[0],
      )}\n\n${acquisitionAngleInstruction(acquisitionTaxonomy)}`
    : "";
  const briefSchema = acquisitionTaxonomy ? creativeBriefSchema(acquisitionTaxonomy) : {};
  const briefContents = {
    ...sharedContents,
    acquisitionTaxonomy,
    editorialDirection: editorialDirection ?? null,
    requestedFormat: format,
    // Only this call sees the article: it is the one extracting evidence.
    story: fullStory,
  };
  const parseBrief = (text: string, strict: boolean) => {
    // Grounding narrows a statement to its excerpt when the statement names
    // people, places or organizations the excerpt does not — which is safe
    // but loses names the article may well carry. So the first response is
    // sent back once, before that narrowing, with the facts and names listed:
    // the model can widen the excerpt and keep them. The retry is narrowed.
    if (strict) {
      const raw = parseJsonObject(text) as { keyFacts?: unknown };
      const leaks = (Array.isArray(raw.keyFacts) ? raw.keyFacts : []).flatMap((item) => {
        const fact = item as { id?: unknown; statement?: unknown; sourceExcerpt?: unknown };
        if (typeof fact.statement !== "string" || typeof fact.sourceExcerpt !== "string") return [];
        const names = unsupportedFactNames(fact.statement, fact.sourceExcerpt);
        return names.length ? [`${typeof fact.id === "string" ? fact.id : "a fact"} (${names.join("; ")})`] : [];
      });
      if (leaks.length) {
        throw new CreativeContentResponseError(
          `Facts ${leaks.join(", ")} name people, places or organizations that their cited sourceExcerpt does not. Widen each sourceExcerpt to one contiguous passage of the story that names them, or remove those names from the statement; keep every statement in the source language. Numbers, dates and names must all come from the cited excerpt.`,
        );
      }
    }
    const parsed = parseGroundedCreativeBrief(text, story.text, profile.conversionGoal, acquisitionTaxonomy, false);
    // A fact no slide before the closing may use can reach the carousel
    // nowhere, because the closing only reuses what the reader has seen. The
    // first response is sent back once with those facts named, so the plan
    // can seat them or drop them; the retry is accepted as planned rather than
    // failing the run over allocation.
    if (strict && parsed.carouselPlan) {
      const unspent = unspentPlanFactIds(parsed.carouselPlan, parsed.keyFacts.map((fact) => fact.id));
      if (unspent.length) {
        throw new CreativeContentResponseError(
          `Facts ${unspent.join(", ")} are extracted but no slide before the closing is allowed to use them, so the ending cannot resolve the opening with them (a closing may only reuse evidence the reader has seen). Assign each to the slide that answers its question, add slides (up to 8) if the arc needs them, or drop it from keyFacts and renumber if it is not load-bearing.`,
        );
      }
    }
    return parsed;
  };

  let brief: GeneratedCreativeBrief;
  if (existingBrief) {
    brief = existingBrief;
  } else if (!acquisitionTaxonomy) {
    throw new CreativeContentResponseError(
      "Extracting a brief needs the Topic's acquisition taxonomy; supply existingBrief to rewrite a script without it.",
    );
  } else {
    const briefResponse = await call(briefInstruction, briefSchema, briefContents, BRIEF_OUTPUT_TOKENS);
    try {
      brief = parseBrief(briefResponse.text, true);
    } catch (error) {
      if (!(error instanceof CreativeContentResponseError)) throw withBilledUsage(error, briefResponse.usage);
      console.warn(`Single-shot brief failed validation: ${error.message} Retrying once with the error as feedback.`);
      const retry = await call(
        briefInstruction + BRIEF_RETRY,
        briefSchema,
        { ...briefContents, previousValidationError: error.message, previousBrief: briefResponse.text },
        BRIEF_OUTPUT_TOKENS,
      );
      brief = parseBrief(retry.text, false);
    }
  }

  // Step 2: the visible script, written against the brief just produced. The
  // slide count is known now, so the schema pins units to exactly it.
  const carouselLike = format === "carousel" || format === "sequence";
  const draftSchema = creativeSingleShotDraftSchema(
    format,
    carouselLike ? brief.carouselPlan?.slideCount : undefined,
    characterRoster.length > 0,
  );
  // The chosen acquisition lens steers how the opening is written and requires
  // the cover's promise to be paid off by a later slide. Without it the model
  // gets the hook text but none of the reasoning that shaped it.
  // The framing the brief actually applied (it may have fallen back from the
  // profile's), stated for the script in its own terms: what the cover opens
  // with and what the closing resolves. The brief call always had this; the
  // script call did not, and a reader-consequence cover led with a duration.
  const draftInstruction = `${DRAFT_SYSTEM_INSTRUCTION}${acquisitionHookInstruction(
    brief.editorialAngle,
    acquisitionTaxonomy,
  )}${VISUAL_NEED_INSTRUCTION}\n\n${creativeScriptFramingInstruction(
    effectiveFramingStrategy(
      profile.framingStrategy as Parameters<typeof creativeScriptFramingInstruction>[0],
      brief,
    ),
  )}${revision ? REVISION_INSTRUCTION : ""}`;
  const draftContents = {
    ...sharedContents,
    requestedFormat: format,
    ...(revision
      ? {
          previousScript: {
            concept: revision.previousDraft.concept,
            caption: revision.previousDraft.caption,
            hashtags: revision.previousDraft.hashtags,
            units: revision.previousDraft.units.map((unit) => ({
              order: unit.order,
              role: unit.role,
              editorialGoal: unit.editorialGoal,
              viewerQuestion: unit.viewerQuestion,
              headline: unit.headline,
              subheadline: unit.subheadline,
              body: unit.body,
              continuationCue: unit.continuationCue,
              ctaQuestion: unit.ctaQuestion,
              factIds: unit.factIds,
              visualDirection: unit.visualDirection,
            })),
          },
          reviewFindings: revision.findings,
          slidesToRevise: [...new Set(revision.findings.flatMap((issue) => (issue.unitOrder ? [issue.unitOrder] : [])))],
          qualityThresholds: revision.thresholds,
          ...(revision.scores ? { currentScores: revision.scores } : {}),
        }
      : {}),
    ...(profile.requireCoverTitle
      ? {
          coverTitle: brief.contentTitle ?? story.title,
          coverTitlePolicy:
            "Keep the hook as headline and this content name as the cover subheadline. The headline must add curiosity through a source-supported technique, contrast, ingredient combination or result; it must not repeat or paraphrase the content name.",
        }
      : {}),
    constraints:
      format === "meme"
        ? { units: 1, aspectRatio: outputAspectRatio }
        : { units: brief.carouselPlan?.slideCount, aspectRatio: outputAspectRatio },
    ...(carouselLike && brief.carouselPlan ? { carouselPlan: brief.carouselPlan } : {}),
    // The same projection the legacy pipeline sends: every fact carries its
    // claimGuard (certainty, required/forbidden phrases, allowed numbers), and
    // contentSufficiency plus suggestedConcepts tell the writer how far the
    // evidence actually reaches.
    creativeBrief: briefForPrompt({ ...brief, ...(editorialDirection ? { editorialDirection } : {}) }),
    supportingCharacterRoster: characterRoster.slice(0, 2).map((character) => ({ id: character.id, name: character.name })),
    // Deliberately no article text: the brief already carries the selected
    // excerpts, and handing the writer the raw source invites it to introduce
    // unselected facts (AGENTS.md §20).
    story: {
      title: fullStory.title,
      url: fullStory.url,
      contentStatus: fullStory.contentStatus,
      contentSource: fullStory.contentSource,
      ...(fullStory.editorialContext
        ? { editorialContext: fullStory.editorialContext, editorialRevision: fullStory.editorialRevision }
        : {}),
    },
  };
  const parseDraft = (text: string, strictCopy: boolean) => {
    let value = parseCreativeDraft(
      text,
      format,
      brief,
      outputAspectRatio,
      characterRoster,
      brief.carouselPlan,
      false,
      true,
      providerLabel(draftProvider),
      true,
    );
    assertVisibleDraftLanguage(value, profile.language);
    value = attachVisualNeeds(value, text);
    value = repairDeterministicCreativeCopy(
      value,
      format,
      brief.keyFacts,
      profile.language,
      profile.conversionGoal,
      brief.carouselPlan,
    );
    value = enforceCoverTitle(value, profile.requireCoverTitle, brief.contentTitle ?? story.title);
    // Over-length supporting text is deterministic and cheap to fix here,
    // expensive to fix later: left in, it reaches the audit as a finding and
    // can cost a whole repair-and-verify round. The first response is held to
    // it and rewritten once with the exact slides named; the retry is accepted
    // as is, so a stubborn 47-word slide cannot sink the generation.
    if (strictCopy) {
      const overLength = deterministicCreativeQualityIssues(
        value,
        format,
        brief.keyFacts,
        profile.language,
        profile.conversionGoal,
        profile.framingStrategy,
      ).filter((issue) => /body[-_]too[-_]long/i.test(issue.code));
      if (overLength.length) {
        throw new CreativeContentResponseError(overLength.map((issue) => issue.message).join(" "));
      }
    }
    return value;
  };

  let draft: GeneratedCreativeDraft;
  const writeScript = writerModel ? callWriter : call;
  const draftResponse = await writeScript(draftInstruction, draftSchema, draftContents, format === "meme" ? 3_072 : 6_144);
  try {
    // A revision is already the second look at this copy; holding it to the
    // local length rewrite would spend the one attempt it has.
    draft = parseDraft(draftResponse.text, !revision);
  } catch (error) {
    if (!(error instanceof CreativeContentResponseError)) throw withBilledUsage(error, draftResponse.usage);
    console.warn(`Single-shot script failed validation: ${error.message} Retrying once with the error as feedback.`);
    const retry = await writeScript(
      draftInstruction + DRAFT_RETRY,
      draftSchema,
      { ...draftContents, previousValidationError: error.message, previousDraft: draftResponse.text },
      format === "meme" ? 3_072 : 6_144,
    );
    draft = parseDraft(retry.text, false);
  }

  return {
    brief,
    draft,
    provider: draftProvider,
    model: lastModel,
    ...(lastModelVersion ? { modelVersion: lastModelVersion } : {}),
    usage,
    attempts,
  };
}
