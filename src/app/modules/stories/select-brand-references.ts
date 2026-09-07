/**
 * Deterministic per-unit selection of activated brand visual references
 * (BRAND-03). Pure — no I/O, fully unit-tested. Same inputs → same output.
 *
 * It only *records* a selection (`{ selected, excluded, note }`) on each unit;
 * sending references to the provider is BRAND-04 and the immutable per-asset
 * snapshot + generation hash is BRAND-05. It never changes the visual-fidelity
 * policy: when generative imagery is not allowed it selects nothing and says so.
 */

import { parseCreativeBrandContribution } from "./creative-brand-reference-metadata";

import type {
  BrandContributionAspect,
  BrandReferenceFunction,
  BrandReferenceSelection,
  BrandReferenceSelectionEntry,
  BrandReferenceSelectionExclusion,
  CreativeBrandReference,
  CreativeUnitRole,
} from "./creative-content.types";

export type {
  BrandReferenceFunction,
  BrandReferenceSelection,
  BrandReferenceSelectionEntry,
  BrandReferenceSelectionExclusion,
} from "./creative-content.types";

export type BrandReferenceSelectionBudget = {
  /** Max brand references chosen for a single unit. */
  maxPerUnit: number;
  /** Max total reference images (character + brand) per unit. */
  maxUnitReferenceImages: number;
};

const DEFAULT_BRAND_MAX_REFERENCES_PER_UNIT = 2;
const DEFAULT_BRAND_MAX_UNIT_REFERENCE_IMAGES = 4;

/** Env-overridable budget (BRAND-03 criterion "límites configurables"). */
export function getBrandReferenceSelectionBudget(): BrandReferenceSelectionBudget {
  return {
    maxPerUnit: readPositiveInt(
      process.env.BRAND_MAX_REFERENCES_PER_UNIT,
      DEFAULT_BRAND_MAX_REFERENCES_PER_UNIT,
    ),
    maxUnitReferenceImages: readPositiveInt(
      process.env.BRAND_MAX_UNIT_REFERENCE_IMAGES,
      DEFAULT_BRAND_MAX_UNIT_REFERENCE_IMAGES,
    ),
  };
}

function readPositiveInt(raw: string | undefined, fallback: number): number {
  const value = raw ? Number(raw) : Number.NaN;
  return Number.isInteger(value) && value > 0 && value <= 16 ? value : fallback;
}

type BrandReferenceKind = CreativeBrandReference["kind"];

/** Fixed kind ↔ role affinity. */
const KIND_ROLE_SCORE: Record<
  BrandReferenceKind,
  Partial<Record<CreativeUnitRole, number>>
> = {
  "finished-post": { cover: 3, content: 1, conclusion: 1 },
  poster: { content: 2, cover: 1, conclusion: 1 },
  "sticker-sheet": { content: 2, "call-to-action": 1 },
  signage: { cover: 1, content: 1, conclusion: 1, "call-to-action": 1 },
  other: {},
};

const ASPECT_KEYWORDS: Record<BrandContributionAspect, RegExp> = {
  color: /\b(colou?r|palette|hue|tone)\b/i,
  composition: /\b(composition|layout|grid|arrange|framing)\b/i,
  texture: /\b(texture|grain|paper|matte|gloss)\b/i,
  shape: /\b(shape|geometry|round|angular|silhouette)\b/i,
  motif: /\b(motif|pattern|icon|sticker|emblem)\b/i,
  mood: /\b(mood|tone|atmosphere|feel|vibe)\b/i,
};

const ASPECT_FUNCTION: Record<BrandContributionAspect, BrandReferenceFunction> = {
  color: "palette",
  composition: "layout",
  texture: "texture",
  shape: "layout",
  motif: "motif",
  mood: "ambience",
};

const KIND_FUNCTION: Record<BrandReferenceKind, BrandReferenceFunction> = {
  "finished-post": "layout",
  poster: "layout",
  "sticker-sheet": "motif",
  signage: "signage",
  other: "layout",
};

type ScoredReference = {
  reference: CreativeBrandReference;
  score: number;
  matchedAspects: BrandContributionAspect[];
};

export type BrandSelectionUnitInput = {
  order: number;
  role: CreativeUnitRole;
  visualDirection: string;
};

export function selectBrandReferencesForUnit(input: {
  unit: BrandSelectionUnitInput;
  eligible: CreativeBrandReference[];
  characterReferenceImageCount: number;
  budget: BrandReferenceSelectionBudget;
  generativeImageryAllowed: boolean;
}): BrandReferenceSelection {
  if (!input.generativeImageryAllowed) {
    return {
      selected: [],
      excluded: [],
      note: "Place fidelity is set above illustration; brand references are not used for this draft.",
    };
  }
  if (input.eligible.length === 0) {
    return {
      selected: [],
      excluded: [],
      note: "No brand references are activated for this topic.",
    };
  }

  const scored: ScoredReference[] = input.eligible.map((reference) =>
    scoreReference(reference, input.unit),
  );

  const excluded: BrandReferenceSelectionExclusion[] = [];
  const candidates = scored
    .filter((entry) => {
      if (entry.score > 0) return true;
      excluded.push({
        id: entry.reference.id,
        reason: "no clear match for this slide",
      });
      return false;
    })
    .sort(compareScored);

  const available = Math.max(
    0,
    input.budget.maxUnitReferenceImages - input.characterReferenceImageCount,
  );
  const take = Math.min(
    input.budget.maxPerUnit,
    available,
    candidates.length,
  );

  const selected = candidates.slice(0, take).map((entry) => toEntry(entry, input.unit.role));
  for (const entry of candidates.slice(take)) {
    excluded.push({
      id: entry.reference.id,
      reason:
        available === 0
          ? "the per-unit reference budget is taken by character references"
          : `over the per-unit brand budget (kept the ${take} highest-scoring)`,
    });
  }

  let note: string | null = null;
  if (selected.length === 0) {
    note =
      available === 0
        ? "Character references fill this slide's reference budget."
        : "No activated brand reference matched this slide.";
  }

  return { selected, excluded, note };
}

