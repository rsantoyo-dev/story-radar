import "server-only";
import { parseGeoContact } from "./creative-geo-contact";

import { eq, sql } from "drizzle-orm";

import { db } from "@/db/client";
import { creativeBrandAssets, creativeProfiles } from "@/db/schema";

import {
  CREATIVE_CONVERSION_GOALS,
  CREATIVE_FRAMING_STRATEGIES,
  DEFAULT_CREATIVE_BRAND_OVERLAY_SETTINGS,
  DEFAULT_CREATIVE_CAROUSEL_CHROME_SETTINGS,
  DEFAULT_CREATIVE_CONVERSION_GOAL,
  DEFAULT_CREATIVE_FRAMING_STRATEGY,
  CREATIVE_VISUAL_GUIDANCE_MAX_LENGTH,
  DEFAULT_CREATIVE_GEO_SCOPE,
  DEFAULT_CREATIVE_VISUAL_GUIDANCE,
  DEFAULT_VISUAL_FIDELITY_MODE,
  VISUAL_FIDELITY_MODES,
  isCreativeConversionGoal,
  isCreativeFramingStrategy,
  isVisualFidelityMode,
  type CreativeConversionGoal,
  type CreativeFramingStrategy,
  type CreativeGeoScope,
  type CreativeProfile,
  type EditableCreativeProfile,
  type VisualFidelityMode,
} from "./creative-content.types";
import { parseCreativeGeoScopeInput } from "./creative-geo-scope-validation";
import { invalidateApprovalsForVisualPolicyChange } from "./creative-visual-policy-invalidation";
import {
  findCreativeBrandAsset,
  publicCreativeBrandAsset,
  type StoredCreativeBrandAsset,
} from "./creative-brand-assets.repository";
import {
  parseCreativeBrandOverlayInput,
  parseCreativeBrandOverlaySettings,
} from "./creative-brand-overlay-validation";
import {
  cloneDefaultPalette,
  parseCreativeBrandPaletteInput,
  parseCreativeCarouselChromeInput,
} from "./creative-carousel-chrome-validation";

export const DEFAULT_CREATIVE_PROFILE_ID = "default";

const DEFAULT_PROFILE: EditableCreativeProfile = {
  name: "Press Craftor",
  language: "English",
  region: "Global",
  platform: "Facebook",
  audience:
    "Professionals, creators, and small businesses interested in the selected topic",
  visualGuidance: DEFAULT_CREATIVE_VISUAL_GUIDANCE,
  brandPalette: cloneDefaultPalette(),
  carouselChrome: { ...DEFAULT_CREATIVE_CAROUSEL_CHROME_SETTINGS },
  brandOverlay: { ...DEFAULT_CREATIVE_BRAND_OVERLAY_SETTINGS },
  brandPersonality: ["insightful", "clear", "clever", "practical"],
  formality: 45,
  humor: 45,
  energy: 65,
  optimism: 65,
  provocation: 25,
  allowEmojis: true,
  maxEmojis: 2,
  conversionGoal: DEFAULT_CREATIVE_CONVERSION_GOAL,
  framingStrategy: DEFAULT_CREATIVE_FRAMING_STRATEGY,
  visualFidelityMode: DEFAULT_VISUAL_FIDELITY_MODE,
  geoScope: { ...DEFAULT_CREATIVE_GEO_SCOPE },
  callToActionStyle:
    "Use one natural call to action aligned with the primary conversion goal. State a concrete audience benefit without engagement bait or artificial urgency.",
};

export async function getCreativeProfile(
  topicId: string,
): Promise<CreativeProfile> {
  const existing = await findStoredCreativeProfile(topicId);

  if (existing) {
    return mapCreativeProfile(existing.profile, existing.brandAsset);
  }

  const [created] = await db
    .insert(creativeProfiles)
    .values({ id: profileId(topicId), topicId, ...DEFAULT_PROFILE })
    .onConflictDoNothing()
    .returning();

  if (created) {
    return mapCreativeProfile(created);
  }

  const concurrent = await findStoredCreativeProfile(topicId);

  if (!concurrent) {
    throw new Error("The creative profile could not be initialized");
  }

  return mapCreativeProfile(concurrent.profile, concurrent.brandAsset);
}

export type VisualPolicyChangeResult = {
  policyVersion: number;
  draftsRetired: number;
};

export type SaveCreativeProfileResult = {
  profile: CreativeProfile;
  /**
   * Non-null when this save either advanced the visual fidelity policy or
   * finished invalidating approvals a previous save left stale (the
   * invalidation runs on every save and is idempotent — GEO-01 criterion 4).
   */
  visualPolicyChange: VisualPolicyChangeResult | null;
};

