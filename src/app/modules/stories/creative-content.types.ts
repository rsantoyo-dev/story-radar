import type {
  CarouselEditorialGoal,
  CarouselPlan,
} from "./carousel-narrative";

export const CREATIVE_FORMATS = ["meme", "carousel"] as const;
export type CreativeFormat = (typeof CREATIVE_FORMATS)[number];

export const CREATIVE_ASPECT_RATIOS = ["1:1", "4:5", "9:16", "16:9"] as const;
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

export const CREATIVE_CONVERSION_GOALS = [
  "followers",
  "discussion",
  "saves",
  "shares",
] as const;
export type CreativeConversionGoal =
  (typeof CREATIVE_CONVERSION_GOALS)[number];
/** Follower conversion is the active default for both profiles and old briefs. */
export const DEFAULT_CREATIVE_CONVERSION_GOAL: CreativeConversionGoal =
  "followers";

export function isCreativeConversionGoal(
  value: unknown,
): value is CreativeConversionGoal {
  return CREATIVE_CONVERSION_GOALS.includes(value as CreativeConversionGoal);
}

export const CREATIVE_FRAMING_STRATEGIES = [
  "auto",
  "reader-consequence",
  "explainer",
  "authority",
] as const;
export type CreativeFramingStrategy =
  (typeof CREATIVE_FRAMING_STRATEGIES)[number];
/**
 * Which editorial lens the brief must use for the angle and hook. "auto" keeps
 * the model's four-lens assessment; the others let a campaign fix the framing.
 */
export const DEFAULT_CREATIVE_FRAMING_STRATEGY: CreativeFramingStrategy = "auto";

export function isCreativeFramingStrategy(
  value: unknown,
): value is CreativeFramingStrategy {
  return CREATIVE_FRAMING_STRATEGIES.includes(
    value as CreativeFramingStrategy,
  );
}

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

export const CREATIVE_BRAND_PLACEMENTS = [
  "top-left",
  "top-center",
  "top-right",
  "center-left",
  "center",
  "center-right",
  "bottom-left",
  "bottom-center",
  "bottom-right",
] as const;
export type CreativeBrandPlacement =
  (typeof CREATIVE_BRAND_PLACEMENTS)[number];

export const CREATIVE_BRAND_SCOPES = ["first-unit", "all-units"] as const;
export type CreativeBrandScope = (typeof CREATIVE_BRAND_SCOPES)[number];

export const CREATIVE_BRAND_BACKDROP_MODES = ["none", "solid"] as const;
export type CreativeBrandBackdropMode =
  (typeof CREATIVE_BRAND_BACKDROP_MODES)[number];

export type CreativeBrandAsset = {
  id: string;
  fileName: string;
  contentType: "image/png";
  fileSize: number;
  width: number;
  height: number;
  createdAt: Date;
};

export type CreativeBrandOverlaySettings = {
  enabled: boolean;
  scope: CreativeBrandScope;
  placement: CreativeBrandPlacement;
  /** Maximum logo edge as a percentage of the canvas short edge. */
  sizePercent: number;
  /** Distance from the selected canvas edge, based on the short edge. */
  insetPercent: number;
  backdropMode: CreativeBrandBackdropMode;
  backdropColor: string;
  backdropOpacity: number;
};

export type CreativeBrandOverlay = CreativeBrandOverlaySettings & {
  assetId?: string;
  asset?: CreativeBrandAsset;
};

/**
 * Server-only immutable input captured for asset composition. Unlike the
 * browser-facing overlay, this snapshot retains the private R2 object key.
 */
export type CreativeBrandOverlaySnapshot = CreativeBrandOverlaySettings & {
  /** Selects the immutable geometry/composition policy used for this batch. */
  compositorVersion: 1;
  asset: CreativeBrandAsset & { objectKey: string; sha256: string };
};

