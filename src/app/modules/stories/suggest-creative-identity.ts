import "server-only";

import { randomUUID } from "node:crypto";

import { recordUsageCharge } from "../credits/usage-charges.repository";
import { CreativeContentConfigurationError } from "./creative-content.config";
import {
  buildCreativeIdentityOrganizerContents,
  buildCreativeIdentityOrganizerInstructions,
  CREATIVE_IDENTITY_FIELDS,
  CREATIVE_IDENTITY_ORGANIZER_PROMPT_VERSION,
  CREATIVE_IDENTITY_ORGANIZER_SCHEMA,
  EMPTY_CREATIVE_IDENTITY,
  parseCreativeIdentityFields,
  parseCreativeIdentityInput,
  parseCreativeIdentityOrganizerResponse,
  validateCreativeIdentityGuide,
  validateCreativeIdentityInstruction,
  type CreativeIdentity,
} from "./creative-identity";
import { getCreativeProfile } from "./creative-profile.repository";
import { textCostMicros, textRate } from "./creative-text-cost";
import { generateOpenAiStructuredResponse } from "./openai-structured-response";
import { suggestBrandPalette, type BrandPaletteSuggestionResult } from "./suggest-brand-palette";

/**
 * "Organize with AI": turns the Visual campaign guide into the creative
 * identity's fixed branches, all at once or one field at a time. Nothing is
 * saved here; the editor reviews the proposal in the profile and saves it.
 */
/** Reading and condensing the whole guide needs Sol; retouching one short field does not. */
const DEFAULT_MODEL = "gpt-6.1-sol";
const DEFAULT_FIELD_MODEL = "gpt-6-luna";
const MAX_OUTPUT_TOKENS = 3_000;
const TIMEOUT_MS = 90_000;
export const MAX_CREATIVE_IDENTITY_SUGGESTIONS_PER_DAY = 40;

export class CreativeIdentitySuggestionLimitError extends Error {}

const usage = new Map<string, number>();
function reserve(topicId: string): void {
  const key = `${new Date().toISOString().slice(0, 10)}:${topicId}`;
  const count = usage.get(key) ?? 0;
  if (count >= MAX_CREATIVE_IDENTITY_SUGGESTIONS_PER_DAY) {
    throw new CreativeIdentitySuggestionLimitError("The daily limit of identity suggestions for this topic was reached; edit the fields manually or try tomorrow.");
  }
  usage.set(key, count + 1);
}

export type CreativeIdentitySuggestion = {
  identity: CreativeIdentity;
  paletteDirection: string;
  /** Only when the whole identity was organized and the guide discusses colour. */
  palette?: BrandPaletteSuggestionResult;
  model: string;
  promptVersion: string;
};

export async function suggestCreativeIdentity(input: {
  topicId: string;
  guide: unknown;
  instruction?: unknown;
  fields?: unknown;
  current?: unknown;
}): Promise<CreativeIdentitySuggestion> {
  const guide = validateCreativeIdentityGuide(input.guide);
  const instruction = validateCreativeIdentityInstruction(input.instruction);
  const fields = parseCreativeIdentityFields(input.fields);
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) throw new CreativeContentConfigurationError("OPENAI_API_KEY is not configured; the identity assistant is unavailable");
  const wholeRequest = CREATIVE_IDENTITY_FIELDS.every((field) => fields.includes(field));
  const model = wholeRequest
    ? process.env.CREATIVE_IDENTITY_ASSISTANT_MODEL?.trim() || DEFAULT_MODEL
    : process.env.CREATIVE_IDENTITY_FIELD_MODEL?.trim() || DEFAULT_FIELD_MODEL;
  const profile = await getCreativeProfile(input.topicId);
  // The unsaved fields in the editor are the baseline a single-field rewrite keeps.
  const current = input.current === undefined ? profile.creativeIdentity ?? EMPTY_CREATIVE_IDENTITY : parseCreativeIdentityInput(input.current);
  reserve(input.topicId);

  const runId = randomUUID();
  const response = await generateOpenAiStructuredResponse({
    selfMetered: true,
    apiKey,
    model,
    instructions: buildCreativeIdentityOrganizerInstructions(fields),
    contents: buildCreativeIdentityOrganizerContents({
      guide, instruction, current,
      profile: { name: profile.name, language: profile.language, region: profile.region, platform: profile.platform, audience: profile.audience },
    }),
    schema: CREATIVE_IDENTITY_ORGANIZER_SCHEMA as unknown as Record<string, unknown>,
    schemaName: "creative_identity",
    maxOutputTokens: MAX_OUTPUT_TOKENS,
    reasoningEffort: "low",
    timeoutMs: TIMEOUT_MS,
    auditContext: { runId, topicId: input.topicId, storyId: "creative-profile" },
  });
  await chargeIdentityCall(input.topicId, runId, response.model, response.usage, response.cachedInputTokens ?? 0);

  const { identity, paletteDirection } = parseCreativeIdentityOrganizerResponse(response.text, fields, current);
  const palette = wholeRequest && paletteDirection.length >= 8
    ? await suggestBrandPalette({ topicId: input.topicId, prompt: paletteDirection.slice(0, 1_200) }).catch(() => undefined)
    : undefined;
  return { identity, paletteDirection, ...(palette ? { palette } : {}), model: response.model, promptVersion: CREATIVE_IDENTITY_ORGANIZER_PROMPT_VERSION };
}

async function chargeIdentityCall(topicId: string, runId: string, model: string, usage: Parameters<typeof textCostMicros>[1], cachedTokens: number) {
  let costMicros: number | null = null;
  let rate: Record<string, unknown> = { unpriced: true };
  try {
    const resolved = textRate("openai", model, usage.promptTokens);
    costMicros = textCostMicros(resolved, usage, cachedTokens);
    rate = { ...resolved };
  } catch { /* an unknown model is recorded unpriced */ }
  await recordUsageCharge({
    topicId, kind: "text", provider: "openai", model, operation: "creative_identity",
    units: { promptTokens: usage.promptTokens, outputTokens: usage.outputTokens, cachedTokens },
    costMicros, estimated: false, rate, idempotencyKey: `identity:${runId}`,
  });
}
