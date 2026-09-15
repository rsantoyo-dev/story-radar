export type AcquisitionHookBias = "capability" | "stake" | "contrast";

export type TopicAcquisitionLens = {
  key: string;
  label: string;
  definition: string;
  examples: string[];
  hookBias?: AcquisitionHookBias;
  targetShare?: number;
  enabled: boolean;
  isFallback: boolean;
};

export type TopicAcquisitionTaxonomy = {
  topicId: string;
  taxonomyVersion: number;
  lenses: TopicAcquisitionLens[];
};

export type TopicAcquisitionTaxonomyPublication = {
  expectedTaxonomyVersion: number;
  lenses: TopicAcquisitionLens[];
};

export type EditorialAngle = {
  angle: string;
  taxonomyVersion: number;
  reason: string;
  audienceStake: string;
  hookPromise: string;
  alternative?: {
    angle: string;
    reason: string;
  };
};

export class AcquisitionLensError extends Error {}

export const DEFAULT_TOPIC_ACQUISITION_LENSES: readonly TopicAcquisitionLens[] = [
  {
    key: "practical-impact",
    label: "Practical impact",
    definition:
      "Information that can help the audience make, change, or prepare for a practical decision.",
    examples: ["A change to a service people use", "Advice with a clear next step"],
    hookBias: "stake",
    enabled: true,
    isFallback: false,
  },
  {
    key: "notable-development",
    label: "Notable development",
    definition:
      "A new or unexpected development whose specific capability, result, or change merits attention.",
    examples: ["A newly available capability", "An unexpected research result"],
    hookBias: "capability",
    enabled: true,
    isFallback: false,
  },
  {
    key: "risk-and-uncertainty",
    label: "Risk and uncertainty",
    definition:
      "A supported risk, limitation, safety concern, or uncertainty that benefits from careful explanation.",
    examples: ["A documented safety concern", "A policy change with uncertain effects"],
    hookBias: "contrast",
    enabled: true,
    isFallback: false,
  },
  {
    key: "context-and-explainer",
    label: "Context and explainer",
    definition:
      "Background or explanation that helps a specialized or general audience understand an important subject.",
    examples: ["How a process works", "What a reported change means"],
    enabled: true,
    isFallback: true,
  },
];

const LENS_KEY = /^[a-z][a-z0-9-]{0,63}$/;
const HOOK_BIASES = new Set<AcquisitionHookBias>([
  "capability",
  "stake",
  "contrast",
]);

