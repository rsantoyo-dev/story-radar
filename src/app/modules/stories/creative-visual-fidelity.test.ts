import assert from "node:assert/strict";
import { test } from "node:test";

import {
  assertExplicitFidelityChange,
  resolveEffectiveVisualFidelity,
  VisualFidelityError,
} from "./creative-visual-fidelity";

test("inherits the brief snapshot mode when there is no override", () => {
  const result = resolveEffectiveVisualFidelity({
    inheritedMode: "photo-required",
    override: null,
  });
  assert.deepEqual(result, {
    mode: "photo-required",
    source: "inherited",
    reason: null,
    inheritedMode: "photo-required",
  });
});

test("a legacy brief with no captured mode falls back to the default", () => {
  const result = resolveEffectiveVisualFidelity({ inheritedMode: undefined });
  assert.equal(result.mode, "illustration-editorial");
  assert.equal(result.source, "inherited");
});

test("an explicit override with a reason wins over the inherited mode", () => {
  const result = resolveEffectiveVisualFidelity({
    inheritedMode: "photo-required",
    override: "verified-references",
    overrideReason: "  Archive photo approved by the editor  ",
  });
  assert.equal(result.mode, "verified-references");
  assert.equal(result.source, "override");
  assert.equal(result.reason, "Archive photo approved by the editor");
  assert.equal(result.inheritedMode, "photo-required");
});

test("an override without a reason is rejected", () => {
  assert.throws(
    () =>
      resolveEffectiveVisualFidelity({
        inheritedMode: "photo-required",
        override: "illustration-editorial",
        overrideReason: "   ",
      }),
    VisualFidelityError,
  );
});

test("an unknown override mode is rejected", () => {
  assert.throws(
    () =>
      resolveEffectiveVisualFidelity({
        inheritedMode: "photo-required",
        override: "anything-goes",
        overrideReason: "because",
      }),
    VisualFidelityError,
  );
});

test("leaving photo-required without a reason is rejected as a silent fallback", () => {
  assert.throws(
    () =>
      assertExplicitFidelityChange({
        inheritedMode: "photo-required",
        nextMode: "illustration-editorial",
        reason: "",
      }),
    VisualFidelityError,
  );
});

test("leaving photo-required with a reason is allowed", () => {
  assert.doesNotThrow(() =>
    assertExplicitFidelityChange({
      inheritedMode: "photo-required",
      nextMode: "illustration-editorial",
      reason: "Editor chose an artistic treatment for this campaign",
    }),
  );
});

test("keeping the same mode never requires a reason", () => {
  assert.doesNotThrow(() =>
    assertExplicitFidelityChange({
      inheritedMode: "photo-required",
      nextMode: "photo-required",
      reason: undefined,
    }),
  );
});
