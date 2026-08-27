import type {
  CarouselEditorialGoal,
  CarouselPlan,
} from "./carousel-narrative";

export const CREATIVE_FORMATS = ["meme", "carousel"] as const;
export type CreativeFormat = (typeof CREATIVE_FORMATS)[number];

export const CREATIVE_ASPECT_RATIOS = ["1:1", "4:5", "16:9"] as const;
export type CreativeAspectRatio = (typeof CREATIVE_ASPECT_RATIOS)[number];

export const CREATIVE_IMAGE_QUALITIES = [
  "auto",
  "low",
  "medium",
  "high",
] as const;
export type CreativeImageQuality = (typeof CREATIVE_IMAGE_QUALITIES)[number];
/** Default for new batches. Existing batches are migrated as high. */
export const DEFAULT_CREATIVE_IMAGE_QUALITY: CreativeImageQuality = "low";

export const DEFAULT_CREATIVE_VISUAL_GUIDANCE =
  "Create a clear, modern editorial visual direction appropriate to the topic and audience. Use a focused composition, high legibility, inclusive imagery, and generous negative space. Respect the selected output format and avoid watermarks, unapproved logos, or misleading visual claims.";

export const CREATIVE_TONES = [
  "informative",
  "curious",
  "playful",
  "inspiring",
  "cautious",
  "urgent",
  "somber",
] as const;
export type CreativeTone = (typeof CREATIVE_TONES)[number];

/**
 * The small, metadata-only roster that may be offered to the script model.
 * Reference images and storage details intentionally never cross this boundary.
 */
export type CreativeCharacterRosterEntry = {
  id: string;
  name: string;
  description: string;
  /**
   * Opaque server-generated fingerprint of the current reference set. It is
   * included in the draft cache identity, but never sent to Gemini or Fal.
   */
  referenceFingerprint?: string;
};

export type CreativeCharacterReferenceImage = {
  id: string;
  fileName: string;
  contentType: string;
  fileSize: number;
  order: number;
  createdAt: Date;
};

export type CreativeCharacter = {
  id: string;
  slot: 1 | 2;
  name: string;
  description: string;
  isActive: boolean;
  referenceImages: CreativeCharacterReferenceImage[];
  createdAt: Date;
  updatedAt: Date;
};

export type EditableCreativeCharacter = Pick<
  CreativeCharacter,
  "name" | "description"
>;

/** Server-only immutable copy used to regenerate an approved draft consistently. */
export type CreativeCharacterSnapshot = CreativeCharacterRosterEntry & {
  referenceImages: Array<
    CreativeCharacterReferenceImage & {
      objectKey: string;
    }
  >;
};

export type CreativeCharacterPlan = {
  recommendation: "not-needed" | "use-characters";
  rationale: string;
  suggestedCharacterIds: string[];
};

export type CreativeContentSufficiency =
  | "sufficient"
  | "limited"
  | "insufficient";
export type CreativeDraftStatus = "draft" | "approved";
export type CreativeUnitRole =
  | "cover"
  | "content"
  | "conclusion"
  | "call-to-action";
export type CreativeAssetRequest = "generated-image" | "typography-only";
export type CreativeAssetGenerationMode =
  | "text-to-image"
  | "reference-guided";
export type CreativeAssetBatchStatus =
  | "queued"
  | "generating"
  | "partial"
  | "completed"
  | "failed"
  | "stale";
export type CreativeAssetStatus =
  | "queued"
  | "generating"
  | "generated"
  | "failed"
  | "approved"
  | "stale";

export type CreativeProfile = {
  id: string;
  name: string;
  language: string;
  region: string;
  platform: string;
  audience: string;
  visualGuidance: string;
  brandPersonality: string[];
  formality: number;
  humor: number;
  energy: number;
  optimism: number;
  provocation: number;
  allowEmojis: boolean;
  maxEmojis: number;
  callToActionStyle: string;
  updatedAt: Date;
};

