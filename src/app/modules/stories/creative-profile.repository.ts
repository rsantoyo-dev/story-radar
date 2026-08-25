import "server-only";

import { eq } from "drizzle-orm";

import { db } from "@/db/client";
import { creativeProfiles } from "@/db/schema";

import {
  DEFAULT_CREATIVE_VISUAL_GUIDANCE,
  type CreativeProfile,
  type EditableCreativeProfile,
} from "./creative-content.types";

export const DEFAULT_CREATIVE_PROFILE_ID = "default";

const DEFAULT_PROFILE: EditableCreativeProfile = {
  name: "Story Radar",
  language: "English",
  region: "Global",
  platform: "Facebook",
  audience:
    "Professionals, creators, and small businesses interested in the selected topic",
  visualGuidance: DEFAULT_CREATIVE_VISUAL_GUIDANCE,
  brandPersonality: ["insightful", "clear", "clever", "practical"],
  formality: 45,
  humor: 45,
  energy: 65,
  optimism: 65,
  provocation: 25,
  allowEmojis: true,
  maxEmojis: 2,
  callToActionStyle:
    "Invite informed discussion without engagement bait or artificial urgency.",
};

export async function getCreativeProfile(
  topicId: string,
): Promise<CreativeProfile> {
  const [existing] = await db
    .select()
    .from(creativeProfiles)
    .where(eq(creativeProfiles.topicId, topicId))
    .limit(1);

  if (existing) {
    return existing;
  }

  const [created] = await db
    .insert(creativeProfiles)
    .values({ id: profileId(topicId), topicId, ...DEFAULT_PROFILE })
    .onConflictDoNothing()
    .returning();

  if (created) {
    return created;
  }

  const [concurrent] = await db
    .select()
    .from(creativeProfiles)
    .where(eq(creativeProfiles.topicId, topicId))
    .limit(1);

  if (!concurrent) {
    throw new Error("The creative profile could not be initialized");
  }

  return concurrent;
}

export async function saveCreativeProfile(
  topicId: string,
  input: EditableCreativeProfile,
): Promise<CreativeProfile> {
  const profile = validateCreativeProfile(input);
  const [saved] = await db
    .insert(creativeProfiles)
    .values({
      id: profileId(topicId),
      topicId,
      ...profile,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: creativeProfiles.topicId,
      set: { ...profile, updatedAt: new Date() },
    })
    .returning();

  if (!saved) {
    throw new Error("The creative profile could not be saved");
  }

  return saved;
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
    brandPersonality: value.brandPersonality,
    formality: value.formality,
    humor: value.humor,
    energy: value.energy,
    optimism: value.optimism,
    provocation: value.provocation,
    allowEmojis: value.allowEmojis,
    maxEmojis: value.maxEmojis,
    callToActionStyle: value.callToActionStyle,
  } as EditableCreativeProfile);
}

function validateCreativeProfile(
  value: EditableCreativeProfile,
): EditableCreativeProfile {
  return {
    name: textValue(value.name, "name", 100),
    language: textValue(value.language, "language", 80),
    region: textValue(value.region, "region", 80),
    platform: textValue(value.platform, "platform", 80),
    audience: textValue(value.audience, "audience", 500),
    visualGuidance: visualGuidanceValue(value.visualGuidance),
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
    callToActionStyle: textValue(
      value.callToActionStyle,
      "callToActionStyle",
      500,
    ),
  };
}

function visualGuidanceValue(value: unknown): string {
  if (value === undefined) {
    return DEFAULT_CREATIVE_VISUAL_GUIDANCE;
  }

  if (typeof value !== "string" || !value.trim()) {
    throw new CreativeProfileValidationError("visualGuidance is required");
  }

  return value.replace(/\r\n?/g, "\n").trim().slice(0, 4_000);
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export class CreativeProfileValidationError extends Error {}
