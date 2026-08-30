import "server-only";

import { eq, sql } from "drizzle-orm";

import { getTopicById } from "@/app/modules/topics/topic-catalog.repository";
import { db } from "@/db/client";
import {
  topicEditorialProfiles,
  type TopicEditorialProfile,
} from "@/db/schema";

import { getEditorialEvaluationPublicConfig } from "./editorial-evaluation.config";
import { reactivateAutoRejectedStories } from "./reactivate-auto-rejected-stories";
import {
  DEFAULT_EDITORIAL_PROFILE_FRESHNESS,
  DEFAULT_EDITORIAL_PROFILE_WEIGHTS,
  MAX_EDITORIAL_PROFILE_LIST_ITEMS,
  MAX_EDITORIAL_PROFILE_LIST_ITEM_LENGTH,
  type EditableEditorialProfile,
  type EditorialProfile,
  type EditorialProfileFreshnessPolicy,
  type EditorialProfileWeights,
} from "./editorial-profile.types";

export type {
  EditorialProfile,
  EditableEditorialProfile,
  TopicEditorialProfile,
  UpdateTopicEditorialProfileInput,
} from "./editorial-profile.types";

/**
 * Extends the established profile response rather than wrapping it, so callers
 * that already consume a profile can safely ignore the reactivation detail.
 */
export type SavedEditorialProfile = EditorialProfile & {
  reactivatedStories: number;
};

const MAX_AUDIENCE_LENGTH = 500;
const MAX_MISSION_LENGTH = 1_000;
const MAX_AGE_HOURS = 8_760;

/**
 * Loads a stored topic profile only. Most application code should call
 * `getEditorialProfile`, which always returns a usable resolved profile.
 */
export async function getStoredEditorialProfile(
  topicId: string,
): Promise<TopicEditorialProfile | undefined> {
  const [profile] = await db
    .select()
    .from(topicEditorialProfiles)
    .where(eq(topicEditorialProfiles.topicId, topicId))
    .limit(1);

  return profile;
}

/**
 * Gets the topic's persisted profile or a legacy-compatible resolved default.
 *
 * Existing topics do not need a migration backfill: the fallback preserves the
 * configured global candidate age and local score threshold until a profile is
 * explicitly saved for that topic.
 */
export async function getEditorialProfile(
  topicId: string,
): Promise<EditorialProfile> {
  const [stored, topic] = await Promise.all([
    getStoredEditorialProfile(topicId),
    getTopicById(topicId),
  ]);

  if (stored) {
    return mapStoredProfile(stored);
  }

  if (!topic) {
    throw new EditorialProfileNotFoundError("Topic was not found");
  }

  return createDefaultEditorialProfile({
    topicId: topic.id,
    name: topic.name,
    description: topic.description,
    updatedAt: topic.updatedAt,
  });
}

/**
 * Upserts a profile owned by a topic. The revision increments atomically on
 * every update so profile-aware AI caches can invalidate safely.
 */
export async function saveEditorialProfile(
  topicId: string,
  input: EditableEditorialProfile,
): Promise<SavedEditorialProfile> {
  const [topic, previousProfile] = await Promise.all([
    getTopicById(topicId),
    getStoredEditorialProfile(topicId),
  ]);

  if (!topic) {
    throw new EditorialProfileNotFoundError("Topic was not found");
  }

  const profile = validateEditorialProfile(input);
  const previousFloor =
    previousProfile?.localCandidateMinScore ??
    getEditorialEvaluationPublicConfig().minLocalScore;
  const now = new Date();
  const [saved] = await db
    .insert(topicEditorialProfiles)
    .values({
      topicId,
      ...toDatabaseValues(profile),
      profileVersion: 1,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: topicEditorialProfiles.topicId,
      set: {
        ...toDatabaseValues(profile),
        profileVersion: sql`${topicEditorialProfiles.profileVersion} + 1`,
        updatedAt: now,
      },
    })
    .returning();

  if (!saved) {
    throw new Error("The editorial profile could not be saved");
  }

  const reactivatedStories =
    profile.localCandidateMinScore < previousFloor
      ? await reactivateAutoRejectedStories(
          topicId,
          profile.localCandidateMinScore,
        )
      : 0;

  return {
    ...mapStoredProfile(saved),
    reactivatedStories,
  };
}