/**
 * The topic's CURRENT place-fidelity mode, read straight from the profile row
 * (no brand-asset join). Used by the image pipeline as a live safety gate so a
 * re-approved old draft cannot generate under a superseded policy. Falls back
 * to the default when the topic has no profile row yet.
 */
export async function getTopicVisualFidelityMode(
  topicId: string,
): Promise<VisualFidelityMode> {
  const [row] = await db
    .select({ visualFidelityMode: creativeProfiles.visualFidelityMode })
    .from(creativeProfiles)
    .where(eq(creativeProfiles.topicId, topicId))
    .limit(1);
  return row ? visualFidelityModeValue(row.visualFidelityMode) : DEFAULT_VISUAL_FIDELITY_MODE;
}

export async function saveCreativeProfile(
  topicId: string,
  input: EditableCreativeProfile,
  options: { preserveExistingBrandOverlay?: boolean } = {},
): Promise<SaveCreativeProfileResult> {
  const profile = validateCreativeProfile(input);
  const { brandOverlay, ...profileFields } = profile;
  const brandAssetId = brandOverlay.assetId ?? null;
  const brandAsset = brandAssetId
    ? await findCreativeBrandAsset(topicId, brandAssetId)
    : undefined;
  if (brandAssetId && !brandAsset) {
    throw new CreativeProfileValidationError(
      "brandOverlay.assetId must belong to the selected topic",
    );
  }

  // Read the row before the upsert so a visual-policy change (mode or
  // geoScope) can be detected. A palette or tone edit must not advance
  // visualPolicyVersion or invalidate approvals — GEO-01 criterion 2/4.
  const previous = await findStoredCreativeProfile(topicId);
  const policyChanged =
    previous !== undefined &&
    (previous.profile.visualFidelityMode !== profileFields.visualFidelityMode ||
      !geoScopeEquals(previous.profile.geoScope, profileFields.geoScope));

  const previousEditable = previous ? validateCreativeProfile(mapCreativeProfile(previous.profile, previous.brandAsset)) : undefined;
  const editorialEqual = previousEditable && JSON.stringify(
    { ...profile, ...(options.preserveExistingBrandOverlay ? { brandOverlay: previousEditable.brandOverlay } : {}), geoProviderContact: undefined },
  ) === JSON.stringify({ ...previousEditable, geoProviderContact: undefined });
  // Contact-only saves must not invalidate documentary fingerprints or editorial caches.
  const updatedAt = editorialEqual ? previous!.profile.updatedAt : new Date();
  const brandOverlaySettings = parseCreativeBrandOverlaySettings(brandOverlay);
  const bumpPolicyVersion = policyChanged
    ? {
        visualPolicyVersion: sql`${creativeProfiles.visualPolicyVersion} + 1`,
      }
    : {};
  const updateFields = options.preserveExistingBrandOverlay
    ? {
        ...profileFields,
        ...bumpPolicyVersion,
        updatedAt,
      }
    : {
        ...profileFields,
        ...bumpPolicyVersion,
        brandAssetId,
        brandOverlay: brandOverlaySettings,
        updatedAt,
      };
  const [saved] = await db
    .insert(creativeProfiles)
    .values({
      id: profileId(topicId),
      topicId,
      ...profileFields,
      brandAssetId,
      brandOverlay: brandOverlaySettings,
      updatedAt,
    })
    .onConflictDoUpdate({
      target: creativeProfiles.topicId,
      // Older clients do not know about brandOverlay. Their full-profile PUT
      // may update legacy fields, but must not unlink a logo selected in a
      // newer tab. On insert, the disabled defaults above still apply.
      set: updateFields,
    })
    .returning();

  if (!saved) {
    throw new Error("The creative profile could not be saved");
  }

  const resolvedBrandAsset = saved.brandAssetId
    ? await findCreativeBrandAsset(topicId, saved.brandAssetId)
    : undefined;
  const mapped = mapCreativeProfile(saved, resolvedBrandAsset ?? brandAsset);

  // Run on EVERY save, not only when this call changed the policy: the pass is
  // idempotent (it selects stale approvals from stored state), so a retry
  // after a partial failure still completes even though `policyChanged` is now
  // false. When nothing is stale it is one indexed query and a no-op.
  const invalidation = await invalidateApprovalsForVisualPolicyChange({
    topicId,
    currentPolicyVersion: saved.visualPolicyVersion,
  });
  const visualPolicyChange: VisualPolicyChangeResult | null =
    policyChanged || invalidation.draftsRetired > 0
      ? { policyVersion: saved.visualPolicyVersion, ...invalidation }
      : null;

  return { profile: mapped, visualPolicyChange };
}

