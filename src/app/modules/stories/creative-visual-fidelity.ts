/**
 * Resolves the visual fidelity policy that applies to one publication
 * (FEAT-GEO-001 / GEO-01). Pure — unit-tested directly, no "server-only".
 *
 * A draft inherits the topic's current mode unless
 * an editor set an explicit per-draft override. Moving to a less strict mode
 * (anything off `photo-required`) is only ever an explicit, reasoned editor
 * action — this module never derives a weaker mode on its own.
 */

import {
  DEFAULT_VISUAL_FIDELITY_MODE,
  isVisualFidelityMode,
  type VisualFidelityMode,
} from "./creative-content.types";

export type VisualFidelitySource = "inherited" | "override";

export type EffectiveVisualFidelity = {
  mode: VisualFidelityMode;
  source: VisualFidelitySource;
  reason: string | null;
  /** The topic-policy mode the draft would use with no override. */
  inheritedMode: VisualFidelityMode;
};

export type ResolveVisualFidelityInput = {
  /** Current topic policy; missing legacy values use the default. */
  inheritedMode: unknown;
  /** From `creative_drafts.visual_fidelity_override`; null when inheriting. */
  override?: unknown;
  overrideReason?: unknown;
};

export function resolveEffectiveVisualFidelity(
  input: ResolveVisualFidelityInput,
): EffectiveVisualFidelity {
  const inheritedMode = isVisualFidelityMode(input.inheritedMode)
    ? input.inheritedMode
    : DEFAULT_VISUAL_FIDELITY_MODE;

  if (input.override === undefined || input.override === null) {
    return {
      mode: inheritedMode,
      source: "inherited",
      reason: null,
      inheritedMode,
    };
  }

  if (!isVisualFidelityMode(input.override)) {
    throw new VisualFidelityError(
      "visual fidelity override must be a known mode",
    );
  }

  const reason =
    typeof input.overrideReason === "string" ? input.overrideReason.trim() : "";
  if (!reason) {
    throw new VisualFidelityError(
      "a visual fidelity override requires an explicit reason",
    );
  }

  return {
    mode: input.override,
    source: "override",
    reason,
    inheritedMode,
  };
}

/**
 * Guards the one transition the policy calls out by name: leaving
 * `photo-required` for a generative mode must be a deliberate, reasoned
 * choice, never a fallback when material is missing or a step fails.
 */
export function assertExplicitFidelityChange(input: {
  inheritedMode: VisualFidelityMode;
  nextMode: VisualFidelityMode;
  reason: unknown;
}): void {
  if (input.nextMode === input.inheritedMode) return;
  const looseningFromPhoto =
    input.inheritedMode === "photo-required" &&
    input.nextMode !== "photo-required";
  const reason =
    typeof input.reason === "string" ? input.reason.trim() : "";
  if (!reason) {
    throw new VisualFidelityError(
      looseningFromPhoto
        ? "leaving photo-required requires an explicit editor reason; it is never an automatic fallback"
        : "changing the visual fidelity mode requires an explicit editor reason",
    );
  }
}

export class VisualFidelityError extends Error {}
