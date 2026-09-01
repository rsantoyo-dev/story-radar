import assert from "node:assert/strict";
import test from "node:test";

import { DEFAULT_CREATIVE_BRAND_OVERLAY_SETTINGS } from "./creative-content.types";
import {
  CreativeBrandOverlayValidationError,
  parseCreativeBrandOverlayInput,
  parseCreativeBrandOverlaySettings,
} from "./creative-brand-overlay-validation";

const ASSET_ID = "5b7be8b4-bf0f-4d19-99f1-4f34c2672217";

test("brand overlay input defaults to a disabled first-unit overlay", () => {
  assert.deepEqual(
    parseCreativeBrandOverlayInput(undefined),
    DEFAULT_CREATIVE_BRAND_OVERLAY_SETTINGS,
  );
});

test("brand overlay input keeps only validated settings and the asset ID", () => {
  assert.deepEqual(
    parseCreativeBrandOverlayInput({
      ...DEFAULT_CREATIVE_BRAND_OVERLAY_SETTINGS,
      enabled: true,
      assetId: ASSET_ID.toUpperCase(),
      asset: { objectKey: "must-not-cross-the-boundary" },
      backdropColor: "#f6f0e4",
    }),
    {
      ...DEFAULT_CREATIVE_BRAND_OVERLAY_SETTINGS,
      enabled: true,
      assetId: ASSET_ID,
      backdropColor: "#F6F0E4",
    },
  );
});

test("enabled brand overlays require an asset ID", () => {
  assert.throws(
    () =>
      parseCreativeBrandOverlayInput({
        ...DEFAULT_CREATIVE_BRAND_OVERLAY_SETTINGS,
        enabled: true,
      }),
    CreativeBrandOverlayValidationError,
  );
});

test("brand overlay settings enforce backend geometry limits", () => {
  assert.throws(
    () =>
      parseCreativeBrandOverlaySettings({
        ...DEFAULT_CREATIVE_BRAND_OVERLAY_SETTINGS,
        sizePercent: 41,
      }),
    /brandOverlay\.sizePercent must be an integer from 5 to 40/,
  );
  assert.throws(
    () =>
      parseCreativeBrandOverlaySettings({
        ...DEFAULT_CREATIVE_BRAND_OVERLAY_SETTINGS,
        insetPercent: -1,
      }),
    /brandOverlay\.insetPercent must be an integer from 0 to 20/,
  );
});