export type EditableCreativeProfile = Omit<
  CreativeProfile,
  "id" | "updatedAt"
>;

export type CreativeFormatScore = {
  format: CreativeFormat;
  score: number;
  reason: string;
};

export type CreativeKeyFact = {
  id: string;
  statement: string;
  /** Words such as "estimated" or "show signs" that copy must preserve. */
  requiredQualifiers?: string[];
  /** Source attribution that must remain attached when the claim needs it. */
  attribution?: string;
};

export type CreativeSuggestedConcept = {
  format: CreativeFormat;
  title: string;
  concept: string;
};

export type GeneratedCreativeBrief = {
  recommendedFormat: CreativeFormat;
  fallbackFormat: CreativeFormat;
  formatScores: CreativeFormatScore[];
  confidence: number;
  targetAudience: string;
  keyMessage: string;
  angle: string;
  hook: string;
  tone: {
    primary: CreativeTone;
    energy: number;
    humor: number;
    reason: string;
  };
  contentSufficiency: CreativeContentSufficiency;
  keyFacts: CreativeKeyFact[];
  /** Optional only for briefs created before narrative planning existed. */
  carouselPlan?: CarouselPlan;
  riskFlags: string[];
  suggestedConcepts: CreativeSuggestedConcept[];
};

export type CreativeBrief = GeneratedCreativeBrief & {
  id: string;
  storyId: string;
  profileId: string;
  profileSnapshot: CreativeProfile;
  provider: string;
  model: string;
  modelVersion?: string;
  promptVersion: string;
  inputHash: string;
  usage: CreativeAiUsage;
  createdAt: Date;
};

export type CreativeUnit = {
  id?: string;
  order: number;
  type: "meme-frame" | "carousel-slide";
  role: CreativeUnitRole;
  /** Narrative purpose; optional only for drafts created before narrative arcs. */
  editorialGoal?: CarouselEditorialGoal;
  /** Internal question this slide resolves. It is never rendered as copy. */
  viewerQuestion?: string;
  /** Optional visible question reserved for the carousel closing slide. */
  ctaQuestion?: string;
  headline: string;
  body?: string;
  visualDirection: string;
  factIds: string[];
  assetRequest: CreativeAssetRequest;
  aspectRatio: CreativeAspectRatio;
  /**
   * Optional for backward compatibility with drafts created before supporting
   * characters existed. Runtime mappers always normalize this to an empty list.
   */
  characterIds?: string[];
};

export type CreativeQualityScores = {
  factuality: number;
  hook: number;
  swipeReward: number;
  continuity: number;
  relevance: number;
  clarity: number;
  cta: number;
  overall: number;
};

export type CreativeQualityIssue = {
  code: string;
  severity: "blocker" | "warning";
  message: string;
  unitOrder?: number;
};

export type CreativeQualityReview = {
  status: "accepted" | "needs-repair" | "rejected";
  scores: CreativeQualityScores;
  issues: CreativeQualityIssue[];
  repairPasses: number;
};

export type GeneratedCreativeDraft = {
  concept: string;
  /** Explains a deliberate departure from the preferred carousel arc. */
  narrativeRationale?: string;
  caption: string;
  callToAction?: string;
  hashtags: string[];
  altText: string;
  /** The model's recommendation; slide assignments remain user-editable. */
  characterPlan?: CreativeCharacterPlan;
  /** Review of the exact generated copy. Manual edits make this review stale. */
  qualityReview?: CreativeQualityReview;
  units: CreativeUnit[];
};

export type CreativeDraft = GeneratedCreativeDraft & {
  id: string;
  storyId: string;
  briefId: string;
  format: CreativeFormat;
  outputAspectRatio: CreativeAspectRatio;
  status: CreativeDraftStatus;
  version: number;
  provider: string;
  model: string;
  modelVersion?: string;
  promptVersion: string;
  inputHash: string;
  usage: CreativeAiUsage;
  /** Derived when loading a workspace; historical rows intentionally omit it. */
  inputIsCurrent?: boolean;
  /** False when saved copy no longer matches the AI-reviewed snapshot. */
  qualityReviewIsCurrent?: boolean;
  approvedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
};

