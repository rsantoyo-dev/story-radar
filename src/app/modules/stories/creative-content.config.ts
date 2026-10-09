import "server-only";

import type { CreativeFormat } from "./creative-content.types";
import type { CreativeEditorialModelConfig } from "./creative-editorial-router";

export type CreativeTextProvider = "gemini" | "groq";

export type CreativeContentPublicConfig = {
  provider: "google" | "groq";
  model: string;
  primaryProvider: CreativeTextProvider;
  carouselWriterModel?: string;
  /** Single-shot only: rewrites the script during the repair loop. Falls back to carouselWriterModel when unset. */
  repairWriterModel?: string;
  briefPromptVersion: string;
  draftPromptVersions: Record<CreativeFormat, string>;
  maxRunsPerDay: number;
  maxContentCharacters: number;
};

export type CreativeContentRuntimeConfig = CreativeContentPublicConfig & {
  apiKey: string;
  /** Optional second Gemini account, attempted before non-Google providers. */
  paidGeminiApiKey?: string;
  /** Optional capacity/token-limit fallback for creative briefs and drafts. */
  groqApiKey?: string;
  groqModel?: string;
  /** Optional final fallback using Cloudflare Workers AI JSON mode. */
  cloudflareAiAccountId?: string;
  cloudflareAiApiToken?: string;
  cloudflareAiModel?: string;
  /** Optional OpenAI quality gate. Gemini remains the draft author. */
  openAiApiKey?: string;
  openAiEditorialModels: CreativeEditorialModelConfig;
};

/**
 * Companion Stories deliberately use the OpenAI editorial pipeline rather
 * than the primary Gemini/Groq draft provider. Keep this separate so an
 * approved script can still produce a Story in installations that only have
 * the OpenAI key configured for this feature.
 */
export type CreativeCompanionRuntimeConfig = {
  apiKey: string;
  lunaModel: string;
  terraModel: string;
  promptVersion: string;
};

const DEFAULT_MAX_RUNS_PER_DAY = 40;
const DEFAULT_MAX_CONTENT_CHARACTERS = 15_000;

export function getCreativeContentRuntimeConfig(): CreativeContentRuntimeConfig {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  const paidGeminiApiKey = process.env.GEMINI_PAID_API_KEY?.trim();
  const groqApiKey = process.env.GROQ_API_KEY?.trim();
  const cloudflareAiAccountId = process.env.CLOUDFLARE_AI_ACCOUNT_ID?.trim();
  const cloudflareAiApiToken = process.env.CLOUDFLARE_AI_API_TOKEN?.trim();
  const cloudflareAiModel =
    process.env.CLOUDFLARE_AI_MODEL?.trim() ||
    "@cf/zai-org/glm-4.7-flash";
  const openAiApiKey = process.env.OPENAI_API_KEY?.trim();
  // 2026-09-24: GPT-6 Sol/Luna launched at roughly half GPT-5.6's per-token
  // price (docs/creative-text-recovery.md has the checked rates). Luna/Terra
  // roles move up to Sol's old tier at the new generation's price; the severe
  // tier — the last-resort escalation after minor/structural repair already
  // failed — moves up again to Astra was considered and rejected as 2.5x
  // Sol's price with no material capability gain for this role; GPT-6 Luna
  // (40x cheaper than 5.6 Sol) took its place instead, since a repair tier
  // reached only after two lighter tiers have already failed benefits more
  // from headroom than from raw model size. The carousel writer is deliberately
  // exempted from this last step — see CREATIVE_CAROUSEL_WRITER_MODEL in .env.local.
  const openAiEditorialModels: CreativeEditorialModelConfig = {
    criticModel:
      process.env.CREATIVE_CRITIC_MODEL?.trim() || "gpt-6.1-sol",
    minorRepairModel:
      process.env.CREATIVE_MINOR_REPAIR_MODEL?.trim() || "gpt-6.1-sol",
    structuralRepairModel:
      process.env.CREATIVE_STRUCTURAL_REPAIR_MODEL?.trim() || "gpt-6.1-sol",
    severeRepairModel:
      process.env.CREATIVE_SEVERE_REPAIR_MODEL?.trim() || "gpt-6-luna",
  };
  const publicConfig = getCreativeContentPublicConfig();
  if (publicConfig.carouselWriterModel && !openAiApiKey) {
    throw new CreativeContentConfigurationError("OPENAI_API_KEY is required for CREATIVE_CAROUSEL_WRITER_MODEL");
  }
  if (Boolean(cloudflareAiAccountId) !== Boolean(cloudflareAiApiToken)) {
    throw new CreativeContentConfigurationError(
      "CLOUDFLARE_AI_ACCOUNT_ID and CLOUDFLARE_AI_API_TOKEN must be configured together",
    );
  }
  const cloudflareFallback =
    cloudflareAiAccountId && cloudflareAiApiToken
      ? {
          cloudflareAiAccountId,
          cloudflareAiApiToken,
          cloudflareAiModel,
        }
      : {};

  if (publicConfig.primaryProvider === "groq") {
    if (!groqApiKey) {
      throw new CreativeContentConfigurationError(
        "GROQ_API_KEY is not configured",
      );
    }

    return {
      apiKey: groqApiKey,
      groqApiKey,
      groqModel: publicConfig.model,
      ...cloudflareFallback,
      ...(openAiApiKey ? { openAiApiKey } : {}),
      openAiEditorialModels,
      ...publicConfig,
    };
  }

  if (!apiKey) {
    throw new CreativeContentConfigurationError(
      "GEMINI_API_KEY is not configured",
    );
  }

  return {
    apiKey,
    ...(paidGeminiApiKey && paidGeminiApiKey !== apiKey
      ? { paidGeminiApiKey }
      : {}),
    ...(groqApiKey
      ? {
          groqApiKey,
          groqModel:
            process.env.CREATIVE_GROQ_MODEL?.trim() || "openai/gpt-oss-20b",
        }
      : {}),
    ...cloudflareFallback,
    ...(openAiApiKey ? { openAiApiKey } : {}),
    openAiEditorialModels,
    ...publicConfig,
  };
}

