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
  sumCreativeAiUsage,
  topicForPrompt,
  type CreativeStoryInput,
  type CreativeTopicContext,
  type GeneratorOptions,
} from "./gemini-creative-content-generator";
import { failedGeminiUsage } from "./creative-gemini-request";
import { creativeBriefFramingInstruction } from "./creative-framing-instruction";
import { carouselNarrativePolicyForPrompt } from "./carousel-narrative";
import { repairDeterministicCreativeCopy } from "./creative-quality";
import { enforceCoverTitle } from "./creative-cover-title";
import type { TopicAcquisitionTaxonomy } from "./acquisition-lenses";
import type {
  CreativeAiUsage,
  CreativeAspectRatio,
  CreativeCharacterRosterEntry,
  CreativeFormat,
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

const BRIEF_RETRY = `\n\nYour previous response failed validation; the error is supplied as previousValidationError. Correct exactly that problem and return a complete brief, keeping everything that was already correct.`;

const DRAFT_RETRY = `\n\nYour previous response failed validation; the error is supplied as previousValidationError. Correct exactly that problem and return a complete script, keeping everything that was already correct. Return exactly the planned slide count, in the planned order, using only each slide's allowed fact IDs.`;

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
  provider: "google";
  model: string;
  modelVersion?: string;
  usage: CreativeAiUsage;
  /** Physical Gemini calls spent (2 nominally, more when a validation retry was needed). Count this against the caller's call budget. */
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
  } = options;
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
  const parseBrief = (text: string) =>
    parseGroundedCreativeBrief(text, story.text, profile.conversionGoal, acquisitionTaxonomy, false);

  let brief: GeneratedCreativeBrief;
  if (existingBrief) {
    brief = existingBrief;
  } else if (!acquisitionTaxonomy) {
    throw new CreativeContentResponseError(
      "Extracting a brief needs the Topic's acquisition taxonomy; supply existingBrief to rewrite a script without it.",
    );
  } else {
    const briefResponse = await call(briefInstruction, briefSchema, briefContents, 4_096);
    try {
      brief = parseBrief(briefResponse.text);
    } catch (error) {
      if (!(error instanceof CreativeContentResponseError)) throw withBilledUsage(error, briefResponse.usage);
      console.warn(`Single-shot brief failed validation: ${error.message} Retrying once with the error as feedback.`);
      const retry = await call(
        briefInstruction + BRIEF_RETRY,
        briefSchema,
        { ...briefContents, previousValidationError: error.message, previousBrief: briefResponse.text },
        4_096,
      );
      brief = parseBrief(retry.text);
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
  const draftInstruction = `${DRAFT_SYSTEM_INSTRUCTION}${acquisitionHookInstruction(
    brief.editorialAngle,
    acquisitionTaxonomy,
  )}${VISUAL_NEED_INSTRUCTION}`;
  const draftContents = {
    ...sharedContents,
    requestedFormat: format,
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
  const parseDraft = (text: string) => {
    let value = parseCreativeDraft(
      text,
      format,
      brief,
      outputAspectRatio,
      characterRoster,
      brief.carouselPlan,
      false,
      true,
      providerLabel("google"),
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
    return enforceCoverTitle(value, profile.requireCoverTitle, brief.contentTitle ?? story.title);
  };

  let draft: GeneratedCreativeDraft;
  const draftResponse = await call(draftInstruction, draftSchema, draftContents, format === "meme" ? 3_072 : 6_144);
  try {
    draft = parseDraft(draftResponse.text);
  } catch (error) {
    if (!(error instanceof CreativeContentResponseError)) throw withBilledUsage(error, draftResponse.usage);
    console.warn(`Single-shot script failed validation: ${error.message} Retrying once with the error as feedback.`);
    const retry = await call(
      draftInstruction + DRAFT_RETRY,
      draftSchema,
      { ...draftContents, previousValidationError: error.message, previousDraft: draftResponse.text },
      format === "meme" ? 3_072 : 6_144,
    );
    draft = parseDraft(retry.text);
  }

  return {
    brief,
    draft,
    provider: "google",
    model: lastModel,
    ...(lastModelVersion ? { modelVersion: lastModelVersion } : {}),
    usage,
    attempts,
  };
}
