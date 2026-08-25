/**
 * Generic editorial signals. They deliberately do not encode an industry or
 * geography, so the same profile can drive Tech, Psychology, or a future
 * topic without application code branching on topic type.
 */
export type EditorialProfileWeights = {
  topicFit: number;
  evidenceDepth: number;
  noveltyTimeliness: number;
  audienceValue: number;
  socialPotential: number;
};

export type EditorialProfileFreshnessPolicy = {
  newsMaxAgeHours: number;
  researchMaxAgeHours: number;
};

export type EditableEditorialProfile = {
  audience: string;
  mission: string;
  contentPillars: string[];
  exclusions: string[];
  freshness: EditorialProfileFreshnessPolicy;
  weights: EditorialProfileWeights;
  localCandidateMinScore: number;
};

export type EditorialProfile = EditableEditorialProfile & {
  topicId: string;
  profileVersion: number;
  updatedAt: Date;
  /** True when no persisted customization exists for the topic. */
  isDefault: boolean;
};

/** Public name used by routes and topic-oriented consumers. */
export type TopicEditorialProfile = EditorialProfile;

/** Complete replacement input for a topic's persisted profile. */
export type UpdateTopicEditorialProfileInput = EditableEditorialProfile;

export const DEFAULT_EDITORIAL_PROFILE_WEIGHTS: Readonly<EditorialProfileWeights> =
  {
    topicFit: 35,
    evidenceDepth: 20,
    noveltyTimeliness: 15,
    audienceValue: 20,
    socialPotential: 10,
  };

export const DEFAULT_EDITORIAL_PROFILE_FRESHNESS: Readonly<EditorialProfileFreshnessPolicy> =
  {
    // The repository replaces these with existing runtime limits for a topic
    // without a stored profile, preserving the legacy evaluator behavior.
    newsMaxAgeHours: 72,
    researchMaxAgeHours: 72,
  };

/**
 * Stable serialization for editorial-evaluation caches.
 *
 * It intentionally excludes `isDefault`: switching from a fallback to an
 * identical saved profile should not change Gemini's editorial judgment.
 */
export function createEditorialProfileFingerprint(
  profile: EditorialProfile,
): string {
  return JSON.stringify({
    audience: profile.audience,
    mission: profile.mission,
    contentPillars: profile.contentPillars,
    exclusions: profile.exclusions,
    freshness: profile.freshness,
    weights: profile.weights,
    localCandidateMinScore: profile.localCandidateMinScore,
    profileVersion: profile.profileVersion,
    updatedAt: profile.updatedAt.toISOString(),
  });
}
