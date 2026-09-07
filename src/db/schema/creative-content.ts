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

import {
  DEFAULT_CREATIVE_BRAND_OVERLAY_SETTINGS,
  DEFAULT_CREATIVE_BRAND_PALETTE,
  DEFAULT_CREATIVE_CAROUSEL_CHROME_SETTINGS,
  DEFAULT_CREATIVE_CONVERSION_GOAL,
  DEFAULT_CREATIVE_FRAMING_STRATEGY,
  DEFAULT_CREATIVE_GEO_SCOPE,
  DEFAULT_CREATIVE_VISUAL_GUIDANCE,
  DEFAULT_VISUAL_FIDELITY_MODE,
  type CreativeBrandOverlaySnapshot,
  type CreativeBrandOverlaySettings,
  type CreativeBrandPaletteColor,
  type CreativeCarouselChromeSettings,
  type CreativeCarouselChromeSnapshot,
  type CreativeConversionGoal,
  type CreativeFramingStrategy,
  type CreativeGeoScope,
  type CreativeInteractiveOverlay,
  type VisualFidelityMode,
} from "@/app/modules/stories/creative-content.types";

import {
  creativeAiRunStatusEnum,
  creativeAiTaskEnum,
  creativeAspectRatioEnum,
  creativeAssetGenerationModeEnum,
  creativeAssetBatchStatusEnum,
  creativeAssetRequestTypeEnum,
  creativeAssetStatusEnum,
  creativeContentSufficiencyEnum,
  creativeDraftStatusEnum,
  creativeFormatEnum,
  creativeImageQualityEnum,
  creativeToneEnum,
  creativeUnitRoleEnum,
  creativeUnitTypeEnum,
} from "./enums";
import { stories } from "./stories";
import { topics } from "./topics";

export const creativeBrandAssets = pgTable(
  "creative_brand_assets",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    topicId: uuid("topic_id")
      .notNull()
      .references(() => topics.id, { onDelete: "cascade" }),
    /** Private immutable R2 key. Never return this column to the browser. */
    objectKey: text("object_key").notNull(),
    sha256: text("sha256").notNull(),
    contentType: text("content_type").default("image/png").notNull(),
    fileName: text("file_name").notNull(),
    fileSize: integer("file_size").notNull(),
    width: integer("width").notNull(),
    height: integer("height").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("creative_brand_assets_object_key_unique").on(table.objectKey),
    index("creative_brand_assets_topic_id_idx").on(table.topicId),
    check(
      "creative_brand_assets_values_check",
      sql`${table.contentType} = 'image/png'
        AND ${table.sha256} ~ '^[0-9a-f]{64}$'
        AND ${table.fileSize} BETWEEN 1 AND 5242880
        AND ${table.width} BETWEEN 16 AND 4096
        AND ${table.height} BETWEEN 16 AND 4096
        AND ${table.width} <= ${table.height} * 20
        AND ${table.height} <= ${table.width} * 20`,
    ),
  ],
);

/**
 * Per-topic private library of brand visual references (FEAT-BRAND-001 / BRAND-01)
 * — finished posts, posters, stickers, signage, multi-element sheets the
 * image-to-image flow can look at for composition/colour/graphic language.
 * A separate entity from `creativeBrandAssets` (the single overlay logo) and
 * from `creativeCharacters`. Uploading one never makes it a logo or a character.
 * References are deactivated, never deleted, so historical draft snapshots keep
 * the exact bytes that explain a generated image.
 */
/** Atomic per-topic UTC-day reservation counter, including failed attempts. */
export const creativeBrandAnalysisQuota = pgTable("creative_brand_analysis_quota", {
  id: text("id").primaryKey(),
  topicId: uuid("topic_id").notNull().references(() => topics.id, { onDelete: "cascade" }),
  attempts: integer("attempts").notNull().default(0),
});

