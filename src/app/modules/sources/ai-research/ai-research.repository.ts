import "server-only";

import { eq } from "drizzle-orm";

import { getTopicById } from "@/app/modules/topics/topic-catalog.repository";
import { db } from "@/db/client";
import { aiResearchSources } from "@/db/schema";

import {
  AI_RESEARCH_ORIENTATIONS,
  type AiResearchOrientation,
  type AiResearchSourceConfig,
  type UpdateAiResearchSourceInput,
} from "./ai-research.types";

const MAX_INSTRUCTION_LENGTH = 2_000;

export class AiResearchSourceValidationError extends Error {}
export class AiResearchSourceNotFoundError extends Error {}

export async function getAiResearchSourceConfig(
  topicId: string,
): Promise<AiResearchSourceConfig> {
  const [stored, topic] = await Promise.all([
    db
      .select()
      .from(aiResearchSources)
      .where(eq(aiResearchSources.topicId, topicId))
      .limit(1)
      .then(([value]) => value),
    getTopicById(topicId),
  ]);

  if (!topic) {
    throw new AiResearchSourceNotFoundError("Topic was not found");
  }

  if (!stored) {
    return defaultConfig(topic);
  }

  return {
    topicId: topic.id,
    topicName: topic.name,
    ...(topic.description ? { topicDescription: topic.description } : {}),
    enabled: stored.enabled,
    instruction: stored.instruction,
    orientation: stored.orientation as AiResearchOrientation,
    resultLimit: stored.resultLimit,
    lookbackHours: stored.lookbackHours,
    language: stored.language,
    region: stored.region,
    includeContent: stored.includeContent,
    priority: stored.priority,
    updatedAt: stored.updatedAt,
  };
}

export async function saveAiResearchSourceConfig(
  topicId: string,
  input: UpdateAiResearchSourceInput,
): Promise<AiResearchSourceConfig> {
  const current = await getAiResearchSourceConfig(topicId);
  const next = validateUpdate(current, input);
  const now = new Date();

  await db
    .insert(aiResearchSources)
    .values({
      topicId,
      enabled: next.enabled,
      instruction: next.instruction,
      orientation: next.orientation,
      resultLimit: next.resultLimit,
      lookbackHours: next.lookbackHours,
      language: next.language,
      region: next.region,
      includeContent: next.includeContent,
      priority: next.priority,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: aiResearchSources.topicId,
      set: {
        enabled: next.enabled,
        instruction: next.instruction,
        orientation: next.orientation,
        resultLimit: next.resultLimit,
        lookbackHours: next.lookbackHours,
        language: next.language,
        region: next.region,
        includeContent: next.includeContent,
        priority: next.priority,
        updatedAt: now,
      },
    });

  return { ...next, updatedAt: now };
}

function defaultConfig(topic: {
  id: string;
  name: string;
  description?: string | null;
  updatedAt: Date;
}): AiResearchSourceConfig {
  return {
    topicId: topic.id,
    topicName: topic.name,
    ...(topic.description ? { topicDescription: topic.description } : {}),
    enabled: false,
    instruction: "",
    orientation: "informative",
    resultLimit: 3,
    lookbackHours: 72,
    language: "en",
    region: "global",
    includeContent: true,
    priority: 0,
    updatedAt: topic.updatedAt,
  };
}

function validateUpdate(
  current: AiResearchSourceConfig,
  input: UpdateAiResearchSourceInput,
): AiResearchSourceConfig {
  if (!isRecord(input)) {
    throw new AiResearchSourceValidationError("AI research settings must be an object");
  }

  return {
    ...current,
    enabled: input.enabled === undefined ? current.enabled : boolean(input.enabled, "enabled"),
    instruction:
      input.instruction === undefined
        ? current.instruction
        : text(input.instruction, "instruction", MAX_INSTRUCTION_LENGTH, true),
    orientation:
      input.orientation === undefined
        ? current.orientation
        : orientation(input.orientation),
    resultLimit:
      input.resultLimit === undefined
        ? current.resultLimit
        : integer(input.resultLimit, "resultLimit", 1, 10),
    lookbackHours:
      input.lookbackHours === undefined
        ? current.lookbackHours
        : integer(input.lookbackHours, "lookbackHours", 1, 8_760),
    language:
      input.language === undefined
        ? current.language
        : text(input.language, "language", 32),
    region:
      input.region === undefined
        ? current.region
        : text(input.region, "region", 80),
    includeContent:
      input.includeContent === undefined
        ? current.includeContent
        : boolean(input.includeContent, "includeContent"),
    priority:
      input.priority === undefined
        ? current.priority
        : integer(input.priority, "priority", 0, 100),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(
  value: unknown,
  field: string,
  maxLength: number,
  allowBlank = false,
): string {
  if (typeof value !== "string") {
    throw new AiResearchSourceValidationError(`${field} must be text`);
  }
  const normalized = value.trim();
  if ((!allowBlank && !normalized) || normalized.length > maxLength) {
    throw new AiResearchSourceValidationError(
      `${field} must be ${allowBlank ? "at most" : "between 1 and"} ${maxLength} characters`,
    );
  }
  return normalized;
}

function boolean(value: unknown, field: string): boolean {
  if (typeof value !== "boolean") {
    throw new AiResearchSourceValidationError(`${field} must be true or false`);
  }
  return value;
}

function integer(
  value: unknown,
  field: string,
  minimum: number,
  maximum: number,
): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new AiResearchSourceValidationError(
      `${field} must be a whole number between ${minimum} and ${maximum}`,
    );
  }
  return parsed;
}

function orientation(value: unknown): AiResearchOrientation {
  if (
    typeof value === "string" &&
    (AI_RESEARCH_ORIENTATIONS as readonly string[]).includes(value)
  ) {
    return value as AiResearchOrientation;
  }
  throw new AiResearchSourceValidationError(
    `orientation must be one of: ${AI_RESEARCH_ORIENTATIONS.join(", ")}`,
  );
}