/** Topic-oriented aliases for API and UI integrations. */
export const getTopicEditorialProfile = getEditorialProfile;
export const resolveTopicEditorialProfile = getEditorialProfile;
export async function updateTopicEditorialProfile(
  topicId: string,
  input: EditableEditorialProfile,
): Promise<EditorialProfile> {
  return saveEditorialProfile(topicId, input);
}

/** Parses and validates the complete profile payload used by future routes. */
export function parseEditorialProfileInput(
  value: unknown,
): EditableEditorialProfile {
  if (!isRecord(value)) {
    throw new EditorialProfileValidationError("A profile object is required");
  }

  return validateEditorialProfile({
    audience: value.audience,
    mission: value.mission,
    contentPillars: value.contentPillars,
    exclusions: value.exclusions,
    freshness: value.freshness,
    weights: value.weights,
    localCandidateMinScore: value.localCandidateMinScore,
  } as EditableEditorialProfile);
}

/**
 * Creates the profile a topic sees before it has a custom row. Exported for
 * previews/tests; normal consumers should call `getEditorialProfile`.
 */
export function createDefaultEditorialProfile(input: {
  topicId: string;
  name: string;
  description?: string | null;
  updatedAt: Date;
}): EditorialProfile {
  const legacyConfig = getEditorialEvaluationPublicConfig();
  const description = input.description?.trim();

  return {
    topicId: input.topicId,
    audience: `People interested in ${input.name}`,
    mission:
      description ||
      `Surface the most relevant, trustworthy, and useful stories for ${input.name}.`,
    contentPillars: [input.name],
    exclusions: [],
    freshness: {
      ...DEFAULT_EDITORIAL_PROFILE_FRESHNESS,
      newsMaxAgeHours: legacyConfig.maxAgeHours,
      researchMaxAgeHours: legacyConfig.maxAgeHours,
    },
    weights: { ...DEFAULT_EDITORIAL_PROFILE_WEIGHTS },
    localCandidateMinScore: legacyConfig.minLocalScore,
    profileVersion: 1,
    updatedAt: input.updatedAt,
    isDefault: true,
  };
}

function mapStoredProfile(profile: TopicEditorialProfile): EditorialProfile {
  return {
    topicId: profile.topicId,
    audience: profile.audience,
    mission: profile.mission,
    contentPillars: profile.contentPillars,
    exclusions: profile.exclusions,
    freshness: {
      newsMaxAgeHours: profile.newsMaxAgeHours,
      researchMaxAgeHours: profile.researchMaxAgeHours,
    },
    weights: {
      topicFit: profile.topicFitWeight,
      evidenceDepth: profile.evidenceDepthWeight,
      noveltyTimeliness: profile.noveltyTimelinessWeight,
      audienceValue: profile.audienceValueWeight,
      socialPotential: profile.socialPotentialWeight,
    },
    localCandidateMinScore: profile.localCandidateMinScore,
    profileVersion: profile.profileVersion,
    updatedAt: profile.updatedAt,
    isDefault: false,
  };
}

function toDatabaseValues(profile: EditableEditorialProfile) {
  return {
    audience: profile.audience,
    mission: profile.mission,
    contentPillars: profile.contentPillars,
    exclusions: profile.exclusions,
    newsMaxAgeHours: profile.freshness.newsMaxAgeHours,
    researchMaxAgeHours: profile.freshness.researchMaxAgeHours,
    topicFitWeight: profile.weights.topicFit,
    evidenceDepthWeight: profile.weights.evidenceDepth,
    noveltyTimelinessWeight: profile.weights.noveltyTimeliness,
    audienceValueWeight: profile.weights.audienceValue,
    socialPotentialWeight: profile.weights.socialPotential,
    localCandidateMinScore: profile.localCandidateMinScore,
  };
}

