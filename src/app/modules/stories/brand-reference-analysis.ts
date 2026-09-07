/**
 * Pure shaping for the optional AI visual analysis of a brand reference
 * (BRAND-02). The model's output is untrusted: only structural data survives,
 * everything is length-capped, and `detectedText` is display-only — nothing
 * here can change permissions or the activation state. Kept out of the
 * `server-only` orchestrator so it stays unit-testable.
 */

import {
  BRAND_CONTRIBUTION_ASPECTS,
  type BrandContributionAspect,
  type BrandReferenceAnalysis,
  type BrandReferenceAnalysisAspect,
} from "./creative-content.types";

export class CreativeBrandAnalysisError extends Error {}

const MAX_ASPECT_TEXT = 400;
const MAX_LIST_ITEMS = 10;
const MAX_LIST_ITEM_TEXT = 120;
const CONFIDENCES = ["high", "medium", "low"] as const;

export const BRAND_ANALYSIS_DISCLAIMER =
  "Automated visual read — it can be wrong and is not an authoritative brand rule. The editor's configuration always wins.";

/** JSON schema handed to Gemini (`Record<string, unknown>`, like creativeBriefSchema). */
export function brandAnalysisSchema(): Record<string, unknown> {
  const aspect = {
    type: "object",
    additionalProperties: false,
    required: ["present", "observed", "evidence", "confidence"],
    properties: {
      present: { type: "boolean" },
      observed: { type: "string", maxLength: MAX_ASPECT_TEXT },
      evidence: { type: "string", maxLength: MAX_ASPECT_TEXT },
      confidence: { type: "string", enum: [...CONFIDENCES] },
    },
  };
  return {
    type: "object",
    additionalProperties: false,
    required: ["aspects", "detectedText", "avoid", "unknowns"],
    properties: {
      aspects: {
        type: "object",
        additionalProperties: false,
        required: [...BRAND_CONTRIBUTION_ASPECTS],
        properties: Object.fromEntries(
          BRAND_CONTRIBUTION_ASPECTS.map((name) => [name, aspect]),
        ),
      },
      detectedText: {
        type: "array",
        maxItems: MAX_LIST_ITEMS,
        items: { type: "string", maxLength: MAX_LIST_ITEM_TEXT },
      },
      avoid: {
        type: "array",
        maxItems: MAX_LIST_ITEMS,
        items: { type: "string", maxLength: MAX_LIST_ITEM_TEXT },
      },
      unknowns: {
        type: "array",
        maxItems: MAX_LIST_ITEMS,
        items: { type: "string", maxLength: MAX_LIST_ITEM_TEXT },
      },
    },
  };
}

export function parseBrandReferenceAnalysis(
  text: string,
): BrandReferenceAnalysis {
  const body = extractJsonObject(text);
  const rawAspects = asRecord(body.aspects) ?? {};

  const aspects = Object.fromEntries(
    BRAND_CONTRIBUTION_ASPECTS.map((name) => [
      name,
      parseAspect(rawAspects[name]),
    ]),
  ) as Record<BrandContributionAspect, BrandReferenceAnalysisAspect>;

  return {
    aspects,
    detectedText: parseStringList(body.detectedText),
    avoid: parseStringList(body.avoid),
    unknowns: parseStringList(body.unknowns),
    note: BRAND_ANALYSIS_DISCLAIMER,
  };
}

function parseAspect(value: unknown): BrandReferenceAnalysisAspect {
  const raw = asRecord(value);
  if (!raw) {
    return { present: false, observed: "", evidence: "", confidence: "low" };
  }
  const present = raw.present === true;
  return {
    present,
    observed: present ? clip(raw.observed, MAX_ASPECT_TEXT) : "",
    evidence: present ? clip(raw.evidence, MAX_ASPECT_TEXT) : "",
    confidence: CONFIDENCES.includes(
      raw.confidence as (typeof CONFIDENCES)[number],
    )
      ? (raw.confidence as (typeof CONFIDENCES)[number])
      : "low",
  };
}

function parseStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const entry of value) {
    if (typeof entry !== "string") continue;
    const text = entry.trim().slice(0, MAX_LIST_ITEM_TEXT);
    if (text) out.push(text);
    if (out.length >= MAX_LIST_ITEMS) break;
  }
  return out;
}

function clip(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

/** Tolerant: strips a ```json fence and falls back to the outermost braces. */
function extractJsonObject(text: string): Record<string, unknown> {
  const candidates: string[] = [];
  const trimmed = text.trim();
  candidates.push(trimmed);
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fenced) candidates.push(fenced[1].trim());
  const first = trimmed.indexOf("{");
  const last = trimmed.lastIndexOf("}");
  if (first !== -1 && last > first) {
    candidates.push(trimmed.slice(first, last + 1));
  }
  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      const record = asRecord(parsed);
      if (record) return record;
    } catch {
      // try the next candidate
    }
  }
  throw new CreativeBrandAnalysisError(
    "The analyzer response was not a JSON object",
  );
}