function record(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function text(value: unknown, field: string, maxLength: number): string {
  if (typeof value !== "string" || !value.trim() || value.trim().length > maxLength) {
    throw new AcquisitionLensError(`Invalid ${field}`);
  }

  return value.trim();
}

function textList(value: unknown, field: string, maxItems: number): string[] {
  if (!Array.isArray(value) || value.length > maxItems) {
    throw new AcquisitionLensError(`Invalid ${field}`);
  }

  return value.map((item) => text(item, field, 240));
}

export function cloneDefaultTopicAcquisitionLenses(): TopicAcquisitionLens[] {
  return DEFAULT_TOPIC_ACQUISITION_LENSES.map((lens) => ({
    ...lens,
    examples: [...lens.examples],
  }));
}

/** Validates a complete, publishable snapshot rather than a partial UI edit. */
export function parseTopicAcquisitionLenses(value: unknown): TopicAcquisitionLens[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 20) {
    throw new AcquisitionLensError("A taxonomy needs between 1 and 20 lenses");
  }

  const keys = new Set<string>();
  const lenses = value.map((candidate): TopicAcquisitionLens => {
    if (!record(candidate)) throw new AcquisitionLensError("Invalid acquisition lens");

    const allowed = new Set([
      "key",
      "label",
      "definition",
      "examples",
      "hookBias",
      "targetShare",
      "enabled",
      "isFallback",
    ]);
    if (Object.keys(candidate).some((key) => !allowed.has(key))) {
      throw new AcquisitionLensError("Invalid acquisition lens");
    }

    const key = text(candidate.key, "lens key", 64);
    if (!LENS_KEY.test(key) || keys.has(key)) {
      throw new AcquisitionLensError("Lens keys must be unique stable identifiers");
    }
    keys.add(key);

    if (typeof candidate.enabled !== "boolean") {
      throw new AcquisitionLensError("Invalid lens enabled state");
    }
    if (typeof candidate.isFallback !== "boolean") {
      throw new AcquisitionLensError("Invalid lens fallback state");
    }

    const hookBias = candidate.hookBias;
    if (hookBias !== undefined && (typeof hookBias !== "string" || !HOOK_BIASES.has(hookBias as AcquisitionHookBias))) {
      throw new AcquisitionLensError("Invalid hook bias");
    }

    // `Number.isInteger` accepts `unknown` without narrowing it, so the type
    // check has to be explicit before the value can be stored as a number.
    let targetShare: number | undefined;
    if (candidate.targetShare !== undefined) {
      const share = candidate.targetShare;
      if (typeof share !== "number" || !Number.isInteger(share) || share < 0 || share > 100) {
        throw new AcquisitionLensError("Invalid target share");
      }
      targetShare = share;
    }

    if (!candidate.enabled && targetShare !== undefined) {
      throw new AcquisitionLensError("Disabled lenses cannot have a target share");
    }

    return {
      key,
      label: text(candidate.label, "lens label", 100),
      definition: text(candidate.definition, "lens definition", 1_500),
      examples: textList(candidate.examples, "lens examples", 8),
      ...(hookBias ? { hookBias: hookBias as AcquisitionHookBias } : {}),
      ...(targetShare !== undefined ? { targetShare } : {}),
      enabled: candidate.enabled,
      isFallback: candidate.isFallback,
    };
  });

  const enabled = lenses.filter((lens) => lens.enabled);
  if (!enabled.length) throw new AcquisitionLensError("At least one lens must be enabled");
  if (enabled.filter((lens) => lens.isFallback).length !== 1) {
    throw new AcquisitionLensError("Exactly one enabled lens must be the fallback");
  }

  const configuredTargets = enabled.filter((lens) => lens.targetShare !== undefined);
  if (configuredTargets.length && configuredTargets.length !== enabled.length) {
    throw new AcquisitionLensError("Enabled lenses must all define a target share or none may");
  }
  if (configuredTargets.length && configuredTargets.reduce((sum, lens) => sum + (lens.targetShare ?? 0), 0) !== 100) {
    throw new AcquisitionLensError("Enabled lens target shares must total 100");
  }

  return lenses;
}

export function parseTopicAcquisitionTaxonomyPublication(
  value: unknown,
): TopicAcquisitionTaxonomyPublication {
  if (!record(value) || Object.keys(value).some((key) => key !== "expectedTaxonomyVersion" && key !== "lenses")) {
    throw new AcquisitionLensError("Invalid acquisition taxonomy publication");
  }
  const expectedTaxonomyVersion = value.expectedTaxonomyVersion;
  if (
    typeof expectedTaxonomyVersion !== "number" ||
    !Number.isInteger(expectedTaxonomyVersion) ||
    expectedTaxonomyVersion < 1
  ) {
    throw new AcquisitionLensError("Invalid expected taxonomy version");
  }

  return {
    expectedTaxonomyVersion,
    lenses: parseTopicAcquisitionLenses(value.lenses),
  };
}

export function fallbackEditorialAngle(
  taxonomy: Pick<TopicAcquisitionTaxonomy, "taxonomyVersion" | "lenses">,
  reason: string,
  audienceStake: string,
  hookPromise: string,
): EditorialAngle {
  const fallback = taxonomy.lenses.find(
    (lens) => lens.enabled && lens.isFallback,
  );
  if (!fallback) throw new AcquisitionLensError("The taxonomy has no enabled fallback lens");

  return {
    angle: fallback.key,
    taxonomyVersion: taxonomy.taxonomyVersion,
    reason: text(reason, "editorial angle reason", 1_500),
    audienceStake: text(audienceStake, "editorial angle audience stake", 600),
    hookPromise: text(hookPromise, "editorial angle hook promise", 600),
  };
}