export function selectBrandReferencesForDraft(input: {
  units: BrandSelectionUnitInput[];
  eligible: CreativeBrandReference[];
  budget: BrandReferenceSelectionBudget;
  generativeImageryAllowed: boolean;
  characterImageCountByOrder: Map<number, number>;
}): Map<number, BrandReferenceSelection> {
  const byOrder = new Map<number, BrandReferenceSelection>();
  for (const unit of input.units) {
    byOrder.set(
      unit.order,
      selectBrandReferencesForUnit({
        unit,
        eligible: input.eligible,
        characterReferenceImageCount:
          input.characterImageCountByOrder.get(unit.order) ?? 0,
        budget: input.budget,
        generativeImageryAllowed: input.generativeImageryAllowed,
      }),
    );
  }
  return byOrder;
}

function scoreReference(
  reference: CreativeBrandReference,
  unit: BrandSelectionUnitInput,
): ScoredReference {
  let score = KIND_ROLE_SCORE[reference.kind]?.[unit.role] ?? 0;
  const matchedAspects: BrandContributionAspect[] = [];
  const aspects = reference.contribution?.aspects ?? [];
  const text = unit.visualDirection ?? "";

  for (const aspect of aspects) {
    const inText = ASPECT_KEYWORDS[aspect].test(text);
    const coverBonus =
      unit.role === "cover" && (aspect === "color" || aspect === "mood");
    if (inText || coverBonus) {
      score += 1;
      matchedAspects.push(aspect);
    }
  }
  return { reference, score, matchedAspects };
}

function compareScored(a: ScoredReference, b: ScoredReference): number {
  if (a.score !== b.score) return b.score - a.score;
  if (a.reference.configVersion !== b.reference.configVersion) {
    return b.reference.configVersion - a.reference.configVersion;
  }
  const at = new Date(a.reference.createdAt).getTime();
  const bt = new Date(b.reference.createdAt).getTime();
  if (at !== bt) return at - bt;
  return a.reference.id < b.reference.id ? -1 : a.reference.id > b.reference.id ? 1 : 0;
}

function toEntry(
  entry: ScoredReference,
  role: CreativeUnitRole,
): BrandReferenceSelectionEntry {
  const dominant = entry.matchedAspects[0];
  const fn = dominant
    ? ASPECT_FUNCTION[dominant]
    : KIND_FUNCTION[entry.reference.kind];
  const aspectPart = entry.matchedAspects.length
    ? `contributes ${entry.matchedAspects.join(", ")}; `
    : "";
  return {
    id: entry.reference.id,
    name: entry.reference.name,
    usageNote: entry.reference.usageNote,
    provenance: entry.reference.provenance,
    sha256: entry.reference.sha256,
    ...(entry.reference.contribution ? { contribution: structuredClone(entry.reference.contribution) } : {}),
    version: entry.reference.version,
    configVersion: entry.reference.configVersion,
    function: fn,
    reason: `${entry.reference.kind} reference; ${aspectPart}fits a '${role}' slide`,
  };
}

const FUNCTIONS = new Set<BrandReferenceFunction>([
  "layout",
  "palette",
  "texture",
  "motif",
  "ambience",
  "signage",
]);

/** Defensively shapes the stored jsonb column into the contract. */
export function normalizeBrandReferenceSelection(
  value: unknown,
): BrandReferenceSelection | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  const raw = value as {
    selected?: unknown;
    excluded?: unknown;
    note?: unknown;
  };
  const selected: BrandReferenceSelectionEntry[] = Array.isArray(raw.selected)
    ? raw.selected.flatMap((item) => {
        const e = asRecord(item);
        if (!e || typeof e.id !== "string") return [];
        return [
          {
            id: e.id,
            ...(typeof e.usageNote === "string" ? { usageNote: e.usageNote } : {}),
            ...(typeof e.provenance === "string" ? { provenance: e.provenance } : {}),
            ...(typeof e.sha256 === "string" ? { sha256: e.sha256 } : {}),
            ...(typeof e.name === "string" ? { name: e.name } : {}),
            ...(safeContribution(e.contribution) ? { contribution: safeContribution(e.contribution) } : {}),
            version: typeof e.version === "number" ? e.version : 1,
            configVersion:
              typeof e.configVersion === "number" ? e.configVersion : 1,
            function: FUNCTIONS.has(e.function as BrandReferenceFunction)
              ? (e.function as BrandReferenceFunction)
              : "layout",
            reason: typeof e.reason === "string" ? e.reason : "",
          },
        ];
      })
    : [];
  const excluded: BrandReferenceSelectionExclusion[] = Array.isArray(raw.excluded)
    ? raw.excluded.flatMap((item) => {
        const e = asRecord(item);
        if (!e || typeof e.id !== "string") return [];
        return [{ id: e.id, reason: typeof e.reason === "string" ? e.reason : "" }];
      })
    : [];
  return {
    selected,
    excluded,
    note: typeof raw.note === "string" ? raw.note : null,
  };
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function safeContribution(value: unknown) {
  try { return value ? parseCreativeBrandContribution(value) : undefined; }
  catch { return undefined; }
}