export function getCreativeContentPublicConfig(): CreativeContentPublicConfig {
  const carouselWriterModel = process.env.CREATIVE_CAROUSEL_WRITER_MODEL?.trim() || undefined;
  const repairWriterModel = process.env.CREATIVE_SINGLE_SHOT_REPAIR_MODEL?.trim() || undefined;
  const primaryProvider = creativeTextProvider();
  const geminiModel =
    process.env.CREATIVE_GEMINI_MODEL?.trim() ||
    process.env.GEMINI_MODEL?.trim() ||
    "gemini-3.6-flash";
  const groqModel =
    process.env.CREATIVE_GROQ_MODEL?.trim() || "openai/gpt-oss-20b";

  return {
    provider: primaryProvider === "groq" ? "groq" : "google",
    model: primaryProvider === "groq" ? groqModel : geminiModel,
    primaryProvider,
    ...(carouselWriterModel ? { carouselWriterModel } : {}),
    ...(repairWriterModel ? { repairWriterModel } : {}),
    // v36: keyFacts ceiling 6 -> 15 and "extract every load-bearing fact"
    // guidance. v37: the closing may not copy any single earlier slide and
    // every fact must be seated before the closing; the plan repair changed
    // with it. v38: a statement may not name people, places or organizations
    // its excerpt does not (grounding narrows it, after one rewrite). v39: the
    // planning prompt describes each goal's job instead of showing a template
    // question, and arc alignment keeps the model's closing question. Bumped
    // so plans built on template questions are not reused. v40: the
    // "hook-list" story structure (one enumerated item per slide, a
    // count-and-subject cover, a closing that helps the reader act on the
    // list) and its list arc in the narrative policy. v41: "auto" decides from
    // the source whether the story is an enumerated list and the brief
    // declares carouselPlan.structure; lists take one slide per item up to 20
    // slides (24 facts, enforced by the parser); never extract or write that a
    // detail is missing; lead with the experience, logistics after it. v42: a
    // list's hook slide also carries the facts of its draw (free, new,
    // ending this weekend) so the cover can promise it. v43: each list item
    // keeps its practical passage (day, time, price, ages) as a fact of its
    // own, extracted verbatim from a labelled block when the model misses it
    // (attachListPracticalFacts); the closing may cite one per item; a
    // forecast for the period stays a qualified fact.
    briefPromptVersion: "creative-brief-v43",
    // v28/v52/v7: the writer now has explicit guidance for what a
    // publish-ready caption reads like — a concrete opening stake, one line
    // per distinct practical consequence the facts support, and caption
    // sharing the closing unit's single conversionGoal action rather than
    // adding a second one (a save/share nudge alongside it is still a
    // second action). Applies uniformly across formats, since caption/
    // hashtags exist on all three.
    draftPromptVersions: {
      meme: "meme-draft-v28",
      // v49/v48: the script call now states the applied framing in the
      // writer's terms, and a repair is a rewrite with the review in hand.
      // v50/v49: the writer is told to declare verified-map on the locating
      // slide of a closure/works/venue story; the pipeline now reads it.
      // v51: the writer is also told to declare real-photo for a slide about
      // a specific named landmark, even one it cannot itself confirm evidence
      // for — requiresVerifiedGeography now routes that value too, into the
      // same photo/map/fallback chain (never an archive photo as proof of a
      // current closure/works/change).
      // v53/v8: the script call states the story structure in the writer's
      // terms (hook-list items, or hook-steps for a procedure drafted as a
      // carousel), and the critic is told a count-and-subject cover is the
      // list's reason to continue.
      // v54/v9: an "auto" brief that found a list is written as one (list
      // headlines name the item and what the reader gets, never a price or a
      // condition), up to 20 slides, and no copy says a detail is unknown.
      // v55/v10: list items use the event's own name and open with what
      // happens there; a list closing plans the whole list (by day when it
      // can), never a subset; visual directions keep an identity's mixed media.
      // v56/v11: a real-photo slide's direction is the scene of what happens
      // there (fictional people, real objects, generic setting), never an
      // abstract arrangement of shapes.
      // v57/v12: list slides are lighter (headline ≤ 8 words, one sentence and
      // a practical line, fine print in the caption), the cover adds a
      // verifiable draw and shows it, and the closing gives one takeaway
      // instead of re-listing the items.
      // v58/v13: a list cover's headline is the promise and its subheadline
      // the draw, over one main image (never cards or thumbnails per item);
      // each item ends with a practical line (day · time · ages · price);
      // when the closing's facts give times, it is the plan by day plus a
      // short call to action.
      carousel: carouselWriterModel ? `carousel-draft-v58-writer-${carouselWriterModel}` : "carousel-draft-v58",
      sequence: "sequence-draft-v13",
    },
    maxRunsPerDay: parsePositiveInteger(
      process.env.CREATIVE_MAX_RUNS_PER_DAY,
      DEFAULT_MAX_RUNS_PER_DAY,
    ),
    maxContentCharacters: parsePositiveInteger(
      process.env.CREATIVE_MAX_CONTENT_CHARACTERS,
      DEFAULT_MAX_CONTENT_CHARACTERS,
    ),
  };
}

