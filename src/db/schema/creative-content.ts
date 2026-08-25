import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { DEFAULT_CREATIVE_VISUAL_GUIDANCE } from "@/app/modules/stories/creative-content.types";

import {
  creativeAiRunStatusEnum,
  creativeAiTaskEnum,
  creativeAspectRatioEnum,
  creativeImageQualityEnum,
  creativeAssetBatchStatusEnum,
  creativeAssetRequestTypeEnum,
  creativeAssetStatusEnum,
  creativeContentSufficiencyEnum,
  creativeDraftStatusEnum,
  creativeFormatEnum,
  creativeToneEnum,
  creativeUnitRoleEnum,
  creativeUnitTypeEnum,
} from "./enums";
import { stories } from "./stories";
import { topics } from "./topics";

export const creativeProfiles = pgTable(
  "creative_profiles",
  {
    id: text("id").primaryKey(),
    topicId: uuid("topic_id")
      .notNull()
      .references(() => topics.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    language: text("language").notNull(),
    region: text("region").notNull(),
    platform: text("platform").notNull(),
    audience: text("audience").notNull(),
    visualGuidance: text("visual_guidance")
      .notNull()
      .default(DEFAULT_CREATIVE_VISUAL_GUIDANCE),
    brandPersonality: text("brand_personality")
      .array()
      .notNull()
      .default(sql`ARRAY[]::text[]`),
    formality: integer("formality").notNull(),
    humor: integer("humor").notNull(),
    energy: integer("energy").notNull(),
    optimism: integer("optimism").notNull(),
    provocation: integer("provocation").notNull(),
    allowEmojis: boolean("allow_emojis").default(true).notNull(),
    maxEmojis: integer("max_emojis").default(2).notNull(),
    callToActionStyle: text("call_to_action_style").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("creative_profiles_topic_id_unique").on(table.topicId),
    check(
      "creative_profiles_dimensions_check",
      sql`${table.formality} BETWEEN 0 AND 100
        AND ${table.humor} BETWEEN 0 AND 100
        AND ${table.energy} BETWEEN 0 AND 100
        AND ${table.optimism} BETWEEN 0 AND 100
        AND ${table.provocation} BETWEEN 0 AND 100`,
    ),
    check(
      "creative_profiles_max_emojis_check",
      sql`${table.maxEmojis} BETWEEN 0 AND 10`,
    ),
  ],
);

export const storyCreativeBriefs = pgTable(
  "story_creative_briefs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    topicId: uuid("topic_id")
      .notNull()
      .references(() => topics.id, { onDelete: "cascade" }),
    storyId: uuid("story_id")
      .notNull()
      .references(() => stories.id, { onDelete: "cascade" }),
    profileId: text("profile_id")
      .notNull()
      .references(() => creativeProfiles.id),
    profileSnapshot: jsonb("profile_snapshot").notNull(),
    provider: text("provider").notNull(),
    model: text("model").notNull(),
    modelVersion: text("model_version"),
    promptVersion: text("prompt_version").notNull(),
    inputHash: text("input_hash").notNull(),
    recommendedFormat: creativeFormatEnum("recommended_format").notNull(),
    fallbackFormat: creativeFormatEnum("fallback_format").notNull(),
    formatScores: jsonb("format_scores").notNull(),
    confidence: integer("confidence").notNull(),
    targetAudience: text("target_audience").notNull(),
    keyMessage: text("key_message").notNull(),
    angle: text("angle").notNull(),
    hook: text("hook").notNull(),
    tonePrimary: creativeToneEnum("tone_primary").notNull(),
    toneEnergy: integer("tone_energy").notNull(),
    toneHumor: integer("tone_humor").notNull(),
    toneReason: text("tone_reason").notNull(),
    contentSufficiency: creativeContentSufficiencyEnum(
      "content_sufficiency",
    ).notNull(),
    keyFacts: jsonb("key_facts").notNull(),
    riskFlags: text("risk_flags")
      .array()
      .notNull()
      .default(sql`ARRAY[]::text[]`),
    suggestedConcepts: jsonb("suggested_concepts").notNull(),
    promptTokens: integer("prompt_tokens").default(0).notNull(),
    outputTokens: integer("output_tokens").default(0).notNull(),
    thoughtsTokens: integer("thoughts_tokens").default(0).notNull(),
    totalTokens: integer("total_tokens").default(0).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("story_creative_briefs_topic_cache_unique").on(
      table.topicId,
      table.storyId,
      table.provider,
      table.model,
      table.promptVersion,
      table.inputHash,
    ),
    index("story_creative_briefs_story_id_idx").on(table.storyId),
    index("story_creative_briefs_topic_story_id_idx").on(
      table.topicId,
      table.storyId,
    ),
    index("story_creative_briefs_created_at_idx").on(table.createdAt),
    check(
      "story_creative_briefs_scores_check",
      sql`${table.confidence} BETWEEN 0 AND 100
        AND ${table.toneEnergy} BETWEEN 0 AND 100
        AND ${table.toneHumor} BETWEEN 0 AND 100`,
    ),
    check(
      "story_creative_briefs_formats_check",
      sql`${table.recommendedFormat} <> ${table.fallbackFormat}`,
    ),
    check(
      "story_creative_briefs_tokens_check",
      sql`${table.promptTokens} >= 0
        AND ${table.outputTokens} >= 0
        AND ${table.thoughtsTokens} >= 0
        AND ${table.totalTokens} >= 0`,
    ),
  ],
);