export const creativeBrandReferences = pgTable(
  "creative_brand_references",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    topicId: uuid("topic_id")
      .notNull()
      .references(() => topics.id, { onDelete: "cascade" }),
    /** In-place revision counter. BRAND-01 always 1; BRAND-05 bumps on replace. */
    version: integer("version").default(1).notNull(),
    /** Private immutable R2 key. Never return this column to the browser. */
    objectKey: text("object_key").notNull(),
    originalSnapshot: jsonb("original_snapshot").$type<{ objectKey: string; sha256: string; contentType: string; fileName: string; fileSize: number }>(),
    revisions: jsonb("revisions").$type<Record<string, unknown>[]>().default(sql`'[]'::jsonb`).notNull(),
    sha256: text("sha256").notNull(),
    /** Stored (normalised) type — always image/webp. */
    contentType: text("content_type").default("image/webp").notNull(),
    /** The MIME the editor uploaded — the declared "type" of record. */
    originalContentType: text("original_content_type").notNull(),
    fileName: text("file_name").notNull(),
    fileSize: integer("file_size").notNull(),
    width: integer("width").notNull(),
    height: integer("height").notNull(),
    /** Editor label. */
    name: text("name").notNull(),
    kind: text("kind").default("other").notNull(),
    provenance: text("provenance"),
    /**
     * Whether the editor has declared this reference may be transmitted to the
     * image provider. Defaults false; BRAND-02 gates activation on it.
     */
    providerTransmissionAllowed: boolean("provider_transmission_allowed")
      .default(false)
      .notNull(),
    /** Free-text declared conditions for reuse. */
    usageNote: text("usage_note"),
    isActive: boolean("is_active").default(true).notNull(),
    /**
     * Editor-declared "what the generator should take from this" (BRAND-02):
     * `{ aspects: string[], guidance: string|null, avoid: string|null }`.
     * Validated in code. Null = not configured yet.
     */
    contribution: jsonb("contribution"),
    /** Bumps whenever `contribution` changes; BRAND-05 folds it into the hash. */
    configVersion: integer("config_version").default(1).notNull(),
    /**
     * The editor has turned this reference on for auto-selection (BRAND-02/03).
     * Only allowed true when `provider_transmission_allowed` is true and a
     * contribution is set (the "set a contribution" part is enforced in code).
     */
    activatedForJourney: boolean("activated_for_journey")
      .default(false)
      .notNull(),
    /**
     * Optional AI visual analysis (BRAND-02): structured suggestions with
     * evidence and explicit unknowns. Never applied automatically — the editor
     * copies fields into `contribution`.
     */
    analysis: jsonb("analysis"),
    /** sha256 of { image sha256, analyzer model, prompt version } — cache key. */
    analysisHash: text("analysis_hash"),
    analysisModel: text("analysis_model"),
    analysisPromptVersion: text("analysis_prompt_version"),
    analysisRunAt: timestamp("analysis_run_at", {
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
    uniqueIndex("creative_brand_references_object_key_unique").on(
      table.objectKey,
    ),
    index("creative_brand_references_topic_id_idx").on(table.topicId),
    index("creative_brand_references_topic_active_idx").on(
      table.topicId,
      table.isActive,
    ),
    check(
      "creative_brand_references_values_check",
      sql`${table.contentType} = 'image/webp'
        AND ${table.sha256} ~ '^[0-9a-f]{64}$'
        AND ${table.fileSize} BETWEEN 1 AND 15728640
        AND ${table.width} BETWEEN 64 AND 8192
        AND ${table.height} BETWEEN 64 AND 8192
        AND ${table.width} <= ${table.height} * 30
        AND ${table.height} <= ${table.width} * 30
        AND ${table.version} > 0
        AND ${table.configVersion} > 0
        AND char_length(${table.name}) BETWEEN 1 AND 120
        AND ${table.kind} IN ('finished-post', 'poster', 'sticker-sheet', 'signage', 'other')
        AND (${table.provenance} IS NULL OR char_length(${table.provenance}) <= 500)
        AND (${table.usageNote} IS NULL OR char_length(${table.usageNote}) <= 1000)
        AND (${table.activatedForJourney} = false OR ${table.providerTransmissionAllowed} = true)
        AND (${table.analysisPromptVersion} IS NULL OR char_length(${table.analysisPromptVersion}) <= 60)`,
    ),
  ],
);

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
    brandPalette: jsonb("brand_palette")
      .$type<CreativeBrandPaletteColor[]>()
      .default(DEFAULT_CREATIVE_BRAND_PALETTE.map((entry) => ({ ...entry })))
      .notNull(),
    carouselChrome: jsonb("carousel_chrome")
      .$type<CreativeCarouselChromeSettings>()
      .default(DEFAULT_CREATIVE_CAROUSEL_CHROME_SETTINGS)
      .notNull(),
    brandAssetId: uuid("brand_asset_id").references(
      () => creativeBrandAssets.id,
      { onDelete: "set null" },
    ),
    brandOverlay: jsonb("brand_overlay")
      .$type<CreativeBrandOverlaySettings>()
      .default(DEFAULT_CREATIVE_BRAND_OVERLAY_SETTINGS)
      .notNull(),
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
    conversionGoal: text("conversion_goal")
      .$type<CreativeConversionGoal>()
      .default(DEFAULT_CREATIVE_CONVERSION_GOAL)
      .notNull(),
    framingStrategy: text("framing_strategy")
      .$type<CreativeFramingStrategy>()
      .default(DEFAULT_CREATIVE_FRAMING_STRATEGY)
      .notNull(),
    /**
     * How real places may be represented (FEAT-GEO-001 / GEO-01). The default
     * keeps pre-GEO behavior; changing it advances visualPolicyVersion and
     * invalidates approvals that captured the old policy.
     */
    visualFidelityMode: text("visual_fidelity_mode")
      .$type<VisualFidelityMode>()
      .default(DEFAULT_VISUAL_FIDELITY_MODE)
      .notNull(),
    /** Confirmed municipality/region/country of the covered place. */
    geoScope: jsonb("geo_scope")
      .$type<CreativeGeoScope>()
      .default(DEFAULT_CREATIVE_GEO_SCOPE)
      .notNull(),
    /**
     * Monotonic revision that advances only when visualFidelityMode or
     * geoScope change on a save. Briefs capture it in profileSnapshot so a
     * later policy change can be detected and stale approvals invalidated.
     */
    visualPolicyVersion: integer("visual_policy_version").default(1).notNull(),
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
    check(
      "creative_profiles_conversion_goal_check",
      sql`${table.conversionGoal} IN ('followers', 'discussion', 'saves', 'shares')`,
    ),
    check(
      "creative_profiles_framing_strategy_check",
      sql`${table.framingStrategy} IN ('auto', 'reader-consequence', 'explainer', 'authority')`,
    ),
    check(
      "creative_profiles_visual_fidelity_mode_check",
      sql`${table.visualFidelityMode} IN ('illustration-editorial', 'verified-references', 'photo-required')`,
    ),
    check(
      "creative_profiles_visual_policy_version_check",
      sql`${table.visualPolicyVersion} >= 1`,
    ),
  ],
);