export type EditableCreativeDraft = Pick<
  GeneratedCreativeDraft,
  | "concept"
  | "narrativeRationale"
  | "caption"
  | "callToAction"
  | "hashtags"
  | "altText"
  | "units"
> & {
  outputAspectRatio: CreativeAspectRatio;
};

export type CreativeAiUsage = {
  promptTokens: number;
  outputTokens: number;
  thoughtsTokens: number;
  totalTokens: number;
};

export type CreativeDailyUsage = CreativeAiUsage & {
  runs: number;
  maxRuns: number;
  remainingRuns: number;
};

export type CreativeWorkspaceState = {
  story: {
    storyId: string;
    title: string;
    url: string;
    contentStatus: "excerpt" | "full" | "likely-full" | "missing";
    contentSource: "rss" | "article";
    hasContent: boolean;
  };
  profile: CreativeProfile;
  /** Active, metadata-only supporting characters available for this topic. */
  characterRoster: CreativeCharacterRosterEntry[];
  brief?: CreativeBrief;
  briefIsCurrent: boolean;
  drafts: CreativeDraft[];
  daily: CreativeDailyUsage;
  configuration: {
    provider: string;
    model: string;
    briefPromptVersion: string;
    draftPromptVersions: Record<CreativeFormat, string>;
  };
};

export type CreativeGenerationResult = {
  outcome: "generated" | "cached";
  state: CreativeWorkspaceState;
};

export type CreativeGeneratedAsset = {
  id: string;
  batchId: string;
  unitOrder: number;
  unitRole: CreativeUnitRole;
  version: number;
  availableVersions: number;
  status: CreativeAssetStatus;
  provider: string;
  model: string;
  promptVersion: string;
  prompt: string;
  expectedText: string;
  unitSnapshot: CreativeUnit;
  /** Safe display metadata; private reference object keys never leave the server. */
  generationMode: CreativeAssetGenerationMode;
  providerEndpoint: string;
  referenceInputHash: string;
  requestId?: string;
  imageUrl?: string;
  contentType?: string;
  fileName?: string;
  fileSize?: number;
  width?: number;
  height?: number;
  seed?: number;
  safetyFlag?: boolean;
  error?: string;
  completedAt?: Date;
  approvedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
};

export type CreativeAssetBatch = {
  id: string;
  draftId: string;
  draftVersion: number;
  status: CreativeAssetBatchStatus;
  provider: string;
  model: string;
  promptVersion: string;
  outputAspectRatio: CreativeAspectRatio;
  imageQuality: CreativeImageQuality;
  width: number;
  height: number;
  totalAssets: number;
  approvedAssets: number;
  allApproved: boolean;
  assets: CreativeGeneratedAsset[];
  completedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
};

export type CreativeAssetConfiguration = {
  provider: string;
  model: string;
  width: number;
  height: number;
  promptVersion: string;
  imageQuality: CreativeImageQuality;
  outputFormat: "png";
};

export type CreativeAssetBatchResponse = {
  batch?: CreativeAssetBatch;
  configuration: CreativeAssetConfiguration;
};

export function isCreativeFormat(value: unknown): value is CreativeFormat {
  return value === "meme" || value === "carousel";
}

export function isCreativeAspectRatio(
  value: unknown,
): value is CreativeAspectRatio {
  return (
    typeof value === "string" &&
    (CREATIVE_ASPECT_RATIOS as readonly string[]).includes(value)
  );
}

export function isCreativeImageQuality(
  value: unknown,
): value is CreativeImageQuality {
  return (
    typeof value === "string" &&
    (CREATIVE_IMAGE_QUALITIES as readonly string[]).includes(value)
  );
}

export function isCreativeTone(value: unknown): value is CreativeTone {
  return (
    typeof value === "string" &&
    (CREATIVE_TONES as readonly string[]).includes(value)
  );
}