export const creativeDrafts = pgTable(
  "creative_drafts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    topicId: uuid("topic_id")
      .notNull()
      .references(() => topics.id, { onDelete: "cascade" }),
    storyId: uuid("story_id")
      .notNull()
      .references(() => stories.id, { onDelete: "cascade" }),
    briefId: uuid("brief_id")
      .notNull()
      .references(() => storyCreativeBriefs.id, { onDelete: "cascade" }),
    format: creativeFormatEnum("format").notNull(),
    outputAspectRatio: creativeAspectRatioEnum("output_aspect_ratio").notNull(),
    status: creativeDraftStatusEnum("status").default("draft").notNull(),
    concept: text("concept").notNull(),
    caption: text("caption").notNull(),
    callToAction: text("call_to_action"),
    hashtags: text("hashtags")
      .array()
      .notNull()
      .default(sql`ARRAY[]::text[]`),
    altText: text("alt_text").notNull(),
    provider: text("provider").notNull(),
    model: text("model").notNull(),
    modelVersion: text("model_version"),
    promptVersion: text("prompt_version").notNull(),
    inputHash: text("input_hash").notNull(),
    aiSnapshot: jsonb("ai_snapshot").notNull(),
    version: integer("version").default(1).notNull(),
    promptTokens: integer("prompt_tokens").default(0).notNull(),
    outputTokens: integer("output_tokens").default(0).notNull(),
    thoughtsTokens: integer("thoughts_tokens").default(0).notNull(),
    totalTokens: integer("total_tokens").default(0).notNull(),
    approvedAt: timestamp("approved_at", {
      withTimezone: true,
      mode: "date",
    }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("creative_drafts_cache_unique").on(
      table.briefId,
      table.format,
      table.inputHash,
    ),
    index("creative_drafts_story_id_idx").on(table.storyId),
    index("creative_drafts_topic_id_idx").on(table.topicId),
    index("creative_drafts_brief_id_idx").on(table.briefId),
    index("creative_drafts_status_idx").on(table.status),
    check("creative_drafts_version_check", sql`${table.version} > 0`),
    check(
      "creative_drafts_approval_check",
      sql`(${table.status} = 'draft' AND ${table.approvedAt} IS NULL)
        OR (${table.status} = 'approved' AND ${table.approvedAt} IS NOT NULL)`,
    ),
    check(
      "creative_drafts_tokens_check",
      sql`${table.promptTokens} >= 0
        AND ${table.outputTokens} >= 0
        AND ${table.thoughtsTokens} >= 0
        AND ${table.totalTokens} >= 0`,
    ),
  ],
);

export const creativeUnits = pgTable(
  "creative_units",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    draftId: uuid("draft_id")
      .notNull()
      .references(() => creativeDrafts.id, { onDelete: "cascade" }),
    order: integer("order").notNull(),
    type: creativeUnitTypeEnum("type").notNull(),
    role: creativeUnitRoleEnum("role").notNull(),
    headline: text("headline").notNull(),
    body: text("body"),
    visualDirection: text("visual_direction").notNull(),
    factIds: text("fact_ids")
      .array()
      .notNull()
      .default(sql`ARRAY[]::text[]`),
    assetRequest: creativeAssetRequestTypeEnum("asset_request").notNull(),
    aspectRatio: creativeAspectRatioEnum("aspect_ratio").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("creative_units_draft_order_unique").on(
      table.draftId,
      table.order,
    ),
    index("creative_units_draft_id_idx").on(table.draftId),
    check("creative_units_order_check", sql`${table.order} > 0`),
  ],
);

export const creativeAssetBatches = pgTable(
  "creative_asset_batches",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    draftId: uuid("draft_id")
      .notNull()
      .references(() => creativeDrafts.id, { onDelete: "cascade" }),
    draftVersion: integer("draft_version").notNull(),
    status: creativeAssetBatchStatusEnum("status").default("queued").notNull(),
    provider: text("provider").notNull(),
    model: text("model").notNull(),
    promptVersion: text("prompt_version").notNull(),
    outputAspectRatio: creativeAspectRatioEnum("output_aspect_ratio").notNull(),
    imageQuality: creativeImageQualityEnum("image_quality")
      .default("low")
      .notNull(),
    width: integer("width").notNull(),
    height: integer("height").notNull(),
    totalAssets: integer("total_assets").notNull(),
    completedAt: timestamp("completed_at", {
      withTimezone: true,
      mode: "date",
    }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("creative_asset_batches_generation_unique").on(
      table.draftId,
      table.draftVersion,
      table.provider,
      table.model,
      table.promptVersion,
      table.imageQuality,
    ),
    index("creative_asset_batches_draft_id_idx").on(table.draftId),
    index("creative_asset_batches_status_idx").on(table.status),
    check(
      "creative_asset_batches_values_check",
      sql`${table.draftVersion} > 0
        AND ${table.width} BETWEEN 512 AND 2048
        AND ${table.height} BETWEEN 512 AND 2048
        AND ${table.totalAssets} > 0`,
    ),
    check(
      "creative_asset_batches_dates_check",
      sql`${table.completedAt} IS NULL OR ${table.completedAt} >= ${table.createdAt}`,
    ),
  ],
);