export const DEFAULT_CREATIVE_BRAND_OVERLAY_SETTINGS = {
  enabled: false,
  scope: "first-unit",
  placement: "top-left",
  sizePercent: 18,
  insetPercent: 5,
  backdropMode: "solid",
  backdropColor: "#F6F0E4",
  backdropOpacity: 95,
} as const satisfies CreativeBrandOverlaySettings;

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

export const CREATIVE_INSTAGRAM_INTERACTION_KINDS = [
  "poll",
  "question",
  "quiz",
  "slider",
] as const;
export type CreativeInstagramInteractionKind =
  (typeof CREATIVE_INSTAGRAM_INTERACTION_KINDS)[number];

/** Editor-facing native sticker copy; it is intentionally never image copy. */
export type CreativeInstagramInteractionRecommendation = {
  kind: CreativeInstagramInteractionKind;
  prompt: string;
  /** Poll/quiz options, in the order they should be added in Instagram. */
  options?: string[];
  /** Required only for a quiz and must exactly match one option. */
  correctOption?: string;
  /** Optional emoji for the native slider. */
  emoji?: string;
  /** Why this is the strongest interaction for this specific Story. */
  rationale: string;
};

/**
 * A deliberately empty canvas region for an editor to add a native Instagram
 * poll, question, quiz, or slider after export. It is never rendered as copy.
 */
export type CreativeInteractiveOverlay = {
  kind: "instagram-sticker";
  placement: "top-third" | "middle-third" | "bottom-third";
  recommendation?: CreativeInstagramInteractionRecommendation;
};

export const CREATIVE_COMPANION_APPROACHES = [
  "expectation-vs-reality",
  "myth-vs-fact",
  "quick-fact",
  "editorial-reaction",
  "story-question",
] as const;
export type CreativeCompanionApproach =
  (typeof CREATIVE_COMPANION_APPROACHES)[number];

export function isCreativeCompanionApproach(
  value: unknown,
): value is CreativeCompanionApproach {
  return CREATIVE_COMPANION_APPROACHES.includes(
    value as CreativeCompanionApproach,
  );
}

/** Immutable origin and editor-selected treatment for a companion Story. */
export type CreativeCompanionMetadata = {
  parentDraftId: string;
  angle: string;
  approach: CreativeCompanionApproach;
  reserveInteractiveSpace: boolean;
};
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

export const CREATIVE_CAROUSEL_CHROME_STYLES = ["pill", "minimal"] as const;
export type CreativeCarouselChromeStyle =
  (typeof CREATIVE_CAROUSEL_CHROME_STYLES)[number];

/** A named, approved brand colour that can be reused by deterministic visuals. */
export type CreativeBrandPaletteColor = {
  name: string;
  color: string;
};

/**
 * Settings for the compositor-rendered carousel counter. Every colour must
 * be selected from the profile's approved brand palette.
 */
export type CreativeCarouselChromeSettings = {
  enabled: boolean;
  style: CreativeCarouselChromeStyle;
  backgroundColor: string;
  textColor: string;
  accentColor: string;
};

/** Immutable per-asset material so a regenerated historical image is exact. */
export type CreativeCarouselChromeSnapshot = CreativeCarouselChromeSettings & {
  compositorVersion: 1;
};

export const DEFAULT_CREATIVE_BRAND_PALETTE = [
  { name: "Warm cream", color: "#F6F0E4" },
  { name: "Editorial navy", color: "#102A43" },
  { name: "Editorial gold", color: "#E8A83E" },
  { name: "Teal", color: "#2F777B" },
  { name: "Coral", color: "#EF644B" },
] as const satisfies readonly CreativeBrandPaletteColor[];

export const DEFAULT_CREATIVE_CAROUSEL_CHROME_SETTINGS = {
  enabled: true,
  style: "pill",
  backgroundColor: "#102A43",
  textColor: "#F6F0E4",
  accentColor: "#E8A83E",
} as const satisfies CreativeCarouselChromeSettings;