function validateEditorialProfile(
  value: EditableEditorialProfile,
): EditableEditorialProfile {
  const weights = profileWeights(value.weights);

  if (
    weights.topicFit +
      weights.evidenceDepth +
      weights.noveltyTimeliness +
      weights.audienceValue +
      weights.socialPotential !==
    100
  ) {
    throw new EditorialProfileValidationError("weights must add up to 100");
  }

  return {
    audience: textValue(value.audience, "audience", MAX_AUDIENCE_LENGTH),
    mission: textValue(value.mission, "mission", MAX_MISSION_LENGTH),
    contentPillars: textList(
      value.contentPillars,
      "contentPillars",
      MAX_EDITORIAL_PROFILE_LIST_ITEMS,
    ),
    exclusions: textList(
      value.exclusions,
      "exclusions",
      MAX_EDITORIAL_PROFILE_LIST_ITEMS,
    ),
    freshness: freshnessPolicy(value.freshness),
    weights,
    localCandidateMinScore: boundedInteger(
      value.localCandidateMinScore,
      "localCandidateMinScore",
      0,
      100,
    ),
  };
}

function profileWeights(value: unknown): EditorialProfileWeights {
  if (!isRecord(value)) {
    throw new EditorialProfileValidationError("weights must be an object");
  }

  return {
    topicFit: boundedInteger(value.topicFit, "weights.topicFit", 0, 100),
    evidenceDepth: boundedInteger(
      value.evidenceDepth,
      "weights.evidenceDepth",
      0,
      100,
    ),
    noveltyTimeliness: boundedInteger(
      value.noveltyTimeliness,
      "weights.noveltyTimeliness",
      0,
      100,
    ),
    audienceValue: boundedInteger(
      value.audienceValue,
      "weights.audienceValue",
      0,
      100,
    ),
    socialPotential: boundedInteger(
      value.socialPotential,
      "weights.socialPotential",
      0,
      100,
    ),
  };
}

function freshnessPolicy(value: unknown): EditorialProfileFreshnessPolicy {
  if (!isRecord(value)) {
    throw new EditorialProfileValidationError("freshness must be an object");
  }

  return {
    newsMaxAgeHours: boundedInteger(
      value.newsMaxAgeHours,
      "freshness.newsMaxAgeHours",
      1,
      MAX_AGE_HOURS,
    ),
    researchMaxAgeHours: boundedInteger(
      value.researchMaxAgeHours,
      "freshness.researchMaxAgeHours",
      1,
      MAX_AGE_HOURS,
    ),
  };
}

function textValue(value: unknown, field: string, maxLength: number): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new EditorialProfileValidationError(`${field} is required`);
  }

  return value.replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function textList(
  value: unknown,
  field: string,
  maxItems: number,
): string[] {
  if (!Array.isArray(value) || !value.every((item) => typeof item === "string")) {
    throw new EditorialProfileValidationError(`${field} must be a text array`);
  }

  const normalized = [
    ...new Set(value.map((item) => item.trim()).filter(Boolean)),
  ];
  if (normalized.length > maxItems) {
    throw new EditorialProfileValidationError(
      `${field} supports at most ${maxItems} items`,
    );
  }
  const oversized = normalized.find(
    (item) => item.length > MAX_EDITORIAL_PROFILE_LIST_ITEM_LENGTH,
  );
  if (oversized) {
    throw new EditorialProfileValidationError(
      `${field} items support at most ${MAX_EDITORIAL_PROFILE_LIST_ITEM_LENGTH} characters`,
    );
  }
  return normalized;
}

function boundedInteger(
  value: unknown,
  field: string,
  minimum: number,
  maximum: number,
): number {
  if (
    !Number.isInteger(value) ||
    (value as number) < minimum ||
    (value as number) > maximum
  ) {
    throw new EditorialProfileValidationError(
      `${field} must be an integer between ${minimum} and ${maximum}`,
    );
  }

  return value as number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export class EditorialProfileValidationError extends Error {}

export class EditorialProfileNotFoundError extends Error {}