export const creativeAssets = pgTable(
  "creative_assets",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    batchId: uuid("batch_id")
      .notNull()
      .references(() => creativeAssetBatches.id, { onDelete: "cascade" }),
    unitOrder: integer("unit_order").notNull(),
    unitRole: creativeUnitRoleEnum("unit_role").notNull(),
    version: integer("version").default(1).notNull(),
    status: creativeAssetStatusEnum("status").default("queued").notNull(),
    provider: text("provider").notNull(),
    model: text("model").notNull(),
    promptVersion: text("prompt_version").notNull(),
    prompt: text("prompt").notNull(),
    expectedText: text("expected_text").notNull(),
    unitSnapshot: jsonb("unit_snapshot").notNull(),
    requestId: text("request_id"),
    imageUrl: text("image_url"),
    contentType: text("content_type"),
    fileName: text("file_name"),
    fileSize: integer("file_size"),
    width: integer("width"),
    height: integer("height"),
    seed: integer("seed"),
    safetyFlag: boolean("safety_flag"),
    error: text("error"),
    completedAt: timestamp("completed_at", {
      withTimezone: true,
      mode: "date",
    }),
    approvedAt: timestamp("approved_at", {
      withTimezone: true,
      mode: "date",
    }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("creative_assets_batch_unit_version_unique").on(
      table.batchId,
      table.unitOrder,
      table.version,
    ),
    uniqueIndex("creative_assets_request_id_unique").on(table.requestId),
    index("creative_assets_batch_id_idx").on(table.batchId),
    index("creative_assets_status_idx").on(table.status),
    check(
      "creative_assets_values_check",
      sql`${table.unitOrder} > 0
        AND ${table.version} > 0
        AND (${table.fileSize} IS NULL OR ${table.fileSize} >= 0)
        AND (${table.width} IS NULL OR ${table.width} > 0)
        AND (${table.height} IS NULL OR ${table.height} > 0)`,
    ),
    check(
      "creative_assets_approval_check",
      sql`(${table.status} = 'approved' AND ${table.approvedAt} IS NOT NULL)
        OR (${table.status} <> 'approved' AND ${table.approvedAt} IS NULL)`,
    ),
    check(
      "creative_assets_dates_check",
      sql`(${table.completedAt} IS NULL OR ${table.completedAt} >= ${table.createdAt})
        AND (${table.approvedAt} IS NULL OR ${table.approvedAt} >= ${table.createdAt})`,
    ),
  ],
);

export const creativeAiRuns = pgTable(
  "creative_ai_runs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    topicId: uuid("topic_id")
      .notNull()
      .references(() => topics.id, { onDelete: "cascade" }),
    storyId: uuid("story_id")
      .notNull()
      .references(() => stories.id, { onDelete: "cascade" }),
    briefId: uuid("brief_id").references(() => storyCreativeBriefs.id, {
      onDelete: "set null",
    }),
    draftId: uuid("draft_id").references(() => creativeDrafts.id, {
      onDelete: "set null",
    }),
    task: creativeAiTaskEnum("task").notNull(),
    provider: text("provider").notNull(),
    model: text("model").notNull(),
    promptVersion: text("prompt_version").notNull(),
    inputHash: text("input_hash").notNull(),
    status: creativeAiRunStatusEnum("status").default("running").notNull(),
    promptTokens: integer("prompt_tokens").default(0).notNull(),
    outputTokens: integer("output_tokens").default(0).notNull(),
    thoughtsTokens: integer("thoughts_tokens").default(0).notNull(),
    totalTokens: integer("total_tokens").default(0).notNull(),
    error: text("error"),
    startedAt: timestamp("started_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
    finishedAt: timestamp("finished_at", {
      withTimezone: true,
      mode: "date",
    }),
  },
  (table) => [
    index("creative_ai_runs_story_id_idx").on(table.storyId),
    index("creative_ai_runs_topic_started_at_idx").on(
      table.topicId,
      table.startedAt,
    ),
    index("creative_ai_runs_started_at_idx").on(table.startedAt),
    index("creative_ai_runs_status_idx").on(table.status),
    check(
      "creative_ai_runs_tokens_check",
      sql`${table.promptTokens} >= 0
        AND ${table.outputTokens} >= 0
        AND ${table.thoughtsTokens} >= 0
        AND ${table.totalTokens} >= 0`,
    ),
    check(
      "creative_ai_runs_dates_check",
      sql`${table.finishedAt} IS NULL OR ${table.finishedAt} >= ${table.startedAt}`,
    ),
  ],
);