export type CreativeProfile = {
  id: string;
  name: string;
  language: string;
  region: string;
  platform: string;
  audience: string;
  visualGuidance: string;
  brandPalette: CreativeBrandPaletteColor[];
  carouselChrome: CreativeCarouselChromeSettings;
  brandOverlay: CreativeBrandOverlay;
  brandPersonality: string[];
  formality: number;
  humor: number;
  energy: number;
  optimism: number;
  provocation: number;
  allowEmojis: boolean;
  maxEmojis: number;
  conversionGoal: CreativeConversionGoal;
  framingStrategy: CreativeFramingStrategy;
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

export type CreativeFactClaimGuard = {
  /** The strongest certainty level that editable copy may express. */
  certainty:
    | "asserted"
    | "reported"
    | "estimated"
    | "detected-signal"
    | "projection"
    | "association";
  /** Source wording that should survive paraphrasing when relevant. */
  requiredPhrases: string[];
  /** Certainty upgrades that are never supported by this fact. */
  forbiddenPhrases: string[];
  /** Population/timeframe phrases needed to interpret its numbers correctly. */
  scopePhrases: string[];
  /** Normalized numeric values allowed in copy citing this fact. */
  allowedNumbers: string[];
};

export type CreativeKeyFact = {
  id: string;
  statement: string;
  /** Short extractive evidence copied from the source; optional for history. */
  sourceExcerpt?: string;
  /** Words such as "estimated" or "show signs" that copy must preserve. */
  requiredQualifiers?: string[];
  /** Source attribution that must remain attached when the claim needs it. */
  attribution?: string;
  /** Deterministic guard metadata; inferred on load for historical briefs. */
  claimGuard?: CreativeFactClaimGuard;
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
  /** Editor-authored framing; it guides composition but is never evidence. */
  editorialDirection?: string;
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
  /**
   * Optional visible CTA reserved for the carousel closing slide. It may be a
   * question or a concise imperative; the legacy property name is retained so
   * stored drafts remain compatible.
   */
  ctaQuestion?: string;
  headline: string;
  /** Optional secondary line between the headline and supporting copy. */
  subheadline?: string;
  body?: string;
  /**
   * Optional, concrete promise of what the next carousel slide will deliver.
   * The compact pagination badge supplies progress and direction.
   */
  continuationCue?: string;
  visualDirection: string;
  factIds: string[];
  assetRequest: CreativeAssetRequest;
  aspectRatio: CreativeAspectRatio;
  /**
   * Optional for backward compatibility with drafts created before supporting
   * characters existed. Runtime mappers always normalize this to an empty list.
   */
  characterIds?: string[];
  /** A reserved blank zone for a native Instagram interaction sticker. */
  interactiveOverlay?: CreativeInteractiveOverlay;
};

export type CreativeQualityScores = {
  factuality: number;
  hook: number;
  /** Human curiosity and immediate personal relevance of the opening. */
  curiosity: number;
  swipeReward: number;
  continuity: number;
  relevance: number;
  clarity: number;
  /** How clearly the ending pays off the opening promise. */
  resolution: number;
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
  // "needs-review": the automated critic could not run; the draft awaits
  // explicit human approval instead of being rejected by a service outage.
  status: "accepted" | "needs-repair" | "needs-review" | "rejected";
  scores: CreativeQualityScores;
  issues: CreativeQualityIssue[];
  repairPasses: number;
  /** Traceability for the independent editorial quality gate. */
  critic?: {
    provider: "openai";
    model: string;
  };
  repair?: {
    provider: "openai";
    model: string;
    severity: "minor" | "structural" | "severe";
  };
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
  /** Present only for a post-approval Story derived from another draft. */
  companion?: CreativeCompanionMetadata;
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
  /** Opaque identity of the immutable logo plus placement settings. */
  brandInputHash: string;
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