function geoScopeEquals(a: CreativeGeoScope, b: CreativeGeoScope): boolean {
  return (
    a.municipality === b.municipality &&
    a.region === b.region &&
    a.country === b.country &&
    a.validatedLocationId === b.validatedLocationId
  );
}

function profileId(topicId: string): string {
  return `topic:${topicId}`;
}

export function parseCreativeProfileInput(value: unknown): EditableCreativeProfile {
  if (!isRecord(value)) {
    throw new CreativeProfileValidationError("A profile object is required");
  }

  return validateCreativeProfile({
    name: value.name,
    language: value.language,
    region: value.region,
    platform: value.platform,
    audience: value.audience,
    visualGuidance: value.visualGuidance,
    brandPalette: value.brandPalette,
    carouselChrome: value.carouselChrome,
    brandOverlay: value.brandOverlay,
    brandPersonality: value.brandPersonality,
    formality: value.formality,
    humor: value.humor,
    energy: value.energy,
    optimism: value.optimism,
    provocation: value.provocation,
    allowEmojis: value.allowEmojis,
    maxEmojis: value.maxEmojis,
    conversionGoal: value.conversionGoal,
    framingStrategy: value.framingStrategy,
    visualFidelityMode: value.visualFidelityMode,
    geoProviderContact: value.geoProviderContact,
    geoScope: value.geoScope,
    callToActionStyle: value.callToActionStyle,
  } as EditableCreativeProfile);
}

function validateCreativeProfile(
  value: EditableCreativeProfile,
): EditableCreativeProfile {
  const brandPalette = parseCreativeBrandPaletteInput(value.brandPalette);
  return {
    name: textValue(value.name, "name", 100),
    language: textValue(value.language, "language", 80),
    region: textValue(value.region, "region", 80),
    platform: textValue(value.platform, "platform", 80),
    audience: textValue(value.audience, "audience", 500),
    visualGuidance: visualGuidanceValue(value.visualGuidance),
    brandPalette,
    carouselChrome: parseCreativeCarouselChromeInput(
      value.carouselChrome,
      brandPalette,
    ),
    brandOverlay: parseCreativeBrandOverlayInput(value.brandOverlay),
    brandPersonality: textList(
      value.brandPersonality,
      "brandPersonality",
      8,
      50,
    ),
    formality: score(value.formality, "formality"),
    humor: score(value.humor, "humor"),
    energy: score(value.energy, "energy"),
    optimism: score(value.optimism, "optimism"),
    provocation: score(value.provocation, "provocation"),
    allowEmojis: booleanValue(value.allowEmojis, "allowEmojis"),
    maxEmojis: boundedInteger(value.maxEmojis, "maxEmojis", 0, 10),
    conversionGoal: conversionGoalValue(value.conversionGoal),
    framingStrategy: framingStrategyValue(value.framingStrategy),
    visualFidelityMode: visualFidelityModeValue(value.visualFidelityMode),
    geoProviderContact: geographicContactValue(value.geoProviderContact),
    geoScope: parseCreativeGeoScopeInput(value.geoScope),
    callToActionStyle: textValue(
      value.callToActionStyle,
      "callToActionStyle",
      500,
    ),
  };
}

async function findStoredCreativeProfile(topicId: string): Promise<
  | {
      profile: typeof creativeProfiles.$inferSelect;
      brandAsset: StoredCreativeBrandAsset | null;
    }
  | undefined
> {
  const [row] = await db
    .select({ profile: creativeProfiles, brandAsset: creativeBrandAssets })
    .from(creativeProfiles)
    .leftJoin(
      creativeBrandAssets,
      eq(creativeProfiles.brandAssetId, creativeBrandAssets.id),
    )
    .where(eq(creativeProfiles.topicId, topicId))
    .limit(1);
  return row;
}

