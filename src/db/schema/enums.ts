import { pgEnum } from "drizzle-orm/pg-core";

export const storyContentStatusEnum = pgEnum("story_content_status", [
  "excerpt",
  "full",
  "likely-full",
  "missing",
]);

export const rssContentModeEnum = pgEnum("rss_content_mode", [
  "excerpt",
  "full",
  "auto",
]);

export const storyProcessingStatusEnum = pgEnum("story_processing_status", [
  "new",
  "needs-enrichment",
  "ready",
  "selected",
  "rejected",
  "published",
  "failed",
]);

export const storyReviewDecisionEnum = pgEnum("story_review_decision", [
  "approved",
  "rejected",
]);

export const storyContentEnrichmentStatusEnum = pgEnum(
  "story_content_enrichment_status",
  ["pending", "completed", "failed", "blocked"],
);

export const storyContentEnrichmentMethodEnum = pgEnum(
  "story_content_enrichment_method",
  ["direct", "reader"],
);

export const collectionRunStatusEnum = pgEnum("collection_run_status", [
  "completed",
  "partial",
  "failed",
]);

export const collectionSourceStatusEnum = pgEnum(
  "collection_source_status",
  ["successful", "failed"],
);

export const editorialEvaluationDecisionEnum = pgEnum(
  "editorial_evaluation_decision",
  ["reject", "review", "shortlist"],
);

export const editorialEvaluationRunStatusEnum = pgEnum(
  "editorial_evaluation_run_status",
  ["running", "completed", "failed"],
);

export const creativeFormatEnum = pgEnum("creative_format", [
  "meme",
  "carousel",
]);

export const creativeDraftStatusEnum = pgEnum("creative_draft_status", [
  "draft",
  "approved",
]);

export const creativeUnitTypeEnum = pgEnum("creative_unit_type", [
  "meme-frame",
  "carousel-slide",
]);

export const creativeUnitRoleEnum = pgEnum("creative_unit_role", [
  "cover",
  "content",
  "conclusion",
  "call-to-action",
]);

export const creativeAssetRequestTypeEnum = pgEnum(
  "creative_asset_request_type",
  ["generated-image", "typography-only"],
);

/**
 * Kept on the asset—not the batch—because a carousel may use references on
 * one slide and plain text-to-image on another.
 */
export const creativeAssetGenerationModeEnum = pgEnum(
  "creative_asset_generation_mode",
  ["text-to-image", "reference-guided"],
);

export const creativeAspectRatioEnum = pgEnum("creative_aspect_ratio", [
  "1:1",
  "4:5",
  "9:16",
  "16:9",
]);

export const creativeImageQualityEnum = pgEnum("creative_image_quality", [
  "auto",
  "low",
  "medium",
  "high",
]);

export const creativeToneEnum = pgEnum("creative_tone", [
  "informative",
  "curious",
  "playful",
  "inspiring",
  "cautious",
  "urgent",
  "somber",
]);

export const creativeContentSufficiencyEnum = pgEnum(
  "creative_content_sufficiency",
  ["sufficient", "limited", "insufficient"],
);

export const creativeAiTaskEnum = pgEnum("creative_ai_task", [
  "brief",
  "draft",
]);

export const creativeAiRunStatusEnum = pgEnum("creative_ai_run_status", [
  "running",
  "completed",
  "failed",
]);

export const creativeAssetBatchStatusEnum = pgEnum(
  "creative_asset_batch_status",
  ["queued", "generating", "partial", "completed", "failed", "stale"],
);

export const creativeAssetStatusEnum = pgEnum("creative_asset_status", [
  "queued",
  "generating",
  "generated",
  "failed",
  "approved",
  "stale",
]);

export const socialPublicationPlatformEnum = pgEnum(
  "social_publication_platform",
  [
    "instagram",
    "linkedin",
    "tiktok",
    "facebook",
    "x",
    "youtube",
    "newsletter",
  ],
);

export const socialPublicationStatusEnum = pgEnum("social_publication_status", [
  "draft",
  "scheduled",
  "published",
]);