export function parseEditorialAngle(
  value: unknown,
  taxonomy: Pick<TopicAcquisitionTaxonomy, "taxonomyVersion" | "lenses">,
): EditorialAngle {
  if (!record(value)) throw new AcquisitionLensError("Invalid editorial angle");

  const allowed = new Set([
    "angle",
    "taxonomyVersion",
    "reason",
    "audienceStake",
    "hookPromise",
    "alternative",
  ]);
  if (Object.keys(value).some((key) => !allowed.has(key))) {
    throw new AcquisitionLensError("Invalid editorial angle");
  }

  const angle = text(value.angle, "editorial angle", 64);
  if (!Number.isInteger(value.taxonomyVersion) || value.taxonomyVersion !== taxonomy.taxonomyVersion) {
    throw new AcquisitionLensError("Editorial angle uses an unknown taxonomy version");
  }
  if (!taxonomy.lenses.some((lens) => lens.key === angle && lens.enabled)) {
    throw new AcquisitionLensError("Editorial angle is not enabled for this topic");
  }

  const editorialAngle: EditorialAngle = {
    angle,
    taxonomyVersion: taxonomy.taxonomyVersion,
    reason: text(value.reason, "editorial angle reason", 1_500),
    audienceStake: text(value.audienceStake, "editorial angle audience stake", 600),
    hookPromise: text(value.hookPromise, "editorial angle hook promise", 600),
  };

  if (value.alternative === undefined) return editorialAngle;
  if (!record(value.alternative)) throw new AcquisitionLensError("Invalid editorial angle alternative");
  if (Object.keys(value.alternative).some((key) => key !== "angle" && key !== "reason")) {
    throw new AcquisitionLensError("Invalid editorial angle alternative");
  }

  const alternativeAngle = text(value.alternative.angle, "alternative editorial angle", 64);
  if (alternativeAngle === angle || !taxonomy.lenses.some((lens) => lens.key === alternativeAngle && lens.enabled)) {
    throw new AcquisitionLensError("Alternative editorial angle is not enabled for this topic");
  }

  return {
    ...editorialAngle,
    alternative: {
      angle: alternativeAngle,
      reason: text(value.alternative.reason, "alternative editorial angle reason", 1_500),
    },
  };
}

/**
 * Presentation status of a stored decision against the live vocabulary.
 *
 * - `current`  — the lens is enabled and the decision used this same version.
 * - `retired`  — the lens still exists but is disabled, or the decision was
 *   taken under an older taxonomy version.
 * - `unknown`  — the key is absent from the live vocabulary entirely.
 */
export type EditorialAngleStatus = "current" | "retired" | "unknown";

export type EditorialAngleDescription = {
  key: string;
  label: string;
  definition?: string;
  hookBias?: AcquisitionHookBias;
  status: EditorialAngleStatus;
};

/**
 * Resolves a stored angle key for display. A historical decision must keep
 * rendering after its lens is renamed, disabled, or dropped, so this never
 * throws: an unresolvable key falls back to showing the raw key.
 */
export function describeEditorialAngle(
  angle: Pick<EditorialAngle, "angle" | "taxonomyVersion">,
  taxonomy?: Pick<TopicAcquisitionTaxonomy, "taxonomyVersion" | "lenses">,
): EditorialAngleDescription {
  const lens = taxonomy?.lenses.find((candidate) => candidate.key === angle.angle);
  if (!lens) return { key: angle.angle, label: angle.angle, status: "unknown" };

  return {
    key: lens.key,
    label: lens.label,
    definition: lens.definition,
    ...(lens.hookBias ? { hookBias: lens.hookBias } : {}),
    status:
      lens.enabled && taxonomy!.taxonomyVersion === angle.taxonomyVersion
        ? "current"
        : "retired",
  };
}

/** The hook treatment the chosen lens biases toward, when it declares one. */
export function hookBiasForAngle(
  angle: Pick<EditorialAngle, "angle">,
  taxonomy?: Pick<TopicAcquisitionTaxonomy, "lenses">,
): AcquisitionHookBias | undefined {
  return taxonomy?.lenses.find((lens) => lens.key === angle.angle)?.hookBias;
}