function mapCreativeProfile(
  profile: typeof creativeProfiles.$inferSelect,
  brandAsset?: StoredCreativeBrandAsset | null,
): CreativeProfile {
  const settings = parseCreativeBrandOverlaySettings(profile.brandOverlay);
  const brandPalette = parseCreativeBrandPaletteInput(profile.brandPalette);
  const carouselChrome = parseCreativeCarouselChromeInput(
    profile.carouselChrome,
    brandPalette,
  );
  if (
    profile.brandAssetId &&
    (!brandAsset ||
      brandAsset.id !== profile.brandAssetId ||
      brandAsset.topicId !== profile.topicId)
  ) {
    throw new Error("The creative profile brand asset is inconsistent");
  }

  return {
    id: profile.id,
    name: profile.name,
    language: profile.language,
    region: profile.region,
    platform: profile.platform,
    audience: profile.audience,
    visualGuidance: profile.visualGuidance,
    brandPalette,
    carouselChrome,
    brandOverlay: {
      ...settings,
      ...(brandAsset
        ? {
            assetId: brandAsset.id,
            asset: publicCreativeBrandAsset(brandAsset),
          }
        : {}),
    },
    brandPersonality: profile.brandPersonality,
    formality: profile.formality,
    humor: profile.humor,
    energy: profile.energy,
    optimism: profile.optimism,
    provocation: profile.provocation,
    allowEmojis: profile.allowEmojis,
    maxEmojis: profile.maxEmojis,
    conversionGoal: conversionGoalValue(profile.conversionGoal),
    framingStrategy: framingStrategyValue(profile.framingStrategy),
    visualFidelityMode: visualFidelityModeValue(profile.visualFidelityMode),
    geoProviderContact: profile.geoProviderContact ?? "",
    geoScope: parseCreativeGeoScopeInput(profile.geoScope),
    visualPolicyVersion: profile.visualPolicyVersion,
    callToActionStyle: profile.callToActionStyle,
    updatedAt: profile.updatedAt,
  };
}

function visualGuidanceValue(value: unknown): string {
  if (value === undefined) {
    return DEFAULT_CREATIVE_VISUAL_GUIDANCE;
  }

  if (typeof value !== "string" || !value.trim()) {
    throw new CreativeProfileValidationError("visualGuidance is required");
  }

  return value
    .replace(/\r\n?/g, "\n")
    .trim()
    .slice(0, CREATIVE_VISUAL_GUIDANCE_MAX_LENGTH);
}

function textValue(value: unknown, field: string, max: number): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new CreativeProfileValidationError(`${field} is required`);
  }

  return value.replace(/\s+/g, " ").trim().slice(0, max);
}

function textList(
  value: unknown,
  field: string,
  maxItems: number,
  maxLength: number,
): string[] {
  if (!Array.isArray(value) || !value.every((item) => typeof item === "string")) {
    throw new CreativeProfileValidationError(`${field} must be a text array`);
  }

  return [...new Set(value.map((item) => item.trim()).filter(Boolean))]
    .slice(0, maxItems)
    .map((item) => item.slice(0, maxLength));
}

function score(value: unknown, field: string): number {
  return boundedInteger(value, field, 0, 100);
}

function boundedInteger(
  value: unknown,
  field: string,
  minimum: number,
  maximum: number,
): number {
  if (!Number.isInteger(value) || (value as number) < minimum || (value as number) > maximum) {
    throw new CreativeProfileValidationError(
      `${field} must be an integer from ${minimum} to ${maximum}`,
    );
  }

  return value as number;
}

function booleanValue(value: unknown, field: string): boolean {
  if (typeof value !== "boolean") {
    throw new CreativeProfileValidationError(`${field} must be a boolean`);
  }

  return value;
}

export function conversionGoalValue(value: unknown): CreativeConversionGoal {
  if (value === undefined) {
    return DEFAULT_CREATIVE_CONVERSION_GOAL;
  }

  if (typeof value !== "string" || !isCreativeConversionGoal(value)) {
    throw new CreativeProfileValidationError(
      `conversionGoal must be one of: ${CREATIVE_CONVERSION_GOALS.join(", ")}`,
    );
  }

  return value as CreativeConversionGoal;
}

export function framingStrategyValue(value: unknown): CreativeFramingStrategy {
  if (value === undefined || value === null || value === "") {
    return DEFAULT_CREATIVE_FRAMING_STRATEGY;
  }

  if (typeof value !== "string" || !isCreativeFramingStrategy(value)) {
    throw new CreativeProfileValidationError(
      `framingStrategy must be one of: ${CREATIVE_FRAMING_STRATEGIES.join(", ")}`,
    );
  }

  return value as CreativeFramingStrategy;
}

export function visualFidelityModeValue(value: unknown): VisualFidelityMode {
  if (value === undefined || value === null || value === "") {
    return DEFAULT_VISUAL_FIDELITY_MODE;
  }

  if (typeof value !== "string" || !isVisualFidelityMode(value)) {
    throw new CreativeProfileValidationError(
      `visualFidelityMode must be one of: ${VISUAL_FIDELITY_MODES.join(", ")}`,
    );
  }

  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export class CreativeProfileValidationError extends Error {}

function geographicContactValue(value: unknown): string {
  try { return parseGeoContact(value); }
  catch { throw new CreativeProfileValidationError("Geographic contact must be a valid email address"); }
}