export function getCreativeCompanionRuntimeConfig(): CreativeCompanionRuntimeConfig {
  const apiKey = process.env.OPENAI_API_KEY?.trim();

  if (!apiKey) {
    throw new CreativeContentConfigurationError(
      "OPENAI_API_KEY is not configured for companion Stories",
    );
  }

  return {
    apiKey,
    lunaModel:
      process.env.CREATIVE_COMPANION_LUNA_MODEL?.trim() || "gpt-6.1-sol",
    terraModel:
      process.env.CREATIVE_COMPANION_TERRA_MODEL?.trim() ||
      process.env.CREATIVE_CRITIC_MODEL?.trim() ||
      "gpt-6.1-sol",
    promptVersion: "companion-story-v2-interaction",
  };
}

function creativeTextProvider(): CreativeTextProvider {
  return process.env.CREATIVE_TEXT_PROVIDER?.trim().toLowerCase() === "groq"
    ? "groq"
    : "gemini";
}

/**
 * Single-shot script pipeline (generate → audit → optional repair → verify,
 * capped at 4 physical text calls) replacing the brief+draft+multi-tier
 * repair loop. Off by default; the legacy pipeline keeps working unchanged
 * either way.
 */
export function creativeSingleShotConfig(): { enabled: boolean } {
  return { enabled: process.env.CREATIVE_SINGLE_SHOT_ENABLED?.trim() === "true" };
}

function parsePositiveInteger(
  value: string | undefined,
  fallback: number,
): number {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export class CreativeContentConfigurationError extends Error {}