export const creativeCharacters = pgTable(
  "creative_characters",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    topicId: uuid("topic_id")
      .notNull()
      .references(() => topics.id, { onDelete: "cascade" }),
    slot: integer("slot"),
    name: text("name").notNull(),
    description: text("description").notNull(),
    isActive: boolean("is_active").default(true).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("creative_characters_topic_slot_unique").on(
      table.topicId,
      table.slot,
    ),
    index("creative_characters_topic_id_idx").on(table.topicId),
    index("creative_characters_topic_active_idx").on(
      table.topicId,
      table.isActive,
    ),
    check(
      "creative_characters_slot_check",
      sql`(${table.slot} IS NULL OR ${table.slot} BETWEEN 1 AND 2)
        AND (${table.isActive} = false OR ${table.slot} IS NOT NULL)`,
    ),
  ],
);

export const creativeCharacterReferenceImages = pgTable(
  "creative_character_reference_images",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    characterId: uuid("character_id")
      .notNull()
      .references(() => creativeCharacters.id, { onDelete: "cascade" }),
    objectKey: text("object_key").notNull(),
    contentType: text("content_type").notNull(),
    fileName: text("file_name").notNull(),
    fileSize: integer("file_size").notNull(),
    order: integer("order").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("creative_character_reference_images_character_order_unique").on(
      table.characterId,
      table.order,
    ),
    index("creative_character_reference_images_character_id_idx").on(
      table.characterId,
    ),
    check(
      "creative_character_reference_images_values_check",
      sql`${table.order} BETWEEN 1 AND 5 AND ${table.fileSize} > 0`,
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
    /** Editor-authored framing; configuration only, never source evidence. */
    editorialDirection: text("editorial_direction"),
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
    carouselPlan: jsonb("carousel_plan"),
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
    narrativeRationale: text("narrative_rationale"),
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
    /**
     * Per-publication override of the topic's visual fidelity policy
     * (FEAT-GEO-001 / GEO-01). NULL means the draft inherits the current
     * topic policy. A non-null override always carries an
     * explicit editor reason (see the check below): moving off
     * "photo-required" is never a silent fallback.
     */
    visualFidelityOverride: text("visual_fidelity_override")
      .$type<VisualFidelityMode>(),
    visualFidelityOverrideReason: text("visual_fidelity_override_reason"),
    visualFidelityOverrideAt: timestamp("visual_fidelity_override_at", {
      withTimezone: true,
      mode: "date",
    }),
    visualFidelityOverrideBy: text("visual_fidelity_override_by"),
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
      "creative_drafts_visual_fidelity_override_check",
      sql`(
        ${table.visualFidelityOverride} IS NULL
        AND ${table.visualFidelityOverrideReason} IS NULL
        AND ${table.visualFidelityOverrideAt} IS NULL
      ) OR (
        ${table.visualFidelityOverride}
          IN ('illustration-editorial', 'verified-references', 'photo-required')
        AND char_length(btrim(${table.visualFidelityOverrideReason})) > 0
        AND ${table.visualFidelityOverrideAt} IS NOT NULL
      )`,
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
    editorialGoal: text("editorial_goal"),
    viewerQuestion: text("viewer_question"),
    ctaQuestion: text("cta_question"),
    headline: text("headline").notNull(),
    subheadline: text("subheadline"),
    body: text("body"),
    continuationCue: text("continuation_cue"),
    visualDirection: text("visual_direction").notNull(),
    interactiveOverlay: jsonb("interactive_overlay")
      .$type<CreativeInteractiveOverlay>(),
    factIds: text("fact_ids")
      .array()
      .notNull()
      .default(sql`ARRAY[]::text[]`),
    assetRequest: creativeAssetRequestTypeEnum("asset_request").notNull(),
    aspectRatio: creativeAspectRatioEnum("aspect_ratio").notNull(),
    /**
     * Deterministic auto-selection of activated brand visual references for
     * this unit (BRAND-03): `{ selected: [{ id, version, configVersion,
     * function, reason }], excluded: [{ id, reason }], note: string|null }`.
     * Recomputed on every draft save; validated in code. Null when the feature
     * produced nothing.
     */
    brandReferenceSelection: jsonb("brand_reference_selection"),
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

export const creativeUnitCharacters = pgTable(
  "creative_unit_characters",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    unitId: uuid("unit_id")
      .notNull()
      .references(() => creativeUnits.id, { onDelete: "cascade" }),
    characterId: uuid("character_id")
      .notNull()
      .references(() => creativeCharacters.id, { onDelete: "restrict" }),
    characterSnapshot: jsonb("character_snapshot").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("creative_unit_characters_unit_character_unique").on(
      table.unitId,
      table.characterId,
    ),
    index("creative_unit_characters_unit_id_idx").on(table.unitId),
    index("creative_unit_characters_character_id_idx").on(table.characterId),
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
    brandInputHash: text("brand_input_hash").default("none").notNull(),
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
      table.brandInputHash,
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
    generationMode: creativeAssetGenerationModeEnum("generation_mode")
      .default("text-to-image")
      .notNull(),
    /** The exact Fal endpoint must survive polling and regeneration. */
    providerEndpoint: text("provider_endpoint")
      .default("openai/gpt-image-2")
      .notNull(),
    /** Immutable R2-backed character references; never signed/Fal URLs. */
    referenceSnapshot: jsonb("reference_snapshot")
      .default(sql`'[]'::jsonb`)
      .notNull(),
    referenceInputHash: text("reference_input_hash").default("").notNull(),
    brandOverlaySnapshot: jsonb("brand_overlay_snapshot").$type<CreativeBrandOverlaySnapshot>(),
    carouselChromeSnapshot: jsonb("carousel_chrome_snapshot").$type<CreativeCarouselChromeSnapshot>(),
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

/**
 * IMG-01. A saved-but-not-executed image edit request, one pending row per
 * slide. Persisting one never calls the image provider, never bumps
 * `creative_drafts.version`, and never touches `creative_asset_batches` or an
 * asset's approval. IMG-02+ moves `status` through running/applied/failed and
 * records `applied_asset_id`; the executed history itself lives on the
 * `creative_assets` chain (`references.base` + `editInstruction`).
 */
export const creativeAssetEditRequests = pgTable(
  "creative_asset_edit_requests",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    topicId: uuid("topic_id")
      .notNull()
      .references(() => topics.id, { onDelete: "cascade" }),
    draftId: uuid("draft_id")
      .notNull()
      .references(() => creativeDrafts.id, { onDelete: "cascade" }),
    unitOrder: integer("unit_order").notNull(),
    baseAssetId: uuid("base_asset_id").references(() => creativeAssets.id, {
      onDelete: "set null",
    }),
    baseVersion: integer("base_version").notNull(),
    revision: integer("revision").default(1).notNull(),
    editType: text("edit_type").default("generative").notNull(),
    instruction: text("instruction"),
    useImageAsBase: boolean("use_image_as_base").default(true).notNull(),
    brandReferenceIds: text("brand_reference_ids")
      .array()
      .default(sql`ARRAY[]::text[]`)
      .notNull(),
    compositionRecipe: jsonb("composition_recipe"),
    status: text("status").default("saved").notNull(),
    appliedAssetId: uuid("applied_asset_id").references(() => creativeAssets.id, {
      onDelete: "set null",
    }),
    appliedRevision: integer("applied_revision"),
    appliedAt: timestamp("applied_at", { withTimezone: true, mode: "date" }),
    blockedReason: text("blocked_reason"),
    lastError: text("last_error"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("creative_asset_edit_requests_draft_unit_unique").on(
      table.draftId,
      table.unitOrder,
    ),
    index("creative_asset_edit_requests_draft_id_idx").on(table.draftId),
    index("creative_asset_edit_requests_topic_id_idx").on(table.topicId),
    check(
      "creative_asset_edit_requests_values_check",
      sql`${table.unitOrder} > 0
        AND ${table.baseVersion} > 0
        AND ${table.revision} > 0
        AND ${table.editType} IN ('generative', 'composition')
        AND ${table.status} IN ('saved', 'running', 'applied', 'failed')
        AND (${table.instruction} IS NULL OR char_length(${table.instruction}) <= 2000)
        AND (${table.appliedRevision} IS NULL OR ${table.appliedRevision} > 0)`,
    ),
    check(
      "creative_asset_edit_requests_dates_check",
      sql`${table.updatedAt} >= ${table.createdAt}`,
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
